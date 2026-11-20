// kanevas-synchro-cartes, montée de la base : le critère demande la migration jouée sur une base d'exemple au schéma précédent.
// Attendu écrit du besoin (docs/donnees.md, « cartes » et « reglages_instance ») : les cartes existantes, leurs fonds et leurs
// éléments survivent ; elles n'ont ni clé d'origine, ni fiche, ni texte ; le plafond du fond est absent (donc 75 par défaut).
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-cartes-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('montée 0040 → suivante : les cartes, leurs fonds et leurs éléments survivent ; sans fiche, sans clé ; l’import et le rattachement ensuite possibles', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(40));
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cle, cree_le) VALUES (1, 'U', 'univ-essai', ?)").run(d);
  db.prepare("INSERT INTO fiches (id, univers_id, type, titre, cle, creee_via, charge, cree_le, modifie_le) VALUES (1, 1, 'lieu', 'Port', 'port', 'ecran', '{}', ?, ?)").run(d, d);
  db.prepare("INSERT INTO cartes (id, univers_id, titre, forme, visible, fond, fond_type, cree_le) VALUES (1, 1, 'Port-Sel', 'illustree', 1, 'abc-def', 'image/png', ?)").run(d);
  db.prepare("INSERT INTO cartes (id, univers_id, titre, forme, visible, cree_le) VALUES (2, 1, 'Liens', 'graphe', 0, ?)").run(d);
  db.prepare('INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (1, 1, 12.5, 80, ?)').run(d);

  migrate(db);

  const cartes = db.prepare('SELECT id, titre, forme, visible, fond, fond_type FROM cartes ORDER BY id').all();
  assert.deepEqual(cartes, [
    { id: 1, titre: 'Port-Sel', forme: 'illustree', visible: 1, fond: 'abc-def', fond_type: 'image/png' },
    { id: 2, titre: 'Liens', forme: 'graphe', visible: 0, fond: null, fond_type: null },
  ]);
  const neuf = db.prepare('SELECT cle_origine, fiche_id FROM cartes ORDER BY id').all();
  assert.deepEqual(neuf, [
    { cle_origine: null, fiche_id: null },
    { cle_origine: null, fiche_id: null },
  ]);
  assert.deepEqual(db.prepare('SELECT carte_id, fiche_id, x, y FROM elements_carte').all(), [{ carte_id: 1, fiche_id: 1, x: 12.5, y: 80 }]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  // rattachement possible, puis la fiche disparaît : la carte reste, détachée
  db.prepare('UPDATE cartes SET fiche_id = 1 WHERE id = 2').run();
  db.prepare('DELETE FROM elements_carte').run();
  db.prepare('DELETE FROM fiches WHERE id = 1').run();
  assert.deepEqual(db.prepare('SELECT id, fiche_id FROM cartes ORDER BY id').all(), [
    { id: 1, fiche_id: null },
    { id: 2, fiche_id: null },
  ]);
  // la clé d'origine est unique par univers
  db.prepare("UPDATE cartes SET cle_origine = 'k' WHERE id = 1").run();
  assert.throws(() => db.prepare("UPDATE cartes SET cle_origine = 'k' WHERE id = 2").run());
});
