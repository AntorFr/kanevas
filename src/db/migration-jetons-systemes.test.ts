// Migration 0053 (AD-155, AD-systemes-api-4): `jetons_systemes`. The 0052 database is built by the test itself
// (migrations ≤ 0052, then SQL rows in the former schema).
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

test('0053 : un jeton de contenu, un d’outil et un révoqué restent lisibles, sans ligne de système', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-jetons-systemes-'));
  try {
    const source = new URL('./migrations/', import.meta.url);
    for (const file of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 52) copyFileSync(new URL(file, source), join(dir, file));
    }
    const db = openDb(':memory:');
    assert.equal(migrate(db, dir + '/').at(-1), 52);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'jetons_systemes'").get().n, 0);

    db.prepare('INSERT INTO comptes (id, username, cree_le) VALUES (1, ?, ?)').run('ana', D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (1, 'U1', '', ?, 'u-un')").run(D);
    db.prepare("INSERT INTO systemes_jeu (id, nom, cree_le) VALUES (7, 'Zeta', ?)").run(D);
    const ins = db.prepare(
      'INSERT INTO jetons_api (id, compte_id, nom, empreinte, cree_le, expire_le, revoque_le, contenu) VALUES (?, 1, ?, ?, ?, ?, ?, ?)',
    );
    ins.run(1, 'contenu', empreinteDe('kvs_contenu'), D, FUTUR, null, 1);
    ins.run(2, 'outil', empreinteDe('kvs_outil'), D, FUTUR, null, 0);
    ins.run(3, 'revoque', empreinteDe('kvs_revoque'), D, FUTUR, '2022-05-05T00:00:00.000Z', 1);
    const acces = db.prepare('INSERT INTO jetons_univers (jeton_id, univers_id, niveau) VALUES (?, 1, ?)');
    acces.run(1, 'ecriture');
    acces.run(2, 'lecture');
    acces.run(3, 'lecture');
    db.prepare("INSERT INTO jetons_outils (jeton_id, outil) VALUES (2, 'swn')").run();
    const avant = db.prepare('SELECT * FROM jetons_api ORDER BY id').all();

    assert.deepEqual(migrate(db), [53]);

    assert.deepEqual(db.prepare('SELECT * FROM jetons_api ORDER BY id').all(), avant, 'no token row moves');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jetons_systemes').get().n, 0);
    const c = verifierJeton(db, 'kvs_contenu', MAINTENANT)!;
    assert.equal(c.id, 1);
    assert.equal(c.contenu, true);
    assert.deepEqual(c.systemes, []);
    assert.deepEqual(c.univers.map((u) => [u.universId, u.niveau]), [[1, 'ecriture']]);
    const o = verifierJeton(db, 'kvs_outil', MAINTENANT)!;
    assert.equal(o.contenu, false);
    assert.deepEqual(o.outils, ['swn']);
    assert.deepEqual(o.systemes, []);
    assert.equal(verifierJeton(db, 'kvs_revoque', MAINTENANT), null);

    // the table: key, CHECK, cascades, index
    const ligne = db.prepare('INSERT INTO jetons_systemes (jeton_id, systeme_id, niveau) VALUES (?, ?, ?)');
    ligne.run(1, 7, 'lecture');
    assert.throws(() => ligne.run(1, 7, 'ecriture'), /UNIQUE|PRIMARY/);
    assert.throws(() => ligne.run(2, 7, 'tous'), /CHECK/);
    assert.throws(() => ligne.run(2, 7, 'aucun'), /CHECK/);
    assert.throws(() => ligne.run(99, 7, 'lecture'), /FOREIGN/);
    assert.throws(() => ligne.run(2, 99, 'lecture'), /FOREIGN/);
    assert.ok((db.prepare("PRAGMA index_list('jetons_systemes')").all() as { name: string }[]).some((i) => i.name === 'jetons_systemes_systeme'));
    ligne.run(2, 7, 'ecriture');
    db.prepare('DELETE FROM jetons_api WHERE id = 2').run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jetons_systemes').get().n, 1, 'the token takes its rows with it');
    db.prepare('DELETE FROM systemes_jeu WHERE id = 7').run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jetons_systemes').get().n, 0, 'the system takes its rows with it');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
