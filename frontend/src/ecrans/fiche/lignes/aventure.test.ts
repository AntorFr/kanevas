// Unit tests of the « Statut : … » line under the title of an adventure (E-9, B-59), rendered on the server:
// registered for « aventure » only, badge alone for a reader, a menu for the GM, nothing for an unknown status.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const React = require('react');
const uses = React.useSyncExternalStore;
React.useSyncExternalStore = (s: never, g: never) => uses(s, g, g);
const { createElement } = React as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { lignesDuType } = (await vite.ssrLoadModule('./registre.ts')) as typeof import('./registre');
test.after(() => vite.close());

const fiche = (type: string, statut?: string) => ({ id: 7, universId: 1, type, titre: 'La Couronne brisée', charge: statut === undefined ? {} : { statut }, sections: [] });
function rendre(type: string, statut: string | undefined, gestion: boolean): string {
  const lignes = lignesDuType(type);
  assert.equal(lignes.length, 1, `une ligne pour ${type}`);
  return renderToStaticMarkup(createElement(lignes[0]!.composant, { universId: '1', fiche: fiche(type, statut), gestion, rafraichir: async () => undefined } as never));
}

test('le registre donne une ligne aux aventures, aucune aux autres types, et garde celle du compte-rendu', () => {
  assert.equal(lignesDuType('aventure').length, 1);
  assert.equal(lignesDuType('personnage').length, 0);
  assert.equal(lignesDuType('compte_rendu').length, 1);
});

test('lecteur : « Statut : En cours » en pastille seule, sans menu', () => {
  const h = rendre('aventure', 'en_cours', false);
  assert.match(h, /Statut :/);
  assert.match(h, /En cours/);
  assert.doesNotMatch(h, /<button/);
  assert.doesNotMatch(h, /changer le statut/);
});

test('MJ : la ligne porte le menu « Statut de … » avec le statut courant', () => {
  const h = rendre('aventure', 'en_preparation', true);
  assert.match(h, /Statut :/);
  assert.match(h, /En préparation/);
  assert.match(h, /<button/);
  assert.match(h, /changer le statut de « La Couronne brisée »/);
});

test('statut inconnu ou absent : pas de pastille (jamais un libellé inventé)', () => {
  for (const s of [undefined, 'nimporte', 'toString']) {
    const h = rendre('aventure', s, true);
    assert.doesNotMatch(h, /<button/, String(s));
    assert.doesNotMatch(h, /En (préparation|cours)|Prête|Terminée/, String(s));
  }
});
