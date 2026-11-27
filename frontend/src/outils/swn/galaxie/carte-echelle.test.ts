// The scale of a system map (AD-echelle-1), written from the exit criterion with literal values, not from the code.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  distanceLune, disposer, ecartsOrbites, orbitesAstres, rayonAstre, ETOILE_FACTEUR, K_CORPS, PAS_LUNE, RAYON_MIN_PX, U,
  type Plan,
} from './carte-geometrie.ts';
import type { AstreSysteme, InterieurSysteme } from './types.ts';

const plan: Plan = (r, h) => [r * Math.sin((h * Math.PI) / 6), -r * Math.cos((h * Math.PI) / 6)];
const astre = (cle: string, o: Partial<AstreSysteme> = {}): AstreSysteme => ({
  cle, genre: 'planete', parent_cle: null, etoile_rang: 0, type: 'tellurique', nom: cle, orbite: 2, heure: 3, taille: 0.1, ...o,
});
const etoile = (o: Partial<AstreSysteme> = {}) => astre('s', { genre: 'etoile', type: 'etoile', orbite: null, ...o });
const systeme = (astres: AstreSysteme[]): InterieurSysteme => ({ q: 0, r: 0, nom: 's', etat: 'defini', astres, formations: [] });
const placer = (astres: AstreSysteme[]) => disposer(systeme(astres), plan);

describe('constantes', () => {
  it('valeurs de l’AD', () => {
    assert.equal(RAYON_MIN_PX, 3);
    assert.equal(K_CORPS, 4.5);
    assert.equal(ETOILE_FACTEUR, 0.35);
    assert.equal(U, 44);
  });
});

describe('rayonAstre', () => {
  it('plafonné à la moitié de l’écart voisin (planète taille 1 : brute 198 px, écart 100 → 50)', () => {
    assert.equal(rayonAstre(1, 100, 'planete'), 50);
  });
  it('sans plafond ni plancher : taille × U × ajuste × 4,5 (0,1 → 19,8 ; ajuste 0,5 → 9,9)', () => {
    assert.ok(Math.abs(rayonAstre(0.1, 1000, 'planete') - 19.8) < 1e-9);
    assert.ok(Math.abs(rayonAstre(0.1, 1000, 'planete', 0.5) - 9.9) < 1e-9);
  });
  it('jamais moins de 3 px, même quand la moitié de l’écart est plus petite : le plancher gagne', () => {
    assert.equal(rayonAstre(1, 2, 'planete'), 3);
    assert.equal(rayonAstre(1, 0, 'planete'), 3);
    assert.equal(rayonAstre(0.001, 1000, 'planete'), 3);
    assert.equal(rayonAstre(1, 2, 'etoile'), 3);
  });
  it('taille non finie : rayon fini, au moins 3', () => {
    for (const t of [NaN, Infinity, -Infinity]) {
      const r = rayonAstre(t, 1000, 'planete');
      assert.ok(Number.isFinite(r) && r >= 3, `taille ${t} → ${r}`);
    }
  });
  it('étoile strictement plus petite qu’une planète de même taille là où ni plancher ni plafond ne jouent (0,35 × 19,8 = 6,93)', () => {
    const e = rayonAstre(0.1, 1000, 'etoile');
    assert.ok(Math.abs(e - 6.93) < 1e-9);
    assert.ok(e < rayonAstre(0.1, 1000, 'planete'));
  });
  it('compagne comme l’étoile ; lune et comète comme la planète', () => {
    assert.equal(rayonAstre(0.1, 1000, 'compagne'), rayonAstre(0.1, 1000, 'etoile'));
    assert.equal(rayonAstre(0.1, 1000, 'lune'), rayonAstre(0.1, 1000, 'planete'));
    assert.equal(rayonAstre(0.1, 1000, 'comete'), rayonAstre(0.1, 1000, 'planete'));
  });
  it('étoile et planète égales (3 px) quand le plancher joue pour les deux', () => {
    assert.equal(rayonAstre(0.1, 4, 'etoile'), 3);
    assert.equal(rayonAstre(0.1, 4, 'planete'), 3);
  });
  it('étoile plafonnée comme une planète : écart 10 → 5 quand 0,35 × brute dépasse 5', () => {
    assert.equal(rayonAstre(1, 10, 'etoile'), 5);
  });
  it('même valeur quel que soit un zoom : la fonction n’en prend pas, deux appels donnent la même valeur', () => {
    assert.equal(rayonAstre.length >= 3, true);
    assert.equal(rayonAstre(0.3, 80, 'planete'), rayonAstre(0.3, 80, 'planete'));
  });
});

describe('ecartsOrbites', () => {
  it('écart à l’autre orbite distincte la plus proche (orbites 2 et 3 : rayons 110 et 154 → 44)', () => {
    const d = placer([etoile(), astre('a', { orbite: 2 }), astre('b', { orbite: 3 })]);
    const e = ecartsOrbites(d.corps);
    assert.equal(e.get('a'), 44);
    assert.equal(e.get('b'), 44);
  });
  it('astre seul sur son centre : son propre rayon d’orbite (orbite 2 → 110), sans étoile voisine', () => {
    const e = ecartsOrbites(placer([astre('a', { orbite: 2 })]).corps);
    assert.equal(e.get('a'), 110);
  });
  it('deux astres sur le même rayon s’ignorent : chacun a l’écart défini, pas 0', () => {
    const e = ecartsOrbites(placer([astre('a', { orbite: 2, heure: 1 }), astre('b', { orbite: 2, heure: 7 })]).corps);
    assert.equal(e.get('a'), 110);
    assert.equal(e.get('b'), 110);
  });
  it('deux astres sur le même rayon plus un troisième : l’écart vise l’autre orbite (rayons 110, 110, 198 → 88)', () => {
    const e = ecartsOrbites(placer([astre('a', { orbite: 2 }), astre('b', { orbite: 2, heure: 6 }), astre('c', { orbite: 4 })]).corps);
    assert.equal(e.get('a'), 88);
    assert.equal(e.get('b'), 88);
    assert.equal(e.get('c'), 88);
  });
  it('étoile centrale : son écart est défini, fini et positif (écart à la première orbite : 110)', () => {
    const e = ecartsOrbites(placer([etoile(), astre('a', { orbite: 2 })]).corps);
    assert.equal(e.get('s'), 110);
  });
  it('étoile centrale seule : un écart fini (le plancher fera 3 px)', () => {
    const e = ecartsOrbites(placer([etoile()]).corps);
    assert.ok(Number.isFinite(e.get('s')!));
    assert.equal(rayonAstre(0.5, (e.get('s') ?? 0) * 1, 'etoile'), 3);
  });
  it('planète à lunes : écart plafonné à U (orbites 2 et 8, la planète seule serait à 264 → 44)', () => {
    const e = ecartsOrbites(placer([astre('a', { orbite: 2 }), astre('b', { orbite: 8 }), astre('l', { genre: 'lune', parent_cle: 'a', orbite: null })]).corps);
    assert.equal(e.get('a'), U);
    assert.equal(e.get('b'), 264);
  });
  it('planète à lunes dont l’écart est déjà sous U : on garde le plus petit', () => {
    const e = ecartsOrbites(placer([astre('a', { orbite: 2 }), astre('b', { orbite: 2.5 }), astre('l', { genre: 'lune', parent_cle: 'a', orbite: null })]).corps);
    assert.equal(e.get('a'), 22);
  });
  it('lune : PAS_LUNE', () => {
    const e = ecartsOrbites(placer([astre('a'), astre('l', { genre: 'lune', parent_cle: 'a', orbite: null })]).corps);
    assert.equal(e.get('l'), PAS_LUNE);
    assert.equal(PAS_LUNE, 11);
  });
  it('rayon de planète à lunes : au plus U/2 = 22 < première lune (26,4)', () => {
    const e = ecartsOrbites(placer([astre('a', { orbite: 2, taille: 1 }), astre('l', { genre: 'lune', parent_cle: 'a', orbite: null })]).corps);
    assert.ok(rayonAstre(1, e.get('a')!, 'planete') <= U / 2 + 1e-9);
    assert.ok(U / 2 < distanceLune(0));
  });
});

describe('distanceLune', () => {
  it('valeurs : 26,4 puis +11 par rang', () => {
    assert.ok(Math.abs(distanceLune(0) - 26.4) < 1e-9);
    assert.ok(Math.abs(distanceLune(1) - 37.4) < 1e-9);
    assert.ok(Math.abs(distanceLune(3) - 59.4) < 1e-9);
  });
  it('croît avec le rang et ne lit aucun rayon (un seul argument)', () => {
    assert.ok(distanceLune(0) < distanceLune(1) && distanceLune(1) < distanceLune(2));
    assert.equal(distanceLune.length, 1);
  });
  it('disposer place la lune à distanceLune(rang) de sa planète, quelles que soient les tailles', () => {
    for (const taille of [0.01, 2]) {
      const d = placer([astre('a', { taille }), astre('l1', { genre: 'lune', parent_cle: 'a', orbite: null, taille, heure: 0 }), astre('l2', { genre: 'lune', parent_cle: 'a', orbite: null, taille, heure: 6 })]);
      const p = d.corps.find((c) => c.cle === 'a')!;
      const l1 = d.corps.find((c) => c.cle === 'l1')!;
      const l2 = d.corps.find((c) => c.cle === 'l2')!;
      assert.ok(Math.abs(Math.hypot(l1.x - p.x, l1.y - p.y) - 26.4) < 1e-6);
      assert.ok(Math.abs(Math.hypot(l2.x - p.x, l2.y - p.y) - 37.4) < 1e-6);
    }
  });
});

describe('orbitesAstres', () => {
  it('un anneau par astre orbitant, à son propre rayon, centré sur le centre ; l’étoile centrale n’en a pas', () => {
    const d = placer([etoile(), astre('a', { orbite: 2 }), astre('b', { orbite: 5 })]);
    const a = orbitesAstres(d);
    assert.equal(a.length, 2);
    assert.deepEqual(a.map((x) => [x.cle, x.cx, x.cy, x.rayon]), [['a', 0, 0, 110], ['b', 0, 0, 242]]);
  });
  it('une lune a son anneau autour de sa planète au rayon distanceLune(rang)', () => {
    const d = placer([astre('a', { orbite: 2, heure: 3 }), astre('l', { genre: 'lune', parent_cle: 'a', orbite: null }), astre('m', { genre: 'lune', parent_cle: 'a', orbite: null })]);
    const p = d.corps.find((c) => c.cle === 'a')!;
    const a = orbitesAstres(d);
    const l = a.find((x) => x.cle === 'l')!;
    const m = a.find((x) => x.cle === 'm')!;
    assert.ok(Math.abs(l.cx - p.x) < 1e-9 && Math.abs(l.cy - p.y) < 1e-9);
    assert.ok(Math.abs(l.rayon - 26.4) < 1e-9);
    assert.ok(Math.abs(m.rayon - 37.4) < 1e-9);
    assert.equal(a.find((x) => x.cle === 'a')!.rayon, 110);
  });
  it('deux astres sur le même rayon : deux anneaux (un par astre)', () => {
    const a = orbitesAstres(placer([astre('a', { heure: 1 }), astre('b', { heure: 7 })]));
    assert.equal(a.length, 2);
  });
  it('orbite négative ou absente : rayon 0, pas de NaN', () => {
    const a = orbitesAstres(placer([astre('a', { orbite: -3 }), astre('b', { orbite: null })]));
    for (const x of a) assert.ok(Number.isFinite(x.rayon) && x.rayon >= 0);
  });
  it('lune sans planète connue : anneau fini autour du centre', () => {
    const a = orbitesAstres(placer([astre('l', { genre: 'lune', parent_cle: 'zzz', orbite: null })]));
    assert.equal(a.length, 1);
    assert.ok(Number.isFinite(a[0]!.cx) && Number.isFinite(a[0]!.cy));
  });
});

describe('disposer : étendue', () => {
  it('ne change pas quand on change les tailles d’astres', () => {
    const f = (t: number) => placer([etoile({ taille: t }), astre('a', { orbite: 4, taille: t }), astre('l', { genre: 'lune', parent_cle: 'a', orbite: null, taille: t })]).etendue;
    assert.equal(f(0.01), f(5));
    assert.ok(Math.abs(f(0.01) - 224.4) < 1e-6, 'planète à 198 + lune à 26,4 dans la même direction');
  });
  it('CorpsPlace ne porte plus ni rayon ni cote', () => {
    const c = placer([astre('a')]).corps[0]! as unknown as Record<string, unknown>;
    assert.equal('rayon' in c, false);
    assert.equal('cote' in c, false);
  });
  it('étendue : au moins 3 U ; un astre à orbite 8 (rayon 374) l’étend à 374', () => {
    assert.equal(placer([astre('a', { orbite: 0.5 })]).etendue, 3 * U);
    assert.ok(Math.abs(placer([astre('a', { orbite: 8, heure: 0 })]).etendue - 374) < 1e-6);
  });
});
