// Unit tests of the status component of an adventure (E-8/E-9), rendered on the server: what a reader
// sees (badge only), what a GM sees (a menu), what is never rendered (other types, unknown status).
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
const { StatutAventure, statutValide, STATUTS_AVENTURE } = (await vite.ssrLoadModule('./statut.tsx')) as typeof import('./statut');
test.after(() => vite.close());

const fiche = (type: string, statut?: string) => ({ id: 7, universId: 1, type, titre: 'La Couronne brisée', charge: statut === undefined ? {} : { statut }, sections: [] });
const rendre = (f: Record<string, unknown>, gestion?: boolean) =>
  renderToStaticMarkup(createElement(StatutAventure, { universId: '1', fiche: f, gestion } as never));

test('les quatre libellés publics, dans l’ordre du cycle', () => {
  assert.deepEqual(Object.values(STATUTS_AVENTURE).map((s) => s.libelle), ['En préparation', 'Prête', 'En cours', 'Terminée']);
});

test('statutValide : valeur inconnue ou absente = « Tous »', () => {
  assert.equal(statutValide('en_cours'), 'en_cours');
  for (const v of ['nimporte', '', null, undefined, 'toString', '__proto__', 'EN_COURS']) assert.equal(statutValide(v as never), '', String(v));
});

test('lecteur (gestion absente ou fausse) : le badge, jamais de menu', () => {
  for (const g of [undefined, false]) {
    const h = rendre(fiche('aventure', 'en_cours'), g);
    assert.match(h, /En cours/);
    assert.ok(!h.includes('<button'), 'pas de bouton');
    assert.ok(!h.includes('changer le statut'), 'pas de déclencheur');
    assert.ok(!h.includes('En préparation') && !h.includes('Terminée'), 'pas les autres entrées');
  }
});

test('MJ en gestion : un déclencheur nommé d’après la fiche, portant le statut courant', () => {
  const h = rendre(fiche('aventure', 'prete'), true);
  assert.match(h, /<button/);
  assert.match(h, /Prête/);
  assert.match(h, /changer le statut de « La Couronne brisée »/);
});

test('autre type ou statut inconnu : rien', () => {
  assert.equal(rendre(fiche('personnage', 'en_cours'), true), '');
  assert.equal(rendre(fiche('aventure'), true), '');
  assert.equal(rendre(fiche('aventure', 'inconnu'), true), '');
});
