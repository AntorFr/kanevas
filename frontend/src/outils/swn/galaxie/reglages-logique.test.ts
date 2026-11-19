// kanevas-carte-spatiale-reglages-generateur: the draft of E-24, read from the criterion (« Entre 0 et 1. », only the moved keys are
// proposed, the count sentence). Expected values are written by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brouillonDe, lireBrouillon, phraseDecompte, phraseEtendue, proposition } from './reglages-logique.ts';
import type { VueReglages } from './reglages-api.ts';

const classe = { planetes: [2, 5], lunes: [0, 5], ceintures: [0, 1], total: [4, 12] };
const defauts = {
  frequences: { comete: 0.5, zone: 0.25, nebuleuse: 0.75 },
  par_classe: Object.fromEntries(['naine_rouge', 'orange', 'jaune', 'jaune_vert', 'blanche', 'naine_blanche', 'geante_rouge', 'geante_bleue'].map((c) => [c, classe])),
};
const vue = { version: 3, version_generateur: 1, versions_connues: [1], densite_defaut: 0.68, valeurs: defauts, surcharge: {}, defauts, par_defaut: true, aspects: [] } as VueReglages;
const depart = () => brouillonDe(vue.valeurs, vue.densite_defaut, 1);

test('un brouillon intact ne propose rien', () => {
  const b = depart();
  assert.equal(proposition(b, lireBrouillon(b, defauts), vue), null);
});

test('une fréquence de 2 est refusée « Entre 0 et 1. » et la virgule décimale est lue', () => {
  const b = depart();
  b.frequences.comete = '2';
  assert.equal(lireBrouillon(b, defauts).erreurs['frequences.comete'], 'Entre 0 et 1.');
  b.frequences.comete = '0,8';
  const l = lireBrouillon(b, defauts);
  assert.deepEqual(l.erreurs, {});
  assert.deepEqual(l.surcharge, { frequences: { comete: 0.8 } });
  assert.deepEqual(proposition(b, l, vue), { valeurs: { frequences: { comete: 0.8 } } });
  b.frequences.comete = '-0,1'; assert.ok(lireBrouillon(b, defauts).erreurs['frequences.comete']);
  b.frequences.comete = ''; assert.ok(lireBrouillon(b, defauts).erreurs['frequences.comete']);
  b.frequences.comete = 'abc'; assert.ok(lireBrouillon(b, defauts).erreurs['frequences.comete']);
});

test('bornes des classes : 12 et 13 planètes, minimum au-dessus du maximum, décimal refusé', () => {
  const b = depart();
  b.classes.orange!.planetes = ['2', '12'];
  assert.deepEqual(lireBrouillon(b, defauts).erreurs, {});
  b.classes.orange!.planetes = ['2', '13'];
  assert.equal(lireBrouillon(b, defauts).erreurs['orange.planetes.1'], 'Entre 0 et 12.');
  b.classes.orange!.planetes = ['6', '3'];
  assert.equal(lireBrouillon(b, defauts).erreurs['orange.planetes.0'], 'Le minimum dépasse le maximum.');
  b.classes.orange!.planetes = ['2', '3,5'];
  assert.ok(lireBrouillon(b, defauts).erreurs['orange.planetes.1']);
  b.classes.orange!.planetes = ['2', '3'];
  assert.deepEqual(lireBrouillon(b, defauts).surcharge, { par_classe: { orange: { planetes: [2, 3] } } });
});

test('la densité est un pourcentage 0–100 ; revenir au défaut retire la clé', () => {
  const b = depart();
  b.densite = '101';
  assert.equal(lireBrouillon(b, defauts).erreurs.densite, 'Entre 0 et 100.');
  b.densite = '50';
  assert.deepEqual(proposition(b, lireBrouillon(b, defauts), vue), { densite: 0.5 });
  const saved = { ...vue, valeurs: { ...defauts, frequences: { ...defauts.frequences, comete: 1 } } } as VueReglages;
  const b2 = brouillonDe(saved.valeurs, saved.densite_defaut, 1);
  assert.equal(proposition(b2, lireBrouillon(b2, defauts), saved), null);
  b2.frequences.comete = '0,5';
  assert.deepEqual(proposition(b2, lireBrouillon(b2, defauts), saved), { valeurs: null });
});

test('phrases du décompte', () => {
  const e = { de: { bx: 0, by: 0 }, a: { bx: 0, by: 0 } };
  assert.equal(phraseDecompte({ tires_changent: 214, definis_inchangent: 12, etendue: { ...e, largeur: 250, hauteur: 250 } }), "214 systèmes tirés changent d'intérieur. 12 systèmes définis ne bougent pas.");
  assert.equal(phraseDecompte({ tires_changent: 1, definis_inchangent: 1, etendue: { ...e, largeur: 1, hauteur: 1 } }), "1 système tiré change d'intérieur. 1 système défini ne bouge pas.");
  assert.equal(phraseEtendue({ tires_changent: 0, definis_inchangent: 0, etendue: { ...e, largeur: 250, hauteur: 250 } }), null);
  assert.equal(phraseEtendue({ tires_changent: 0, definis_inchangent: 0, etendue: { ...e, largeur: 300, hauteur: 160 } }), 'sur 300 × 160 hexagones');
});
