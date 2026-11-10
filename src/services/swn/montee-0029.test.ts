import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// 0029 (F-1): upgrade from the 0028 schema with the seed rows; identical counts, null columns, empty foreign_key_check.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');

const TABLES = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples'];
const NOUVELLES: Record<string, string[]> = {
  coques: ['vitesse', 'armure', 'equipage_min', 'equipage_max'], moteurs: ['classe_min', 'classe_max', 'condition'],
  amenagements: ['classe_min', 'classe_max', 'condition', 'effet', 'rend_puissance', 'rend_masse', 'soute', 'soute_par_classe', 'reduction_cout_pct'], defenses: ['classe_min', 'classe_max', 'condition', 'bonus_vitesse'],
  armes: ['degats', 'perforation', 'qualites', 'niveau_tech'], exemples: ['equipage'],
  // 0032: also written by the seed; stubbed here, all NULL after the real migration.
  modifications: ['cout_pct', 'effet', 'valeur', 'points_max', 'sens', 'echange_puissance', 'echange_masse', 'reparation_min'],
};

test('0029 : montée depuis 0028 avec le semis, comptes inchangés, colonnes nouvelles nulles, foreign_key_check vide', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-0029-'));
  const db = openDb(':memory:');
  const source = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(source).filter((x) => /^\d{4}-.+\.sql$/.test(x))) if (Number(f.slice(0, 4)) <= 28) copyFileSync(new URL(f, source), join(dir, f));
  migrate(db, dir + '/');
  // The seed writes the 0029 columns: stubs for the duration of the seed.
  const stub = (v: 'ADD COLUMN' | 'DROP COLUMN') => { for (const [t, cs] of Object.entries(NOUVELLES)) for (const c of cs) db.exec(`ALTER TABLE swn_catalogue_${t} ${v} ${c}${v === 'ADD COLUMN' ? ' INTEGER' : ''}`); };
  stub('ADD COLUMN'); db.exec('ALTER TABLE swn_conceptions ADD COLUMN equipage INTEGER'); // 0030, written by the seed
  semerBouchon(db); db.exec('ALTER TABLE swn_conceptions DROP COLUMN equipage'); stub('DROP COLUMN');
  const comptes = () => TABLES.map((t) => (db.prepare(`SELECT COUNT(*) n FROM swn_catalogue_${t}`).get() as any).n as number);
  const avant = comptes();
  assert.ok(avant.every((n) => n > 0));
  assert.deepEqual(migrate(db), [29, 30, 31, 32, 33, 34]);
  assert.deepEqual(comptes(), avant);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  for (const [t, cs] of Object.entries(NOUVELLES)) for (const c of cs) {
    assert.equal((db.prepare(`SELECT COUNT(*) n FROM swn_catalogue_${t} WHERE ${c} IS NOT NULL`).get() as any).n, t === 'armes' && c === 'classe_min' ? 0 : 0, `${t}.${c}`);
  }
});
