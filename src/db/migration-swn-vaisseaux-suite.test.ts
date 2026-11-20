import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

// 0035 (Z-6): the modifications table is rebuilt; rows, values, versions, masks and unique indexes survive, new columns null, foreign_key_check empty.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0035 : montée depuis 0034, modifications et aménagements gardent leurs valeurs, colonnes nulles, CHECK élargi', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(34));
  const noms = (t: string) => (db.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name);
  assert.ok(!noms('swn_catalogue_modifications').includes('effet_pct'));
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', '2026-11-01T00:00:00.000Z')").run();
  const mod = (cle: string, effet: string | null, extra = '') => db.prepare(`INSERT INTO swn_catalogue_modifications (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, effet, valeur, cout_pct, reparation_min${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ('univers', 1, ?, 'N', 7, 2, 1.5, 3, 4, 5, 0, 1, 0, 1, 6, 'v1', ?, ?, 120, 9${extra ? ', ' + extra.split('=')[1] : ''})`).run(cle, effet, effet === 'armure' ? 3 : null);
  mod('a', 'armure'); mod('b', null); mod('c', 'vitesse');
  assert.throws(() => mod('d', 'surcharge_arme'));
  db.prepare("INSERT INTO swn_catalogue_amenagements (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, version_catalogue, classe_min, classe_max, condition) VALUES ('univers', 1, 'am', 'N', 7, 1, 1.5, 2, 3, 4, 0, 1, 0, 'v1', 1, 3, 'cond')").run();
  const avantM = db.prepare('SELECT * FROM swn_catalogue_modifications ORDER BY cle').all();
  const avantA = db.prepare('SELECT * FROM swn_catalogue_amenagements ORDER BY cle').all();
  assert.deepEqual(migrate(db, dossierJusqua(35)), [35]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const apres = db.prepare('SELECT * FROM swn_catalogue_modifications ORDER BY cle').all() as any[];
  assert.equal(apres.length, 3);
  for (const [i, l] of apres.entries()) {
    for (const [k, v] of Object.entries(avantM[i] as any)) assert.deepEqual(l[k], v, `${l.cle}.${k}`);
    assert.equal(l.effet_pct, null); assert.equal(l.armure_par_classe, null); assert.equal(l.echange_arrondi, null);
  }
  const am = db.prepare('SELECT * FROM swn_catalogue_amenagements ORDER BY cle').all() as any[];
  for (const [k, v] of Object.entries(avantA[0] as any)) assert.deepEqual(am[0][k], v, k);
  assert.equal(am[0].reduction_base, null);
  mod('d', 'surcharge_arme');
  assert.throws(() => mod('a', null), /UNIQUE/);
  assert.equal((db.prepare("SELECT masque m, version v, version_catalogue c FROM swn_catalogue_modifications WHERE cle = 'a'").get() as any).m, 1);
  // cascade survives the rebuild
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM univers WHERE id = 1').run();
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_catalogue_modifications').get() as any).n, 0);
  assert.equal(noms('swn_catalogue_amenagements').includes('reduction_base'), true);
});
