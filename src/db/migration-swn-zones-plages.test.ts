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
const colonnes = (db: ReturnType<typeof openDb>) =>
  (db.pragma('table_info(swn_zones)') as { name: string; notnull: number }[]);

test('0029 : montée depuis 0028, la colonne plages apparaît, nulle, et la zone polygonale reste intacte', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(28));
  assert.equal(colonnes(db).some((c) => c.name === 'plages'), false);
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', ?)").run(d);
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 0, 'abc', 0.2, 1)").run();
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, secret) VALUES (1, 1, 'z', 'Z', '[[0,0],[1,0],[0,1]]', 'accent', 0)").run();
  const avant = db.prepare('SELECT * FROM swn_zones').all() as Record<string, unknown>[];

  assert.deepEqual(migrate(db), [29, 30, 31, 32, 33]);

  const plages = colonnes(db).find((c) => c.name === 'plages');
  assert.ok(plages, 'la colonne plages existe');
  assert.equal(plages.notnull, 0);
  const apres = db.prepare('SELECT * FROM swn_zones').all() as Record<string, unknown>[];
  assert.equal(apres.length, avant.length);
  assert.equal(apres[0]!.plages, null);
  assert.equal(apres[0]!.contour, '[[0,0],[1,0],[0,1]]');
  const { plages: _p, ...reste } = apres[0]!;
  assert.deepEqual(reste, avant[0]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});
