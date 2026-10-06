// kanevas-rv-composants: the pure rules of the shared components (docs/charte.md § 4). Expected values
// are literals taken from the charte, not recomputed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { etatAudience, motAudience } from './composants';
import { indexSuivant } from './menu';
import { DUREE_TOAST_MS, empiler, MAX_TOASTS } from './toast';

test('toast : 4 s et trois au plus (charte, kanevas-refonte-visuelle § Détail)', () => {
  assert.equal(DUREE_TOAST_MS, 4000);
  assert.equal(MAX_TOASTS, 3);
});

test('toast : un quatrième chasse le plus ancien, le plus récent reste en bas', () => {
  let l: { id: number; texte: string }[] = [];
  for (const id of [1, 2, 3]) l = empiler(l, { id, texte: `t${id}` });
  assert.deepEqual(l.map((t) => t.id), [1, 2, 3]);
  l = empiler(l, { id: 4, texte: 't4' });
  assert.deepEqual(l.map((t) => t.id), [2, 3, 4]);
});

test('menu : ↓ ↑ bouclent, Home/End aux extrémités, autre touche : rien', () => {
  assert.equal(indexSuivant(3, 0, 'ArrowDown'), 1);
  assert.equal(indexSuivant(3, 2, 'ArrowDown'), 0);
  assert.equal(indexSuivant(3, 0, 'ArrowUp'), 2);
  assert.equal(indexSuivant(3, 1, 'ArrowUp'), 0);
  assert.equal(indexSuivant(3, 1, 'Home'), 0);
  assert.equal(indexSuivant(3, 0, 'End'), 2);
  assert.equal(indexSuivant(3, 1, 'a'), null);
  assert.equal(indexSuivant(0, -1, 'ArrowDown'), null);
});

test('audience : le mot se déduit des cinq réglages (charte, Pastille d’audience)', () => {
  const base = { joueursLisent: false, joueursEcrivent: false, auteurLit: false, auteurEcrit: false };
  assert.equal(etatAudience({ ...base, joueursLisent: true }), 'lue');
  assert.equal(etatAudience({ ...base, joueursLisent: true, joueursEcrivent: true }), 'ecrite');
  assert.equal(etatAudience({ ...base, joueursLisent: true, auteurLit: true }), 'lue');
  assert.equal(etatAudience({ ...base, auteurLit: true }), 'confiee');
  assert.equal(etatAudience({ ...base, auteurEcrit: true }), 'confiee');
  assert.equal(etatAudience(base), 'mj');
  // players cannot write what they cannot read: the word stays the author's / MJ's
  assert.equal(etatAudience({ ...base, joueursEcrivent: true }), 'mj');
  assert.equal(motAudience('lue'), 'Lue des joueurs');
  assert.equal(motAudience('ecrite'), 'Écrite par les joueurs');
  assert.equal(motAudience('confiee', 'Léa'), 'Confiée à Léa');
  assert.equal(motAudience('mj'), 'MJ seul');
});
