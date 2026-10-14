// kanevas-markdown-editeur: pure rules of the editor. Expected values are literals from docs/ecrans.md.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { depasse, entourer, messageTropLong } from './editeur-logique';

test('Ctrl+B sur un mot sélectionné l’entoure de ** et garde le mot sélectionné', () => {
  assert.deepEqual(entourer('un mot ici', 3, 6, '**'), { texte: 'un **mot** ici', debut: 5, fin: 8 });
});

test('Ctrl+I sans sélection pose deux marques et place le curseur entre elles', () => {
  assert.deepEqual(entourer('ab', 1, 1, '*'), { texte: 'a**b', debut: 2, fin: 2 });
});

test('une sélection à l’envers (fin avant début) est entourée comme à l’endroit', () => {
  assert.deepEqual(entourer('un mot ici', 6, 3, '**'), { texte: 'un **mot** ici', debut: 5, fin: 8 });
});

test('entourer en bord de texte (début, fin, vide)', () => {
  assert.equal(entourer('mot', 0, 3, '**').texte, '**mot**');
  assert.equal(entourer('', 0, 0, '**').texte, '****');
});

test('plafond : 100 000 passe, 100 001 dépasse, plafond inconnu ne vérifie rien', () => {
  assert.equal(depasse('a'.repeat(100000), 100000), false);
  assert.equal(depasse('a'.repeat(100001), 100000), true);
  assert.equal(depasse('a'.repeat(500000), undefined), false);
});

test('message de plafond : les mots de l’interface et du serveur', () => {
  assert.equal(messageTropLong(100000), '100 000 caractères au plus.');
  assert.equal(messageTropLong(999), '999 caractères au plus.');
});
