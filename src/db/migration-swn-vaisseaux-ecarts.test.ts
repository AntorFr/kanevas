import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

// 0034 (Y-2): upgrade from the 0033 schema with defences rows (negative-free values kept), foreign_key_check empty, new columns null.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0034 : montée depuis 0033, les défenses gardent leurs valeurs, colonnes nulles, index et CHECK vivants', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(33));
  const noms = (t: string) => (db.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name);
  assert.ok(!noms('swn_catalogue_modifications').includes('reparation_min'));
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', '2026-11-01T00:00:00.000Z')").run();
  const ins = (cle: string, bv: number | null) => db.prepare("INSERT INTO swn_catalogue_defenses (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, version_catalogue, classe_min, classe_max, condition, bonus_vitesse, version, masque) VALUES ('univers', 1, ?, 'N', 7, 1, 1.5, 2, 3, 4, 0, 1, 0, 'v1', 1, 3, 'cond', ?, 5, 1)").run(cle, bv);
  ins('a', 9); ins('b', 0); ins('c', null);
  const avant = db.prepare('SELECT * FROM swn_catalogue_defenses ORDER BY cle').all();
  assert.throws(() => ins('d', -2));
  assert.deepEqual(migrate(db), [34, 35]);
  assert.deepEqual(db.prepare('SELECT * FROM swn_catalogue_defenses ORDER BY cle').all(), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  ins('d', -9); ins('e', -2);
  assert.throws(() => ins('f', -10)); assert.throws(() => ins('g', 10));
  assert.throws(() => ins('a', 1), /UNIQUE/);
  assert.equal((db.prepare("SELECT version_catalogue v FROM swn_catalogue_defenses WHERE cle = 'a'").get() as any).v, 'v1');
  for (const c of ['reparation_min']) assert.ok(noms('swn_catalogue_modifications').includes(c));
  for (const c of ['soute_par_classe', 'reduction_cout_pct']) assert.ok(noms('swn_catalogue_amenagements').includes(c));
  db.prepare("INSERT INTO swn_catalogue_modifications (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, version_catalogue) VALUES ('univers', 1, 'm', 'N', 7, 1, 1, 0, 0, 0, 0, 0, 0, 'v1')").run();
  assert.equal((db.prepare('SELECT reparation_min r FROM swn_catalogue_modifications').get() as any).r, null);
});
