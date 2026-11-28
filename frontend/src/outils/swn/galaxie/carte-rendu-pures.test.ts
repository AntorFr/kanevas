// The pure parts of the galaxy map's rendering (AD-galaxie-systemes-3 and 4), written from the exit criterion with literal values.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rayonEtoile, couleurEtoile } from './carte-geometrie.ts';
import { cadrerZoneConnue, boiteZoneConnue, boiteGrille, zoomMinimal, zoomDecouverte, TAILLE_FOND, BLOCS_FENETRE_MAX, ajustement } from './carte-cadrage.ts';
import { nomsVisibles, type CandidatNom } from './carte-noms.ts';
import { versPlan, TAILLE_MAX, COTE_BLOC, BLOCS_MAX, tailleMinimale } from './geo.ts';

describe('rayonEtoile', () => {
  it('croît strictement avec la taille, valeurs littérales aux bornes (3 px à 0, 12 px à 1)', () => {
    assert.equal(rayonEtoile(0), 3);
    assert.equal(rayonEtoile(1), 12);
    let prec = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) { const r = rayonEtoile(t); assert.ok(r > prec); prec = r; }
  });
  it('ne dépend d’aucun zoom : une seule entrée', () => {
    assert.equal(rayonEtoile.length, 1);
  });
  it('une taille hors [0, 1] ou illisible ne sort pas des bornes', () => {
    assert.equal(rayonEtoile(-3), 3);
    assert.equal(rayonEtoile(7), 12);
    const n = rayonEtoile(NaN); assert.ok(n >= 3 && n <= 12);
  });
});

describe('couleurEtoile', () => {
  const classes = new Map([['G', '#ffe08a'], ['M', '#ff8a5c']]);
  it('la couleur libre gagne sur la classe', () => assert.equal(couleurEtoile('#112233', 'G', classes), '#112233'));
  it('sans couleur libre, la couleur de la classe du cœur', () => {
    assert.equal(couleurEtoile(null, 'M', classes), '#ff8a5c');
    assert.equal(couleurEtoile(undefined, 'G', classes), '#ffe08a');
  });
  it('classe inconnue ou absente : null', () => {
    assert.equal(couleurEtoile(null, 'Z', classes), null);
    assert.equal(couleurEtoile(null, undefined, classes), null);
  });
});

const FEN = { w: 800, h: 600 };
// Pixel of a hexagon centre for a view.
const px = (v: { vx: number; vy: number; s: number }, q: number, r: number, f = FEN) => {
  const p = versPlan(q, r);
  return { x: (p.x - v.vx) * v.s + f.w / 2, y: (p.y - v.vy) * v.s + f.h / 2 };
};

describe('cadrerZoneConnue', () => {
  it('rien de lu : null', () => assert.equal(cadrerZoneConnue([], [], FEN), null));

  it('tient tous les systèmes lus, avec la marge de 8 %', () => {
    const sys = [{ q: -4, r: 2 }, { q: 9, r: -3 }, { q: 3, r: 7 }];
    const v = cadrerZoneConnue(sys, [], FEN)!;
    for (const s of sys) {
      const p = px(v, s.q, s.r);
      assert.ok(p.x >= FEN.w * 0.08 && p.x <= FEN.w * 0.92, `x ${p.x}`);
      assert.ok(p.y >= FEN.h * 0.08 && p.y <= FEN.h * 0.92, `y ${p.y}`);
    }
  });

  it('tient les hexagones d’une zone en polygone et d’une zone en plages, pas seulement les systèmes', () => {
    const contour: [number, number][] = [[20, 0], [24, 0], [22, 4]];
    const plages: [number, number, number][] = [[-10, -6, -2], [-9, -6, -3]];
    const v = cadrerZoneConnue([{ q: 0, r: 0 }], [{ contour, plages: undefined }, { contour: [], plages }], FEN)!;
    for (const [q, r] of [...contour, [-6, -10], [-2, -10], [-6, -9], [-3, -9]] as [number, number][]) {
      const p = px(v, q, r);
      assert.ok(p.x >= 0 && p.x <= FEN.w && p.y >= 0 && p.y <= FEN.h, `${q},${r} → ${p.x},${p.y}`);
    }
  });

  it('un hexagone caché (non passé) ne bouge pas la vue : même vue qu’avec seulement le lu', () => {
    const lu = [{ q: 1, r: 1 }, { q: 5, r: 2 }];
    const a = cadrerZoneConnue(lu, [], FEN);
    const b = cadrerZoneConnue([...lu], [], FEN);
    assert.deepEqual(a, b);
    const avecCache = cadrerZoneConnue([...lu, { q: 400, r: 400 }], [], FEN)!;
    assert.notDeepEqual(avecCache, a, 'le cadrage suit ce qu’on lui donne : le garde est à l’appelant, qui ne donne que le lu');
  });

  it('centre la zone : le milieu de la boîte est au centre de la fenêtre', () => {
    const v = cadrerZoneConnue([{ q: 0, r: 0 }, { q: 10, r: 0 }], [], FEN)!;
    const b = boiteZoneConnue([{ q: 0, r: 0 }, { q: 10, r: 0 }], [])!;
    assert.ok(Math.abs(v.vx - (b.x0 + b.x1) / 2) < 1e-9);
    assert.ok(Math.abs(v.vy - (b.y0 + b.y1) / 2) < 1e-9);
  });

  it('un seul système : zoom plafonné à TAILLE_MAX, jamais au-delà', () => {
    const v = cadrerZoneConnue([{ q: 0, r: 0 }], [], FEN)!;
    assert.equal(v.s, TAILLE_MAX);
  });

  it('zone plus large que le plancher d’aujourd’hui : le zoom descend sous celui-ci, jamais sous 4 px', () => {
    const large = [{ q: 0, r: 0 }, { q: 60, r: 0 }];
    const b = boiteZoneConnue(large, [])!;
    const base = zoomMinimal(FEN, null);
    const v = cadrerZoneConnue(large, [], FEN)!;
    assert.ok(v.s < base, `${v.s} < ${base}`);
    assert.ok(v.s >= TAILLE_FOND);
    for (const s of large) { const p = px(v, s.q, s.r); assert.ok(p.x > 0 && p.x < FEN.w); }
    assert.ok(b.x1 > b.x0);
  });

  it('zone démesurée : le zoom reste au plus bas, la fenêtre ne tient jamais plus de BLOCS_FENETRE_MAX blocs par côté', () => {
    const v = cadrerZoneConnue([{ q: -5000, r: 0 }, { q: 5000, r: 0 }], [], FEN)!;
    assert.equal(v.s, zoomMinimal(FEN, boiteZoneConnue([{ q: -5000, r: 0 }, { q: 5000, r: 0 }], [])));
    const blocsParCote = (FEN.w / v.s) / (COTE_BLOC * Math.sqrt(3));
    assert.ok(blocsParCote <= BLOCS_FENETRE_MAX + 1e-6, `${blocsParCote}`);
  });
});

describe('boiteGrille', () => {
  it('null sans zone ; sinon la boîte élargie d’un bloc de chaque côté', () => {
    assert.equal(boiteGrille(null), null);
    const b = boiteZoneConnue([{ q: 0, r: 0 }], [])!;
    const g = boiteGrille(b)!;
    assert.ok(g.x0 < b.x0 - COTE_BLOC && g.x1 > b.x1 + COTE_BLOC && g.y0 < b.y0 - COTE_BLOC && g.y1 > b.y1 + COTE_BLOC);
  });
});

describe('nomsVisibles', () => {
  const sys = (cle: string, x: number, y: number, texte = 'Havre'): CandidatNom => ({ cle, x, y, texte, priorite: 0, taille: 0.5 });
  const etoile = (cle: string, x: number, y: number, taille = 0.5): CandidatNom => ({ cle, x, y, texte: 'Étoile 3, 4', priorite: 1, taille });

  it('le nom d’un système défini reste quand celui d’une étoile tirée au même endroit disparaît, quel que soit l’ordre d’entrée', () => {
    for (const liste of [[sys('s:a', 100, 100), etoile('g:3,4', 100, 100, 1)], [etoile('g:3,4', 100, 100, 1), sys('s:a', 100, 100)]]) {
      const k = nomsVisibles(liste, { s: 30 });
      assert.ok(k.has('s:a'));
      assert.ok(!k.has('g:3,4'));
    }
  });
  it('deux noms loin l’un de l’autre sont gardés tous deux', () => {
    const k = nomsVisibles([sys('s:a', 100, 100), etoile('g:3,4', 400, 300)], { s: 30 });
    assert.deepEqual([...k].sort(), ['g:3,4', 's:a']);
  });
  it('à priorité égale la plus grande taille passe d’abord', () => {
    const k = nomsVisibles([etoile('g:p', 50, 50, 0.2), etoile('g:g', 50, 50, 0.9)], { s: 30 });
    assert.deepEqual([...k], ['g:g']);
  });
  it('à tout égal la clé départage : résultat identique dans les deux ordres', () => {
    const a = nomsVisibles([etoile('g:b', 5, 5), etoile('g:a', 5, 5)], { s: 30 });
    const b = nomsVisibles([etoile('g:a', 5, 5), etoile('g:b', 5, 5)], { s: 30 });
    assert.deepEqual([...a], ['g:a']); assert.deepEqual([...b], ['g:a']);
  });
  it('au dézoom (positions rapprochées) les étoiles se replient avant les systèmes définis', () => {
    const cands = [sys('s:a', 100, 100), sys('s:b', 130, 100), etoile('g:1', 100, 105), etoile('g:2', 400, 400)];
    const k = nomsVisibles(cands, { s: 5 });
    assert.ok(k.has('s:a'));
    assert.ok(!k.has('s:b'), 'deux systèmes se chevauchent : l’un cède, par la clé');
    assert.ok(!k.has('g:1'));
    assert.ok(k.has('g:2'));
  });
  it('rien en entrée, rien en sortie', () => assert.equal(nomsVisibles([], { s: 30 }).size, 0));
  it('des boîtes qui se touchent sans se recouvrir sont gardées toutes deux', () => {
    // width of « Havre » at body 12: 0.6 × 12 × 5 = 36 → half 18
    const k = nomsVisibles([sys('s:a', 100, 100), sys('s:b', 136, 100)], { s: 30 });
    assert.equal(k.size, 2);
  });
});

describe('réouverture de recette : un système défini lointain (Vael à 30, -20)', () => {
  const sys = [{ q: 0, r: 0 }, { q: 4, r: -2 }, { q: 30, r: -20 }];

  it('le cadrage tient Vael et ses voisins dans la fenêtre à 1280 px et à 390 px', () => {
    for (const f of [{ w: 901, h: 640 }, { w: 390, h: 600 }]) {
      const v = cadrerZoneConnue(sys, [], f)!;
      for (const s of sys) {
        const p = { x: f.w / 2 + (versPlan(s.q, s.r).x - v.vx) * v.s, y: f.h / 2 + (versPlan(s.q, s.r).y - v.vy) * v.s };
        assert.ok(p.x > 0 && p.x < f.w && p.y > 0 && p.y < f.h, `${s.q},${s.r} → ${p.x},${p.y} dans ${f.w}x${f.h}`);
      }
    }
  });

  it('le zoom de découverte est le plus bas du plafond de blocs : jamais sous 4 px, jamais au-dessus du plancher d’aujourd’hui', () => {
    const z = zoomDecouverte(FEN);
    assert.ok(z >= TAILLE_FOND);
    assert.ok(z <= tailleMinimale(FEN.w, FEN.h) + 1e-9);
    assert.equal(z, Math.max(TAILLE_FOND, tailleMinimale(FEN.w, FEN.h) * (BLOCS_MAX / BLOCS_FENETRE_MAX)));
  });

  it('le plancher de zoom, calculé sur la même part de fenêtre que le cadrage, ne retient pas l’ajustement', () => {
    const b = boiteZoneConnue(sys, [])!;
    const part = 0.7;
    const fit = ajustement(b, { w: FEN.w * part, h: FEN.h * part });
    assert.ok(zoomMinimal(FEN, b, part) <= Math.max(fit, TAILLE_FOND) + 1e-9);
  });
});
