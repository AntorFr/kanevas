// Tester of kanevas-carte-rendu-echelle-carte (E-23, AD-echelle-1): labels of a 12-body system at 390 px, the star's halo being an obstacle.
// Literal values, no DOM: the text measurer is an argument.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placerEtiquettes, type CorpsEtiquette, type Mesureur, type Obstacle } from './etiquettes.ts';

const mesurer: Mesureur = (t) => ({ largeur: [...t].length * 6, hauteur: 12 });
const vue = { largeur: 390, hauteur: 700, zoom: 1 };
const P = (cle: string, nom: string, x: number, y: number): CorpsEtiquette => ({ cle, genre: 'planete', nom, x, y, rayon: 5 });
const L = (cle: string, nom: string, x: number, y: number): CorpsEtiquette => ({ cle, genre: 'lune', nom, x, y, rayon: 3 });
// Star at (195,350) with a 30 px corona; planets on rings of 50, 70, 90, 110, 130, 150 and 170 px (50 → 90 are 40 px apart); 4 moons.
const corps: CorpsEtiquette[] = [
  { cle: 'etoile', genre: 'etoile', nom: 'Étoile', x: 195, y: 350, rayon: 4 },
  P('p1', 'Première', 245, 350), P('p2', 'Deuxième', 195, 420), P('p3', 'Troisième', 105, 350), P('p4', 'Quatrième', 195, 240),
  P('p5', 'Cinquième', 295, 450), P('p6', 'Sixième', 85, 460), P('p7', 'Septième', 80, 230),
  L('p1-a', 'Première a', 245, 336), L('p3-a', 'Troisième a', 105, 336), L('p5-a', 'Cinquième a', 309, 450), L('p6-a', 'Sixième a', 85, 446),
];
const halo: Obstacle = { type: 'disque', x: 195, y: 350, rayon: 30 };
const inter = (a: { x: number; y: number; largeur: number; hauteur: number }, b: typeof a) =>
  a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;

describe('placerEtiquettes — 12 astres dont 4 lunes à 390 px, halo en obstacle', () => {
  const res = placerEtiquettes(corps, vue, mesurer, [halo]);
  const horsLunes = res.filter((e) => !e.cle.endsWith('-a'));

  it('les 8 astres hors lunes ont leur nom posé, entier', () => {
    assert.equal(horsLunes.length, 8);
    assert.deepEqual(horsLunes.filter((e) => !e.visible).map((e) => e.cle), []);
    for (const c of corps.filter((k) => k.genre !== 'lune')) assert.equal(res.find((e) => e.cle === c.cle)!.texte, c.nom);
  });
  it('aucun recouvrement entre noms posés, ni avec le halo, ni hors de la vue', () => {
    const posees = res.filter((e) => e.visible);
    posees.forEach((a, i) => {
      for (const b of posees.slice(i + 1)) assert.equal(inter(a, b), false, `${a.cle} / ${b.cle}`);
      const px = Math.max(a.x, Math.min(195, a.x + a.largeur)), py = Math.max(a.y, Math.min(350, a.y + a.hauteur));
      assert.ok(Math.hypot(px - 195, py - 350) >= 30, `${a.cle} dans le halo`);
      assert.ok(a.x >= 0 && a.x + a.largeur <= 390 && a.y >= 0 && a.y + a.hauteur <= 700, `${a.cle} hors vue`);
    });
  });
  it('le nom de l’étoile se pose à côté du halo, pas sur lui', () => {
    const e = res.find((x) => x.cle === 'etoile')!;
    assert.ok(e.visible);
    assert.ok(e.y >= 350 + 30 || e.y + e.hauteur <= 350 - 30 || e.x >= 195 + 30 || e.x + e.largeur <= 195 - 30);
  });
  it('à zoom 0.5 les noms des lunes se replient, ceux des 8 autres astres restent posés', () => {
    const loin = placerEtiquettes(corps, { ...vue, zoom: 0.5 }, mesurer, [halo]);
    assert.deepEqual(loin.filter((e) => e.cle.endsWith('-a') && e.visible), []);
    assert.deepEqual(loin.filter((e) => !e.cle.endsWith('-a') && !e.visible), []);
  });
  it('sans l’obstacle, le nom de l’étoile est plus près : le halo agit', () => {
    const sans = placerEtiquettes(corps, vue, mesurer).find((x) => x.cle === 'etoile')!;
    const avec = res.find((x) => x.cle === 'etoile')!;
    assert.ok(Math.hypot(avec.x + avec.largeur / 2 - 195, avec.y + avec.hauteur / 2 - 350) > Math.hypot(sans.x + sans.largeur / 2 - 195, sans.y + sans.hauteur / 2 - 350));
  });
});
