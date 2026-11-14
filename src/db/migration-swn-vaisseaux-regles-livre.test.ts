import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

// 0036 (W-5): the modifications table is rebuilt with the four new codes and without `armure_par_classe`; old codes are converted in the same copy.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0036 : montée depuis 0035, valeurs gardées, surcharge_arme devient surcharge_cumulable, les trois autres anciens effets deviennent simples', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(35));
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', '2026-11-01T00:00:00.000Z')").run();
  const ins = (cle: string, effet: string | null, extra: Record<string, unknown> = {}) => {
    const cols: Record<string, unknown> = { proprietaire: 'univers', univers_id: 1, cle, nom: `N ${cle}`, cout: 700, puissance: 2, masse: 1.5, pv: 3, ca: 4, limite: 1,
      x_cout: 0, x_puissance: 1, x_masse: 0, masque: 1, version: 6, version_catalogue: 'v1', cout_pct: 120, effet, ...extra };
    db.prepare(`INSERT INTO swn_catalogue_modifications (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`).run(...Object.values(cols) as any[]);
  };
  ins('vit', 'vitesse', { valeur: 2 });
  ins('ech', 'echange', { points_max: 3, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation', limite: 3 });
  ins('sur', 'surcharge_arme', { effet_pct: 50 });
  ins('opt', 'soutes_optimisees', { effet_pct: 10 });
  ins('arm', 'armure_par_classe', { armure_par_classe: '[1,2,3,4]' });
  ins('mon', 'montage_specialise', { valeur: -1 });
  ins('nu', null);
  const avant = Object.fromEntries((db.prepare('SELECT * FROM swn_catalogue_modifications').all() as any[]).map((r) => [r.cle, r]));
  assert.deepEqual(migrate(db), [36]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const apres = Object.fromEntries((db.prepare('SELECT * FROM swn_catalogue_modifications').all() as any[]).map((r) => [r.cle, r]));
  assert.equal(Object.keys(apres).length, 7);
  assert.ok(!('armure_par_classe' in apres.nu));
  for (const [cle, a] of Object.entries<any>(avant)) {
    for (const k of ['cout', 'puissance', 'masse', 'pv', 'ca', 'limite', 'x_puissance', 'masque', 'version', 'version_catalogue', 'cout_pct', 'nom']) assert.equal(apres[cle][k], a[k], `${cle}.${k}`);
  }
  assert.equal(apres.vit.effet, 'vitesse'); assert.equal(apres.vit.valeur, 2);
  assert.equal(apres.ech.echange_arrondi, 'installation'); assert.equal(apres.ech.points_max, 3);
  assert.equal(apres.sur.effet, 'surcharge_cumulable'); assert.equal(apres.sur.effet_pct, 50);
  for (const cle of ['opt', 'arm', 'mon']) { assert.equal(apres[cle].effet, null, cle); assert.equal(apres[cle].valeur, null, cle); assert.equal(apres[cle].effet_pct, null, cle); }
  assert.equal(apres.nu.effet, null);
  // new CHECK
  const maj = (cle: string, e: string) => db.prepare('UPDATE swn_catalogue_modifications SET effet = ? WHERE cle = ?').run(e, cle);
  for (const e of ['soutes_optimisees_livre', 'blindage_renforce', 'montages_specialises', 'surcharge_cumulable']) maj('nu', e);
  for (const e of ['soutes_optimisees', 'armure_par_classe', 'montage_specialise', 'surcharge_arme']) assert.throws(() => maj('nu', e), /CHECK/, e);
  // unique index and cascade survive the rebuild
  assert.throws(() => ins('vit', null), /UNIQUE/);
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM univers WHERE id = 1').run();
  assert.equal((db.prepare('SELECT COUNT(*) n FROM swn_catalogue_modifications').get() as any).n, 0);
});
