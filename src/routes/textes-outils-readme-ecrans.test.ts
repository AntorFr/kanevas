import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// kanevas-outils-textes, written from the fiche (not from the code): the README names « Modifier la carte » as the group of commands
// in wide layout and « Modifier la carte ▾ » as the button under 760 px; docs/ecrans.md quotes the « vise » refusal without a full stop.
// Expectations are hard-coded literals; the test reads two files by path, never the tracked tree, so it cannot match itself.
const readme = readFileSync('README.md', 'utf8');
const ecrans = readFileSync('docs/ecrans.md', 'utf8');
const LARGE = '« Modifier la carte » group (« Placer un système », « Tracer une route », « Dessiner une zone » and the « Galaxie ▾ » menu';
const ETROIT = 'under 760 px they fold into the « Modifier la carte ▾ » button';
const OLD = 'use « Modifier la carte »';

test('README : en large, « Modifier la carte » est le groupe de commandes ; sous 760 px, le bouton « Modifier la carte ▾ »', () => {
  assert.ok(readme.includes(LARGE), 'le groupe « Modifier la carte » et ses quatre commandes');
  assert.ok(readme.includes(ETROIT), 'le bouton « Modifier la carte ▾ » sous 760 px');
});

test('README : « Modifier la carte » n’est plus présenté comme un bouton à utiliser en large', () => {
  assert.equal(readme.includes(OLD), false);
  assert.equal(readme.includes('« Modifier la carte » button'), false);
});

test('docs/ecrans.md : le refus « vise » exigé se cite « élément visé exigé » sans point dans les guillemets', () => {
  assert.ok(ecrans.includes('« … champ `vise` : élément visé exigé » (mounting, overload)'));
  assert.equal(ecrans.includes('élément visé exigé. »'), false);
});
