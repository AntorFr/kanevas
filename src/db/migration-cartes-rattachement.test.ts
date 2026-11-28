// Migration 0041 (AD-142, AD-143): a map gains origin key, attached sheet, text and version; `reglages_instance` appears.
// The 0040 database is built by the test itself (migrations up to 0040, then SQL rows).
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';
const colonnes = (db: ReturnType<typeof openDb>, t: string) =>
  (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);

test('0041 : les cartes gardent leurs lignes et leurs éléments, les colonnes neuves sont vides, reglages_instance existe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-cartes-'));
  try {
    const source = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 40) copyFileSync(new URL(f, source), join(dir, f));
    }
    const db = openDb(':memory:');
    assert.equal(migrate(db, dir + '/').at(-1), 40);
    assert.ok(!colonnes(db, 'cartes').includes('fiche_id'));
    const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p);

    run("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'mj', ?)", D);
    run("INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (1, 'Un', '', ?, 'un')", D);
    run("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (1, 1, 'lieu', 'Port', '{}', ?, ?, 'port', 'import')", D, D);
    run("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via) VALUES (2, 1, 'lieu', 'Fort', '{}', ?, ?, 'fort', 'import')", D, D);
    run("INSERT INTO cartes (id, univers_id, titre, forme, visible, fond, fond_type, cree_le) VALUES (7, 1, 'Plan', 'illustree', 1, 'disque-1', 'image/png', ?)", D);
    run("INSERT INTO cartes (id, univers_id, titre, forme, visible, cree_le) VALUES (9, 1, 'Graphe', 'graphe', 0, ?)", D);
    run('INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (7, 1, 10, 20, ?)', D);
    run('INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (9, 1, NULL, NULL, ?)', D);
    run('INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (9, 2, NULL, NULL, ?)', D);
    const lire = () => ({
      cartes: db.prepare('SELECT id, univers_id, titre, forme, visible, fond, fond_type, cree_le FROM cartes ORDER BY id').all(),
      elements: db.prepare('SELECT * FROM elements_carte ORDER BY id').all(),
    });
    const etat = lire();

    assert.deepEqual(migrate(db, new URL('./migrations/', import.meta.url).pathname), [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54]);

    assert.deepEqual(lire(), etat, 'lignes et éléments intacts, mêmes id');
    for (const c of ['cle_origine', 'fiche_id', 'texte', 'texte_public', 'version']) assert.ok(colonnes(db, 'cartes').includes(c), c);
    const neuves = db.prepare('SELECT cle_origine, fiche_id, texte, texte_public, version FROM cartes ORDER BY id').all() as Record<string, unknown>[];
    assert.equal(neuves.length, 2);
    for (const n of neuves) assert.deepEqual(n, { cle_origine: null, fiche_id: null, texte: '', texte_public: '', version: 0 });
    assert.deepEqual(colonnes(db, 'reglages_instance'), ['cle', 'valeur', 'modifie_le', 'modifie_par']);
    assert.equal((db.prepare('SELECT count(*) AS n FROM reglages_instance').get() as { n: number }).n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.deepEqual(migrate(db, new URL('./migrations/', import.meta.url).pathname), [], 'idempotente');

    // elements_carte still points at the rebuilt table, and the rules of 0007 still hold.
    assert.throws(() => run('DELETE FROM fiches WHERE id = 1'), 'fiche placée');
    assert.throws(() => run("UPDATE cartes SET forme = 'graphe' WHERE id = 7"), 'forme figée');
    assert.throws(() => run("INSERT INTO cartes (univers_id, titre, forme, fond, cree_le) VALUES (1, 't', 'illustree', 'x', ?)", D), 'fond sans type');
    // fiche_id: ON DELETE SET NULL.
    run('UPDATE cartes SET fiche_id = 2 WHERE id = 7');
    run('DELETE FROM elements_carte WHERE fiche_id = 2');
    run('DELETE FROM fiches WHERE id = 2');
    assert.equal((db.prepare('SELECT fiche_id FROM cartes WHERE id = 7').get() as { fiche_id: number | null }).fiche_id, null);
    // The origin key is unique per universe when set, free when null.
    run("UPDATE cartes SET cle_origine = 'a' WHERE id = 7");
    assert.throws(() => run("UPDATE cartes SET cle_origine = 'a' WHERE id = 9"));
    run('UPDATE cartes SET cle_origine = NULL WHERE id = 7');
    run("UPDATE cartes SET cle_origine = 'a' WHERE id = 9");
    // elements of a deleted map still guarded (the foreign key reaches the new table).
    assert.throws(() => run('INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (555, 1, 1, 1, ?)', D));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
