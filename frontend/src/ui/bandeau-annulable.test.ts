// E-26 (kanevas-battlemap-assistant-e26): BandeauAnnulable in its states and its tokens-only styling (charte § 4).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { createElement } = require('react') as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const mod = (await vite.ssrLoadModule('./bandeau-annulable.tsx')) as typeof import('./bandeau-annulable');
test.after(() => vite.close());

// `Bouton` reads the connection through `useSyncExternalStore` (no server snapshot), so the component is
// called as a function and its element tree is read: what it hands to `Bouton` is what the states are.
type Noeud = { type: unknown; props: Record<string, any> };
const arbre = (p: Partial<Parameters<typeof mod.BandeauAnnulable>[0]> = {}) =>
  mod.BandeauAnnulable({ onAnnuler: () => {}, children: 'Texte modifié par l’assistant', ...p }) as unknown as Noeud;
const enfants = (n: Noeud): Noeud[] => [n.props.children].flat().filter((x) => x && typeof x === 'object');
const bouton = (n: Noeud) => enfants(n).find((e) => e.type === Bouton)!;
const notes = (n: Noeud) => enfants(n).filter((e) => e.type === 'span' && String(e.props.className).includes('ba-note'));
const { Bouton } = (await vite.ssrLoadModule('./composants.tsx')) as typeof import('./composants');

test('visible : role=status, texte, « Annuler » actif au nom accessible de la charte', () => {
  const n = arbre();
  assert.equal(n.props.role, 'status');
  assert.equal(n.props.className, 'bandeau-annulable');
  assert.equal(enfants(n)[0].props.children, 'Texte modifié par l’assistant');
  const b = bouton(n);
  assert.equal(b.props['aria-label'], 'Annuler la modification de l’assistant');
  assert.equal(b.props.children, 'Annuler');
  assert.ok(!b.props.disabled && !b.props.enCours);
  assert.equal(notes(n).length, 0);
  assert.equal(enfants(n).length, 2, 'no close button');
});

test('action en cours : « Annulation… » et enCours (Bouton ignore un second clic)', () => {
  const b = bouton(arbre({ enCours: true }));
  assert.equal(b.props.enCours, true);
  assert.equal(b.props.children, 'Annulation…');
});

test('hors connexion : « Annuler » désactivé (aria-disabled par Bouton) et la note le dit', () => {
  const n = arbre({ horsConnexion: true });
  assert.equal(bouton(n).props.disabled, true);
  assert.equal(notes(n)[0].props.children, mod.TEXTE_HORS_CONNEXION);
});

test('échec : l’erreur est une alerte, « Annuler » reste actif', () => {
  const n = arbre({ erreur: 'L’annulation a échoué. Réessayez.' });
  assert.ok(!bouton(n).props.disabled);
  assert.equal(notes(n)[0].props.role, 'alert');
  assert.equal(notes(n)[0].props.children, 'L’annulation a échoué. Réessayez.');
});

test('styles : .bandeau-annulable n’utilise que des tokens (aucune couleur en dur, aucun px de longueur hors police)', () => {
  const css = readFileSync(join(import.meta.dirname, 'ui.css'), 'utf8');
  const debut = css.indexOf('/* ---------- BandeauAnnulable');
  assert.ok(debut >= 0);
  const bloc = css.slice(debut);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(bloc), 'no hard-coded colour');
  for (const nom of ['--accent-fond', '--accent', '--texte', '--rayon-champ', '--e-2', '--e-3', '--t-13']) assert.ok(bloc.includes(`var(${nom})`), nom);
  const tokens = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
  for (const m of bloc.matchAll(/var\((--[\w-]+)/g)) assert.ok(tokens.includes(`${m[1]}:`), `${m[1]} defined in tokens.css`);
  assert.ok(!/\b\d+px\b/.test(bloc.replace(/border: 1px solid/, '')), 'no px but the 1px border');
});
