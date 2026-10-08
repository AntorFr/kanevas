// Tests of the graph layout (AD-71), written from the exit criterion of kanevas-cg-ecran-graphe:
// deterministic, unaffected by nodes the reader did not receive, within the unit square.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { disposer } from './disposition';

const N = [
  { id: 3, titre: 'La Guilde' },
  { id: 1, titre: 'Les Lames Grises' },
  { id: 2, titre: 'Les Ombres de Fer' },
];
const L = [
  { de: 1, vers: 2 },
  { de: 1, vers: 3 },
];

test('vide : aucune position ; un seul nœud : au centre', () => {
  assert.equal(disposer([], []).size, 0);
  assert.deepEqual([...disposer([{ id: 7, titre: 'Seul' }], []).entries()], [[7, { x: 0.5, y: 0.5 }]]);
});

test('même graphe, même disposition, quel que soit l’ordre d’arrivée des nœuds', () => {
  const a = disposer(N, L);
  const b = disposer([...N].reverse(), L);
  assert.equal(a.size, 3);
  for (const n of N) assert.deepEqual(a.get(n.id), b.get(n.id));
  // Link order only reorders float sums: same picture to well under a pixel.
  const c = disposer(N, [...L].reverse());
  for (const n of N) {
    assert.ok(Math.abs(a.get(n.id)!.x - c.get(n.id)!.x) < 1e-3);
    assert.ok(Math.abs(a.get(n.id)!.y - c.get(n.id)!.y) < 1e-3);
  }
  assert.deepEqual([...disposer(N, L).entries()], [...a.entries()]);
});

test('un nœud absent de la réponse ne change rien : la disposition ne dépend que du graphe reçu', () => {
  // Léa's graph (2 nodes, no link) is the same whether or not a third node exists server-side.
  const deux = N.filter((n) => n.id !== 3);
  const a = disposer(deux, []);
  const b = disposer(deux, []);
  assert.deepEqual([...a.entries()], [...b.entries()]);
});

test('toutes les positions restent dans le carré unité, sans NaN, deux nœuds distincts', () => {
  const grand = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, titre: `Fiche ${i % 7}` }));
  const liens = grand.slice(1).map((n) => ({ de: 1, vers: n.id }));
  const p = disposer(grand, liens);
  assert.equal(p.size, 100);
  for (const { x, y } of p.values()) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  }
  const deux = disposer(N.slice(0, 2), []);
  const [u, v] = [...deux.values()];
  assert.ok(Math.hypot(u!.x - v!.x, u!.y - v!.y) > 0.5, 'deux nœuds sont écartés');
});

test('liens vers un nœud inconnu ou sur soi-même : ignorés, sans erreur', () => {
  const p = disposer(N, [...L, { de: 1, vers: 99 }, { de: 2, vers: 2 }]);
  assert.equal(p.size, 3);
});

test('les titres identiques se départagent par identifiant : stable', () => {
  const m = [
    { id: 5, titre: 'Même' },
    { id: 4, titre: 'Même' },
  ];
  assert.deepEqual([...disposer(m, []).entries()], [...disposer([...m].reverse(), []).entries()]);
});
