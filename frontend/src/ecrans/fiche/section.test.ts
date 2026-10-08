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

test('MJ : la pastille dit l’audience et ouvre son réglage ; la section « MJ seul » est hachurée, les autres portent leur filet', () => {
  const ferme = rendre('mj', { audience, peutEcrire: true });
  assert.match(ferme, /<button[^>]*aria-label="MJ seul — régler l’audience de « Apparence »"[^>]*>/);
  assert.match(ferme, /<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.ok(ferme.includes('data-aud="mj"'), 'hatched in amber');
  const lue = rendre('mj', { audience: { ...audience, joueursLisent: true } });
  assert.match(lue, /Lue des joueurs — régler l’audience de « Apparence »/);
  assert.ok(lue.includes('data-aud="table"') && !lue.includes('data-aud="mj"'));
  const ecrite = rendre('mj', { audience: { ...audience, joueursLisent: true, joueursEcrivent: true } });
  assert.match(ecrite, /Écrite par les joueurs — régler l’audience/);
  assert.ok(ecrite.includes('data-aud="table-ecrit"'));
  const confiee = rendre('mj', { audience: { ...audience, auteurId: 2, auteurLit: true } });
  assert.match(confiee, /Confiée à lea — régler l’audience/);
  assert.ok(confiee.includes('data-aud="confiee"'));
  // An author without any right on the section does not confide it: MJ only.
  assert.match(rendre('mj', { audience: { ...audience, auteurId: 2 } }), /MJ seul — régler/);
});

test('MJ : le réglage et les actions d’ordre et de retrait ne sont rendus qu’une fois leur boîte ouverte ; le menu ⋯ est là', () => {
  const h = rendre('mj', { audience, peutEcrire: true });
  assert.match(h, /aria-label="Autres actions sur « Apparence »"/);
  for (const m of ['Les joueurs la lisent', 'Les joueurs l’écrivent', 'Qui voit', 'Monter', 'Descendre', 'Retirer la section']) assert.ok(!h.includes(m), `${m} before opening`);
  assert.match(h, /Modifier/);
});

test('joueur : aucune pastille, filet, hachure ni menu ⋯, même sur une section que les joueurs lisent', () => {
  const h = rendre('joueur', { audience: { ...audience, joueursLisent: true } });
  for (const m of ['data-aud', 'régler l’audience', 'Autres actions', 'pastille', 'Lue des joueurs']) assert.ok(!h.includes(m), m);
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
