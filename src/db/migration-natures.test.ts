// Migration 0018 (kanevas-fiches-liees-natures-serveur): `relations.type` becomes `qualificatif`, a `nature`
// column appears, ids and count are kept. The base at the previous schema is built here, rows by hand.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

function base17() {
  const dir = mkdtempSync(join(tmpdir(), 'mig-nat-'));
  const source = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(source)) {
    if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 17) copyFileSync(new URL(f, source), join(dir, f));
  }
  const db = openDb(':memory:');
  migrate(db, dir + '/');
  const d = '2021-03-03T12:34:56.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?)").run(d);
  const fiche = db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 1, ?, ?, '{}', ?, ?)");
  fiche.run(1, 'personnage', 'Aldric', d, d);
  fiche.run(2, 'lieu', 'Port-Sel', d, d);
  const cols = db.prepare('PRAGMA table_info(sections)').all() as { name: string; notnull: number; dflt_value: unknown }[];
  const requis = cols.filter((c) => c.notnull && c.dflt_value === null && c.name !== 'id').map((c) => c.name);
  const val: Record<string, unknown> = { fiche_id: 1, titre: 'Apparence', contenu: 'x', ordre: 0, version: 1, cree_le: d, modifie_le: d };
  for (const c of requis) assert.ok(c in val || c === 'fiche_id', `colonne obligatoire inattendue: ${c}`);
  const noms = Object.keys(val).filter((k) => cols.some((c) => c.name === k));
  db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (1, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => val[k]));
  const rel = db.prepare('INSERT INTO relations (id, section_id, cible_fiche_id, type, cree_le) VALUES (?, 1, ?, ?, ?)');
  rel.run(7, 2, 'maître de port', d);
  rel.run(9, 2, 'surveille', d);
  rel.run(12, 2, 'y fait passer ses cargaisons', d);
  return db;
}

test('0018 : trois relations à type → nature "" et ancien texte en qualificatif, mêmes ids, clés étrangères saines', () => {
  const db = base17();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM relations').get()?.n, 3);
  assert.deepEqual(migrate(db), [18]);
  assert.deepEqual(
    db.prepare('SELECT id, nature, qualificatif, cible_fiche_id FROM relations ORDER BY id').all(),
    [
      { id: 7, nature: '', qualificatif: 'maître de port', cible_fiche_id: 2 },
      { id: 9, nature: '', qualificatif: 'surveille', cible_fiche_id: 2 },
      { id: 12, nature: '', qualificatif: 'y fait passer ses cargaisons', cible_fiche_id: 2 },
    ],
  );
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM migrations WHERE numero = 18').get()?.n, 1);
  assert.deepEqual(migrate(db), []);
});

test('0018 : unicité (section, cible, nature, qualificatif), index relations_par_cible_nature, qualificatif vide permis, 81 refusé', () => {
  const db = base17();
  migrate(db);
  const ins = (nature: string, q: string) =>
    db.prepare("INSERT INTO relations (section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (1, 2, ?, ?, 'a')").run(nature, q);
  ins('membre', '');
  assert.throws(() => ins('membre', ''), /UNIQUE/);
  ins('allie', ''); // another nature, same qualifier
  ins('', 'maître de port-bis');
  assert.throws(() => ins('', 'maître de port'), /UNIQUE/); // the migrated row keeps its uniqueness
  assert.throws(() => ins('', 'a'.repeat(81)), /CHECK/);
  const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'relations'").all() as { name: string }[]).map((r) => r.name);
  for (const n of ['relations_par_section', 'relations_par_cible', 'relations_par_cible_nature']) assert.ok(idx.includes(n), n);
  // cascades survive the recreation
  db.prepare('DELETE FROM sections WHERE id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM relations').get()?.n, 0);
});
