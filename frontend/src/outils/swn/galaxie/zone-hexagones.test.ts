// Pure side of ZoneHexagones (B-84, E-21, Z-6), written from the exit criterion: the edge is the outer edge only
// (no stroke between two member hexagons), the cost is bounded (5 000 hexagons < 2 s) and memoised on (id, version).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculerGeometrie, geometrieDe } from './ZoneHexagones.tsx';

const nbBoucles = (d: string) => (d.match(/M/g) ?? []).length;
// each closed loop repeats its start point before the Z: distinct vertices = points - loops
const nbSommets = (d: string) => (d.match(/[ML]/g) ?? []).length - nbBoucles(d);

test('un hexagone seul : un bord de 6 sommets, un remplissage', () => {
  const g = calculerGeometrie([[0, 0, 0]]);
  assert.equal(nbBoucles(g.bord), 1);
  assert.equal(nbSommets(g.bord), 6);
  assert.equal(nbBoucles(g.plein), 1);
});

test('deux hexagones voisins : un seul contour de 10 sommets, pas de trait entre eux', () => {
  const g = calculerGeometrie([[0, 0, 1]]);
  assert.equal(nbBoucles(g.bord), 1);
  assert.equal(nbSommets(g.bord), 10);
});

test('un anneau avec île : deux boucles, extérieure et intérieure', () => {
  // 3 rangées, anneau de 6 autour de (0,0) absent : r=-1: q 0..1 ; r=0: q -1 et q 1 ; r=1: q -1..0
  const g = calculerGeometrie([[-1, 0, 1], [0, -1, -1], [0, 1, 1], [1, -1, 0]]);
  assert.equal(nbBoucles(g.bord), 2);
  assert.equal(nbSommets(g.bord), 18 + 6);
});

test('l\'étiquette est sur un hexagone membre, le plus proche de la moyenne (anneau : pas le trou)', () => {
  const g = calculerGeometrie([[-1, 0, 1], [0, -1, -1], [0, 1, 1], [1, -1, 0]]);
  const R3 = Math.sqrt(3);
  const membres = [[0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]].map(([q, r]) => [R3 * (q! + r! / 2), 1.5 * r!]);
  assert.ok(membres.some(([x, y]) => Math.abs(x! - g.centre.x) < 1e-6 && Math.abs(y! - g.centre.y) < 1e-6), JSON.stringify(g.centre));
});

test('5 000 hexagones (50 rangées de 100) : calculés en moins de 2 s', () => {
  const plages = Array.from({ length: 50 }, (_, r) => [r, 0, 99] as [number, number, number]);
  const t0 = performance.now();
  const g = calculerGeometrie(plages);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms} ms`);
  assert.equal(nbBoucles(g.bord), 1, 'un parallélogramme plein : un seul contour');
  assert.equal(nbBoucles(g.plein), 50);
});

test('mémoïsé sur (id, version) : même clé = un seul calcul, nouvelle version = un de plus', () => {
  const z = { id: 987001, version: 1, plages: [[0, 0, 3]] as [number, number, number][] };
  assert.equal(geometrieDe(z).calculs, 1);
  assert.equal(geometrieDe({ ...z }).calculs, 1);
  assert.equal(geometrieDe({ ...z, version: 2 }).calculs, 2);
});
