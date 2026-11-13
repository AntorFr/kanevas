import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

// 0032 (X-1): upgrade from the 0031 schema with rows in both tables; rows kept, new columns null, checks live.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}
const NOUVELLES_M = ['cout_pct', 'effet', 'valeur', 'points_max', 'sens', 'echange_puissance', 'echange_masse'];
const NOUVELLES_A = ['effet', 'rend_puissance', 'rend_masse', 'soute'];

test('0032 : montée depuis 0031, les lignes restent, colonnes nouvelles nulles, foreign_key_check vide', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(31));
  const noms = (t: string) => (db.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name);
  for (const c of NOUVELLES_M) assert.ok(!noms('swn_catalogue_modifications').includes(c), c);
  for (const c of NOUVELLES_A) assert.ok(!noms('swn_catalogue_amenagements').includes(c), c);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', '2026-11-01T00:00:00.000Z')").run();
  const ins = (t: string, cle: string) => db.prepare(`INSERT INTO swn_catalogue_${t} (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, version_catalogue) VALUES ('univers', 1, ?, 'N', 7, 1, 1.5, 0, 0, 0, 0, 0, 0, 'v1')`).run(cle);
  ins('modifications', 'm'); ins('amenagements', 'a');
  const avant = (t: string) => db.prepare(`SELECT * FROM swn_catalogue_${t}`).all() as Record<string, unknown>[];
  const [m0, a0] = [avant('modifications'), avant('amenagements')];

  assert.deepEqual(migrate(db), [32, 33, 34, 35, 36]);

  for (const [t, cs, a] of [['modifications', NOUVELLES_M, m0], ['amenagements', NOUVELLES_A, a0]] as const) {
    const apres = avant(t);
    assert.equal(apres.length, 1);
    for (const c of cs) { assert.equal(apres[0]![c], null, `${t}.${c}`); delete apres[0]![c]; }
    for (const c of ['reparation_min', 'soute_par_classe', 'reduction_cout_pct', 'effet_pct', 'echange_arrondi', 'reduction_base']) delete apres[0]![c]; // 0034 and 0035 columns, not the subject here
    assert.deepEqual(apres, a);
  }
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.throws(() => db.prepare("UPDATE swn_catalogue_modifications SET cout_pct = 0").run());
  assert.throws(() => db.prepare("UPDATE swn_catalogue_amenagements SET effet = 'armure'").run());
  db.prepare("UPDATE swn_catalogue_modifications SET cout_pct = 10, effet = 'armure', valeur = 2").run();
});
