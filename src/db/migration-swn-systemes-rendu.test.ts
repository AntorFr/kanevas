// Migration 0051 (AD-rendu-2, B-117, B-118): `swn_systemes` rebuilt on the conversion table of `docs/donnees.md`.
// The 0050 database is built by the test itself (migrations up to 0050, then SQL rows).
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}
type Db = ReturnType<typeof openDb>;
const D = '2026-10-01T00:00:00.000Z';

const TAILLES: [number, number][] = [[1, 0.15], [2, 0.45], [3, 0.75], [4, 0.9], [5, 1]];
const COULEURS: [string, string | null][] = [
  ['accent', '#8b9bf0'], ['table', '#3fc79a'], ['ambre', '#f2a33c'], ['danger', '#ec7b6f'], ['clair', '#ebecf0'], ['neutre', null],
];

/** A database at 0050 with one system per table row (sizes then colours) plus children hung on the first one. */
function base50(): Db {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(50));
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(D);
  db.prepare("INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'U', ?, 'univers-un')").run(D);
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 1, 'abc', 0.2, 1)").run();
  const sys = db.prepare(`INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, version, version_importee, transition)
    VALUES (?, 1, 1, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let id = 1;
  for (const [t] of TAILLES) { sys.run(id, `t${t}`, `Taille ${t}`, id, t, 'neutre', `n${t}`, 0, 1, 3, null, null); id++; }
  for (const [c] of COULEURS) { sys.run(id, `c-${c}`, `Couleur ${c}`, id, 2, c, '', 1, 0, 7, 4, 1.5); id++; }
  // An unknown legacy colour (the old column had no CHECK): no palette name, so no colour.
  sys.run(id, 'bleu', 'Bleu', id, 2, 'bleu', '', 0, 1, 1, null, null);
  return db;
}

test('0051 : chaque taille 1 à 5 prend la valeur de sa ligne de table', () => {
  const db = base50();
  migrate(db);
  for (const [t, v] of TAILLES) {
    const l = db.prepare('SELECT taille FROM swn_systemes WHERE cle = ?').get(`t${t}`) as { taille: number };
    assert.equal(l.taille, v, `taille ${t}`);
  }
});

test('0051 : chacun des cinq noms de couleur prend son #rrggbb, neutre devient null', () => {
  const db = base50();
  migrate(db);
  for (const [c, v] of COULEURS) {
    const l = db.prepare('SELECT couleur FROM swn_systemes WHERE cle = ?').get(`c-${c}`) as { couleur: string | null };
    assert.equal(l.couleur, v, `couleur ${c}`);
  }
  assert.equal((db.prepare("SELECT couleur FROM swn_systemes WHERE cle = 'bleu'").get() as { couleur: unknown }).couleur, null);
});

test('0051 : classe et voile nuls, les autres colonnes et les ids sont conservés', () => {
  const db = base50();
  const avant = db.prepare('SELECT id, galaxie_id, univers_id, cle, nom, q, r, notes, secret, promu, version, version_importee, transition FROM swn_systemes ORDER BY id').all();
  migrate(db);
  const apres = db.prepare('SELECT id, galaxie_id, univers_id, cle, nom, q, r, notes, secret, promu, version, version_importee, transition FROM swn_systemes ORDER BY id').all();
  assert.deepEqual(apres, avant);
  assert.equal(avant.length, 12);
  const n = db.prepare('SELECT count(*) AS n FROM swn_systemes WHERE classe IS NOT NULL OR voile IS NOT NULL').get() as { n: number };
  assert.equal(n.n, 0);
});

test('0051 : routes, astres, formations et éléments suivent leur système, foreign_key_check vide, cascades vivantes', () => {
  const db = base50();
  db.prepare('INSERT INTO swn_routes (id, galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (1, 1, 1, 1, 2, 1, 3)').run();
  db.prepare('INSERT INTO swn_routes (id, galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (2, 1, 1, 3, 1, 0, 4)').run();
  db.prepare(`INSERT INTO swn_astres (id, systeme_id, cle, genre, type, heure, orbite, taille) VALUES (1, 1, 'etoile', 'etoile', 'G', 0, 0, 1)`).run();
  db.prepare(`INSERT INTO swn_astres (id, systeme_id, cle, genre, type, heure, orbite, taille) VALUES (2, 1, 'p1', 'planete', 'terre', 3, 2, 0.3)`).run();
  db.prepare(`INSERT INTO swn_formations (id, systeme_id, cle, forme) VALUES (1, 1, 'anneau', 'anneau')`).run();
  db.prepare(`INSERT INTO swn_elements (id, systeme_id, cle, genre, nom, astre_id) VALUES (1, 1, 'port', 'station', 'Port', 2)`).run();
  db.prepare(`INSERT INTO swn_elements (id, systeme_id, cle, genre, nom, orbite, heure) VALUES (2, 1, 'nef', 'vaisseau', 'Nef', 1, 1)`).run();
  const compte = (t: string) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
  const avant = ['swn_routes', 'swn_astres', 'swn_formations', 'swn_elements'].map(compte);

  assert.deepEqual(migrate(db), [51, 52]);
  assert.deepEqual(['swn_routes', 'swn_astres', 'swn_formations', 'swn_elements'].map(compte), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(db.prepare('SELECT systeme_id FROM swn_astres ORDER BY id').all(), [{ systeme_id: 1 }, { systeme_id: 1 }]);

  // The children still point at the rebuilt table: deleting a system takes them away, and only theirs.
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM swn_systemes WHERE id = 1').run();
  assert.deepEqual(['swn_astres', 'swn_formations', 'swn_elements', 'swn_routes'].map(compte), [0, 0, 0, 0]);
  assert.equal(compte('swn_systemes'), 11);
});

test('0051 : la table refuse désormais une taille hors [0, 1] et une couleur qui n\'est pas #rrggbb, accepte classe et voile', () => {
  const db = base50();
  migrate(db);
  const ins = (cle: string, q: number, taille: unknown, couleur: unknown, classe: unknown = null, voile: unknown = null) =>
    db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, classe, voile) VALUES (1, 1, ?, 'X', ?, 99, ?, ?, ?, ?)`)
      .run(cle, q, taille, couleur, classe, voile);
  ins('ok', 50, 0, '#000000');
  ins('ok2', 51, 1, null, 'K', '#112233');
  assert.throws(() => ins('a', 52, 1.01, null), /CHECK/);
  assert.throws(() => ins('b', 53, -0.1, null), /CHECK/);
  assert.throws(() => ins('c', 54, 0.5, 'ambre'), /CHECK/);
  assert.throws(() => ins('d', 55, 0.5, '#FFF000'), /CHECK/);
  assert.throws(() => ins('e', 56, 0.5, null, 'KK'), /CHECK/);
  assert.throws(() => ins('f', 57, 0.5, null, null, 'rouge'), /CHECK/);
  const defaut = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r) VALUES (1, 1, 'dflt', 'D', 60, 60)").run();
  assert.equal((db.prepare('SELECT taille, couleur FROM swn_systemes WHERE id = ?').get(defaut.lastInsertRowid) as { taille: number }).taille, 0.45);
});

test('0051 : l\'index du bloc existe toujours, la clé et la case (galaxie, q, r) restent uniques', () => {
  const db = base50();
  migrate(db);
  const idx = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_swn_systemes_bloc'").get() as { sql: string };
  assert.match(idx.sql, /swn_systemes \(univers_id, q, r\)/);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'swn_systemes_nouveau'").get(), undefined);
  const ins = (cle: string, q: number, r: number) =>
    db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r) VALUES (1, 1, ?, 'X', ?, ?)`).run(cle, q, r);
  assert.throws(() => ins('t1', 70, 70), /UNIQUE/);
  assert.throws(() => ins('neuf', 1, 0), /UNIQUE/);
});

test('0051 : affichage_defaut vaut 1 sur les zones existantes, 0 et 1 seuls permis', () => {
  const db = base50();
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, secret) VALUES (1, 1, 'z', 'Z', '[[0,0],[1,0],[0,1]]', 'accent', 0)").run();
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, secret) VALUES (1, 1, 'z2', 'Z2', '[[0,0],[1,0],[0,1]]', 'neutre', 1)").run();
  migrate(db);
  assert.deepEqual(db.prepare('SELECT affichage_defaut AS a FROM swn_zones ORDER BY id').all(), [{ a: 1 }, { a: 1 }]);
  db.prepare("UPDATE swn_zones SET affichage_defaut = 0 WHERE cle = 'z'").run();
  assert.throws(() => db.prepare("UPDATE swn_zones SET affichage_defaut = 2 WHERE cle = 'z'").run(), /CHECK/);
});
