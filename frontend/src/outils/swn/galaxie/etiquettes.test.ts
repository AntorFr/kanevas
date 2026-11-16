// Label placement of the system map (B-89, E-23, AD-carte-4): never over a body disc nor another label.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placerEtiquettes, LONGUEUR_MAX, type CorpsEtiquette, type Mesureur } from './etiquettes.ts';

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
