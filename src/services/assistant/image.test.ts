import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';

import { openDb, migrate, type Db } from '../../db/db.js';
import { assurerCompte } from '../comptes.js';
import { creerFiche } from '../fiches.js';
import { generateurBouchon, PNG_BOUCHON } from '../images/bouchon.js';
import { generateurAucun } from '../images/aucun.js';
import type { AdaptateurChoisi, GenerateurImage } from '../images/index.js';
import { ajouterMembre, changerRoleNoyau } from '../membres.js';
import { deposerPieceJointe, MAX_PIECES_PAR_SECTION } from '../pieces-jointes.js';
import { ajouterSection, changerAudience } from '../sections.js';
import { creerUnivers } from '../univers.js';
import { catalogueDe } from './catalogue.js';
import { repondre } from './repondre.js';
import type { AgentTransport } from './transport.js';
import type { ContexteDemande } from './types.js';

const STUB = { KANEVAS_STUB: '1' };
const BOUCHON: AdaptateurChoisi = { nom: 'bouchon', generateur: generateurBouchon };
const AUCUN: AdaptateurChoisi = { nom: 'aucun', generateur: generateurAucun };
const PORTRAIT = "Fais un portrait pour « Apparence » d'« Maître Aldric »";

/** An engine that counts its calls and records the signal it was given. */
function moteurEspion(corps: GenerateurImage['generer'] = async () => Buffer.from(PNG_BOUCHON)) {
  const etat = { appels: 0, signal: undefined as AbortSignal | undefined };
  const generateur: GenerateurImage = {
    async generer(d, s) {
      etat.appels++;
      etat.signal = s;
      return corps(d, s);
    },
  };
  return { etat, images: { nom: 'bouchon', generateur } as AdaptateurChoisi };
}

function monde() {
  const db: Db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'Lame' });
  const autre = creerUnivers(db, antor.id, { nom: 'Autre' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const aldric = creerFiche(db, antor.id, u.id, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } });
  const app = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Apparence', contenu: 'Grand.' });
  changerAudience(db, antor.id, u.id, aldric.id, app.id, { joueursLisent: true });
  const etrangere = creerFiche(db, antor.id, autre.id, { type: 'personnage', titre: 'Ailleurs', charge: { pj: false } });
  const secEtr = ajouterSection(db, antor.id, autre.id, etrangere.id, { titre: 'Autre', contenu: 'x' });
  const pieces = () =>
    db.prepare('SELECT nom, type, secrete, section_id FROM pieces_jointes').all() as {
      nom: string;
      type: string;
      secrete: number;
      section_id: number;
    }[];
  const dit = (compte: number, m: string, deps: any = {}) =>
    repondre(db, compte, u.id, m, [], { config: STUB, images: BOUCHON, ...deps });
  const outil = (compte: number, images: AdaptateurChoisi = BOUCHON) =>
    catalogueDe(db, compte, u.id, images).outils.find((o) => o.nom === 'generer_image')!;
  return { db, antor, lea, u, aldric, app, secEtr, pieces, dit, outil };
}

test('portrait : Antor, pièce image non secrète « image-….png » et événement image_attachee', async () => {
  const { antor, app, aldric, dit, pieces } = monde();
  const r = await dit(antor.id, PORTRAIT);
  const p = pieces();
  assert.equal(p.length, 1);
  assert.match(p[0]!.nom, /^image-.+\.png$/);
  assert.equal(p[0]!.type, 'image/png');
  assert.equal(p[0]!.secrete, 0);
  assert.equal(p[0]!.section_id, app.id);
  assert.equal(r.evenements.length, 1);
  const e = r.evenements[0]!;
  assert.equal(e.type, 'image_attachee');
  assert.equal(e.libelle, 'Image attachée à la section « Apparence » de « Maître Aldric »');
  const c = e.cible as any;
  assert.equal(c.ficheId, aldric.id);
  assert.equal(c.sectionId, app.id);
  assert.ok(Number.isInteger(c.pieceId));
});

test('portrait avec « échec » : rien attaché, aucun événement, « Je n\'ai pas pu générer l\'image. »', async () => {
  const { antor, dit, pieces } = monde();
  const r = await dit(antor.id, `${PORTRAIT}, un échec`);
  assert.equal(pieces().length, 0);
  assert.deepEqual(r.evenements, []);
  assert.equal(r.reponse, "Je n'ai pas pu générer l'image.");
});

test('portrait pour Léa : outil absent du catalogue, refus de l’outil absent, rien attaché', async () => {
  const { lea, dit, pieces, db, u } = monde();
  assert.ok(!catalogueDe(db, lea.id, u.id, BOUCHON).outils.some((o) => o.nom === 'generer_image'));
  const r = await dit(lea.id, PORTRAIT);
  assert.equal(pieces().length, 0);
  assert.deepEqual(r.evenements, []);
  assert.ok(r.reponse.includes('generer_image') && /ne peux pas/.test(r.reponse), r.reponse);
});

test('adaptateur aucun : l’outil n’est pas dans le catalogue du MJ', () => {
  const { db, antor, u } = monde();
  assert.ok(!catalogueDe(db, antor.id, u.id, AUCUN).outils.some((o) => o.nom === 'generer_image'));
});

test('section pleine (50 pièces) : erreur de la fonction d’envoi, sans événement ni moteur', async () => {
  const { db, antor, app, outil, pieces } = monde();
  const dir = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'im-'));
  for (let i = 0; i < MAX_PIECES_PAR_SECTION; i++) {
    await deposerPieceJointe(db, antor.id, false, app.id, Readable.from([PNG_BOUCHON]), `p${i}.png`, false, dir);
  }
  const { etat, images } = moteurEspion();
  const r: any = await outil(antor.id, images).executer({ sectionId: app.id, description: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.evenement, undefined);
  assert.equal(etat.appels, 0);
  assert.equal(pieces().length, MAX_PIECES_PAR_SECTION);
});

test('droit d’écriture perdu : refus sans événement, moteur non appelé', async () => {
  const { db, antor, u, app, outil, pieces } = monde();
  const paul = assurerCompte(db, 'paul');
  ajouterMembre(db, antor.id, u.id, 'paul', 'mj');
  const { etat, images } = moteurEspion();
  const o = outil(antor.id, images); // catalogue built while Antor is still GM
  changerRoleNoyau(db, u.id, antor.id, 'joueur');
  void paul;
  const r: any = await o.executer({ sectionId: app.id, description: 'x' }, {});
  assert.equal(r.ok, false);
  assert.equal(r.evenement, undefined);
  assert.equal(etat.appels, 0);
  assert.equal(pieces().length, 0);
});

test('sections inconnue ou d’un autre univers : erreur sans événement, moteur non appelé', async () => {
  const { antor, secEtr, outil, pieces } = monde();
  const { etat, images } = moteurEspion();
  for (const sectionId of [999999, secEtr.id]) {
    const r: any = await outil(antor.id, images).executer({ sectionId, description: 'x' });
    assert.deepEqual(r, { ok: false, erreur: 'Introuvable.' });
  }
  assert.equal(etat.appels, 0);
  assert.equal(pieces().length, 0);
});

test('une seconde image dans la même demande : « Une seule image par demande. »', async () => {
  const { antor, app, outil, pieces } = monde();
  const { etat, images } = moteurEspion();
  const o = outil(antor.id, images);
  const ctx: ContexteDemande = {};
  const a: any = await o.executer({ sectionId: app.id, description: 'un' }, ctx);
  const b: any = await o.executer({ sectionId: app.id, description: 'deux' }, ctx);
  assert.equal(a.ok, true);
  assert.deepEqual(b, { ok: false, erreur: 'Une seule image par demande.' });
  assert.equal(etat.appels, 1);
  assert.equal(pieces().length, 1);
});

test('description de 500 caractères acceptée, 501 refusée sans moteur', async () => {
  const { antor, app, outil, pieces } = monde();
  const { etat, images } = moteurEspion();
  const o = outil(antor.id, images);
  const long: any = await o.executer({ sectionId: app.id, description: 'a'.repeat(501) }, {});
  assert.deepEqual(long, { ok: false, erreur: 'La description est limitée à 500 caractères.' });
  assert.equal(etat.appels, 0);
  const bord: any = await o.executer({ sectionId: app.id, description: 'a'.repeat(500) }, {});
  assert.equal(bord.ok, true);
  assert.equal(pieces().length, 1);
});

test('bouchon : message plus long que 500 caractères → refus de description', async () => {
  const { antor, dit, pieces } = monde();
  const r = await dit(antor.id, `${PORTRAIT} ${'a'.repeat(500)}`);
  assert.equal(r.reponse, 'La description est limitée à 500 caractères.');
  assert.deepEqual(r.evenements, []);
  assert.equal(pieces().length, 0);
});

test('demande abandonnée pendant la génération : moteur arrêté, rien attaché', async () => {
  const { antor, dit, pieces } = monde();
  const { etat, images } = moteurEspion(
    (_d, s) =>
      new Promise<Buffer>((_ok, ko) => {
        s!.addEventListener('abort', () => ko(new Error('arrêté')));
      }),
  );
  const client = new AbortController();
  const p = dit(antor.id, PORTRAIT, { images, signal: client.signal });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(etat.appels, 1);
  client.abort();
  const r = await p;
  assert.equal(etat.signal!.aborted, true);
  assert.equal(pieces().length, 0);
  assert.deepEqual(r.evenements, []);
});

test('abandon qui arrive quand le moteur a déjà rendu : rien attaché', async () => {
  const { antor, dit, pieces } = monde();
  const client = new AbortController();
  const { images } = moteurEspion(async () => {
    client.abort();
    return Buffer.from(PNG_BOUCHON);
  });
  const r = await dit(antor.id, PORTRAIT, { images, signal: client.signal });
  assert.equal(pieces().length, 0);
  assert.deepEqual(r.evenements, []);
});

test('le temps passé dans l’outil n’entre pas dans le délai de la demande', async () => {
  const { antor, dit, pieces } = monde();
  const { images } = moteurEspion(async () => {
    await new Promise((r) => setTimeout(r, 150));
    return Buffer.from(PNG_BOUCHON);
  });
  const r = await dit(antor.id, PORTRAIT, { images, delaiMs: 60 });
  assert.equal(pieces().length, 1);
  assert.equal(r.evenements.length, 1);
});

test('un tour de modèle plus long que le délai est coupé même avec l’outil image', async () => {
  const { antor, dit } = monde();
  const transport: AgentTransport = {
    nom: 'lent',
    repondre: () => new Promise<string>((r) => setTimeout(() => r('tard'), 400)),
  };
  await assert.rejects(
    dit(antor.id, 'x', { config: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, transport, delaiMs: 50 }),
    (e: any) => e.code === 'assistant_erreur',
  );
});

test('le délai ne repart qu’avec ce qui restait : modèle lent après l’outil est coupé', async () => {
  const { antor, dit } = monde();
  const { images } = moteurEspion(async () => {
    await new Promise((r) => setTimeout(r, 100));
    return Buffer.from(PNG_BOUCHON);
  });
  const transport: AgentTransport = {
    nom: 'mixte',
    async repondre(d) {
      const o = d.outils.find((x) => x.nom === 'generer_image')!;
      const app: any = null;
      void app;
      await o.executer({ sectionId: 1, description: 'x' });
      await new Promise((r) => setTimeout(r, 400));
      return 'fin';
    },
  };
  await assert.rejects(
    dit(antor.id, 'x', { config: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, transport, delaiMs: 80, images }),
    (e: any) => e.code === 'assistant_erreur',
  );
});

test('section pleine : le texte MJ « Cette section porte déjà 50 pièces jointes. » (outil et bouchon)', async () => {
  const { db, antor, app, outil, dit, pieces } = monde();
  const dir = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'im-'));
  for (let i = 0; i < MAX_PIECES_PAR_SECTION; i++) {
    await deposerPieceJointe(db, antor.id, false, app.id, Readable.from([PNG_BOUCHON]), `p${i}.png`, false, dir);
  }
  const { etat, images } = moteurEspion();
  const r: any = await outil(antor.id, images).executer({ sectionId: app.id, description: 'x' });
  assert.deepEqual(r, { ok: false, erreur: 'Cette section porte déjà 50 pièces jointes.' });
  assert.equal(etat.appels, 0);
  const b = await dit(antor.id, PORTRAIT);
  assert.equal(b.reponse, 'Cette section porte déjà 50 pièces jointes.');
  assert.deepEqual(b.evenements, []);
  assert.equal(pieces().length, MAX_PIECES_PAR_SECTION);
});

test('portrait hors forme contenant « échec » : message d’échec d’image, pas d’erreur de transport', async () => {
  const { antor, lea, dit, pieces } = monde();
  const r = await dit(antor.id, "Fais un portrait de l'échec d'Aldric.");
  assert.equal(r.reponse, "Je n'ai pas pu générer l'image.");
  assert.deepEqual(r.evenements, []);
  assert.equal(pieces().length, 0);
  const l = await dit(lea.id, "Fais un portrait de l'échec d'Aldric.");
  assert.ok(l.reponse.includes('generer_image'), l.reponse);
  assert.equal(pieces().length, 0);
});
