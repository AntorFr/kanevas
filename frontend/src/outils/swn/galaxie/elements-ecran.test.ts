// The pure side of E-23 « elements » (B-96), written from docs/ecrans.md « E-23 — elements » and the exit criterion, not from the code:
// where the marks sit, the words of the removal and of the refusals, and the labels around elements.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErreurApi } from '../../../api.ts';
import type { CorpsPlace } from './carte-geometrie.ts';
import { placerMarques } from './elements-geometrie.ts';
import { lireEchecElement } from './echec-element.ts';
import { placerEtiquettes, type CorpsEtiquette, type Mesureur } from './etiquettes.ts';
import { consequenceElements, nomElement, placeElement } from './systeme-libelles.ts';
import type { AstreSysteme, ElementSysteme } from './types.ts';

const el = (cle: string, o: Partial<ElementSysteme> = {}): ElementSysteme => ({
  cle, genre: 'vaisseau', nom: cle, sur: null, orbite: 4, heure: 0, aspect: { icone: 'vaisseau', couleur: 'accent' }, ...o,
});
const astre = (cle: string, o: Partial<AstreSysteme> = {}): AstreSysteme => ({
  cle, genre: 'planete', parent_cle: null, etoile_rang: 0, type: 'tellurique', nom: cle, orbite: 2, heure: 3, taille: 1, ...o,
});
const plan = (r: number, h: number): [number, number] => [r * Math.cos((h * Math.PI) / 6), r * Math.sin((h * Math.PI) / 6)];
const ecran = (x: number, y: number): [number, number] => [x, y];
const corpsPlace = (cle: string, x: number, y: number, rayon: number): CorpsPlace =>
  ({ cle, genre: 'planete', nom: cle, astre: astre(cle), x, y, rayon, cote: rayon * 2, aspect: '{}', decalage: [0, 0] });

describe('marques des éléments : où elles se posent', () => {
  it('par orbite et heure : sur l’orbite (orbite 4 = rayon 198, heure 0), l’échelle de l’écran n’y change rien d’autre qu’ecran()', () => {
    const [m] = placerMarques([el('a', { orbite: 4, heure: 0 })], [], plan, ecran, 1);
    assert.ok(Math.abs(m!.x - 198) < 1e-6 && Math.abs(m!.y) < 1e-6);
  });

  it('deux éléments au même orbite·heure se posent côte à côte (32 px), aucun refusé, et un autre lieu n’est pas décalé', () => {
    const r = placerMarques([el('a'), el('b'), el('c', { heure: 6 })], [], plan, ecran, 1);
    assert.equal(r.length, 3);
    assert.ok(Math.abs(r[1]!.x - r[0]!.x - 32) < 1e-6 && Math.abs(r[1]!.y - r[0]!.y) < 1e-6);
    assert.ok(Math.abs(r[2]!.x + 198) < 1e-6, 'le troisième est à l’autre bout de l’orbite, sans décalage de voisin');
  });

  it('sur un corps : en orbite autour de lui, hors de son disque, et il le suit quand le corps bouge', () => {
    const e = el('nef', { sur: 'p', orbite: null });
    const a = placerMarques([e], [corpsPlace('p', 100, 100, 10)], plan, ecran, 1)[0]!;
    const b = placerMarques([e], [corpsPlace('p', 300, 50, 10)], plan, ecran, 1)[0]!;
    const da = Math.hypot(a.x - 100, a.y - 100);
    assert.ok(da >= 10 + 14, `hors du disque du corps (distance ${da})`);
    assert.ok(da < 60, 'petite orbite');
    assert.ok(Math.abs(b.x - 300 - (a.x - 100)) < 1e-6 && Math.abs(b.y - 50 - (a.y - 100)) < 1e-6, 'même décalage autour du corps déplacé');
  });

  it('plusieurs éléments sur le même corps : positions toutes distinctes', () => {
    const els = [0, 1, 2, 3].map((i) => el(`e${i}`, { sur: 'p', orbite: null }));
    const r = placerMarques(els, [corpsPlace('p', 0, 0, 12)], plan, ecran, 1);
    const cles = new Set(r.map((m) => `${m.x.toFixed(2)}|${m.y.toFixed(2)}`));
    assert.equal(cles.size, 4);
  });

  it('sur un corps que la lecture ne donne pas : retombe sur son orbite sans planter', () => {
    const r = placerMarques([el('x', { sur: 'disparu', orbite: 3, heure: 0 })], [], plan, ecran, 1);
    assert.equal(r.length, 1);
    assert.ok(Number.isFinite(r[0]!.x) && Number.isFinite(r[0]!.y));
  });
});

describe('mots des éléments', () => {
  it('« Retirer Vael II ? » : « Son élément (1) sera retiré. » / « Ses éléments (2) seront retirés. », rien à 0', () => {
    assert.equal(consequenceElements(1), 'Son élément (1) sera retiré.');
    assert.equal(consequenceElements(2), 'Ses éléments (2) seront retirés.');
    assert.equal(consequenceElements(0), '');
  });

  it('le lieu : « Sur Vael II » ou « Orbite 4 · 7 h » ; un nom vide se lit « Élément sans nom »', () => {
    const p = astre('vael2', { nom: 'Vael II' });
    assert.equal(placeElement(el('a', { sur: 'vael2', orbite: null }), [p]), 'Sur Vael II');
    assert.equal(placeElement(el('a', { orbite: 4, heure: 7 }), [p]), 'Orbite 4 · 7 h');
    assert.equal(nomElement(el('a', { nom: '' })), 'Élément sans nom');
  });

  it('les refus lus par leurs mots (docs/ecrans.md « States added »)', () => {
    const e = (statut: number, code?: string) => lireEchecElement(new ErreurApi(statut, 'x', code));
    assert.equal(e(409, 'a_change').message, 'Cet élément a changé depuis que vous l’avez ouvert.');
    assert.equal(e(404, 'astre_inconnu').message, 'Cet élément n’existe plus.');
    assert.equal(lireEchecElement(new ErreurApi(404, 'x', 'astre_inconnu'), true).message, 'Cet astre n’existe plus.');
    assert.equal(e(404).message, 'Ce système n’existe plus.');
    assert.equal(e(500).message, 'Impossible d’enregistrer l’élément.');
    assert.equal(e(0).message, 'Connexion perdue.');
    assert.equal(lireEchecElement(new Error('boom')).message, 'Impossible d’enregistrer l’élément.');
  });
});

describe('étiquettes avec éléments : ni sur un corps, ni sur une marque, ni sur une autre étiquette', () => {
  const mesurer: Mesureur = (t) => ({ largeur: [...t].length * 6, hauteur: 12 });
  const fixture = (largeur: number, hauteur: number): CorpsEtiquette[] => {
    const c: CorpsEtiquette[] = [{ cle: 's', genre: 'etoile', nom: 'Soleil', x: largeur / 2, y: hauteur / 2, rayon: 14 }];
    const col = largeur < 600 ? 3 : 6;
    for (let i = 0; i < 12; i++) {
      const x = ((i % col) + 0.5) * (largeur / col), y = 40 + (Math.floor(i / col) + 0.5) * ((hauteur - 60) / (12 / col));
      c.push({ cle: `p${i}`, genre: 'planete', nom: `Planète ${i}`, x, y, rayon: 9 });
      if (i < 8) c.push({ cle: `element:e${i}`, genre: 'element', nom: `Navire ${i}`, x: x + 20, y: y + 14, rayon: 14 });
    }
    return c;
  };
  for (const [l, h] of [[390, 700], [1280, 700]] as const) {
    it(`${l} px : 12 corps et 8 éléments, aucune étiquette visible ne coupe un disque ni une autre étiquette`, () => {
      const corps = fixture(l, h);
      const r = placerEtiquettes(corps, { largeur: l, hauteur: h, zoom: 1 }, mesurer);
      const vis = r.filter((e) => e.visible);
      for (const e of vis) {
        for (const c of corps) {
          const px = Math.max(e.x, Math.min(c.x, e.x + e.largeur)), py = Math.max(e.y, Math.min(c.y, e.y + e.hauteur));
          assert.ok(Math.hypot(px - c.x, py - c.y) >= c.rayon, `${e.cle} coupe ${c.cle}`);
        }
      }
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i]!, b = vis[j]!;
        assert.ok(a.x >= b.x + b.largeur || b.x >= a.x + a.largeur || a.y >= b.y + b.hauteur || b.y >= a.y + a.hauteur, `${a.cle} chevauche ${b.cle}`);
      }
      assert.ok(vis.some((e) => e.cle.startsWith('element:')), 'au moins un élément est étiqueté au zoom 1');
    });
  }

  it('au zoom éloigné (0,5), les étiquettes des éléments se replient, celles des planètes restent', () => {
    const r = placerEtiquettes(fixture(1280, 700), { largeur: 1280, hauteur: 700, zoom: 0.5 }, mesurer);
    assert.equal(r.filter((e) => e.cle.startsWith('element:') && e.visible).length, 0);
    assert.ok(r.filter((e) => e.cle.startsWith('p') && e.visible).length > 0);
  });

  it('un nom vide (carte de téléphone chargée, élément non sélectionné) ne montre aucune étiquette', () => {
    const r = placerEtiquettes([{ cle: 'element:x', genre: 'element', nom: '', x: 50, y: 50, rayon: 14 }], { largeur: 390, hauteur: 300, zoom: 1 }, mesurer);
    assert.equal(r.filter((e) => e.visible).length, 0);
  });
});
