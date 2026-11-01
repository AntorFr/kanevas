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

test('catalogues : montée depuis 0018 peuplée, lots et jetons restent lisibles (outil nul)', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(18));
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', ?)").run(d);
  db.exec("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj')");
  db.prepare("INSERT INTO jetons_api (id, univers_id, compte_id, nom, empreinte, cree_le, expire_le) VALUES (1, 1, 1, 'j', 'fp', ?, '2027-01-01T00:00:00.000Z')").run(d);
  db.prepare("INSERT INTO lots_import (id, univers_id, jeton_id, ouvert_le) VALUES (1, 1, 1, ?)").run(d);
  const jeton = db.prepare('SELECT * FROM jetons_api').all();
  const lot = db.prepare('SELECT * FROM lots_import').all();

  assert.deepEqual(migrate(db), [19]);
  assert.deepEqual(db.prepare('SELECT * FROM jetons_api').all(), jeton);
  assert.deepEqual(db.prepare('SELECT * FROM lots_import').all(), lot.map((l) => ({ ...(l as object), outil: null })));
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(migrate(db), []);

  // les tables du module d'essai existent, vides, avec leurs contraintes
  for (const t of ['jetons_outils', 'essai_catalogue_elements', 'essai_catalogue_retraits']) {
    assert.equal((db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n, 0);
  }
  db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (1, 'essai/g')").run();
  assert.throws(() => db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (1, 'essai/g')").run(), /UNIQUE|PRIMARY/);
  assert.throws(() => db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (99, 'x')").run(), /FOREIGN/);
  const ins = `INSERT INTO essai_catalogue_elements (niveau, systeme_id, univers_id, nature, cle, nom, masse, cout, portee, masque, version_catalogue) VALUES `;
  assert.throws(() => db.exec(ins + "('systeme', NULL, 1, 'coques', 'a', 'A', 1, 1, NULL, 0, 'v')"), /CHECK/);
  assert.throws(() => db.exec(ins + "('univers', NULL, 1, 'coques', 'a', 'A', 1, 1, NULL, 0, 'v'), ('univers', NULL, 1, 'coques', 'a', 'B', 1, 1, NULL, 0, 'v')"), /UNIQUE/);
  assert.throws(() => db.exec(ins + "('univers', NULL, 1, 'armes', 'z', 'Z', 1, 1, NULL, 0, 'v')"), /CHECK/);
  assert.throws(() => db.exec(ins + "('univers', NULL, 1, 'coques', 'y', 'Y', -1, 1, NULL, 0, 'v')"), /CHECK/);
  assert.throws(() => db.exec(ins + "('univers', NULL, 1, 'coques', 'y', 'Y', 1, 1.5, NULL, 0, 'v')"), /CHECK/);
});
