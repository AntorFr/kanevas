// E-18, lots d'outil : les compteurs se libellent avec les `natures` du corps du lot (jamais le registre du client).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { morceauxLot, type LotVue } from './format.js';

const base = { enAttente: 0, avertissements: 0 };
const outil = { cle: 'essai/g', libelle: 'Essai G' };
const natures = [{ nom: 'coques', libelle: 'Coques' }, { nom: 'armes', libelle: 'Armes' }];

test('lot d’outil : « Coques : 4 créés », « Armes : 7 créés, 1 refusé »', () => {
  const m = morceauxLot({ ...base, outil, natures, compteurs: { coques: { creees: 4 }, armes: { creees: 7, refusees: 1 } } } as LotVue);
  assert.deepEqual(m, ['Coques : 4 créés', 'Armes : 7 créés, 1 refusé']);
});

test('lot d’outil : natures arbitraires du serveur, ordre du serveur, nature vide omise, pluriel du refus', () => {
  const m = morceauxLot({
    ...base, outil,
    natures: [{ nom: 'zeta', libelle: 'Zèta' }, { nom: 'vide', libelle: 'Vide' }, { nom: 'fiches', libelle: 'Propres' }],
    compteurs: { fiches: { mises_a_jour: 2 }, zeta: { refusees: 3, inchangees: 1 }, vide: {}, inconnue: { creees: 9 } },
  } as LotVue);
  assert.deepEqual(m, ['Zèta : 1 inchangé, 3 refusés', 'Propres : 2 mis à jour']);
});

test('lot d’outil : sans natures ou sans rien d’écrit, aucun morceau (pas de repli sur le registre du contenu)', () => {
  assert.deepEqual(morceauxLot({ ...base, outil, compteurs: { fiches: { creees: 5 } } } as LotVue), []);
  assert.deepEqual(morceauxLot({ ...base, outil, natures, compteurs: {} } as LotVue), []);
});

test('lot de contenu : présentation d’avant, natures ignorées sans outil', () => {
  const m = morceauxLot({ ...base, enAttente: 2, avertissements: 1, natures, compteurs: { fiches: { creees: 1 } } } as LotVue);
  assert.deepEqual(m, ['Fiches : 1 créée', '2 liens et références en attente', '1 avertissement']);
});
