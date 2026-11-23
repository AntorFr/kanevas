// Ensemble tester of kanevas-carte-rendu-echelle (B-113, B-115 scale/orbits/names; P-27; E-23), written from the need only:
// literal values, pure functions, no DOM. The expected values come from the need (about half an orbit gap at most, a 3 px floor,
// a star modest, one ring per body at its own distance, a moon's distance following its rank, no name hidden by a corona).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { disposer, distanceLune, orbitesAstres, rayonAstre, type Plan } from './carte-geometrie.ts';
import { placerEtiquettes, type CorpsEtiquette, type Mesureur, type Obstacle } from './etiquettes.ts';
import type { AstreSysteme, InterieurSysteme } from './types';

describe('B-113 rayonAstre : un astre fait au plus la moitié de l’écart d’orbite, jamais moins de 3 px', () => {
  it('nominal : une planète de taille 0,3 à 40 px de l’orbite voisine fait 20 px de rayon au plus', () => {
    const r = rayonAstre(0.3, 40, 'planete');
    assert.ok(r <= 20, `rayon ${r}`);
    assert.ok(r > 3, `rayon ${r}`);
  });
  it('bord : jamais plus de la moitié de l’écart, sur une grille d’écarts et de tailles', () => {
    for (const ecart of [10, 20, 40, 80, 160, 400]) for (const taille of [0.05, 0.1, 0.3, 0.6, 1, 2]) for (const genre of ['planete', 'lune', 'comete', 'etoile', 'compagne'] as const) {
      const r = rayonAstre(taille, ecart, genre);
      assert.ok(r <= Math.max(3, ecart / 2) + 1e-9, `${genre} taille ${taille} écart ${ecart} : ${r}`);
      assert.ok(r >= 3, `${genre} taille ${taille} écart ${ecart} : ${r}`);
    }
  });
  it('bord : le plancher de 3 px gagne quand la moitié de l’écart est plus petite', () => {
    assert.equal(rayonAstre(0.3, 4, 'planete'), 3);
    assert.equal(rayonAstre(0.3, 0, 'planete'), 3);
    assert.equal(rayonAstre(0.3, 5.9, 'planete'), 3);
  });
  it('bord : un astre minuscule dans un grand vide reste à 3 px', () => {
    assert.equal(rayonAstre(0.001, 400, 'planete'), 3);
    assert.equal(rayonAstre(0.001, 400, 'lune'), 3);
  });
  it('bord : le plafond est exactement la moitié de l’écart (ni plus, ni beaucoup moins) pour un gros astre', () => {
    assert.equal(rayonAstre(2, 60, 'planete'), 30);
  });
  it('un astre plus gros que son voisin n’est pas plus petit, tant que le plafond ne joue pas', () => {
    assert.ok(rayonAstre(0.2, 400, 'planete') > rayonAstre(0.1, 400, 'planete'));
  });
  it('exclusion : une étoile est un disque modeste, strictement plus petit qu’une planète de même taille là où rien ne borne', () => {
    assert.ok(rayonAstre(0.1, 400, 'etoile') < rayonAstre(0.1, 400, 'planete'));
    assert.ok(rayonAstre(1, 400, 'etoile') < rayonAstre(1, 400, 'planete'));
    assert.ok(rayonAstre(1, 400, 'compagne') < rayonAstre(1, 400, 'planete'));
  });
  it('exclusion : une étoile ne mange pas non plus la moitié de l’écart de son voisin', () => {
    assert.ok(rayonAstre(1, 30, 'etoile') <= 15);
  });
});

// Plan: 12 at the top, 3 at the right.
const plan: Plan = (rayon, heure) => [rayon * Math.sin((heure * Math.PI) / 6), -rayon * Math.cos((heure * Math.PI) / 6)];
const A = (cle: string, genre: AstreSysteme['genre'], orbite: number | null, heure: number, taille: number, parent: string | null = null): AstreSysteme =>
  ({ cle, genre, parent_cle: parent, etoile_rang: 0, type: genre === 'etoile' ? 'jaune' : 'rocheux', nom: cle, orbite, heure, taille });
const systeme = (tailleAlpha: number, tailleLunes: number): InterieurSysteme => ({
  q: 1, r: 1, nom: 'Neutre', etat: 'defini', formations: [],
  astres: [
    A('etoile', 'etoile', 0, 0, 1), A('alpha', 'planete', 1, 3, tailleAlpha), A('a1', 'lune', null, 1, tailleLunes, 'alpha'),
    A('a2', 'lune', null, 5, tailleLunes, 'alpha'), A('a3', 'lune', null, 9, tailleLunes, 'alpha'),
    A('beta', 'planete', 2.5, 7, 0.4), A('gamma', 'planete', 4, 10, 0.2), A('delta', 'comete', 7, 2, 0.1),
  ],
});

describe('B-115 l’orbite de chaque astre est tracée à sa propre distance', () => {
  const d = disposer(systeme(0.3, 0.1), plan);
  const anneaux = orbitesAstres(d);
  const parCle = new Map(d.corps.map((c) => [c.cle, c]));
  it('nominal : un anneau par astre en orbite (planètes, comète, lunes), aucun pour l’étoile centrale', () => {
    assert.deepEqual(anneaux.map((a) => a.cle).sort(), ['a1', 'a2', 'a3', 'alpha', 'beta', 'delta', 'gamma']);
  });
  it('l’anneau d’une planète passe par la planète : son rayon est la distance de la planète à l’étoile', () => {
    for (const cle of ['alpha', 'beta', 'gamma', 'delta']) {
      const a = anneaux.find((x) => x.cle === cle)!;
      const c = parCle.get(cle)!;
      assert.equal(a.cx, 0); assert.equal(a.cy, 0);
      assert.ok(Math.abs(a.rayon - Math.hypot(c.x, c.y)) < 1e-6, `${cle} : anneau ${a.rayon}, distance ${Math.hypot(c.x, c.y)}`);
    }
  });
  it('exclusion : les anneaux ne sont pas réguliers, ils suivent les orbites 1, 2,5, 4 et 7', () => {
    const r = ['alpha', 'beta', 'gamma', 'delta'].map((k) => anneaux.find((x) => x.cle === k)!.rayon);
    const ecarts = r.slice(1).map((v, i) => v - r[i]!);
    assert.ok(Math.abs(ecarts[1]! - ecarts[2]!) > 1, `écarts ${ecarts}`);
    assert.ok(r.every((v, i) => i === 0 || v > r[i - 1]!), `rayons croissants ${r}`);
  });
  it('l’anneau d’une lune est autour de sa planète, pas de l’étoile', () => {
    const mere = parCle.get('alpha')!;
    for (const cle of ['a1', 'a2', 'a3']) {
      const a = anneaux.find((x) => x.cle === cle)!;
      assert.ok(Math.abs(a.cx - mere.x) < 1e-6 && Math.abs(a.cy - mere.y) < 1e-6, `${cle} centré sur alpha`);
    }
  });
  it('la distance d’une lune suit son rang : croissante, de la première à la troisième lune', () => {
    const [r1, r2, r3] = ['a1', 'a2', 'a3'].map((k) => anneaux.find((x) => x.cle === k)!.rayon);
    assert.ok(r1! > 0 && r1! < r2! && r2! < r3!, `${r1} < ${r2} < ${r3}`);
    assert.equal(r1, distanceLune(0)); assert.equal(r2, distanceLune(1)); assert.equal(r3, distanceLune(2));
  });
  it('bord : distanceLune(rang) croît avec le rang et est positive', () => {
    for (let k = 0; k < 8; k++) { assert.ok(distanceLune(k) > 0); assert.ok(distanceLune(k + 1) > distanceLune(k)); }
  });
  it('exclusion : la distance d’une lune ne change pas avec la taille de sa planète ni de la lune', () => {
    const autre = orbitesAstres(disposer(systeme(1.5, 0.9), plan));
    for (const k of ['a1', 'a2', 'a3']) assert.equal(autre.find((x) => x.cle === k)!.rayon, anneaux.find((x) => x.cle === k)!.rayon);
  });
  it('exclusion : la taille d’un astre ne déplace pas les autres (ni les anneaux, ni l’étendue)', () => {
    const grand = disposer(systeme(1.5, 0.9), plan);
    assert.equal(grand.etendue, d.etendue);
    for (const c of d.corps) { const g = grand.corps.find((x) => x.cle === c.cle)!; assert.equal(g.x, c.x); assert.equal(g.y, c.y); }
  });
  it('bord : un système réduit à son étoile n’a aucun anneau', () => {
    const seul: InterieurSysteme = { q: 0, r: 0, nom: null, etat: 'tire', formations: [], astres: [A('etoile', 'etoile', 0, 0, 1)] };
    assert.deepEqual(orbitesAstres(disposer(seul, plan)), []);
  });
});

describe('B-115 les noms : aucun n’est caché par une couronne, ni recouvert, à 390 px sur 12 astres dont 4 lunes', () => {
  const mesurer: Mesureur = (t) => ({ largeur: [...t].length * 6, hauteur: 12 });
  const vue = { largeur: 390, hauteur: 700, zoom: 1 };
  const P = (cle: string, nom: string, x: number, y: number): CorpsEtiquette => ({ cle, genre: 'planete', nom, x, y, rayon: 6 });
  const L = (cle: string, nom: string, x: number, y: number): CorpsEtiquette => ({ cle, genre: 'lune', nom, x, y, rayon: 3 });
  // Star at (195,350); halo of 45 px; planets on rings of 60, 100, 140 and 180 px (40 px apart), two per ring side; 4 moons.
  const corps: CorpsEtiquette[] = [
    { cle: 'etoile', genre: 'etoile', nom: 'Solaris', x: 195, y: 350, rayon: 5 },
    P('p1', 'Aube', 195, 290), P('p2', 'Brume', 295, 350), P('p3', 'Cendre', 195, 450), P('p4', 'Dune', 55, 350),
    P('p5', 'Écume', 195, 210), P('p6', 'Frimas', 335, 350), P('p7', 'Gouffre', 195, 530), P('p8', 'Havre', 20, 350),
    L('p1-a', 'Aube a', 210, 290), L('p2-a', 'Brume a', 310, 350), L('p4-a', 'Dune a', 70, 350), L('p7-a', 'Gouffre a', 210, 530),
  ];
  const halo: Obstacle = { type: 'disque', x: 195, y: 350, rayon: 45 };
  const res = placerEtiquettes(corps, vue, mesurer, [halo]);
  const posees = res.filter((e) => e.visible);
  const inter = (a: { x: number; y: number; largeur: number; hauteur: number }, b: typeof a) =>
    a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;
  it('nominal : les noms des 8 astres hors lunes sont tous posés, en entier', () => {
    for (const c of corps.filter((k) => k.genre !== 'lune')) {
      const e = res.find((x) => x.cle === c.cle);
      assert.ok(e && e.visible, `${c.nom} posé`);
      assert.equal(e!.texte, c.nom);
    }
  });
  it('exclusion : aucun nom posé ne recouvre un autre nom posé', () => {
    posees.forEach((a, i) => { for (const b of posees.slice(i + 1)) assert.equal(inter(a, b), false, `${a.texte} / ${b.texte}`); });
  });
  it('exclusion : aucun nom posé, pas même celui de l’étoile, n’est sous la couronne de 45 px', () => {
    for (const e of posees) {
      const px = Math.max(e.x, Math.min(195, e.x + e.largeur)), py = Math.max(e.y, Math.min(350, e.y + e.hauteur));
      assert.ok(Math.hypot(px - 195, py - 350) >= 45, `« ${e.texte} » dans la couronne`);
    }
  });
  it('bord : tous les noms posés restent dans les 390 px de large', () => {
    for (const e of posees) assert.ok(e.x >= 0 && e.x + e.largeur <= 390, `« ${e.texte} » sort de la vue : x ${e.x}, largeur ${e.largeur}`);
  });
  it('bord : sans halo en obstacle les mêmes noms existent encore, avec le halo ils sont plus loin de lui', () => {
    const sans = placerEtiquettes(corps, vue, mesurer);
    const e = sans.find((x) => x.cle === 'etoile')!;
    const avec = res.find((x) => x.cle === 'etoile')!;
    const d = (z: typeof e) => Math.hypot(z.x + z.largeur / 2 - 195, z.y + z.hauteur / 2 - 350);
    assert.ok(d(avec) >= d(e));
  });
});
