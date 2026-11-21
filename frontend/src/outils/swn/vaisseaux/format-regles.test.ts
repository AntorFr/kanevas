// Review of kanevas-concepteur-vaisseaux-regles-calcul-atelier (E-22, B-88, H-2): how the browser reads what the server sends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estMoteur, vitesseLue } from './format.ts';

test('vitesse : le moins typographique pour un négatif, rien d’ajouté sinon', () => {
  assert.equal(vitesseLue(-1), '−1');
  assert.equal(vitesseLue(-12), '−12');
  assert.equal(vitesseLue(0), '0');
  assert.equal(vitesseLue(4), '4');
});

test('moteurs : moteur, moteur système et effet moteurs sont écartés d’une station, pas le reste', () => {
  assert.equal(estMoteur({ nature: 'moteurs' }), true);
  assert.equal(estMoteur({ nature: 'amenagements', donnees: { effet: 'moteur_systeme' } }), true);
  assert.equal(estMoteur({ nature: 'amenagements', donnees: { effet: 'moteurs' } }), true);
  assert.equal(estMoteur({ nature: 'amenagements', donnees: {} }), false);
  assert.equal(estMoteur({ nature: 'armes' }), false);
});
