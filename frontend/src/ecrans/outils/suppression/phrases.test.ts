import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LigneDonnees } from '../types';
import { compte, enumerer, nombre, phrase, phraseResultat } from './phrases';

const conc = (n: number): LigneDonnees => ({ cle: 'conceptions', singulier: 'conception', pluriel: 'conceptions', nombre: n });
const cat = (n: number): LigneDonnees => ({ cle: 'catalogue', singulier: 'élément local de catalogue', pluriel: 'éléments locaux de catalogue', nombre: n });
const sys = (n: number): LigneDonnees => ({ cle: 'systemes', singulier: 'système', pluriel: 'systèmes', nombre: n });
const rte = (n: number): LigneDonnees => ({ cle: 'routes', singulier: 'route', pluriel: 'routes', nombre: n });
const zon = (n: number): LigneDonnees => ({ cle: 'zones', singulier: 'zone', pluriel: 'zones', nombre: n });

test('nombre : 14 000 s’écrit avec une espace fine, sans séparateur sous 1 000', () => {
  assert.equal(nombre(14000), '14\u202f000');
  assert.equal(nombre(999), '999');
  assert.equal(nombre(1234567), '1\u202f234\u202f567');
});

test('compte : le pluriel vient de singulier / pluriel du résumé, 1 est au singulier', () => {
  assert.equal(compte(conc(1)), '1 conception');
  assert.equal(compte(cat(2)), '2 éléments locaux de catalogue');
  assert.equal(compte(conc(14000)), '14\u202f000 conceptions');
});

test('phrase : la phrase de l’univers, du singulier, de la galaxie', () => {
  assert.equal(phrase([conc(2), cat(2)], 'univers', false), '2 conceptions, 2 éléments locaux de catalogue seront effacés.');
  assert.equal(phrase([conc(1)], 'univers', false), '1 conception sera effacé.');
  assert.equal(phrase([sys(4), rte(3), zon(1)], 'univers', true), 'Les 4 systèmes, 3 routes et 1 zone de cette galaxie seront effacés.');
  assert.equal(phrase([conc(14000)], 'univers', false), '14\u202f000 conceptions seront effacés.');
});

test('enumerer et résultat : « et » avant le dernier à partir de trois lignes', () => {
  assert.equal(enumerer([sys(4), rte(3)]), '4 systèmes, 3 routes');
  assert.equal(phraseResultat([conc(2), cat(2)]), 'Données supprimées : 2 conceptions, 2 éléments locaux de catalogue.');
});
