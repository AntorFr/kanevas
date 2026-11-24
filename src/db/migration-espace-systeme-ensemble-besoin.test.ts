// Montée de kanevas-systemes-jeu-elements, écrite depuis le critère de la fiche : sur une base d'exemple au schéma précédent
// (gabarits présents, systèmes rattachés ou non), chaque système reçoit son espace caché et la table `gabarits` disparaît.
// La base d'avant est construite par le test lui-même (migrations ≤ 0051, puis des lignes SQL dans l'ancien schéma).
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';

function baseAvant(dir: string) {
  const source = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(source)) {
    if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 51) copyFileSync(new URL(file, source), join(dir, file));
  }
  const db = openDb(':memory:');
  assert.equal(migrate(db, dir + '/').at(-1), 51);
  return db;
}

test('montée : chaque système, rattaché ou non, reçoit un espace caché unique ; gabarits supprimée ; univers réels et noms de systèmes intacts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'montee-espace-'));
  try {
    const db = baseAvant(dir);
    for (const [id, nom] of [[1, 'Alpha'], [2, 'Beta'], [3, 'Gamma']] as const) db.prepare('INSERT INTO systemes_jeu (id, nom, cree_le) VALUES (?, ?, ?)').run(id, nom, D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle, systeme_id) VALUES (1, 'U1', '', ?, 'u-un', 1)").run(D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle, systeme_id) VALUES (2, 'U2', '', ?, 'u-deux', 1)").run(D);
    db.prepare("INSERT INTO univers (id, nom, description, cree_le, cle, systeme_id) VALUES (3, 'U3', '', ?, 'u-trois', NULL)").run(D);
    const g = db.prepare('INSERT INTO gabarits (systeme_id, type, nom, contenu, cree_le, modifie_le) VALUES (?, ?, ?, ?, ?, ?)');
    g.run(1, 'regle', 'Initiative', 'Un d8', D, D);
    g.run(1, 'objet', 'Pistolet', 'Un d6', D, D);
    g.run(2, 'creature', 'Loup', 'Mord', D, D);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM gabarits').get() as { n: number }).n, 3);

    assert.equal(migrate(db)[0], 52);

    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gabarits'").get(), undefined, 'gabarits disparue');
    const espaces = db.prepare('SELECT id, espace_systeme_id FROM univers WHERE espace_systeme_id IS NOT NULL ORDER BY espace_systeme_id').all() as { id: number; espace_systeme_id: number }[];
    assert.deepEqual(espaces.map((e) => e.espace_systeme_id), [1, 2, 3], 'un espace par système, sans doublon');
    const reels = db.prepare('SELECT id, nom, systeme_id FROM univers WHERE espace_systeme_id IS NULL ORDER BY id').all();
    assert.deepEqual(reels, [{ id: 1, nom: 'U1', systeme_id: 1 }, { id: 2, nom: 'U2', systeme_id: 1 }, { id: 3, nom: 'U3', systeme_id: null }]);
    assert.deepEqual(db.prepare('SELECT id, nom FROM systemes_jeu ORDER BY id').all(), [{ id: 1, nom: 'Alpha' }, { id: 2, nom: 'Beta' }, { id: 3, nom: 'Gamma' }]);
    assert.equal(
      (db.prepare('SELECT COUNT(*) n FROM membres WHERE univers_id IN (SELECT id FROM univers WHERE espace_systeme_id IS NOT NULL)').get() as { n: number }).n,
      0,
      'aucun MJ du système avant que l’admin en ajoute',
    );
    assert.equal((db.prepare('SELECT COUNT(*) n FROM fiches WHERE univers_id IN (SELECT id FROM univers WHERE espace_systeme_id IS NOT NULL)').get() as { n: number }).n, 0, 'aucun contenu de gabarit conservé');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('montée : une base sans aucun système se monte sans créer d’espace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'montee-espace-vide-'));
  try {
    const db = baseAvant(dir);
    assert.equal(migrate(db)[0], 52);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM univers').get() as { n: number }).n, 0);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gabarits'").get(), undefined);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
