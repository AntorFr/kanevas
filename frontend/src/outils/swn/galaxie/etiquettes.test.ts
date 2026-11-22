// Label placement of the system map (B-89, E-23, AD-carte-4): never over a body disc nor another label.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placerEtiquettes, LONGUEUR_MAX, type CorpsEtiquette, type Mesureur, type Obstacle } from './etiquettes.ts';

const mesurer: Mesureur = (t) => ({ largeur: [...t].length * 6, hauteur: 12 });

// 12 planets with 4 moons each, 5 companions, a belt (zone) and the star; laid on a grid of the view.
function fixture(largeur: number, hauteur: number): CorpsEtiquette[] {
  const corps: CorpsEtiquette[] = [{ cle: 'etoile', genre: 'etoile', nom: 'Soleil', x: largeur / 2, y: 20, rayon: 14 }];
  const colonnes = largeur < 600 ? 3 : 6;
  const lignes = 12 / colonnes;
  for (let i = 0; i < 12; i++) {
    const x = ((i % colonnes) + 0.5) * (largeur / colonnes);
    const y = 60 + (Math.floor(i / colonnes) + 0.5) * ((hauteur - 60) / lignes);
    corps.push({ cle: `p${i}`, genre: 'planete', nom: `Planète ${i}`, x, y, rayon: 9 });
    for (let l = 0; l < 4; l++) {
      const a = (l - 1.5) * 0.45;
      corps.push({ cle: `p${i}l${l}`, genre: 'lune', nom: `Lune ${i}.${l}`, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 26, rayon: 3 });
    }
  }
  for (let k = 0; k < 5; k++) corps.push({ cle: `c${k}`, genre: 'compagne', nom: `Compagne ${k}`, x: 30 + k * (largeur - 60) / 4, y: 45, rayon: 5 });
  corps.push({ cle: 'ceinture', genre: 'zone', nom: 'Ceinture de Kral', x: largeur / 2, y: hauteur - 8, rayon: 0 });
  return corps;
}

function verifie(corps: CorpsEtiquette[], largeur: number, hauteur: number, zoom = 1) {
  const res = placerEtiquettes(corps, { largeur, hauteur, zoom }, mesurer);
  assert.equal(res.length, corps.length);
  const vis = res.filter((e) => e.visible);
  for (const e of vis) {
    assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.largeur <= largeur && e.y + e.hauteur <= hauteur, `${e.cle} hors de la vue`);
    for (const c of corps) {
      const px = Math.max(e.x, Math.min(c.x, e.x + e.largeur)), py = Math.max(e.y, Math.min(c.y, e.y + e.hauteur));
      assert.ok(Math.hypot(px - c.x, py - c.y) >= c.rayon && (c.rayon > 0 || Math.hypot(px - c.x, py - c.y) > 0), `${e.cle} coupe le corps ${c.cle}`);
    }
  }
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i]!, b = vis[j]!;
    const dehors = a.x >= b.x + b.largeur || b.x >= a.x + a.largeur || a.y >= b.y + b.hauteur || b.y >= a.y + a.hauteur;
    assert.ok(dehors, `${a.cle} chevauche ${b.cle}`);
  }
  return res;
}

describe('placerEtiquettes', () => {
  for (const [l, h] of [[390, 700], [1280, 720]] as const) {
    it(`aucune étiquette ne coupe un corps ni une autre étiquette à ${l} px`, () => {
      const res = verifie(fixture(l, h), l, h);
      const par = new Map(res.map((e) => [e.cle, e]));
      for (const cle of ['etoile', 'p0', 'p11']) assert.equal(par.get(cle)!.visible, true, `${cle} doit rester étiquetée`);
      assert.ok(res.filter((e) => e.visible).length >= 20, 'trop d’étiquettes repliées');
    });
    it(`deux appels donnent le même résultat à ${l} px`, () => {
      const c = fixture(l, h);
      const a = placerEtiquettes(c, { largeur: l, hauteur: h }, mesurer);
      assert.deepEqual(placerEtiquettes(structuredClone(c), { largeur: l, hauteur: h }, mesurer), a);
    });
    it(`le dézoom ne chevauche toujours rien à ${l} px`, () => {
      for (const zoom of [0.5, 0.8, 2]) verifie(fixture(l, h), l, h, zoom);
    });
  }

  it('un nom de 90 caractères est coupé à 80 avec « … »', () => {
    const res = placerEtiquettes([{ cle: 'a', genre: 'planete', nom: 'x'.repeat(90), x: 600, y: 100, rayon: 8 }], { largeur: 1280, hauteur: 300 }, mesurer);
    assert.equal(res[0]!.visible, true);
    assert.equal(res[0]!.texte, `${'x'.repeat(79)}…`);
    assert.equal([...res[0]!.texte].length, LONGUEUR_MAX);
  });
  it('un nom de 80 caractères n’est pas coupé', () => {
    const res = placerEtiquettes([{ cle: 'a', genre: 'planete', nom: 'y'.repeat(80), x: 600, y: 100, rayon: 8 }], { largeur: 1280, hauteur: 300 }, mesurer);
    assert.equal(res[0]!.texte, 'y'.repeat(80));
  });
  it('une étiquette trop large est raccourcie avec « … » plutôt que repliée', () => {
    const res = placerEtiquettes([{ cle: 'a', genre: 'planete', nom: 'Un nom vraiment très long', x: 60, y: 50, rayon: 8 }], { largeur: 120, hauteur: 100 }, mesurer);
    assert.equal(res[0]!.visible, true);
    assert.ok(res[0]!.texte.endsWith('…') && res[0]!.texte.length < 'Un nom vraiment très long'.length);
    assert.ok(res[0]!.largeur <= 120);
  });
  it('une étiquette sans place est repliée : cachée, le corps reste', () => {
    const res = placerEtiquettes([{ cle: 'a', genre: 'planete', nom: 'Gros', x: 30, y: 15, rayon: 40 }], { largeur: 60, hauteur: 30 }, mesurer);
    assert.equal(res[0]!.visible, false);
    assert.equal(res[0]!.texte, '');
  });
  it('les lunes se replient au dézoom, avant les planètes', () => {
    const c: CorpsEtiquette[] = [
      { cle: 'p', genre: 'planete', nom: 'Terre', x: 200, y: 100, rayon: 9 },
      { cle: 'l', genre: 'lune', nom: 'Lune', x: 230, y: 100, rayon: 3 },
      { cle: 'z', genre: 'zone', nom: 'Ceinture', x: 100, y: 150, rayon: 0 },
    ];
    const v = (zoom: number) => Object.fromEntries(placerEtiquettes(c, { largeur: 400, hauteur: 200, zoom }, mesurer).map((e) => [e.cle, e.visible]));
    assert.deepEqual(v(1), { p: true, l: true, z: true });
    assert.deepEqual(v(0.9), { p: true, l: false, z: true });
    assert.deepEqual(v(0.5), { p: true, l: false, z: false });
  });
  it('la priorité : une planète garde son côté préféré face à une lune', () => {
    const c: CorpsEtiquette[] = [
      { cle: 'l', genre: 'lune', nom: 'Lune', x: 200, y: 100, rayon: 3 },
      { cle: 'p', genre: 'planete', nom: 'Terre', x: 200, y: 90, rayon: 9 },
    ];
    const res = placerEtiquettes(c, { largeur: 400, hauteur: 200 }, mesurer);
    assert.equal(res[1]!.visible, true);
    assert.ok(res[1]!.y >= 90 + 9 + 4 || res[1]!.x + res[1]!.largeur <= 200 - 9 || res[1]!.x >= 200 + 9 + 4 || res[1]!.y + res[1]!.hauteur <= 90 - 9);
  });
  it('liste vide et nom vide', () => {
    assert.deepEqual(placerEtiquettes([], { largeur: 100, hauteur: 100 }, mesurer), []);
    const r = placerEtiquettes([{ cle: 'a', genre: 'planete', nom: '   ', x: 50, y: 50, rayon: 5 }], { largeur: 100, hauteur: 100 }, mesurer);
    assert.equal(r[0]!.visible, false);
  });
  it('l’ordre d’entrée ne change pas les rectangles des corps de priorité distincte', () => {
    const c = fixture(1280, 720);
    const a = placerEtiquettes(c, { largeur: 1280, hauteur: 720 }, mesurer);
    const b = placerEtiquettes([...c].reverse(), { largeur: 1280, hauteur: 720 }, mesurer);
    const pb = new Map(b.map((e) => [e.cle, e]));
    for (const e of a.filter((x) => x.cle === 'etoile' || /^p\d+$/.test(x.cle))) assert.deepEqual(pb.get(e.cle), e);
  });
});

describe('placerEtiquettes — obstacles et halo (recette B-89)', () => {
  const vue = { largeur: 400, hauteur: 300 };
  const planete: CorpsEtiquette = { cle: 'p', genre: 'planete', nom: 'Planète', x: 200, y: 150, rayon: 9 };
  const rectDe = (e: { x: number; y: number; largeur: number; hauteur: number }) => e;
  const inter = (a: { x: number; y: number; largeur: number; hauteur: number }, b: typeof a) =>
    a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;

  it('sans obstacle, le côté préféré (dessous) est pris', () => {
    const e = placerEtiquettes([planete], vue, mesurer)[0]!;
    assert.ok(e.visible && e.y >= 150 + 9);
  });
  it('un rectangle (étiquette d’heure) sous le corps écarte l’étiquette', () => {
    const o: Obstacle = { type: 'rect', x: 170, y: 160, largeur: 60, hauteur: 30 };
    const e = placerEtiquettes([planete], vue, mesurer, [o])[0]!;
    assert.ok(e.visible);
    assert.equal(inter(rectDe(e), o), false);
  });
  it('un disque (couronne) est évité', () => {
    const o: Obstacle = { type: 'disque', x: 200, y: 150, rayon: 40 };
    const c: CorpsEtiquette = { cle: 'e', genre: 'etoile', nom: 'Soleil', x: 200, y: 150, rayon: 14, halo: 40 };
    const e = placerEtiquettes([c], vue, mesurer, [o])[0]!;
    assert.ok(e.visible);
    const px = Math.max(e.x, Math.min(200, e.x + e.largeur)), py = Math.max(e.y, Math.min(150, e.y + e.hauteur));
    assert.ok(Math.hypot(px - 200, py - 150) >= 40, 'l’étiquette entre dans la couronne');
  });
  it('un halo large écarte l’étiquette plus loin que le rayon', () => {
    const e = placerEtiquettes([{ ...planete, halo: 50 }], vue, mesurer)[0]!;
    assert.ok(e.visible);
    const px = Math.max(e.x, Math.min(200, e.x + e.largeur)), py = Math.max(e.y, Math.min(150, e.y + e.hauteur));
    assert.ok(Math.hypot(px - 200, py - 150) >= 50);
  });
  it('un anneau (cercle de transition) n’est jamais traversé', () => {
    const o: Obstacle = { type: 'anneau', x: 200, y: 150, rayon: 20 };
    const c: CorpsEtiquette = { cle: 'p', genre: 'planete', nom: 'Planète lointaine', x: 200, y: 150 - 20, rayon: 4 };
    const e = placerEtiquettes([c], vue, mesurer, [o])[0]!;
    if (e.visible) {
      const pts = [e.x, e.x + e.largeur].flatMap((x) => [e.y, e.y + e.hauteur].map((y) => Math.hypot(x - 200, y - 150)));
      const px = Math.max(e.x, Math.min(200, e.x + e.largeur)), py = Math.max(e.y, Math.min(150, e.y + e.hauteur));
      const dmin = Math.hypot(px - 200, py - 150);
      assert.ok(dmin >= 20 || Math.max(...pts) <= 20, 'le rectangle traverse l’anneau');
    }
  });
  it('un nom coincé par des obstacles est raccourci ou replié, jamais posé dessus; déterministe', () => {
    const os: Obstacle[] = [{ type: 'rect', x: 0, y: 0, largeur: 400, hauteur: 300 }];
    const a = placerEtiquettes([planete], vue, mesurer, os);
    assert.equal(a[0]!.visible, false);
    assert.deepEqual(placerEtiquettes([planete], vue, mesurer, os), a);
  });
  it('une liste d’obstacles vide donne le même résultat que sans argument', () => {
    assert.deepEqual(placerEtiquettes([planete], vue, mesurer, []), placerEtiquettes([planete], vue, mesurer));
  });
  it('la fixture de 12 corps avec obstacles : rien ne touche un obstacle, ni un autre rectangle', () => {
    for (const [l, h] of [[390, 700], [1280, 720]] as const) {
      const os: Obstacle[] = [
        { type: 'rect', x: l / 2 - 10, y: h - 30, largeur: 20, hauteur: 12 },
        { type: 'disque', x: l / 2, y: 20, rayon: 24 },
        { type: 'anneau', x: l / 2, y: h / 2, rayon: Math.min(l, h) / 2 - 5 },
      ];
      const res = placerEtiquettes(fixture(l, h), { largeur: l, hauteur: h }, mesurer, os);
      for (const e of res.filter((x) => x.visible)) {
        assert.equal(inter(e, os[0] as typeof e), false, `${e.cle} sur l’heure`);
        const px = Math.max(e.x, Math.min(l / 2, e.x + e.largeur)), py = Math.max(e.y, Math.min(20, e.y + e.hauteur));
        assert.ok(Math.hypot(px - l / 2, py - 20) >= 24, `${e.cle} dans la couronne`);
        const R = Math.min(l, h) / 2 - 5, cy = h / 2;
        const qx = Math.max(e.x, Math.min(l / 2, e.x + e.largeur)), qy = Math.max(e.y, Math.min(cy, e.y + e.hauteur));
        const dmin = Math.hypot(qx - l / 2, qy - cy);
        const dmax = Math.max(...[e.x, e.x + e.largeur].flatMap((x) => [e.y, e.y + e.hauteur].map((y) => Math.hypot(x - l / 2, y - cy))));
        assert.ok(dmin >= R || dmax <= R, `${e.cle} traverse l’anneau`);
      }
    }
  });
});
