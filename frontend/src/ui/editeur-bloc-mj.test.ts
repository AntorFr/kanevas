// kanevas-secrets-editeur: the « Bloc MJ » button's text rule. Expected values are literals from docs/ecrans.md.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { entourerBlocMJ } from './editeur-logique';

test('sélection d’un paragraphe en ligne propre : entouré de :::mj et ::: , sélection gardée', () => {
  const t = 'Avant\n\nSecret\n\nFin';
  assert.deepEqual(entourerBlocMJ(t, 7, 13), { texte: 'Avant\n\n:::mj\nSecret\n:::\n\nFin', debut: 13, fin: 19 });
});

test('sélection au milieu d’une ligne : les sauts de ligne manquants sont ajoutés pour que les deux lignes soient seules', () => {
  assert.equal(entourerBlocMJ('un mot ici', 3, 6).texte, 'un \n:::mj\nmot\n:::\n ici');
});

test('sélection du texte entier (début et fin de texte) : aucun saut superflu', () => {
  assert.equal(entourerBlocMJ('mot', 0, 3).texte, ':::mj\nmot\n:::');
});

test('sélection finissant par un saut de ligne : la ligne ::: suit directement', () => {
  assert.equal(entourerBlocMJ('a\nb\nc', 2, 4).texte, 'a\n:::mj\nb\n:::\nc');
});

test('sans sélection en fin de texte : deux lignes, une ligne vide entre, curseur sur la ligne vide', () => {
  assert.deepEqual(entourerBlocMJ('Texte\n', 6, 6), { texte: 'Texte\n:::mj\n\n:::', debut: 12, fin: 12 });
});

test('sans sélection dans un champ vide', () => {
  assert.deepEqual(entourerBlocMJ('', 0, 0), { texte: ':::mj\n\n:::', debut: 6, fin: 6 });
});

test('sans sélection au milieu d’une ligne : les deux lignes restent seules', () => {
  assert.equal(entourerBlocMJ('ab', 1, 1).texte, 'a\n:::mj\n\n:::\nb');
});

test('sélection à l’envers entourée comme à l’endroit', () => {
  assert.equal(entourerBlocMJ('x\nsecret\ny', 8, 2).texte, 'x\n:::mj\nsecret\n:::\ny');
});
