// Tests of kanevas-mediatheque-service (rewrite of the attachment service tests on `ajouterFichier`):
// rights checked before the stream and again in the transaction, nothing left behind on a refusal.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { migrate, openDb, type Db } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { ErreurService } from './erreurs.js';
import { creerFiche } from './fiches.js';
import { ajouterFichier, retirerJointure } from './fichiers.js';
import { ajouterMembre } from './membres.js';
import { ajouterSection, changerAudience } from './sections.js';
import { viderTmp } from './stockage.js';
import { creerUnivers } from './univers.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = Buffer.from('GIF89a....');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const racine = mkdtempSync(join(tmpdir(), 'fd-'));
  const marc = assurerCompte(db, 'marc');
  const lea = assurerCompte(db, 'lea');
  const zoe = assurerCompte(db, 'zoe');
  const u = creerUnivers(db, marc.id, { nom: 'U' });
  ajouterMembre(db, marc.id, u.id, 'lea', 'joueur');
  const f = creerFiche(db, marc.id, u.id, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  const sec = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Vérité — MJ seul', contenu: 'x' });
  const pub = ajouterSection(db, marc.id, u.id, f.id, { titre: 'Apparence', contenu: 'x' });
  changerAudience(db, marc.id, u.id, f.id, pub.id, { joueursLisent: true });
  return { db, racine, marc, lea, zoe, u, f, sec, pub };
}

async function code(p: () => unknown): Promise<string> {
  try {
    await p();
  } catch (e) {
    if (e instanceof ErreurService) return e.code;
    throw e;
  }
  return 'aucune';
}

const flux = (b: Buffer) => Readable.from([b]);
const nbLignes = (db: Db) => (db.prepare('SELECT count(*) n FROM fichiers').get() as { n: number }).n;
const fichiers = (racine: string) => readdirSync(racine).filter((x) => x !== 'tmp');
const tmp = (racine: string) => (existsSync(join(racine, 'tmp')) ? readdirSync(join(racine, 'tmp')) : []);
const vide = (m: { db: Db; racine: string }) => {
  assert.equal(nbLignes(m.db), 0);
  assert.deepEqual(fichiers(m.racine), []);
  assert.deepEqual(tmp(m.racine), []);
};
const joint = (sectionId: number) => ({ ou: 'section', sectionId, maniere: 'joint' }) as const;

test('migration : pieces_jointes reste (vidée), les trois tables de la médiathèque existent, rejeu sans effet', () => {
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(migrate(db), []);
  const cols = (db.prepare('PRAGMA table_info(pieces_jointes)').all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(cols, ['id', 'section_id', 'nom', 'type', 'taille', 'fichier', 'secrete', 'cree_le']);
  const fi = (db.prepare('PRAGMA table_info(fiches)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(fi.includes('illustration_fichier_id'));
  assert.ok(fi.includes('illustration_fichier'), 'les trois colonnes d’AD-93 restent');
});

test('type par signature : quatre images ; HTML « portrait.png », SVG, PDF → octet-stream', async () => {
  const m = monde();
  const cas: [Buffer, string][] = [
    [PNG, 'image/png'], [JPG, 'image/jpeg'], [GIF, 'image/gif'], [WEBP, 'image/webp'],
    [Buffer.from('<html>x</html>'), 'application/octet-stream'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'application/octet-stream'],
    [Buffer.from('%PDF-1.4'), 'application/octet-stream'],
  ];
  for (const [b, type] of cas) {
    const v = await ajouterFichier(m.db, { compteId: m.marc.id }, m.u.id, flux(b), 'portrait.png', { ou: 'mediatheque' }, m.racine);
    assert.equal(v.type, type);
    assert.equal(v.image, type !== 'application/octet-stream');
  }
});

test('refus sans rien écrire : sans rôle, section inconnue, section non lue, lecture sans écriture', async () => {
  const m = monde();
  const marc = { compteId: m.marc.id };
  assert.equal(await code(() => ajouterFichier(m.db, { compteId: m.zoe.id }, m.u.id, flux(PNG), 'a', joint(m.pub.id), m.racine)), 'introuvable');
  assert.equal(await code(() => ajouterFichier(m.db, marc, m.u.id, flux(PNG), 'a', joint(99999), m.racine)), 'introuvable');
  assert.equal(await code(() => ajouterFichier(m.db, { compteId: m.lea.id }, m.u.id, flux(PNG), 'a', joint(m.sec.id), m.racine)), 'introuvable');
  assert.equal(await code(() => ajouterFichier(m.db, { compteId: m.lea.id }, m.u.id, flux(PNG), 'a', joint(m.pub.id), m.racine)), 'refuse');
  assert.equal(await code(() => ajouterFichier(m.db, marc, m.u.id, flux(PNG), '   ', { ou: 'mediatheque' }, m.racine)), 'invalide');
  assert.equal(await code(() => ajouterFichier(m.db, marc, m.u.id, flux(PNG), 'a', { ou: 'illustration', ficheId: 99999 }, m.racine)), 'introuvable');
  vide(m);
});

test('droit retiré pendant la lecture du flux : refus, rien écrit', async () => {
  const m = monde();
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursEcrivent: true });
  async function* gen() {
    yield PNG;
    changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursEcrivent: false });
    yield PNG;
  }
  assert.equal(await code(() => ajouterFichier(m.db, { compteId: m.lea.id }, m.u.id, gen(), 'a', joint(m.pub.id), m.racine)), 'refuse');
  vide(m);
});

test('flux interrompu : erreur propagée, rien écrit', async () => {
  const m = monde();
  async function* gen() {
    yield PNG;
    throw new Error('coupé');
  }
  await assert.rejects(() => ajouterFichier(m.db, { compteId: m.marc.id }, m.u.id, gen(), 'a', joint(m.sec.id), m.racine), /coupé/);
  vide(m);
});

test('Joueur auteur : envoie et retire sa jointure, mais pas de bloc MJ', async () => {
  const m = monde();
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.sec.id, { auteurId: m.lea.id, auteurLit: true, auteurEcrit: true });
  const lea = { compteId: m.lea.id };
  const p = await ajouterFichier(m.db, lea, m.u.id, flux(PNG), 'a', joint(m.sec.id), m.racine);
  assert.equal(p.visibilite, 'mj');
  assert.equal(
    await code(() => ajouterFichier(m.db, lea, m.u.id, flux(PNG), 'b', { ou: 'section', sectionId: m.sec.id, maniere: 'texte', dansBlocMj: true }, m.racine)),
    'refuse',
  );
  assert.equal(nbLignes(m.db), 1);
  retirerJointure(m.db, lea, m.u.id, m.f.id, m.sec.id, p.id);
  assert.equal((m.db.prepare('SELECT COUNT(*) AS n FROM fichiers_sections').get() as { n: number }).n, 0);
  assert.equal(nbLignes(m.db), 1, 'le fichier reste en médiathèque');
});

test('MJ en mode Joueur : n’envoie que là où les joueurs écrivent, jamais dans un bloc MJ', async () => {
  const m = monde();
  const mode = { compteId: m.marc.id, modeJoueur: true };
  assert.equal(await code(() => ajouterFichier(m.db, mode, m.u.id, flux(PNG), 'a', joint(m.pub.id), m.racine)), 'refuse');
  changerAudience(m.db, m.marc.id, m.u.id, m.f.id, m.pub.id, { joueursEcrivent: true });
  assert.equal(
    await code(() => ajouterFichier(m.db, mode, m.u.id, flux(PNG), 'b', { ou: 'section', sectionId: m.pub.id, maniere: 'texte', dansBlocMj: true }, m.racine)),
    'refuse',
  );
  const v = await ajouterFichier(m.db, mode, m.u.id, flux(PNG), 'c', joint(m.pub.id), m.racine);
  assert.equal(v.visibilite, 'joueurs');
  assert.equal(nbLignes(m.db), 1);
});

test('tmp/ est vidé au démarrage, les fichiers définitifs restent', async () => {
  const m = monde();
  await ajouterFichier(m.db, { compteId: m.marc.id }, m.u.id, flux(PNG), 'a', joint(m.sec.id), m.racine);
  writeFileSync(join(m.racine, 'tmp', 'reste'), 'x');
  await viderTmp(m.racine);
  assert.deepEqual(tmp(m.racine), []);
  assert.equal(fichiers(m.racine).length, 1);
});
