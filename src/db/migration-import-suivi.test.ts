// The reprise mandate requires a populated 0015 database, not only a fresh install.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

test('0016 preserves populated 0015 rows, adds null import markers and scopes origin keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-suivi-'));
  const db = openDb(':memory:');
  try {
    const source = new URL('./migrations/', import.meta.url);
    for (const file of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 15) {
        copyFileSync(new URL(file, source), join(dir, file));
      }
    }
    migrate(db, dir + '/');
    const date = '2021-03-03T12:34:56.000Z';
    db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?), (2, 'lea', ?)").run(date, date);
    db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?), (2, 'Autre', ?)").run(date, date);
    db.exec("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj'), (1, 2, 'joueur'), (2, 1, 'mj')");
    const campaign = db.prepare('INSERT INTO campagnes (id, univers_id, nom, statut, cree_le) VALUES (?, ?, ?, ?, ?)');
    campaign.run(11, 1, 'Les Brumes', 'active', date);
    campaign.run(12, 1, 'Prélude', 'terminee', date);
    campaign.run(13, 2, 'Autre campagne', 'en_preparation', date);
    const scenario = db.prepare('INSERT INTO scenarios (id, campagne_id, titre, contenu, version, cree_le, modifie_le) VALUES (?, ?, ?, ?, ?, ?, ?)');
    scenario.run(21, 11, 'Arrivée au port', '# Port\n' + 'é'.repeat(60000), 7, date, date);
    scenario.run(22, 11, 'Suite', '', 1, date, date);
    scenario.run(23, 12, 'Prélude', '[[cle:lieu:port-sel|Port-Sel]]', 3, date, date);
    db.prepare("INSERT INTO taches_preparation (campagne_id, categorie, libelle, faite, faite_le, cree_le) VALUES (11, 'pnj', 'Capitaine', 1, ?, ?)").run(date, date);

    const tables = ['comptes', 'univers', 'membres', 'campagnes', 'scenarios', 'taches_preparation'];
    const snapshot = () => tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    assert.deepEqual(migrate(db), [16, 17]);
    const expected = before.map((rows, i) => rows.map((row) => ({
      ...(row as Record<string, unknown>),
      ...(tables[i] === 'campagnes' ? { cle_origine: null, dernier_import: null } : {}),
      ...(tables[i] === 'scenarios' ? { cle_origine: null, dernier_import: null, version_importee: null } : {}),
    })));
    assert.deepEqual(snapshot(), expected);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.deepEqual(migrate(db), []);
    assert.deepEqual(snapshot(), expected);

    // Existing null keys coexist; a non-null key is unique only within its owner.
    db.exec("UPDATE campagnes SET cle_origine = 'c:brumes' WHERE id IN (11, 13)");
    assert.throws(() => db.exec("UPDATE campagnes SET cle_origine = 'c:brumes' WHERE id = 12"), /UNIQUE/);
    db.exec("UPDATE scenarios SET cle_origine = 's:1' WHERE id IN (21, 23)");
    assert.throws(() => db.exec("UPDATE scenarios SET cle_origine = 's:1' WHERE id = 22"), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE campagnes SET dernier_import = 'invalid' WHERE id = 11"), /CHECK/);
    assert.throws(() => db.exec("UPDATE scenarios SET dernier_import = 'invalid' WHERE id = 21"), /CHECK/);
    assert.throws(() => db.exec('UPDATE scenarios SET version_importee = 0 WHERE id = 21'), /CHECK/);
    db.exec(`UPDATE campagnes SET dernier_import = '{"nom":"Les Brumes","statut":"active"}' WHERE id = 11`);
    db.exec(`UPDATE scenarios SET dernier_import = '{"titre":"Arrivée au port"}', version_importee = 7 WHERE id = 21`);
    const imported = snapshot();
    assert.deepEqual(migrate(db), []);
    assert.deepEqual(snapshot(), imported);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
