import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

// 0033 (X-4): upgrade from the 0032 schema with a stored design; the row is kept, reparation reads 0, the CHECK 0 to 20 is live.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0033 : montée depuis 0032, la conception reste, reparation vaut 0, CHECK 0 à 20', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(32));
  const noms = () => (db.pragma('table_info(swn_conceptions)') as { name: string }[]).map((c) => c.name);
  assert.ok(!noms().includes('reparation'));
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', '2026-11-01T00:00:00.000Z')").run();
  db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 1, 'vaisseau', 'V', '{}', 'x', 'x')").run();
  db.prepare(`INSERT INTO swn_conceptions (univers_id, fiche_id, coque_cle, choix, version_reglages, version_catalogue, resultat)
    VALUES (1, 1, 'c', '[]', 'r', 'c', '{}')`).run();
  assert.deepEqual(migrate(db), [33, 34, 35, 36]);
  const l = db.prepare('SELECT coque_cle, choix, reparation FROM swn_conceptions').all() as any[];
  assert.deepEqual(l, [{ coque_cle: 'c', choix: '[]', reparation: 0 }]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  for (const v of [0, 20]) db.prepare('UPDATE swn_conceptions SET reparation = ?').run(v);
  for (const v of [-1, 21, 1.5, 'x']) assert.throws(() => db.prepare('UPDATE swn_conceptions SET reparation = ?').run(v), String(v));
});
