import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRequire } from 'node:module';
import { createServer } from 'vite';

// Server rendering has no external-store snapshot for the connection banner hook: give it the client one.
// Patched on the CommonJS exports before anything imports `react` as ESM (that import copies the names).
const require = createRequire(import.meta.url);
const React = require('react');
const uses = React.useSyncExternalStore;
React.useSyncExternalStore = (s: never, g: never) => uses(s, g, g);
const { createElement } = React as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

// Vite's SSR loader resolves the CSS and import.meta.glob imports of the screen files.
const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { PanneauSection } = (await vite.ssrLoadModule('./section.tsx')) as typeof import('./section');
const { badgeFiche, TYPES_LORE } = (await vite.ssrLoadModule('./types-fiche.ts')) as typeof import('./types-fiche');
test.after(() => vite.close());

const audience = { joueursLisent: false, joueursEcrivent: false, auteurId: null, auteurLit: false, auteurEcrit: false };
const fiche = { id: 1, universId: 1, type: 'personnage', titre: 'Maître Aldric', charge: { pj: false }, sections: [] };
const rendre = (role: 'mj' | 'joueur', section: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(PanneauSection, {
      universId: '1', fiche, role, suffixeMode: '', joueurs: [{ compteId: 2, username: 'lea' }],
      premiere: true, derniere: true, rafraichir: async () => {}, onMonter: async () => {}, onDescendre: async () => {},
      section: { id: 1, titre: 'Apparence', ordre: 1, contenu: 'Grand.', version: 1, modifieLe: '', peutEcrire: false, ...section },
    } as never),
  );

test('joueur : ni audience, ni ordre, ni retrait, ni « MJ seul »', () => {
  const h = rendre('joueur', {});
  assert.match(h, /Apparence/);
  assert.match(h, /Grand\./);
  for (const m of ['Les joueurs la lisent', 'Monter', 'Descendre', 'Retirer', 'MJ seul', 'Modifier', 'Auteur']) assert.ok(!h.includes(m), m);
});

test('joueur qui peut écrire : « Modifier » seulement', () => {
  const h = rendre('joueur', { peutEcrire: true });
  assert.match(h, /Modifier/);
  assert.ok(!h.includes('Retirer'));
});

test('MJ : audience, ordre, retrait ; section fermée aux joueurs porte « MJ seul »', () => {
  const h = rendre('mj', { audience, peutEcrire: true });
  for (const m of ['Les joueurs la lisent', 'Les joueurs l’écrivent', 'L’auteur la lit', 'L’auteur l’écrit', 'Monter', 'Descendre', 'Retirer la section', 'MJ seul', 'lea']) assert.ok(h.includes(m), m);
  // The attachments block carries « Secrète (MJ seul) » (docs/ecrans.md): the open section is tested on the pill and the amber rule of the panel.
  const ouverte = rendre('mj', { audience: { ...audience, joueursLisent: true } });
  assert.ok(!/pastille mj">(<svg.*?<\/svg>)?MJ seul/.test(ouverte) && !/class="panneau reserve-mj"/.test(ouverte));
  assert.ok(/pastille mj">(<svg.*?<\/svg>)?MJ seul/.test(h) && /class="panneau reserve-mj"/.test(h));
});

test('section vide : « Rien d’écrit pour l’instant. »', () => {
  assert.match(rendre('joueur', { contenu: '' }), /Rien d’écrit pour l’instant\./);
});

test('contenu de 20 000 caractères affiché en entier', () => {
  assert.ok(rendre('joueur', { contenu: 'x'.repeat(20000) }).includes('x'.repeat(20000)));
});

test('badges : PJ/PNJ pour un personnage, type sinon ; six types avec textes de liste vide', () => {
  assert.equal(badgeFiche({ type: 'personnage', charge: { pj: true } }), 'PJ');
  assert.equal(badgeFiche({ type: 'personnage', charge: {} }), 'PNJ');
  assert.equal(badgeFiche({ type: 'quete', charge: {} }), 'Quête');
  assert.deepEqual(TYPES_LORE.map((t) => t.aucun), ['Aucun personnage', 'Aucun lieu', 'Aucune faction', 'Aucun objet', 'Aucun événement', 'Aucune quête']);
  assert.deepEqual(TYPES_LORE.map((t) => t.nouveau), ['Nouveau personnage', 'Nouveau lieu', 'Nouvelle faction', 'Nouvel objet', 'Nouvel événement', 'Nouvelle quête']);
});
