import assert from 'node:assert/strict';
import { test } from 'node:test';

// Z-1, Z-2, Z-4 (B-84): the pure shape of a zone, polygon or set of hexagons.
import { compterPlages, contient, developper, formeValide, plagesDe } from './forme.js';

const code = (f: unknown) => { const r = formeValide(f); return r.ok ? 'ok' : r.code; };

test('formeValide : un polygone comme avant, un ensemble de 1 à 5 000, les codes de refus', () => {
  assert.equal(code([[0, 0], [4, 0], [0, 4]]), 'ok');
  assert.equal(code([[0, 0], [1, 0]]), 'contour_trop_court');
  assert.equal(code({ hexagones: [[0, 0]] }), 'ok');
  assert.equal(code({ hexagones: [] }), 'hexagones_vides');
  assert.equal(code({ hexagones: Array.from({ length: 5000 }, (_, i) => [i, 0]) }), 'ok');
  assert.equal(code({ hexagones: Array.from({ length: 5001 }, (_, i) => [i, 0]) }), 'hexagones_trop_nombreux');
  for (const mauvais of [[[0.5, 0]], [[0]], [[0, 0, 0]], [['a', 1]], [[100001, 0]], [null], [[NaN, 0]]]) {
    assert.equal(code({ hexagones: mauvais }), 'hexagones_invalide', JSON.stringify(mauvais));
  }
  assert.equal(code({ hexagones: 'x' }), 'hexagones_invalide');
  assert.equal(code({ hexagones: [[0, 0]], autre: 1 }), 'hexagones_invalide');
  assert.equal(code({}), 'contour_invalide');
});

test('plagesDe : plages canoniques triées, disjointes, jamais adjacentes, doublons fondus, ordre sans effet', () => {
  const h: [number, number][] = [[3, 1], [1, 0], [0, 0], [2, 0], [5, 0], [5, 0], [-2, 1], [4, 1]];
  assert.deepEqual(plagesDe(h), [[0, 0, 2], [0, 5, 5], [1, -2, -2], [1, 3, 4]]);
  assert.deepEqual(plagesDe([...h].reverse()), plagesDe(h));
  assert.equal(compterPlages(plagesDe(h)), 7);
  assert.deepEqual(developper(plagesDe(h)).map(String).sort(), [...new Set(h.map(String))].sort());
});

test('contient : ensemble par plages (trou, bords, rangée absente) et polygone comme avant', () => {
  const anneau = { contour: [], plages: plagesDe([[0, 0], [1, 0], [3, 0], [4, 0], [1, 1]]) };
  assert.equal(contient(anneau, 1, 0), true);
  assert.equal(contient(anneau, 2, 0), false); // the hole
  assert.equal(contient(anneau, 4, 0), true);
  assert.equal(contient(anneau, 5, 0), false);
  assert.equal(contient(anneau, 1, 2), false);
  const poly = { contour: [[0, 0], [6, 0], [0, 6]] as [number, number][], plages: null };
  assert.equal(contient(poly, 1, 1), true);
  assert.equal(contient(poly, 6, 6), false);
});
