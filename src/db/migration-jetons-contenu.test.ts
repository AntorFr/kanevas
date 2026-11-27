// Migration 0051 (AD-jeton-unique-1): `jetons_api.contenu` — 0 for a token with a `jetons_outils` row, 1 for the others.
// The 0045 database is built by the test itself (migrations ≤ 0045, then SQL rows in the former schema).
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { empreinteDe, verifierJeton } from '../services/jetons.js';
import { migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';
const FUTUR = '2999-01-01T00:00:00.000Z';
const MAINTENANT = new Date('2023-01-01T00:00:00.000Z');

test('0051 : le jeton d’outil passe à contenu 0, les autres (révoqué compris) à 1 ; chacun s’ouvre comme avant', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-jetons-contenu-'));
  try {
    const source = new URL('./migrations/', import.meta.url);
    for (const file of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 50) copyFileSync(new URL(file, source), join(dir, file));
    }
    const db = openDb(':memory:');
    assert.equal(migrate(db, dir + '/').at(-1), 50);
    assert.ok(!(db.prepare('PRAGMA table_info(jetons_api)').all() as { name: string }[]).some((c) => c.name === 'contenu'));

    db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?)').run('ana', D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (1, 'U1', '', ?, 'u-un')").run(D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (2, 'U2', '', ?, 'u-deux')").run(D);
    const ins = db.prepare(
      'INSERT INTO jetons_api (id, compte_id, nom, empreinte, cree_le, expire_le, revoque_le) VALUES (?, 1, ?, ?, ?, ?, ?)',
    );
    ins.run(1, 'contenu', empreinteDe('kvs_contenu'), D, FUTUR, null);
    ins.run(2, 'outil', empreinteDe('kvs_outil'), D, FUTUR, null);
    ins.run(3, 'revoque', empreinteDe('kvs_revoque'), D, FUTUR, '2022-05-05T00:00:00.000Z');
    ins.run(4, 'outil-revoque', empreinteDe('kvs_outilrevoque'), D, FUTUR, '2022-05-05T00:00:00.000Z');
    const acces = db.prepare('INSERT INTO jetons_univers (jeton_id, univers_id, niveau) VALUES (?, ?, ?)');
    acces.run(1, 1, 'ecriture');
    acces.run(2, 2, 'lecture');
    acces.run(3, 1, 'lecture');
    acces.run(4, 1, 'ecriture');
    db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (2, 'swn')").run();
    db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (4, 'swn')").run();

    assert.deepEqual(migrate(db), [51, 52, 53, 54, 55]);

    assert.deepEqual(
      db.prepare('SELECT id, contenu, nom, empreinte, expire_le, revoque_le FROM jetons_api ORDER BY id').all(),
      [
        { id: 1, contenu: 1, nom: 'contenu', empreinte: empreinteDe('kvs_contenu'), expire_le: FUTUR, revoque_le: null },
        { id: 2, contenu: 0, nom: 'outil', empreinte: empreinteDe('kvs_outil'), expire_le: FUTUR, revoque_le: null },
        { id: 3, contenu: 1, nom: 'revoque', empreinte: empreinteDe('kvs_revoque'), expire_le: FUTUR, revoque_le: '2022-05-05T00:00:00.000Z' },
        { id: 4, contenu: 0, nom: 'outil-revoque', empreinte: empreinteDe('kvs_outilrevoque'), expire_le: FUTUR, revoque_le: '2022-05-05T00:00:00.000Z' },
      ],
    );

    // each opens and reads as before: value, scope, level, universe
    const c = verifierJeton(db, 'kvs_contenu', MAINTENANT)!;
    assert.equal(c.id, 1);
    assert.equal(c.contenu, true);
    assert.deepEqual(c.outils, []);
    assert.deepEqual(c.univers.map((u) => [u.universId, u.niveau]), [[1, 'ecriture']]);
    const o = verifierJeton(db, 'kvs_outil', MAINTENANT)!;
    assert.equal(o.id, 2);
    assert.equal(o.contenu, false);
    assert.deepEqual(o.outils, ['swn']);
    assert.deepEqual(o.univers.map((u) => [u.universId, u.niveau]), [[2, 'lecture']]);
    assert.equal(verifierJeton(db, 'kvs_revoque', MAINTENANT), null, 'revoked stays refused');
    assert.equal(verifierJeton(db, 'kvs_outilrevoque', MAINTENANT), null, 'revoked tool token stays refused');
    assert.equal(verifierJeton(db, 'kvs_inconnu', MAINTENANT), null);

    // the CHECK of the column, and its default for a token written without it
    assert.throws(() => db.prepare('UPDATE jetons_api SET contenu = 2 WHERE id = 1').run(), /CHECK/);
    db.prepare("INSERT INTO jetons_api (compte_id, nom, empreinte, cree_le, expire_le) VALUES (1, 'n', 'fp-n', ?, ?)").run(D, FUTUR);
    assert.equal((db.prepare("SELECT contenu FROM jetons_api WHERE empreinte = 'fp-n'").get() as { contenu: number }).contenu, 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
