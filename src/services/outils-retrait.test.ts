import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;

const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('./comptes.js');
const { creerEtRattacherSysteme } = await import('./systemes.js');
const { creerUnivers } = await import('./univers.js');
const { creerFiche } = await import('./fiches.js');
const { poserActivation } = await import('./outils.js');
const { poserSectionGeree, etatGere } = await import('./sections-gerees.js');
type Db = ReturnType<typeof openDb>;

/** Row count of every `swn_*` / `essai_*` table (read from the schema, so a later module is covered), plus sheets and sections. */
function comptes(db: Db): Record<string, number> {
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'swn\\_%' ESCAPE '\\' OR name LIKE 'essai\\_%' ESCAPE '\\') ORDER BY name`)
    .all() as { name: string }[]).map((t) => t.name);
  return Object.fromEntries([...tables, 'sections', 'fiches'].map((t) => [t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
}

test('D-6 : désactiver un outil (univers puis système) ne perd aucune ligne, la réactivation rend les mêmes sections gérées', () => {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor').id;
  const u = creerUnivers(db, antor, { nom: 'U' }).id;
  const sys = creerEtRattacherSysteme(db, antor, u, { nom: 'Sys' }).id;
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', true);
  const fiche = creerFiche(db, antor, u, { type: 'personnage', titre: 'Aldric', charge: { pj: false } }).id;
  const s = poserSectionGeree(db, antor, u, { ficheId: fiche, outil: 'essai/g', type: 'caracteristiques',
    contenu: 'Texte', sourceVersion: 'vieux' } as any);
  const etat = () => etatGere(db, { compteId: antor }, u, db.prepare('SELECT * FROM sections WHERE id = ?').get(s.id) as any)!.etat;
  const avant = comptes(db);
  const etatAvant = etat();
  poserActivation(db, antor, { niveau: 'univers', id: u }, 'essai/g', false);
  assert.deepEqual(comptes(db), avant);
  poserActivation(db, antor, { niveau: 'univers', id: u }, 'essai/g', null);
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', false);
  assert.deepEqual(comptes(db), avant);
  poserActivation(db, antor, { niveau: 'systeme', id: sys }, 'essai/g', true);
  assert.deepEqual(comptes(db), avant);
  assert.equal(etat(), etatAvant);
});
