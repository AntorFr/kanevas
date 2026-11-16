// Review of kanevas-battlemap-editeur-objets (E-28, B-101, B-102, B-104), written from the exit criterion, on the real Wasm core.
//
// TEST PLAN
//   poser    : clic → une commande poser_element sur le calque Objet choisi, centre aimanté sur l'empreinte, rotation portée
//              (quart de tour : empreinte 2×1 → 1×2) ; sans asset armé → phrase ; calque verrouillé / masqué → phrase, aucune commande
//   calque   : calqueObjet = le calque choisi s'il peut recevoir, sinon le premier libre ; un calque de sol choisi est ignoré
//   calques  : 21e calque refusé par le cœur (carte_pleine) et le nombre vient des limites du cœur
//   objets   : MJ seul sur un calque, échelle 2, hors bornes (0,2 / 4,5) refusée sans changer le document
//   lien     : lier_fiche puis lier_fiche sans fiche → fiche_id absent ; défaire le lien le remet
//   dupliquer: la copie a un nouvel id, garde fiche_id et échelle, décalée de (dx, dy) ; un lot dupliqué = un geste défaisable
//   retire   : un élément dont l'asset n'existe plus reste dans le document (supprimable, sélectionnable)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as CoeurWasm from '../../../../../rust/pkg/battlemap_core/battlemap_core.js';
import { chargerModule } from '../../../../../src/wasm/charger.js';
import type { Coeur } from './coeur';
import { calqueObjet } from './geometrie';
import { Interaction, type Contexte } from './interaction';
import { Moteur } from './moteur';
import type { Commande, Document } from './types';

async function coeur(): Promise<{ coeur: Coeur; vide: () => Document; limites: { calques_max: number; echelle_min: number; echelle_max: number } }> {
  const m = await chargerModule<typeof CoeurWasm>('battlemap_core');
  return {
    vide: () => JSON.parse(m.carte_vide(30, 20)) as Document,
    limites: JSON.parse(m.limites()),
    coeur: {
      appliquerLot: (d, c) => JSON.parse(m.appliquerLot(JSON.stringify(d), JSON.stringify(c))),
      tailleMax: () => ({ largeur: 200, hauteur: 200 }),
    },
  };
}

const ctx = (doc: Document, plus: Partial<Contexte> = {}): Contexte => ({
  doc, aimanter: true, empreinte: () => ({ largeur: 1, hauteur: 1 }), assetSol: null, assetMur: null, selection: [],
  assetObjet: 'coffre', calqueObjet: null, rotation: 0, nouvelId: () => 'e1', ...plus,
});
const clic = (doc: Document, x: number, y: number, plus: Partial<Contexte> = {}) =>
  new Interaction('poser', ctx(doc, plus), { x, y }, false).terminer();
const idObjet = (d: Document) => d.calques.find((c) => c.type === 'objet')!.id;

test('Poser : un clic = une commande poser_element, centre aimanté sur la grille', async () => {
  const { vide } = await coeur();
  const d = vide();
  const r = clic(d, 3.4, 2.7);
  assert.equal(r.k, 'commandes');
  const [c] = (r as { commandes: Commande[] }).commandes;
  assert.equal((r as { commandes: Commande[] }).commandes.length, 1);
  assert.deepEqual({ ...c }, { type: 'poser_element', id: 'e1', calque: idObjet(d), asset_id: 'coffre', x: 3.5, y: 2.5, rotation: 0 });
});

test('Poser : empreinte 2×1 aimantée, et un quart de tour la retourne en 1×2', async () => {
  const { vide } = await coeur();
  const d = vide();
  const emp = () => ({ largeur: 2, hauteur: 1 });
  const a = (clic(d, 3.2, 2.2, { empreinte: emp }) as { commandes: Commande[] }).commandes[0]!;
  assert.deepEqual([a.x, a.y], [3, 2.5]);
  const b = (clic(d, 3.2, 2.2, { empreinte: emp, rotation: 90 }) as { commandes: Commande[] }).commandes[0]!;
  assert.deepEqual([b.x, b.y, b.rotation], [3.5, 2, 90]);
});

test('Poser : sans aimant le centre est le point', async () => {
  const { vide } = await coeur();
  const c = (clic(vide(), 3.3, 2.1, { aimanter: false }) as { commandes: Commande[] }).commandes[0]!;
  assert.deepEqual([c.x, c.y], [3.3, 2.1]);
});

test('Poser : pas d’asset armé, calque verrouillé ou masqué → une phrase, aucune commande', async () => {
  const { vide } = await coeur();
  const d = vide();
  assert.deepEqual(clic(d, 1, 1, { assetObjet: null }), { k: 'message', texte: 'Choisissez un objet dans la bibliothèque.' });
  const verrou = structuredClone(d);
  verrou.calques.find((c) => c.type === 'objet')!.verrouille = true;
  assert.deepEqual(clic(verrou, 1, 1, { calqueObjet: idObjet(verrou) }), { k: 'message', texte: 'Ce calque est verrouillé.' });
  const cache = structuredClone(d);
  cache.calques.find((c) => c.type === 'objet')!.visible = false;
  assert.deepEqual(clic(cache, 1, 1, { calqueObjet: idObjet(cache) }), { k: 'message', texte: 'Ce calque est masqué.' });
});

test('calqueObjet : le calque choisi, sinon le premier libre ; un calque de sol choisi est ignoré', async () => {
  const { vide } = await coeur();
  const d = vide();
  d.calques.push({ id: 'o2', nom: 'MJ', type: 'objet', visible: true, verrouille: false, mj_seul: true });
  assert.equal((calqueObjet(d, 'o2') as { calque: { id: string } }).calque.id, 'o2');
  const sol = d.calques.find((c) => c.type === 'sol')!.id;
  assert.equal((calqueObjet(d, sol) as { calque: { id: string } }).calque.type, 'objet');
  assert.equal((calqueObjet(d, 'inconnu') as { calque: { id: string } }).calque.type, 'objet');
  assert.equal((calqueObjet(d, null) as { calque: { id: string } }).calque.type, 'objet');
});

test('Poser sur le calque MJ seul choisi : l’élément y va', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  assert.equal(m.geste([{ type: 'creer_calque', id: 'mj', nom: 'MJ seul', genre: 'objet' }]).ok, true);
  assert.equal(m.geste([{ type: 'regler_calque', id: 'mj', mj_seul: true }]).ok, true);
  const r = clic(m.document, 4, 4, { calqueObjet: 'mj', assetObjet: 'piege', nouvelId: () => 'p1' }) as { commandes: Commande[] };
  assert.equal(m.geste(r.commandes).ok, true);
  const e = m.document.elements.find((x) => x.id === 'p1')!;
  assert.equal(e.calque, 'mj');
  assert.equal(m.document.calques.find((x) => x.id === 'mj')!.mj_seul, true);
});

test('le 21e calque est refusé par le cœur, et la limite est celle du cœur', async () => {
  const { coeur: c, vide, limites } = await coeur();
  assert.equal(limites.calques_max, 20);
  const m = new Moteur(c, vide(), 1);
  while (m.document.calques.length < limites.calques_max) {
    assert.equal(m.geste([{ type: 'creer_calque', id: `c${m.document.calques.length}`, nom: `Objets ${m.document.calques.length}`, genre: 'objet' }]).ok, true);
  }
  assert.equal(m.document.calques.length, 20);
  const r = m.geste([{ type: 'creer_calque', id: 'de-trop', nom: 'X', genre: 'objet' }]);
  assert.equal(r.ok, false);
  assert.equal(m.document.calques.length, 20);
});

test('échelle : 2 acceptée, bornes du cœur refusées sans changer le document', async () => {
  const { coeur: c, vide, limites } = await coeur();
  const d = vide();
  const m = new Moteur(c, d, 1);
  m.geste([{ type: 'poser_element', id: 'e', calque: idObjet(d), asset_id: 'coffre', x: 2.5, y: 2.5, rotation: 0 }]);
  assert.equal(m.geste([{ type: 'mettre_a_echelle', id: 'e', echelle: 2 }]).ok, true);
  assert.equal(m.document.elements[0]!.echelle, 2);
  assert.equal(limites.echelle_min, 0.25);
  assert.equal(limites.echelle_max, 4);
  for (const v of [0.2, 4.5, 0, -1]) {
    const avant = JSON.stringify(m.document);
    assert.equal(m.geste([{ type: 'mettre_a_echelle', id: 'e', echelle: v }]).ok, false, `échelle ${v}`);
    assert.equal(JSON.stringify(m.document), avant);
  }
  assert.equal(m.geste([{ type: 'mettre_a_echelle', id: 'e', echelle: 0.25 }]).ok, true);
  assert.equal(m.geste([{ type: 'mettre_a_echelle', id: 'e', echelle: 4 }]).ok, true);
});

test('lier une fiche, la délier (commande sans fiche) : fiche_id absent, défaire le remet', async () => {
  const { coeur: c, vide } = await coeur();
  const d = vide();
  const m = new Moteur(c, d, 1);
  m.geste([{ type: 'poser_element', id: 'e', calque: idObjet(d), asset_id: 'coffre', x: 2.5, y: 2.5, rotation: 0 }]);
  assert.equal(m.geste([{ type: 'lier_fiche', id: 'e', fiche_id: '42' }]).ok, true);
  assert.equal(m.document.elements[0]!.fiche_id, '42');
  assert.equal(m.geste([{ type: 'lier_fiche', id: 'e' }]).ok, true);
  assert.equal(m.document.elements[0]!.fiche_id, undefined);
  assert.equal('fiche_id' in JSON.parse(JSON.stringify(m.document.elements[0])), false);
  assert.equal(m.annuler().ok, true);
  assert.equal(m.document.elements[0]!.fiche_id, '42');
  // un élément inconnu : refusé
  assert.equal(m.geste([{ type: 'lier_fiche', id: 'nope', fiche_id: '1' }]).ok, false);
});

test('dupliquer : nouvel id, fiche et échelle gardées, décalage (dx, dy), un geste défaisable', async () => {
  const { coeur: c, vide } = await coeur();
  const d = vide();
  const m = new Moteur(c, d, 1);
  m.geste([{ type: 'poser_element', id: 'e', calque: idObjet(d), asset_id: 'coffre', x: 2.5, y: 2.5, rotation: 90 }]);
  m.geste([{ type: 'mettre_a_echelle', id: 'e', echelle: 2 }, { type: 'lier_fiche', id: 'e', fiche_id: '7' }]);
  const n = m.file.length;
  assert.equal(m.geste([{ type: 'dupliquer_elements', ids: ['e'], nouveaux_ids: ['copie'], dx: 1, dy: 1 }]).ok, true);
  assert.equal(m.file.length, n + 1);
  const copie = m.document.elements.find((x) => x.id === 'copie')!;
  assert.deepEqual([copie.x, copie.y, copie.echelle, copie.fiche_id, copie.rotation, copie.asset_id], [3.5, 3.5, 2, '7', 90, 'coffre']);
  assert.equal(m.document.elements.find((x) => x.id === 'e')!.x, 2.5, 'l’original ne bouge pas');
  // second collage : décalage de 2
  assert.equal(m.geste([{ type: 'dupliquer_elements', ids: ['e'], nouveaux_ids: ['copie2'], dx: 2, dy: 2 }]).ok, true);
  assert.equal(m.document.elements.find((x) => x.id === 'copie2')!.x, 4.5);
  // identifiant déjà pris : refusé
  assert.equal(m.geste([{ type: 'dupliquer_elements', ids: ['e'], nouveaux_ids: ['copie'], dx: 1, dy: 1 }]).ok, false);
  m.annuler();
  assert.equal(m.document.elements.some((x) => x.id === 'copie2'), false);
  assert.equal(m.document.elements.some((x) => x.id === 'copie'), true);
});

test('dupliquer hors de la carte : refusé, document inchangé', async () => {
  const { coeur: c, vide } = await coeur();
  const d = vide();
  const m = new Moteur(c, d, 1);
  m.geste([{ type: 'poser_element', id: 'e', calque: idObjet(d), asset_id: 'coffre', x: 29.5, y: 19.5, rotation: 0 }]);
  const avant = JSON.stringify(m.document);
  assert.equal(m.geste([{ type: 'dupliquer_elements', ids: ['e'], nouveaux_ids: ['hors'], dx: 1, dy: 1 }]).ok, false);
  assert.equal(JSON.stringify(m.document), avant);
});

test('un élément dont l’asset a disparu reste dans le document : on peut le supprimer', async () => {
  const { coeur: c, vide } = await coeur();
  const d = vide();
  const m = new Moteur(c, d, 1);
  m.geste([{ type: 'poser_element', id: 'e', calque: idObjet(d), asset_id: 'retire', x: 2.5, y: 2.5, rotation: 0 }]);
  assert.equal(m.document.elements.length, 1);
  assert.equal(m.geste([{ type: 'supprimer_element', id: 'e' }]).ok, true);
  assert.equal(m.document.elements.length, 0);
  assert.equal(m.annuler().ok, true);
  assert.equal(m.document.elements.length, 1);
});

test('supprimer un calque puis défaire : le calque et ses éléments reviennent', async () => {
  const { coeur: c, vide } = await coeur();
  const d = vide();
  const m = new Moteur(c, d, 1);
  m.geste([{ type: 'creer_calque', id: 'k', nom: 'Objets 2', genre: 'objet' }]);
  m.geste([{ type: 'poser_element', id: 'e', calque: 'k', asset_id: 'coffre', x: 1.5, y: 1.5, rotation: 0 }]);
  assert.equal(m.geste([{ type: 'supprimer_calque', id: 'k' }]).ok, true);
  assert.equal(m.document.elements.length, 0);
  assert.equal(m.annuler().ok, true);
  assert.equal(m.document.calques.some((x) => x.id === 'k'), true);
  assert.equal(m.document.elements.length, 1);
});
