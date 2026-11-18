// kanevas-synchro-ecriture-retrait-fiches (B-47, B-86, AD-138, AD-141, AD-104): a replay of `PUT /fiches/:cle`
// writes what the body carries and nothing else; Kanevas keeps no memory of the import.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
const { trouverCompte } = await import('../services/comptes.js');
const { relierSection, lireRelations } = await import('../services/relations.js');
const { changerAudience, ajouterSection } = await import('../services/sections.js');
const { marquerDisparu, changerSousType, changerStatutFiche, deplacerFiche } = await import('../services/fiches.js');
const { poserEtiquetage } = await import('../services/etiquettes.js');

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const base = `/api/import/v1/univers/${u.id}`;
  const put = (cle: string, payload: unknown, lot?: number) =>
    app.inject({
      method: 'PUT',
      url: `${base}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`,
      headers: auth,
      payload: payload as object,
    });
  const lot = async () => (await app.inject({ method: 'POST', url: `${base}/lots`, headers: auth })).json().lotId as number;
  const clore = async (l: number) => (await app.inject({ method: 'POST', url: `${base}/lots/${l}/clore`, headers: auth })).json();
  const antor = trouverCompte(app.db, 'antor')!.id;
  const fiche = (id: number) => app.db.prepare('SELECT * FROM fiches WHERE id = ?').get(id) as Any;
  const sections = (id: number) => app.db.prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre').all(id) as Any[];
  return { app, u, put, lot, clore, antor, fiche, sections };
}

const PORT = {
  type: 'lieu',
  titre: 'Port-Sel',
  sections: [
    { cle: 'desc', titre: 'Description', contenu: 'Un port.', joueursLisent: true },
    { cle: 'verite', titre: 'Vérité', contenu: 'Secret.' },
  ],
};

test('rejeu identique : inchangee, ni modifie_le ni version ni ligne de fiche ou de section ne bougent, même après des écritures dans Kanevas que le corps redit', async () => {
  const m = await monter();
  const r1 = await m.put('lieu:port-sel', PORT);
  assert.equal(r1.json().etat, 'creee');
  const id = r1.json().id as number;
  const f0 = m.fiche(id);
  const s0 = m.sections(id);
  await new Promise((r) => setTimeout(r, 5));
  const l = await m.lot();
  const r2 = await m.put('lieu:port-sel', PORT, l);
  assert.equal(r2.json().etat, 'inchangee');
  assert.deepEqual(r2.json().avertissements, []);
  assert.deepEqual(m.fiche(id), f0);
  assert.deepEqual(m.sections(id), s0);
  const rap = await m.clore(l);
  assert.equal(rap.compteurs.fiches.inchangees, 1);
  assert.equal(rap.compteurs.fiches.mises_a_jour, 0);
});

test('un champ non envoyé reste tel quel : sous-type, PJ, disparu, alias, étiquettes, parent, statut', async () => {
  const m = await monter();
  const parent = (await m.put('lieu:cote', { type: 'lieu', titre: 'Côte' })).json().id as number;
  const pnj = (await m.put('personnage:bran', { type: 'personnage', titre: 'Bran', pj: false, sections: [] })).json().id as number;
  const ctx = { compteId: m.antor };
  changerSousType(m.app.db, m.antor, m.u.id, pnj, 'Capitaine');
  marquerDisparu(m.app.db, ctx, m.u.id, pnj, true);
  poserEtiquetage(m.app.db, ctx, m.u.id, pnj, { alias: ['Le Vieux'], etiquettes: ['Équipage'] });
  deplacerFiche(m.app.db, ctx, m.u.id, pnj, parent);
  const avant = m.fiche(pnj);
  const l = await m.lot();
  const r = await m.put('personnage:bran', { type: 'personnage', titre: 'Bran', sections: [] }, l);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(m.fiche(pnj), avant);
  assert.deepEqual(m.app.db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ?').all(pnj), [{ alias: 'Le Vieux' }]);
  assert.equal(JSON.parse(m.fiche(pnj).charge).disparu, true);
  assert.equal(JSON.parse(m.fiche(pnj).charge).pj, false);

  // an adventure without `statut` keeps the one it has
  const av = (await m.put('aventure:a', { type: 'aventure', titre: 'A', statut: 'prete', sections: [] })).json().id as number;
  changerStatutFiche(m.app.db, ctx, m.u.id, av, 'en_cours');
  const r2 = await m.put('aventure:a', { type: 'aventure', titre: 'A', sections: [] });
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(JSON.parse(m.fiche(av).charge).statut, 'en_cours');
});

test('un personnage créé sans pj est un PNJ ; un rejeu avec pj:true le passe PJ, un rejeu sans pj le laisse PJ', async () => {
  const m = await monter();
  const id = (await m.put('personnage:x', { type: 'personnage', titre: 'X', sections: [] })).json().id as number;
  assert.equal(JSON.parse(m.fiche(id).charge).pj, false);
  assert.equal((await m.put('personnage:x', { type: 'personnage', titre: 'X', pj: true, sections: [] })).json().etat, 'mise_a_jour');
  assert.equal(JSON.parse(m.fiche(id).charge).pj, true);
  assert.equal((await m.put('personnage:x', { type: 'personnage', titre: 'X', sections: [] })).json().etat, 'inchangee');
  assert.equal(JSON.parse(m.fiche(id).charge).pj, true);
});

test('une section absente du corps reste, avec son contenu, son audience et sa clé ; une section sans contenu ni audience envoyés garde les siens', async () => {
  const m = await monter();
  const id = (await m.put('lieu:port-sel', PORT)).json().id as number;
  const [desc, verite] = m.sections(id);
  // Antor opens « Vérité » to players and writes a section of his own
  changerAudience(m.app.db, m.antor, m.u.id, id, verite.id, { joueursLisent: true, joueursEcrivent: false });
  ajouterSection(m.app.db, m.antor, m.u.id, id, { titre: 'Notes MJ', contenu: 'à moi' });
  const avant = m.sections(id);
  // the body names « desc » only, and says nothing of its content nor audience
  const r = await m.put('lieu:port-sel', { ...PORT, sections: [{ cle: 'desc', titre: 'Description' }] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'inchangee');
  assert.deepEqual(m.sections(id), avant);
  assert.equal(m.sections(id).length, 3);
  assert.equal(m.sections(id)[0].contenu, desc.contenu);
  assert.equal(m.sections(id)[1].joueurs_lisent, 1, 'the audience Antor gave « Vérité » is not closed by omission');
  // a body with an empty section list removes nothing either
  const r2 = await m.put('lieu:port-sel', { type: 'lieu', titre: 'Port-Sel', sections: [] });
  assert.equal(r2.json().etat, 'inchangee');
  assert.equal(m.sections(id).length, 3);
  // an empty content, sent, is a content: it is written
  const r3 = await m.put('lieu:port-sel', { ...PORT, sections: [{ cle: 'desc', titre: 'Description', contenu: '' }] });
  assert.equal(r3.json().etat, 'mise_a_jour');
  assert.equal(m.sections(id)[0].contenu, '');
});

test('une relation absente du corps reste : le rejeu, identique ou modifié, ne la touche pas', async () => {
  const m = await monter();
  const id = (await m.put('lieu:port-sel', PORT)).json().id as number;
  const cible = (await m.put('faction:guilde', { type: 'faction', titre: 'Guilde', sections: [] })).json().id as number;
  const [desc] = m.sections(id);
  relierSection(m.app.db, m.antor, m.u.id, id, desc.id, { cibleFicheId: cible, qualificatif: 'tenu par' });
  const lues = () => lireRelations(m.app.db, { compteId: m.antor }, m.u.id, id, desc.id).length;
  assert.equal(lues(), 1);
  assert.equal((await m.put('lieu:port-sel', PORT)).json().etat, 'inchangee');
  assert.equal(lues(), 1);
  const r = await m.put('lieu:port-sel', { ...PORT, titre: 'Port-Sel II' });
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.equal(lues(), 1);
});

test('chaque champ envoyé qui diffère est écrit, ceux qui ne diffèrent pas ne bougent pas (une seule section change)', async () => {
  const m = await monter();
  const id = (await m.put('lieu:port-sel', PORT)).json().id as number;
  const s0 = m.sections(id);
  const corps = structuredClone(PORT);
  corps.sections[1] = { cle: 'verite', titre: 'Vérité', contenu: 'Autre secret.' };
  const r = await m.put('lieu:port-sel', corps);
  assert.equal(r.json().etat, 'mise_a_jour');
  const s1 = m.sections(id);
  assert.deepEqual(s1[0], s0[0], 'the untouched section keeps version and date');
  assert.equal(s1[1].contenu, 'Autre secret.');
  assert.equal(s1[1].version, s0[1].version + 1);
});

test('aucune réponse ni aucun lot ne contient « non écrasé » après un rejeu qui change tout dans Kanevas', async () => {
  const m = await monter();
  const corps = { ...PORT, sousType: 'Port', alias: ['Salport'], etiquettes: ['Côte'] };
  const id = (await m.put('lieu:port-sel', corps)).json().id as number;
  const ctx = { compteId: m.antor };
  const [desc] = m.sections(id);
  m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Autre titre', id);
  changerSousType(m.app.db, m.antor, m.u.id, id, 'Ruines');
  poserEtiquetage(m.app.db, ctx, m.u.id, id, { alias: ['X'], etiquettes: ['Y'] });
  changerAudience(m.app.db, m.antor, m.u.id, id, desc.id, { joueursLisent: false, joueursEcrivent: false });
  const l = await m.lot();
  const r = await m.put('lieu:port-sel', corps, l);
  assert.equal(r.json().etat, 'mise_a_jour');
  assert.doesNotMatch(r.body, /non écrasé|modifié dans Kanevas/);
  const rap = await m.clore(l);
  assert.doesNotMatch(JSON.stringify(rap), /non écrasé|modifié dans Kanevas/);
  assert.equal(m.fiche(id).titre, 'Port-Sel');
  assert.equal(m.fiche(id).sous_type, 'Port');
  assert.equal(m.sections(id)[0].joueurs_lisent, 1);
  assert.deepEqual(m.app.db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ?').all(id), [{ alias: 'Salport' }]);
  // and an identical replay now leaves everything alone
  assert.equal((await m.put('lieu:port-sel', corps)).json().etat, 'inchangee');
});

test('parent inconnu ou cyclique : le parent reste, un avertissement, rien d’autre n’est empêché', async () => {
  const m = await monter();
  const a = (await m.put('lieu:a', { type: 'lieu', titre: 'A' })).json().id as number;
  const b = (await m.put('lieu:b', { type: 'lieu', titre: 'B', parent: 'lieu:a' })).json().id as number;
  const r = await m.put('lieu:b', { type: 'lieu', titre: 'B2', parent: 'lieu:inconnu' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().etat, 'mise_a_jour', 'the title is written');
  assert.equal(r.json().avertissements.length, 1);
  assert.equal(m.fiche(b).parent_id, a, 'the parent is left');
  const c = await m.put('lieu:a', { type: 'lieu', titre: 'A', parent: 'lieu:b' });
  assert.equal(c.statusCode, 200);
  assert.equal(c.json().avertissements.length, 1);
  assert.match(c.json().avertissements[0], /cycle/);
  assert.equal(m.fiche(a).parent_id, null);
  // an unknown parent on creation: the sheet is created at the root
  const n = await m.put('lieu:n', { type: 'lieu', titre: 'N', parent: 'lieu:nulle-part' });
  assert.equal(n.json().etat, 'creee');
  assert.equal(m.fiche(n.json().id).parent_id, null);
});

test('un refus du corps (champ invalide) n’écrit rien, même quand d’autres champs auraient différé', async () => {
  const m = await monter();
  const id = (await m.put('lieu:port-sel', PORT)).json().id as number;
  const avant = { f: m.fiche(id), s: m.sections(id) };
  const r = await m.put('lieu:port-sel', { ...PORT, titre: 'Changé', sections: [{ cle: 'desc', titre: 'D', contenu: 12 }] });
  assert.equal(r.statusCode, 400);
  assert.deepEqual({ f: m.fiche(id), s: m.sections(id) }, avant);
});

test('B-47 : plus aucune lecture ni écriture de dernier_import / version_importee hors services/fichiers.ts, les tables swn_* et les migrations', () => {
  const racine = join(import.meta.dirname, '..');
  const fichiers: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      if (statSync(p).isDirectory()) {
        if (nom === 'e2e' || nom === 'migrations') continue;
        parcourir(p);
      } else if (p.endsWith('.ts')) fichiers.push(p);
    }
  };
  parcourir(racine);
  const trouves = fichiers
    .filter((p) => !p.endsWith('/services/fichiers.ts') && !p.includes('/swn/') && !p.includes('/db/migration') && !p.endsWith('import-fiches-rejeu.test.ts'))
    .filter((p) => /dernier_import|version_importee|dernierImport|MarqueFiche|MarqueSection/.test(readFileSync(p, 'utf8')))
    .map((p) => p.slice(racine.length + 1));
  // tests that build a legacy schema on purpose (migration tests, systems' own import mark) are out of the rule
  const attendus = trouves.filter((p) => !/migration|types-migration|import-galaxie|systemes/.test(p));
  assert.deepEqual(attendus, []);
});
