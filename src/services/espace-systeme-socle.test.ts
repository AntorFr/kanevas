import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

import { migrate, openDb } from '../db/db.js';
import { assurerCompte } from './comptes.js';
import { lectureSysteme, estMJDuSysteme, sectionsDuSysteme } from './droits.js';
import { creerFiche } from './fiches.js';
import { ajouterMembre } from './membres.js';
import { creerEtRattacherSysteme, creerSysteme, listerSystemes } from './systemes.js';
import { reglerTypeSysteme } from './types-fiche.js';
import { creerUnivers, listerUnivers, lireUnivers } from './univers.js';

const SRC = new URL('../db/migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as { code?: string }).code; }
  return 'aucune';
};

test('montée 0052 : chaque système (rattaché ou non) reçoit son espace, gabarits supprimée, sans membre', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(50));
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO systemes_jeu (id, nom, cree_le) VALUES (1, 'A', ?), (2, 'B', ?), (3, 'C', ?)").run(d, d, d);
  db.prepare("INSERT INTO univers (id, nom, cree_le, systeme_id, cle) VALUES (1, 'U', ?, 1, 'u-1')").run(d);
  db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj')").run();
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'gabarits'").get());
  const avant = db.prepare('SELECT * FROM univers WHERE id = 1').get();

  migrate(db);

  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'gabarits'").get(), undefined);
  const espaces = db.prepare('SELECT id, espace_systeme_id AS s, cle FROM univers WHERE espace_systeme_id IS NOT NULL ORDER BY s').all() as { id: number; s: number; cle: string }[];
  assert.deepEqual(espaces.map((e) => e.s), [1, 2, 3]);
  assert.equal(new Set(espaces.map((e) => e.cle)).size, 3);
  for (const e of espaces) assert.equal(db.prepare('SELECT count(*) n FROM membres WHERE univers_id = ?').get(e.id)!['n' as never], 0);
  assert.equal((db.prepare('SELECT espace_systeme_id e FROM univers WHERE id = 1').get() as { e: null }).e, null);
  assert.equal((db.prepare('SELECT nom, systeme_id FROM univers WHERE id = 1').get() as { nom: string }).nom, (avant as { nom: string }).nom);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  const mj = assurerCompte(db, 'mj'); // GM of the system (space)
  const gm = assurerCompte(db, 'gm'); // GM of an attached universe, not of the system
  const joueur = assurerCompte(db, 'joueur'); // player of an attached universe
  const zoe = assurerCompte(db, 'zoe'); // no link
  const u = creerUnivers(db, gm.id, { nom: 'U' });
  ajouterMembre(db, gm.id, u.id, 'joueur', 'joueur');
  const s = creerEtRattacherSysteme(db, gm.id, u.id, { nom: 'S' });
  const espace = (db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(s.id) as { id: number }).id;
  db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'mj')").run(espace, mj.id);
  const f = creerFiche(db, mj.id, espace, {
    type: 'regle', titre: 'R',
    sections: [{ titre: 'Pub', joueursLisent: true }, { titre: 'Secret', joueursLisent: false }],
  } as never);
  return { db, mj, gm, joueur, zoe, u, s, espace, f };
}

test('lectureSysteme : tout pour un MJ du système, niveau joueur pour un membre rattaché, rien sinon', () => {
  const { db, mj, gm, joueur, zoe, s, f } = monde();
  assert.equal(lectureSysteme(db, mj.id, s.id)?.role, 'mj');
  assert.equal(lectureSysteme(db, joueur.id, s.id)?.role, 'joueur');
  assert.equal(lectureSysteme(db, gm.id, s.id)?.role, 'joueur', 'GM d’univers = simple lecteur');
  assert.equal(lectureSysteme(db, zoe.id, s.id), null);
  assert.equal(lectureSysteme(db, mj.id, 9999), null);
  assert.equal(estMJDuSysteme(db, gm.id, s.id), false);
  assert.equal(sectionsDuSysteme(db, mj.id, s.id, f.id).length, 2);
  assert.deepEqual(sectionsDuSysteme(db, joueur.id, s.id, f.id).map((x) => x.titre), ['Pub']);
  assert.deepEqual(sectionsDuSysteme(db, gm.id, s.id, f.id).map((x) => x.titre), ['Pub']);
  assert.equal(sectionsDuSysteme(db, zoe.id, s.id, f.id).length, 0);
});

test('lectureSysteme : un membre d’un univers détaché ne lit plus rien ; fiche d’un autre espace → rien', () => {
  const { db, joueur, gm, s, f, u } = monde();
  const s2 = creerSysteme(db, gm.id, { nom: 'S2' });
  assert.equal(sectionsDuSysteme(db, gm.id, s2.id, f.id).length, 0);
  db.prepare('UPDATE univers SET systeme_id = NULL WHERE id = ?').run(u.id);
  assert.equal(lectureSysteme(db, joueur.id, s.id), null);
});

test('l’espace n’est dans aucune liste : univers du compte, admin, systèmes d’un non-lecteur', () => {
  const { db, mj, gm, espace, s } = monde();
  assert.deepEqual(listerUnivers(db, mj.id), []);
  assert.equal(listerUnivers(db, gm.id).length, 1);
  assert.throws(() => lireUnivers(db, mj.id, espace));
  assert.deepEqual(listerSystemes(db, mj.id).map((x) => x.id), [s.id]);
});

test('reglerTypeSysteme : 403 pour un GM d’univers rattaché, 404 pour un étranger, ok pour un MJ du système', () => {
  const { db, mj, gm, zoe, s } = monde();
  assert.equal(code(() => reglerTypeSysteme(db, gm.id, s.id, 'objet', false)), 'refuse');
  assert.equal(code(() => reglerTypeSysteme(db, zoe.id, s.id, 'objet', false)), 'introuvable');
  assert.equal(code(() => reglerTypeSysteme(db, mj.id, s.id, 'objet', false)), 'aucune');
});

test('un MJ du système ne devient pas MJ d’un univers : pas de catalogue ni de création de système', () => {
  const { db, mj } = monde();
  assert.equal(code(() => creerSysteme(db, mj.id, { nom: 'X' })), 'refuse');
});
