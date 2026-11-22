// Review of kanevas-concepteur-vaisseaux-cibles-atelier (B-94, E-22): a stored line's targets become one row per installation,
// the rows become the pairs sent; the rows of a reader are text. Expected values by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brouillonDe, ciblesDeRangees, choixDe } from './format.ts';

const conception = (lignes: any[]): any => ({ coque: { cle: 'c', nom: 'C' }, lignes, resultat: { equipage: null, reparation: null } });
const ligne = (plus: any) => ({ nature: 'modifications', cle: 'surcharge', nom: 'Surcharge', quantite: 3, ...plus });

test('une ligne à trois installations sur une seule arme : trois rangées sur la même arme', () => {
  const b = brouillonDe(conception([ligne({ cibles: [{ nature: 'armes', cle: 'la', quantite: 3 }] })]));
  assert.deepEqual(b.lignes[0]!.rangees, ['armes/la', 'armes/la', 'armes/la']);
  assert.equal(b.lignes[0]!.vise, undefined);
});

test('deux armes : les rangées suivent l’ordre des cibles ; une cible qui manque laisse la dernière rangée vide', () => {
  const b = brouillonDe(conception([ligne({ cibles: [{ nature: 'armes', cle: 'la', quantite: 1 }, { nature: 'armes', cle: 'lb', quantite: 1 }] })]));
  assert.deepEqual(b.lignes[0]!.rangees, ['armes/la', 'armes/lb', '']);
});

test('une ligne sans cibles (soutes doublées, pas d’effet visé) n’a pas de rangées', () => {
  const b = brouillonDe(conception([ligne({ quantite: 1, vise: { nature: 'amenagements', cle: 's' } })]));
  assert.equal(b.lignes[0]!.rangees, undefined);
  assert.deepEqual(b.lignes[0]!.vise, { nature: 'amenagements', cle: 's' });
});

test('les rangées vides ne sont pas envoyées ; les mêmes éléments se regroupent avec leur nombre d’installations', () => {
  assert.deepEqual(ciblesDeRangees(['armes/la', '', 'armes/lb', 'armes/la']), [{ nature: 'armes', cle: 'la', quantite: 2 }, { nature: 'armes', cle: 'lb', quantite: 1 }]);
  assert.deepEqual(ciblesDeRangees(['', '']), []);
  assert.deepEqual(ciblesDeRangees(undefined), []);
});

test('l’enregistrement porte `cibles` et jamais `vise` pour une ligne visée', () => {
  const b = brouillonDe(conception([ligne({ cibles: [{ nature: 'armes', cle: 'la', quantite: 3 }] })]));
  const l = (choixDe(b) as any).choix[0];
  assert.deepEqual(l.cibles, [{ nature: 'armes', cle: 'la', quantite: 3 }]);
  assert.equal('vise' in l, false);
});
