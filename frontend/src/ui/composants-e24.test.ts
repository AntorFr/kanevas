// kanevas-carte-spatiale-reglages-charte: the five shared components of E-24 (docs/charte.md § 4).
// Expected values are literals from the fiche and the charte, not recomputed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { couleurValide } from './champ-couleur';
import { idOnglet, idPanneau } from './onglets';

test('couleurValide : #rrggbb seulement (casse libre)', () => {
  for (const ok of ['#3a4cc0', '#3A4CC0', '#000000', '#ffffff']) assert.equal(couleurValide(ok), true, ok);
  for (const non of ['', '#', '#fff', '#12345', '#1234567', '3a4cc0', '#gggggg', ' #3a4cc0', '#3a4cc0 ', '#3a4cc0\n', 'rgb(1,2,3)', 'red'])
    assert.equal(couleurValide(non), false, JSON.stringify(non));
});

test('onglets : l’onglet et son panneau ont des ids distincts qui partent du même préfixe', () => {
  assert.equal(idOnglet('p', 'aspects'), 'p-onglet-aspects');
  assert.equal(idPanneau('p', 'aspects'), 'p-panneau-aspects');
});

test('aucune valeur hexadécimale ni couleur fonctionnelle dans les cinq composants', () => {
  for (const f of ['onglets', 'curseur', 'champ-couleur', 'liste-choix', 'barre-application']) {
    const src = readFileSync(new URL(`./${f}.tsx`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src.replace(/'#rrggbb'|"#rrggbb"|#rrggbb|\/\^#\[0-9a-f\]\{6\}\$\/i/g, ''), /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/, f);
  }
});

test('les cinq composants sont exportés par ui/index.ts', () => {
  const idx = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  for (const f of ['onglets', 'curseur', 'champ-couleur', 'liste-choix', 'barre-application']) assert.match(idx, new RegExp(`from './${f}'`), f);
});
