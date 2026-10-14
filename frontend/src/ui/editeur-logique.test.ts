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

// kanevas-liens-ecran: the `[[` of P-14 step 1. Literal expectations from docs/ecrans.md.
import { insererLien, ouvertureLien, ouvrirLien, texteDeLien } from './editeur-logique';

test('[[ : le caret dans un [[ ouvert rend où il commence et la saisie', () => {
  assert.deepEqual(ouvertureLien('Voir [[ald', 10), { debut: 5, requete: 'ald' });
  assert.deepEqual(ouvertureLien('[[', 2), { debut: 0, requete: '' });
});

test('[[ : pas de liste après ]], un retour à la ligne, un | ou hors d’un [[', () => {
  assert.equal(ouvertureLien('Voir [[1|Aldric]] puis', 22), null);
  assert.equal(ouvertureLien('[[ald\nsuite', 11), null);
  assert.equal(ouvertureLien('[[1|Al', 6), null);
  assert.equal(ouvertureLien('un [ seul', 9), null);
});

test('[[ : le caret avant le [[ ne l’ouvre pas', () => {
  assert.equal(ouvertureLien('ab [[ald', 2), null);
});

test('insérer : [[ald devient [[<id>|<titre>]], le texte après le caret reste, le caret tombe après', () => {
  assert.deepEqual(insererLien('Voir [[ald et la suite', 5, 10, 7, 'Maître Aldric'), {
    texte: 'Voir [[7|Maître Aldric]] et la suite',
    debut: 24,
    fin: 24,
  });
});

test('insérer : un titre à | ] ou retour à la ligne est nettoyé, vide → [[<id>]]', () => {
  assert.equal(insererLien('[[', 0, 2, 3, 'A|B]C\nD').texte, '[[3|A B C D]]');
  assert.equal(insererLien('[[', 0, 2, 3, ' | ').texte, '[[3]]');
});

test('texte d’un lien : 200 caractères au plus', () => {
  assert.equal(texteDeLien('a'.repeat(250)).length, 200);
});

test('Ctrl+K : ouvre un [[ au caret, la sélection devient le début de la recherche', () => {
  assert.deepEqual(ouvrirLien('un mot ici', 3, 6), { texte: 'un [[mot ici', debut: 8, fin: 8 });
  assert.deepEqual(ouvrirLien('ab', 1, 1), { texte: 'a[[b', debut: 3, fin: 3 });
});
