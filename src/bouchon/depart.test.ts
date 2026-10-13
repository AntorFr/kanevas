import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrate, openDb } from '../db/db.js';
import { assurerCompte } from '../services/comptes.js';
import { listerSystemes } from '../services/systemes.js';
import { listerUnivers } from '../services/univers.js';
import { semerBouchon } from './depart.js';

function monde() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

test('semis : univers, rôles et systèmes des critères ; Teo n’a rien ; Mira son seul univers', () => {
  const db = monde();
  assert.equal(semerBouchon(db), true);
  const id = (u: string) => assurerCompte(db, u).id;
  const rolesAntor = listerUnivers(db, id('antor')).map((u) => [u.nom, u.role, u.systeme?.nom]);
  assert.deepEqual(rolesAntor, [
    ["Lame d'Ébène", 'mj', 'CoF Mini'],
    ['Les Cendres de Vaëlis', 'joueur', 'Chroniques Oubliées Fantasy'],
  ]);
  assert.deepEqual(listerUnivers(db, id('lea')).map((u) => [u.nom, u.role]), [["Lame d'Ébène", 'joueur']]);
  assert.deepEqual(listerUnivers(db, id('teo')), []);
  assert.deepEqual(listerSystemes(db, id('teo')), []);
  const mira = listerSystemes(db, id('mira'));
  assert.equal(mira.length, 1);
  assert.equal(mira[0]!.nom, 'CoF Mini');
  assert.equal(mira[0]!.nbUnivers, 2);
  assert.deepEqual(mira[0]!.mesUnivers.map((u) => u.nom), ['Les Landes grises']);
  assert.deepEqual(mira[0]!.entrees, { regle: 3, creature: 4, objet: 2 });
});

test('semis : fiches sans illustration, une seule fois, jamais sur une base qui a un univers', () => {
  const db = monde();
  semerBouchon(db);
  const titres = (db.prepare('SELECT titre FROM fiches ORDER BY titre').all() as { titre: string }[]).map((r) => r.titre);
  for (const t of ['Maître Aldric', 'Le Prieur masqué', "Le Portrait de l'échec", 'La Fresque effacée', 'Cercle des Cendres']) {
    assert.ok(titres.includes(t), t);
  }
  assert.equal((db.prepare('SELECT COUNT(*) n FROM pieces_jointes').get() as { n: number }).n, 0);
  assert.equal(semerBouchon(db), false);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM univers').get() as { n: number }).n, 3);
});
