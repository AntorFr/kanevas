// Whole-feature test of kanevas-carte-rendu-cometes (B-116, P-27, E-23): the pure geometry of a comet's tail and trajectory, written from
// docs/parcours.md B-116 and docs/ecrans.md « Comets » — a tail turned away from the star, longer near it; a trajectory that is a very long
// ellipse from its perihelion, the star at a focus, in the sense of its settings. Expected values are literals checked by hand, or
// properties of the conic the besoin names (never recomputed with the code's own formula).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { U, queueDeComete, trajectoireDeComete } from './carte-geometrie.ts';

const O = { x: 0, y: 0 };
const dist = (p: number[], c = O) => Math.hypot(p[0]! - c.x, p[1]! - c.y);
const aux = (points: number[][], ref: number[]) => Math.min(...points.map((p) => Math.hypot(p[0]! - ref[0]!, p[1]! - ref[1]!)));

describe('B-116 la queue d’une comète est à l’opposé de l’étoile et plus longue près d’elle', () => {
  it('comète à l’est de l’étoile : la queue part vers l’est (1, 0) ; au nord : vers le haut (0, −1) ; au sud-ouest : (−0,6 ; 0,8)', () => {
    const est = queueDeComete({ x: 3 * U, y: 0 }, O, 0.55);
    assert.ok(Math.abs(est.dx - 1) < 1e-9 && Math.abs(est.dy) < 1e-9, `${est.dx}, ${est.dy}`);
    const nord = queueDeComete({ x: 0, y: -2 * U }, O, 0.55);
    assert.ok(Math.abs(nord.dx) < 1e-9 && Math.abs(nord.dy + 1) < 1e-9, `${nord.dx}, ${nord.dy}`);
    const sudOuest = queueDeComete({ x: -3, y: 4 }, O, 0.55);
    assert.ok(Math.abs(sudOuest.dx + 0.6) < 1e-9 && Math.abs(sudOuest.dy - 0.8) < 1e-9, `${sudOuest.dx}, ${sudOuest.dy}`);
  });

  it('la direction est celle de l’étoile vers la comète quand l’étoile n’est pas à l’origine', () => {
    const q = queueDeComete({ x: 110, y: 40 }, { x: 10, y: 40 }, 0.55);
    assert.ok(Math.abs(q.dx - 1) < 1e-9 && Math.abs(q.dy) < 1e-9);
  });

  it('une comète sur son étoile a la queue droit vers le haut, sans NaN', () => {
    const q = queueDeComete({ x: 5, y: 5 }, { x: 5, y: 5 }, 0.55);
    assert.deepEqual([q.dx, q.dy], [0, -1]);
    assert.ok(Number.isFinite(q.longueur) && q.longueur > 0 && Number.isFinite(q.rotation));
  });

  it('la longueur décroît avec la distance à l’étoile et ne tombe jamais à zéro', () => {
    const l = (d: number) => queueDeComete({ x: d * U, y: 0 }, O, 0.55).longueur;
    assert.ok(l(1) > l(3) && l(3) > l(8) && l(8) > l(30), `${l(1)} ${l(3)} ${l(8)} ${l(30)}`);
    assert.ok(l(1000) > 0, 'une queue lointaine reste visible');
    assert.ok(l(0) >= l(1), 'la plus longue au centre');
  });

  it('une queue demandée plus longue par l’aspect (longueur 1) l’est plus que la queue courte (0,1) à la même place', () => {
    const c = { x: 3 * U, y: 0 };
    assert.ok(queueDeComete(c, O, 1).longueur > queueDeComete(c, O, 0.1).longueur);
  });
});

describe('B-116 la trajectoire d’une comète est une ellipse très allongée depuis son périhélie, l’étoile à un foyer', () => {
  const comete = (heure: number, sens?: number, perihelie?: number) => ({
    x: 6 * U * Math.sin((heure / 12) * 2 * Math.PI), y: -6 * U * Math.cos((heure / 12) * 2 * Math.PI), orbite: 6, heure,
    aspect: { ...(perihelie === undefined ? {} : { perihelie }), ...(sens === undefined ? {} : { sens }) },
  });

  it('elle passe par la comète et son point le plus proche de l’étoile est à 1 unité d’orbite (le périhélie demandé)', () => {
    const c = comete(3, 1, 1);
    const { points } = trajectoireDeComete(c, O, 12);
    assert.ok(points.length > 20);
    assert.ok(aux(points, [c.x, c.y]) < 1, `la ligne passe à ${aux(points, [c.x, c.y])} px de la comète`);
    const mini = Math.min(...points.map((p) => dist(p)));
    assert.ok(Math.abs(mini - U) < 0.01 * U, `périhélie ${mini} px, attendu ${U}`);
  });

  it('elle est très allongée : le point le plus loin tracé est à 12 unités quand le périhélie est à 1 (12 fois plus loin)', () => {
    const { points } = trajectoireDeComete(comete(3, 1, 1), O, 12);
    const maxi = Math.max(...points.map((p) => dist(p)));
    assert.ok(maxi >= 11.5 * U && maxi <= 12.5 * U, `plus loin ${maxi / U} unités`);
  });

  it('l’étoile est à un foyer : la ligne est symétrique de part et d’autre de l’axe étoile–périhélie,', () => {
    const c = comete(3, 1, 1);
    const { points } = trajectoireDeComete(c, O, 12);
    const peri = points.reduce((a, p) => (dist(p) < dist(a) ? p : a));
    const ux = peri[0]! / dist(peri), uy = peri[1]! / dist(peri);
    // reflect every point across the apse axis (through the star): it lands on the line again
    for (const p of points.filter((q) => dist(q) < 6 * U)) {
      const t = p[0]! * ux + p[1]! * uy;
      const miroir = [2 * t * ux - p[0]!, 2 * t * uy - p[1]!];
      assert.ok(aux(points, miroir) < 0.08 * dist(p) + 2, `le miroir de (${p}) est à ${aux(points, miroir)} px de la ligne`);
    }
    // a focus, not the centre: the line is far from symmetric about the star (the far end is much farther than the near one)
    const loin = points.reduce((a, p) => (dist(p) > dist(a) ? p : a));
    assert.ok(dist(loin) > 5 * dist(peri));
  });

  it('un périhélie plus grand (2 unités) éloigne le point le plus proche à 2 unités', () => {
    const { points } = trajectoireDeComete(comete(3, 1, 2), O, 12);
    const mini = Math.min(...points.map((p) => dist(p)));
    assert.ok(Math.abs(mini - 2 * U) < 0.02 * U, `périhélie ${mini / U} unités`);
  });

  it('le sens −1 donne la ligne symétrique de celle du sens +1 par rapport à l’axe étoile–comète, et les deux passent par la comète', () => {
    const plus = comete(3, 1, 1), moins = comete(3, -1, 1);
    const p = trajectoireDeComete(plus, O, 12).points, m = trajectoireDeComete(moins, O, 12).points;
    assert.ok(aux(p, [plus.x, plus.y]) < 1 && aux(m, [moins.x, moins.y]) < 1, 'les deux passent par la comète');
    const ux = plus.x / dist([plus.x, plus.y]), uy = plus.y / dist([plus.x, plus.y]); // axis: star → comet
    let differentes = 0;
    for (const q of p.filter((s) => dist(s) < 6 * U)) {
      const t = q[0]! * ux + q[1]! * uy;
      const miroir = [2 * t * ux - q[0]!, 2 * t * uy - q[1]!];
      assert.ok(aux(m, miroir) < 0.08 * dist(q) + 2, `le miroir de (${q}) est à ${aux(m, miroir)} px de la ligne du sens −1`);
      if (aux(m, q) > 0.2 * U) differentes++;
    }
    assert.ok(differentes > 10, 'les deux sens ne dessinent pas la même ligne');
  });

  it('un périhélie absent, nul ou plus grand que l’orbite donne tout de même une ligne finie qui passe par la comète', () => {
    for (const peri of [undefined, 0, 99]) {
      const c = comete(3, 1, peri);
      const { points } = trajectoireDeComete(c, O, 12);
      assert.ok(points.length > 20, `périhélie ${peri}`);
      assert.ok(points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])), `périhélie ${peri} : tout est fini`);
      assert.ok(aux(points, [c.x, c.y]) < 1, `périhélie ${peri} : passe par la comète`);
      assert.ok(Math.min(...points.map((p) => dist(p))) >= 0.09 * U, `périhélie ${peri} : jamais sur l’étoile`);
    }
  });

  it('une comète sur son étoile (orbite 0) donne une ligne finie', () => {
    const { points } = trajectoireDeComete({ x: 0, y: 0, orbite: 0, heure: 0, aspect: { perihelie: 1 } }, O, 12);
    assert.ok(points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  });
});
