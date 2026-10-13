import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb } from '../db/db.js';

function base() {
  const db = openDb(':memory:');
  migrate(db);
  db.prepare("INSERT INTO univers (nom, cree_le) VALUES ('u', 'x')").run();
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 'lieu', 'a', '{}', 'x', 'x')").run();
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 'lieu', 'b', '{}', 'x', 'x')").run();
  return db;
}
const maj = (db: ReturnType<typeof base>, id: number, f: string | null, t: string | null, n: number | null) =>
  db.prepare('UPDATE fiches SET illustration_fichier=?, illustration_type=?, illustration_taille=? WHERE id=?').run(f, t, n, id);

test('migration 0006 : trois colonnes tout ou rien, types d’image seulement, fichier unique', () => {
  const db = base();
  maj(db, 1, 'f1', 'image/webp', 5); // complete triplet accepted
  maj(db, 1, null, null, null); // all absent accepted
  for (const t of ['image/svg+xml', 'text/html']) assert.throws(() => maj(db, 1, 'f', t, 5));
  assert.throws(() => maj(db, 1, 'f', 'image/png', null));
  assert.throws(() => maj(db, 1, null, 'image/png', 5));
  assert.throws(() => maj(db, 1, 'f', null, 5));
  assert.throws(() => maj(db, 1, 'f', 'image/png', 0));
  maj(db, 1, 'dup', 'image/png', 5);
  assert.throws(() => maj(db, 2, 'dup', 'image/png', 5));
});
