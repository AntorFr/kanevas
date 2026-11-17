// Comet tails as label obstacles (B-89): the placement never sits on a tail, and `queuesComete` gives the renderer's geometry.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placerEtiquettes, type CorpsEtiquette, type Mesureur, type Obstacle } from './etiquettes.ts';
import { PORTEE_COURONNE, queuesComete } from './carte-geometrie.ts';

const mesurer: Mesureur = (t) => ({ largeur: [...t].length * 6, hauteur: 12 });
const vue = { largeur: 400, hauteur: 300 };
type Queue = Extract<Obstacle, { type: 'queue' }>;

// Independent check: the tail's real extent, walked every half pixel (distance from the rectangle to the axis point vs the half-width there).
function toucheLaQueue(e: { x: number; y: number; largeur: number; hauteur: number }, q: Queue): boolean {
  for (let s = 0; s <= q.longueur; s += 0.5) {
    const t = s / q.longueur, px = q.x + q.dx * s, py = q.y + q.dy * s;
    const cx = Math.max(e.x, Math.min(px, e.x + e.largeur)), cy = Math.max(e.y, Math.min(py, e.y + e.hauteur));
    if (Math.hypot(cx - px, cy - py) < q.r0 + (q.r1 - q.r0) * t) return true;
  }
  return false;
}

describe('obstacle queue de comète', () => {
  const comete: CorpsEtiquette = { cle: 'c', genre: 'comete', nom: 'Comète de Halley', x: 200, y: 150, rayon: 7 };
  // A tail going straight down from the comet: exactly where the preferred side (below) would put the label.
  const bas: Queue = { type: 'queue', x: 200, y: 150, dx: 0, dy: 1, longueur: 80, r0: 4, r1: 20 };

  it('la place préférée sous le corps, prise par la queue, est quittée', () => {
    const e = placerEtiquettes([comete], vue, mesurer, [bas])[0]!;
    assert.ok(e.visible);
    assert.equal(toucheLaQueue(e, bas), false);
  });
  it('sans la queue, la même étiquette est sous le corps (le test ci-dessus déplace bien quelque chose)', () => {
    const e = placerEtiquettes([comete], vue, mesurer)[0]!;
    assert.ok(e.visible && e.y >= 157 && toucheLaQueue(e, bas));
  });
  it('un rectangle posé au bout de la queue (large, loin de l’axe) la touche : écarté', () => {
    // 15 px along the axis, the half-width is ~7: a label 5 px beside the axis is on the tail.
    const q: Queue = { type: 'queue', x: 100, y: 100, dx: 1, dy: 0, longueur: 60, r0: 3, r1: 30 };
    const corps: CorpsEtiquette = { cle: 'x', genre: 'planete', nom: 'Astre', x: 60, y: 100, rayon: 4 };
    for (const e of placerEtiquettes([corps], vue, mesurer, [q]).filter((r) => r.visible)) assert.equal(toucheLaQueue(e, q), false);
  });
  it('la queue est une ligne de disques : la partie étroite près de la tête compte autant que la large', () => {
    const q: Queue = { type: 'queue', x: 200, y: 150, dx: 0, dy: -1, longueur: 100, r0: 2, r1: 40 };
    const c: CorpsEtiquette = { cle: 'p', genre: 'planete', nom: 'Planète', x: 200, y: 150, rayon: 9 };
    const e = placerEtiquettes([c], vue, mesurer, [q])[0]!;
    assert.ok(e.visible);
    assert.equal(toucheLaQueue(e, q), false);
  });
  it('queue de longueur nulle ou rayons nuls : ne plante pas et ne bloque rien', () => {
    const q: Queue = { type: 'queue', x: 0, y: 0, dx: 1, dy: 0, longueur: 0, r0: 0, r1: 0 };
    const c: CorpsEtiquette = { cle: 'p', genre: 'planete', nom: 'Planète', x: 200, y: 150, rayon: 9 };
    assert.deepEqual(placerEtiquettes([c], vue, mesurer, [q]), placerEtiquettes([c], vue, mesurer));
  });
  it('une queue qui couvre toute la vue replie l’étiquette, et deux appels donnent le même résultat', () => {
    const q: Queue = { type: 'queue', x: 0, y: 150, dx: 1, dy: 0, longueur: 400, r0: 400, r1: 400 };
    const a = placerEtiquettes([comete], vue, mesurer, [q]);
    assert.equal(a[0]!.visible, false);
    assert.deepEqual(placerEtiquettes([comete], vue, mesurer, [q]), a);
  });
  it('les queues réelles d’une comète : aucune étiquette de la fixture ne les touche, à 390 et 1280 px', () => {
    for (const [l, h] of [[390, 700], [1280, 720]] as const) {
      const cx = l / 2, cy = h / 2;
      const qs = queuesComete(cx, cy, 90, undefined);
      const corps: CorpsEtiquette[] = [{ cle: 'c', genre: 'comete', nom: 'Astre sans nom', x: cx, y: cy, rayon: 7 }];
      for (let i = 0; i < 8; i++) corps.push({ cle: `p${i}`, genre: 'planete', nom: `Astre sans nom ${i}`, x: cx + Math.cos(i) * 90, y: cy + Math.sin(i) * 90, rayon: 6 });
      for (const e of placerEtiquettes(corps, { largeur: l, hauteur: h }, mesurer, qs).filter((r) => r.visible)) {
        for (const q of qs) assert.equal(toucheLaQueue(e, q), false, `${e.cle} sur la queue à ${l}px`);
      }
    }
  });
});

describe('queuesComete', () => {
  it('aspect par défaut, côté 100 : deux queues, tête à la position, gaz vers (-0,8 ; 0,6)', () => {
    const [gaz, poussiere] = queuesComete(10, 20, 100, undefined);
    assert.equal(gaz!.x, 10); assert.equal(gaz!.y, 20);
    assert.equal(poussiere!.x, 10); assert.equal(poussiere!.y, 20);
    assert.ok(Math.abs(gaz!.dx - -0.8) < 1e-9 && Math.abs(gaz!.dy - 0.6) < 1e-9);
    // long = (0.3 + 0.55) × 100 × 0.95 = 80.75 ; gas tail: 80.75 × 1.05 × 0.75 ; dust tail: 80.75 × 0.85 × 0.75
    assert.ok(Math.abs(gaz!.longueur - 63.589) < 0.01, String(gaz!.longueur));
    assert.ok(Math.abs(poussiere!.longueur - 51.478) < 0.01, String(poussiere!.longueur));
    assert.ok(Math.abs(gaz!.r0 - 3.485) < 0.01, String(gaz!.r0));
  });
  it('sens -1 : le gaz part à l’opposé, en miroir horizontal', () => {
    const [a] = queuesComete(0, 0, 100, undefined);
    const [b] = queuesComete(0, 0, 100, { sens: -1 });
    assert.ok(Math.abs(b!.dx + a!.dx) < 1e-9 && Math.abs(b!.dy - a!.dy) < 1e-9);
  });
  it('un aspect hors bornes ou non numérique est ramené aux bornes, sans NaN', () => {
    for (const aspect of [{ longueur: 99, ouverture: -4, tete: 'x', courbure: NaN, sens: 'y' }, { longueur: Infinity }, {}]) {
      for (const q of queuesComete(5, 5, 80, aspect)) {
        for (const v of [q.dx, q.dy, q.longueur, q.r0, q.r1]) assert.ok(Number.isFinite(v));
        assert.ok(q.longueur > 0 && q.r0 > 0 && q.r1 >= q.r0);
      }
    }
  });
  it('une queue plus longue (longueur 1) s’étend plus loin qu’une courte (0,1)', () => {
    assert.ok(queuesComete(0, 0, 100, { longueur: 1 })[0]!.longueur > queuesComete(0, 0, 100, { longueur: 0.1 })[0]!.longueur);
  });
  it('la portée de la couronne est 0,9', () => assert.equal(PORTEE_COURONNE, 0.9));
});
