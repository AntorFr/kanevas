// kanevas-rv-composants: Avatar initials (docs/charte.md § Avatar, maquettes E-1/E-3/E-6). Literals, not recomputed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initialesDe } from './composants';

test('avatar : un nom d’un seul mot donne ses deux premières lettres', () => {
  assert.equal(initialesDe('antor'), 'AN');
  assert.equal(initialesDe('Léa'), 'LÉ');
});

test('avatar : plusieurs mots donnent l’initiale des deux premiers', () => {
  assert.equal(initialesDe('Jean Dupont'), 'JD');
  assert.equal(initialesDe('jean-luc picard'), 'JL');
  assert.equal(initialesDe('anne marie claire'), 'AM');
});

test('avatar : cas limites (vide, blancs, une lettre, caractère hors plan de base)', () => {
  assert.equal(initialesDe(''), '');
  assert.equal(initialesDe('   '), '');
  assert.equal(initialesDe('a'), 'A');
  assert.equal(initialesDe('  antor  '), 'AN');
  assert.equal(initialesDe('𝒜bc'), '𝒜B'.toUpperCase());
});
