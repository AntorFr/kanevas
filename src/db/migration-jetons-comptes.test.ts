// Migration 0038 (AD-144): tokens belong to an account and reach universes through `jetons_univers`.
// The 0037 database is built by the test itself (migrations ≤ 0037, then SQL rows in the former schema).
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';

test('0038 : chaque jeton reçoit son créateur et une ligne ecriture pour son univers ; ids, empreintes, dates et lot intacts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-jetons-'));
  try {
    const source = new URL('./migrations/', import.meta.url);
    for (const file of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 37) copyFileSync(new URL(file, source), join(dir, file));
    }
    const db = openDb(':memory:');
    assert.equal(migrate(db, dir + '/').at(-1), 37);
    for (const [id, nom] of [[1, 'ana'], [2, 'bob']] as const) db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (?, ?, ?)').run(id, nom, D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (1, 'U1', '', ?, 'u-un')").run(D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (2, 'U2', '', ?, 'u-deux')").run(D);
    const ins = db.prepare(
      'INSERT INTO jetons_api (id, univers_id, compte_id, nom, empreinte, cree_le, expire_le, revoque_le, dernier_usage_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    ins.run(3, 1, 1, 'actif', 'fp-a', D, '2999-01-01T00:00:00.000Z', null, '2022-03-03T00:00:00.000Z');
    ins.run(7, 2, 2, 'revoque', 'fp-r', D, '2999-01-01T00:00:00.000Z', '2022-04-04T00:00:00.000Z', null);
    ins.run(9, 1, 2, 'expire', 'fp-e', D, '2022-03-01T00:00:00.000Z', null, null);
    db.prepare("INSERT INTO lots_import (id, univers_id, jeton_id, ouvert_le) VALUES (5, 2, 7, ?)").run(D);

    assert.deepEqual(migrate(db), [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52]);

    const j = db.prepare('SELECT * FROM jetons_api ORDER BY id').all() as Record<string, unknown>[];
    assert.deepEqual(j.map((r) => r.id), [3, 7, 9]);
    assert.deepEqual(j.map((r) => r.compte_id), [1, 2, 2]);
    assert.deepEqual(j.map((r) => r.empreinte), ['fp-a', 'fp-r', 'fp-e']);
    assert.deepEqual(j.map((r) => r.expire_le), ['2999-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z', '2022-03-01T00:00:00.000Z']);
    assert.deepEqual(j.map((r) => r.dernier_usage_le), ['2022-03-03T00:00:00.000Z', null, null]);
    assert.deepEqual(j.map((r) => r.revoque_le), [null, '2022-04-04T00:00:00.000Z', null]);
    assert.deepEqual(j.map((r) => r.revoque_par), [null, 2, null], 'revoked: its owner');
    assert.deepEqual(j.map((r) => r.tous), [0, 0, 0]);
    assert.ok(j.every((r) => r.niveau_tous === null && r.modifie_par_admin_par === null && r.modifie_par_admin_le === null));
    assert.ok(!('univers_id' in j[0]!), 'no more univers_id');
    assert.deepEqual(
      db.prepare('SELECT jeton_id, univers_id, niveau FROM jetons_univers ORDER BY jeton_id').all(),
      [{ jeton_id: 3, univers_id: 1, niveau: 'ecriture' }, { jeton_id: 7, univers_id: 2, niveau: 'ecriture' }, { jeton_id: 9, univers_id: 1, niveau: 'ecriture' }],
    );
    assert.deepEqual(db.prepare('SELECT id, jeton_id, univers_id FROM lots_import').all(), [{ id: 5, jeton_id: 7, univers_id: 2 }]);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1, 'foreign keys back on');
    // the next id continues the old sequence
    const n = db
      .prepare("INSERT INTO jetons_api (compte_id, nom, empreinte, cree_le, expire_le) VALUES (1, 'n', 'fp-n', ?, '2999-01-01T00:00:00.000Z')")
      .run(D);
    assert.ok(Number(n.lastInsertRowid) > 9);
    // the checks of the new schema
    assert.throws(() => db.prepare("UPDATE jetons_api SET tous = 1 WHERE id = 3").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO jetons_univers (jeton_id, univers_id, niveau) VALUES (3, 2, 'admin')").run(), /CHECK/);
    // deleting a token takes its rows
    db.prepare('UPDATE lots_import SET jeton_id = 3').run();
    db.prepare('DELETE FROM jetons_api WHERE id = 9').run();
    assert.equal((db.prepare('SELECT count(*) AS n FROM jetons_univers WHERE jeton_id = 9').get() as { n: number }).n, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
