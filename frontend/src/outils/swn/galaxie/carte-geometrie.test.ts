// Comet tail and trajectory, pure (AD-cometes-1, AD-cometes-2), on literal values; and the `--ciel-or` token (B-116).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  COTE_COURONNE_PX, EXCENTRICITE_COMETE, PERIHELIE_MIN_U, QUEUE_MAX_U, QUEUE_MIN_U, RAYON_TETE_MIN_PX, TRAJET_PAS_MAX, U, rayonOrbite,
  queueDeComete, trajectoireDeComete,
} from './carte-geometrie.ts';

const O = { x: 0, y: 0 };
const proche = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
/** World place of a comet where the map puts it: `rayonOrbite(orbite)` and the clock `heure` (12 at the top, clockwise). */
const placeDe = (orbite: number, heure: number) => {
  const t = (heure / 12) * 2 * Math.PI, r = rayonOrbite(orbite);
  return { x: r * Math.sin(t), y: -r * Math.cos(t) };
};
const comete = (orbite: number, heure: number, aspect?: Record<string, unknown>) => ({ ...placeDe(orbite, heure), orbite, heure, aspect });
const distanceAuSegment = (p: [number, number], a: [number, number], b: [number, number]) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
};
const distanceALaLigne = (p: [number, number], pts: [number, number][]) =>
  Math.min(...pts.slice(1).map((b, i) => distanceAuSegment(p, pts[i]!, b)));

describe('constantes (AD-cometes-1, AD-cometes-2)', () => {
  it('portent les valeurs de la conception', () => {
    assert.equal(QUEUE_MAX_U, 4);
    assert.equal(QUEUE_MIN_U, 0.25);
    assert.equal(EXCENTRICITE_COMETE, 0.96);
    assert.equal(PERIHELIE_MIN_U, 0.1);
    assert.equal(TRAJET_PAS_MAX, 192);
    assert.equal(RAYON_TETE_MIN_PX, 4);
    assert.equal(COTE_COURONNE_PX, 24);
  });
});

describe('queueDeComete', () => {
  it('une comète en (3U, 0) a la direction (1, 0)', () => {
    const q = queueDeComete({ x: 3 * U, y: 0 }, O, 1);
    assert.equal(q.dx, 1);
    assert.equal(q.dy, 0);
  });
  it('la direction part de l\'étoile, où qu\'elle soit', () => {
    const q = queueDeComete({ x: 10, y: 40 }, { x: 10, y: 100 }, 0.5);
    proche(q.dx, 0); proche(q.dy, -1);
  });
  it('plus loin de l\'étoile, la queue est strictement plus courte', () => {
    const a = queueDeComete({ x: 3 * U, y: 0 }, O, 1);
    const b = queueDeComete({ x: 6 * U, y: 0 }, O, 1);
    assert.ok(b.longueur < a.longueur);
    proche(a.longueur, (4 / (1 + 1.5)) * U);
    proche(b.longueur, (4 / (1 + 3)) * U);
  });
  it('la longueur suit longueurAspect et ne descend pas sous QUEUE_MIN_U', () => {
    proche(queueDeComete({ x: 0, y: 0 }, { x: 0, y: 0 }, 0.5).longueur, 2 * U);
    proche(queueDeComete({ x: 1000 * U, y: 0 }, O, 1).longueur, 0.25 * U);
  });
  it('longueurAspect hors de [0,1 ; 1] est borné, un non-nombre ne casse rien', () => {
    proche(queueDeComete({ x: 0, y: 0 }, O, 5).longueur, 4 * U);
    proche(queueDeComete({ x: 0, y: 0 }, O, 0).longueur, 0.4 * U);
    const q = queueDeComete({ x: 0, y: 0 }, O, Number.NaN);
    assert.ok(Number.isFinite(q.longueur) && q.longueur > 0);
  });
  it('deux places confondues donnent (0, -1)', () => {
    const q = queueDeComete({ x: 5, y: 7 }, { x: 5, y: 7 }, 1);
    assert.equal(q.dx, 0);
    assert.equal(q.dy, -1);
    assert.ok(Number.isFinite(q.rotation));
  });
  for (const sens of [1, -1]) {
    it(`rotation pose la queue de l'image sur (dx, dy), sens ${sens}`, () => {
      for (const [x, y] of [[3 * U, 0], [-2 * U, 5 * U], [0, -U], [-U, -U], [7, -300]] as const) {
        const q = queueDeComete({ x, y, aspect: { sens } }, O, 0.7);
        const queueImage = Math.atan2(0.6, -sens * 0.8);
        proche(Math.cos(queueImage + q.rotation), q.dx);
        proche(Math.sin(queueImage + q.rotation), q.dy);
      }
    });
  }
  it('un sens absent vaut +1, un sens nul aussi', () => {
    const a = queueDeComete({ x: U, y: 0 }, O, 1);
    assert.equal(queueDeComete({ x: U, y: 0, aspect: { sens: 0 } }, O, 1).rotation, a.rotation);
    assert.notEqual(queueDeComete({ x: U, y: 0, aspect: { sens: -1 } }, O, 1).rotation, a.rotation);
  });
});

describe('trajectoireDeComete', () => {
  const c = comete(8, 3, { perihelie: 1 });
  const { points } = trajectoireDeComete(c, O, 12);
  const e = 0.96;
  const q = 1, a = q / (1 - e);
  const sommet = points.reduce((m, p) => (Math.hypot(...p) < Math.hypot(...m) ? p : m));

  it('au plus 192 points, tous finis', () => {
    assert.ok(points.length <= 192 && points.length > 20);
    for (const p of points) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  });
  it('un sommet d\'anomalie 0 à 1·U de l\'étoile', () => {
    proche(Math.hypot(...sommet), U, 1e-6);
  });
  it('la somme des distances aux deux foyers est constante à 1e-9', () => {
    const ux = sommet[0] / Math.hypot(...sommet), uy = sommet[1] / Math.hypot(...sommet);
    const f2: [number, number] = [-2 * a * e * ux * U, -2 * a * e * uy * U];
    for (const p of points) proche(Math.hypot(p[0], p[1]) + Math.hypot(p[0] - f2[0], p[1] - f2[1]), 2 * a * U, 1e-6);
  });
  it('un sommet à la place de la comète, au pixel près', () => {
    assert.ok(Math.min(...points.map((p) => Math.hypot(p[0] - c.x, p[1] - c.y))) < 1);
  });
  it('la ligne va de part et d\'autre du périhélie jusqu\'à rMaxU', () => {
    const portee = Math.max(...points.map((p) => Math.hypot(...p)));
    proche(portee, 12 * U, 1e-6);
  });
  it('sens -1 donne l\'image miroir autour de l\'axe passant par l\'étoile et la direction de l\'heure', () => {
    const m = trajectoireDeComete(comete(8, 3, { perihelie: 1, sens: -1 }), O, 12).points;
    assert.ok(m.length <= 192);
    // each sens has its own perihelion axis; they are the mirror of one another about the comet's bearing (3 h: due east)
    const reflechi = points.map(([x, y]): [number, number] => [x, -y]);
    for (const p of reflechi) assert.ok(distanceALaLigne(p, m) < 0.05, 'un point du miroir hors de la ligne');
    const sommetM = m.reduce((s, p) => (Math.hypot(...p) < Math.hypot(...s) ? p : s));
    proche(Math.hypot(...sommetM), U, 1e-6);
    assert.ok(Math.hypot(sommetM[0] - sommet[0], sommetM[1] - sommet[1]) > 1, 'les deux périhélies ne se confondent pas');
    assert.ok(Math.min(...m.map((p) => Math.hypot(p[0] - c.x, p[1] - c.y))) < 1);
  });
  it('orbite 6, heure 3 : la ligne traverse la comète posée à rayonOrbite(6) = 6,5·U, pas à 6·U', () => {
    const cm = comete(6, 3, { perihelie: 1 });
    proche(cm.x, 6.5 * U); proche(cm.y, 0);
    for (const sens of [1, -1]) {
      const t = trajectoireDeComete({ ...cm, aspect: { perihelie: 1, sens } }, O, 12).points;
      assert.ok(distanceALaLigne([cm.x, cm.y], t) < 1e-3, `sens ${sens}`);
    }
  });
  it('orbite 0,5 (sous 1) : la comète est à 1,5·U·orbite et la ligne la traverse', () => {
    const cm = comete(0.5, 9, { perihelie: 0.3 });
    proche(Math.hypot(cm.x, cm.y), 0.75 * U);
    assert.ok(distanceALaLigne([cm.x, cm.y], trajectoireDeComete(cm, O, 12).points) < 1e-3);
  });
  it('l\'étoile n\'est pas forcément à l\'origine', () => {
    const t = trajectoireDeComete(c, { x: 100, y: -50 }, 12).points;
    proche(Math.min(...t.map((p) => Math.hypot(p[0] - 100, p[1] + 50))), U, 1e-6);
  });

  const cas: [string, Record<string, unknown> | undefined, number][] = [
    ['perihelie absente', {}, 8], ['aspect absent', undefined, 8], ['perihelie > orbite', { perihelie: 20 }, 8],
    ['perihelie nulle', { perihelie: 0 }, 8], ['perihelie négative', { perihelie: -3 }, 8], ['perihelie = orbite', { perihelie: 8 }, 8],
    ['perihelie non numérique', { perihelie: 'x' }, 8], ['perihelie NaN', { perihelie: Number.NaN }, 8], ['périhélie minimal', { perihelie: 0.1 }, 8],
    ['orbite 0,05', { perihelie: 1 }, 0.05],
  ];
  for (const [nom, aspect, orbite] of cas) for (const sens of [1, -1]) {
    it(`${nom}, sens ${sens} : sans NaN et la ligne passe par la comète`, () => {
      const cm = comete(orbite, 7, { ...aspect, sens });
      const t = trajectoireDeComete(cm, O, 12).points;
      assert.ok(t.length >= 2 && t.length <= 192);
      for (const p of t) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), 'NaN');
      assert.ok(distanceALaLigne([cm.x, cm.y], t) < 1, 'la comète hors de sa ligne');
    });
  }
  it('orbite 0 ou absente : pas de NaN', () => {
    for (const cm of [comete(0, 0), { x: 0, y: 0 }, { x: 0, y: 0, orbite: Number.NaN, heure: Number.NaN }]) {
      for (const r of [12, 3]) {
        const t = trajectoireDeComete(cm, O, r).points;
        assert.ok(t.length <= 192);
        for (const p of t) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
      }
    }
  });
  it('rMaxU sous l\'orbite de la comète : la ligne va au moins jusqu\'à elle', () => {
    const cm = comete(8, 5, { perihelie: 1 });
    assert.ok(distanceALaLigne([cm.x, cm.y], trajectoireDeComete(cm, O, 2).points) < 1);
  });
  it('est pure : deux appels donnent la même ligne', () => {
    assert.deepEqual(trajectoireDeComete(c, O, 12), trajectoireDeComete(c, O, 12));
  });
});

describe('token --ciel-or', () => {
  it('est déclaré dans les deux blocs de tokens.css, à #f2c36b', () => {
    const css = readFileSync(new URL('../../../ui/tokens.css', import.meta.url), 'utf8');
    const lignes = css.match(/--ciel-or:\s*#f2c36b\s*;/gi) ?? [];
    assert.equal(lignes.length, 2);
  });
});
