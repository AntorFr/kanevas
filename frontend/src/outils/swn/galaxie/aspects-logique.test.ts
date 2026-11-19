// kanevas-carte-spatiale-reglages-aspects-ecran: the draft of E-24 « Aspects », read from the criterion (« Couleur invalide : #rrggbb. »,
// only what differs from the default is proposed, keys the screen does not edit stay as saved). Expected values are written by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brouillonAspect, grouperTypes, libelleDeType, lireAspect, lireBorne } from './aspects-logique.ts';

const defaut = { palette: ['#aa0000', '#00aa00', '#0000aa'], halo_couleur: '#ffffff', relief: 0.5, sens: 1, variantes: ['a'] };
const bornes = { relief: { min: 0, max: 1, entier: false } };

test('le brouillon au défaut ne propose rien', () => {
  const b = brouillonAspect(defaut, {});
  assert.equal(b['palette.1'], '#00aa00');
  assert.deepEqual(lireAspect(b, defaut, bornes), { erreurs: {}, surcharge: {} });
});

test('seule la clé qui diffère est proposée, la palette entière', () => {
  const b = { ...brouillonAspect(defaut, {}), 'palette.0': '#FF0000' };
  assert.deepEqual(lireAspect(b, defaut, bornes).surcharge, { palette: ['#ff0000', '#00aa00', '#0000aa'] });
});

test('#12 : « Couleur invalide : #rrggbb. » sur le champ, et « Nombre attendu. » pour un nombre vide', () => {
  const b = { ...brouillonAspect(defaut, {}), 'palette.2': '#12', relief: '' };
  assert.deepEqual(lireAspect(b, defaut, bornes).erreurs, { 'palette.2': 'Couleur invalide : #rrggbb.', relief: 'Nombre attendu.' });
});

test('une valeur hors borne : « Entre 0 et 1. » ; juste à la borne, acceptée', () => {
  const b = brouillonAspect(defaut, {});
  assert.deepEqual(lireAspect({ ...b, relief: '1,5' }, defaut, bornes).erreurs, { relief: 'Entre 0 et 1.' });
  assert.deepEqual(lireAspect({ ...b, relief: '1' }, defaut, bornes), { erreurs: {}, surcharge: { relief: 1 } });
});

test('une clé non éditable de la surcharge enregistrée (variantes, sens) est conservée', () => {
  const enregistree = { variantes: ['z'], sens: -1, relief: 0.8 };
  const b = brouillonAspect(defaut, enregistree);
  assert.equal(b.relief, '0,8');
  assert.deepEqual(lireAspect(b, defaut, bornes, enregistree).surcharge, { variantes: ['z'], sens: -1, relief: 0.8 });
});

test('revenir à la valeur par défaut retire la clé de la surcharge', () => {
  const b = brouillonAspect(defaut, { relief: 0.8 });
  assert.deepEqual(lireAspect({ ...b, relief: '0,5' }, defaut, bornes, { relief: 0.8 }).surcharge, {});
});

test('la borne se lit sur la phrase du cœur ; une autre phrase n’en est pas une', () => {
  assert.deepEqual(lireBorne('Entre -1 et 2.5.'), { min: -1, max: 2.5 });
  assert.equal(lireBorne('Nombre entier attendu.'), null);
});

test('les étoiles se reconnaissent à la couronne et se groupent sous « Étoile » ; un type inconnu garde sa clé humanisée', () => {
  const l = [{ type: 'tellurique', defaut: {} }, { type: 'jaune', defaut: { couronne: 1 } }, { type: 'nouveau_type', defaut: {} }];
  assert.deepEqual(grouperTypes(l), [{ titre: 'Corps', types: ['tellurique', 'nouveau_type'] }, { titre: 'Étoile', types: ['jaune'] }]);
  assert.equal(libelleDeType('nouveau_type', {}), 'Nouveau type');
  assert.equal(libelleDeType('jaune', { couronne: 1 }), 'Étoile jaune (G)');
});
