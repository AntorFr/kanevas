// Review tests of kanevas-battlemap-assistant-direction (B-98, AD-battlemap-assistant-3): source of the art direction text and « Annuler ».
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { ajouterMembre } = await import('./membres.js');
const { creerUnivers } = await import('./univers.js');
const D = await import('./battlemap-direction.js');

function err(fn: () => unknown): { code: string; detail?: string; champ?: string } {
  try { fn(); } catch (e: any) { return e; }
  assert.fail('aucune erreur levée');
}

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const lea = assurerCompte(db, 'lea').id;
  const zoe = assurerCompte(db, 'zoe').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  const v = creerUnivers(db, antor, { nom: 'V' }).id;
  ajouterMembre(db, antor, u, 'lea', 'joueur');
  return { db, u, v, mj: { compteId: antor }, mjJoueur: { compteId: antor, modeJoueur: true }, lea: { compteId: lea }, zoe: { compteId: zoe } };
}
const ligne = (m: ReturnType<typeof monde>, u = m.u) =>
  m.db.prepare('SELECT texte, texte_precedent, source, version FROM bm_direction WHERE univers_id = ?').get(u) as any;

test('migration 0050 sur une base au schéma 0049 : les lignes existantes prennent source = mj, rien d’autre ne bouge', () => {
  const src = new URL('../db/migrations/', import.meta.url).pathname;
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(src)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 49) copyFileSync(src + f, dir + f);
  const db = openDb(':memory:');
  migrate(db, dir);
  db.prepare("INSERT INTO univers (id, nom, cle, cree_le) VALUES (1, 'U', 'u1', 'x')").run();
  db.prepare("INSERT INTO bm_direction (univers_id, texte, texte_precedent, version, modifie_le) VALUES (1, 'Ancien', 'Avant', 4, 'x')").run();
  assert.deepEqual(migrate(db), [50, 51, 52]);
  assert.deepEqual(db.prepare('SELECT texte, texte_precedent, version, source FROM bm_direction').all(),
    [{ texte: 'Ancien', texte_precedent: 'Avant', version: 4, source: 'mj' }]);
  assert.throws(() => db.prepare("UPDATE bm_direction SET source = 'autre'").run(), /CHECK/);
  assert.deepEqual(migrate(db), []);
});

test('une écriture d’origine assistant garde l’ancien texte et pose source = assistant', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'Texte du MJ', 0);
  const v = D.ecrireDirection(m.db, m.mj, m.u, 'Texte de l’assistant', 1, 'assistant');
  assert.deepEqual([v.texte, v.textePrecedent, v.source, v.peutAnnuler, v.version], ['Texte de l’assistant', 'Texte du MJ', 'assistant', true, 2]);
  assert.deepEqual(ligne(m), { texte: 'Texte de l’assistant', texte_precedent: 'Texte du MJ', source: 'assistant', version: 2 });
});

test('première écriture de l’assistant sur une direction vide : Annuler rétablit le texte vide', () => {
  const m = monde();
  const v = D.ecrireDirection(m.db, m.mj, m.u, 'Premier jet', 0, 'assistant');
  assert.equal(v.source, 'assistant');
  assert.equal(v.peutAnnuler, true);
  const a = D.annulerDirection(m.db, m.mj, m.u, v.version);
  assert.deepEqual([a.texte, a.source, a.peutAnnuler, a.version], ['', 'mj', false, 2]);
});

test('annulerDirection rend l’ancien texte, vide texte_precedent, repasse à mj et monte la version', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  const a = D.annulerDirection(m.db, m.mj, m.u, 2);
  assert.deepEqual([a.texte, a.textePrecedent, a.peutAnnuler, a.source, a.version], ['A', null, false, 'mj', 3]);
  assert.deepEqual(ligne(m), { texte: 'A', texte_precedent: null, source: 'mj', version: 3 });
});

test('un second appel est refusé : rien à rétablir, pas de rétablissement, rien ne bouge', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  D.annulerDirection(m.db, m.mj, m.u, 2);
  const e = err(() => D.annulerDirection(m.db, m.mj, m.u, 3));
  assert.deepEqual([e.code, e.detail], ['conflit', 'rien_a_retablir']);
  assert.deepEqual(ligne(m), { texte: 'A', texte_precedent: null, source: 'mj', version: 3 });
});

test('rien à rétablir aussi sur une direction jamais écrite, ou écrite une seule fois par le MJ', () => {
  const m = monde();
  assert.equal(err(() => D.annulerDirection(m.db, m.mj, m.u, 0)).detail, 'rien_a_retablir');
  assert.equal(ligne(m), undefined);
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  assert.equal(D.lireDirection(m.db, m.mj, m.u).peutAnnuler, false);
  assert.equal(err(() => D.annulerDirection(m.db, m.mj, m.u, 1)).detail, 'rien_a_retablir');
});

test('version périmée : conflit sur le champ version, rien n’est rétabli', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  for (const v of [1, 3, 0]) {
    const e = err(() => D.annulerDirection(m.db, m.mj, m.u, v));
    assert.deepEqual([e.code, e.champ], ['conflit', 'version']);
  }
  assert.deepEqual(ligne(m), { texte: 'B', texte_precedent: 'A', source: 'assistant', version: 2 });
});

test('version absente ou mal typée : invalide, rien ne bouge', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  for (const v of [undefined, null, '2', 2.5, -1, NaN]) assert.equal(err(() => D.annulerDirection(m.db, m.mj, m.u, v)).code, 'invalide', String(v));
  assert.equal(ligne(m).version, 2);
});

test('une sauvegarde du MJ à la main repasse source à mj et garde l’ancien texte', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  const v = D.ecrireDirection(m.db, m.mj, m.u, 'B retouché', 2);
  assert.deepEqual([v.texte, v.textePrecedent, v.source, v.version], ['B retouché', 'B', 'mj', 3]);
  const a = D.annulerDirection(m.db, m.mj, m.u, 3);
  assert.equal(a.texte, 'B');
});

test('le MJ qui enregistre le texte tel quel reprend la main sans perdre l’annulation', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  const v = D.ecrireDirection(m.db, m.mj, m.u, 'B', 2);
  assert.deepEqual([v.source, v.textePrecedent], ['mj', 'A']);
});

test('les 5 000 caractères tiennent pour l’assistant aussi, et un refus ne change rien', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  const e = err(() => D.ecrireDirection(m.db, m.mj, m.u, 'x'.repeat(5001), 1, 'assistant'));
  assert.equal(e.detail, 'texte_trop_long');
  assert.deepEqual(ligne(m), { texte: 'A', texte_precedent: null, source: 'mj', version: 1 });
  D.ecrireDirection(m.db, m.mj, m.u, 'x'.repeat(5000), 1, 'assistant');
});

test('droits : un joueur et un étranger reçoivent introuvable, un MJ en mode joueur refuse, rien ne bouge', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  for (const a of [m.lea, m.zoe]) assert.equal(err(() => D.annulerDirection(m.db, a, m.u, 2)).code, 'introuvable');
  assert.equal(err(() => D.annulerDirection(m.db, m.mjJoueur, m.u, 2)).code, 'refuse');
  assert.equal(err(() => D.annulerDirection(m.db, m.mj, m.v, 0)).detail, 'rien_a_retablir'); // son autre univers, jamais écrit
  assert.deepEqual(ligne(m), { texte: 'B', texte_precedent: 'A', source: 'assistant', version: 2 });
});

test('l’annulation d’un univers ne touche pas celui d’à côté', () => {
  const m = monde();
  D.ecrireDirection(m.db, m.mj, m.u, 'A', 0);
  D.ecrireDirection(m.db, m.mj, m.u, 'B', 1, 'assistant');
  D.ecrireDirection(m.db, m.mj, m.v, 'V1', 0);
  D.ecrireDirection(m.db, m.mj, m.v, 'V2', 1, 'assistant');
  D.annulerDirection(m.db, m.mj, m.u, 2);
  assert.deepEqual(ligne(m, m.v), { texte: 'V2', texte_precedent: 'V1', source: 'assistant', version: 2 });
});
