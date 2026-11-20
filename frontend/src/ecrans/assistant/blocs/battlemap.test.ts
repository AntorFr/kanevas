// Review tests of the three battle map blocks of E-12 (E-26, E-27, E-28; AD-76): each block's text, its link, the
// navigation through `adresse.ts` (history entry + popstate), the panel closing, and a modified click leaving the browser alone.
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// `adresse.ts` patches `window.history` at import: give it a window that records what the router would hear.
const entrees: string[] = [];
const evenements: string[] = [];
(globalThis as any).window = {
  history: { pushState: (_a: unknown, _b: unknown, url: string) => void entrees.push(url), replaceState: () => {} },
  location: { pathname: '/' },
  dispatchEvent: (e: { type: string }) => void evenements.push(e.type),
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).PopStateEvent = class { type = 'popstate'; };
(globalThis as any).Event = class { constructor(public type: string) {} };

(globalThis as any).React = await import('react'); // the tsx loader compiles JSX with the classic runtime
const { BlocCarte, BlocDirection, BlocLot } = await import('./battlemap.js');

const ev = (type: string, libelle: string, cible: Record<string, string | number>) => ({ type, libelle, cible }) as any;

/** Expands a function component to its elements, then finds the first `a`. */
function trouver(el: any, balise: string): any {
  if (!el || typeof el !== 'object') return null;
  if (typeof el.type === 'function') return trouver(el.type(el.props), balise);
  if (el.type === balise) return el;
  const enfants = Array.isArray(el.props?.children) ? el.props.children : [el.props?.children];
  for (const e of enfants) {
    const r = trouver(e, balise);
    if (r) return r;
  }
  return null;
}
const clic = (extra: object = {}) => ({ metaKey: false, ctrlKey: false, shiftKey: false, button: 0, preventDefault() { this.vu = true; }, vu: false, ...extra });

test('le registre associe chaque type à son bloc (la source, le registre tirant des feuilles de style)', () => {
  const source = readFileSync(new URL('./registre.ts', import.meta.url), 'utf8');
  for (const [t, b] of [['direction_ecrite', 'BlocDirection'], ['lot_prepare', 'BlocLot'], ['carte_composee', 'BlocCarte']]) {
    assert.match(source, new RegExp(`${t}:\\s*${b}\\b`), t);
  }
});

test('E-26 : « Direction artistique modifiée » + « Ouvrir » vers l’onglet direction', () => {
  const el = createElement(BlocDirection, { evenement: ev('direction_ecrite', 'Direction artistique modifiée', { type: 'direction', versionPrecedente: 3 }), universId: 7, surOuverture: () => {} }) as ReactElement;
  const html = renderToStaticMarkup(el);
  assert.match(html, /Direction artistique modifiée/);
  assert.match(html, /Ouvrir/);
  assert.match(html, /href="\/univers\/7\/outils\/battlemap\/assets\?onglet=direction"/);
  assert.doesNotMatch(html, /À lancer par vous/);
});

test('E-27 : « Lot préparé : N assets » + « À lancer par vous. » + « Ouvrir »', () => {
  const html = renderToStaticMarkup(createElement(BlocLot, { evenement: ev('lot_prepare', 'x', { type: 'lot', lignes: 10 }), universId: 7, surOuverture: () => {} }));
  assert.match(html, /Lot préparé : 10 assets/);
  assert.match(html, /À lancer par vous\./);
  assert.match(html, /Ouvrir/);
  assert.match(html, /href="\/univers\/7\/outils\/battlemap\/assets\?onglet=generation"/);
});

test('E-28 : « Carte « X » composée » + « Ouvrir » vers la carte ; le titre est échappé', () => {
  const html = renderToStaticMarkup(createElement(BlocCarte, { evenement: ev('carte_composee', 'x', { type: 'carte', carteId: 42, titre: 'Cantine <b>&' }), universId: 7, surOuverture: () => {} }));
  assert.match(html, /Carte « Cantine &lt;b&gt;&amp; » composée/);
  assert.match(html, /href="\/univers\/7\/cartes\/42"/);
  assert.doesNotMatch(html, /<b>/);
});

test('le clic passe par adresse.ts : ferme le panneau puis ajoute une entrée d’historique et un popstate', () => {
  for (const [Bloc, cible, attendu] of [
    [BlocDirection, { type: 'direction', versionPrecedente: 1 }, '/univers/9/outils/battlemap/assets?onglet=direction'],
    [BlocLot, { type: 'lot', lignes: 3 }, '/univers/9/outils/battlemap/assets?onglet=generation'],
    [BlocCarte, { type: 'carte', carteId: 5, titre: 'T' }, '/univers/9/cartes/5'],
  ] as const) {
    entrees.length = 0;
    evenements.length = 0;
    const ordre: string[] = [];
    const a = trouver(createElement(Bloc as any, { evenement: ev('t', 'x', cible), universId: 9, surOuverture: () => ordre.push('ferme') }), 'a');
    assert.equal(a.props.href, attendu);
    const e = clic();
    a.props.onClick(e);
    assert.equal(e.vu, true, 'la navigation native est annulée');
    assert.deepEqual(ordre, ['ferme']);
    assert.deepEqual(entrees, [attendu]);
    assert.ok(evenements.includes('popstate'), 'le routeur entend un popstate');
  }
});

test('un clic avec modificateur ou autre que le bouton principal laisse le navigateur faire', () => {
  entrees.length = 0;
  let ferme = 0;
  const a = trouver(createElement(BlocCarte as any, { evenement: ev('t', 'x', { type: 'carte', carteId: 5, titre: 'T' }), universId: 9, surOuverture: () => ferme++ }), 'a');
  for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
    const e = clic(extra);
    a.props.onClick(e);
    assert.equal(e.vu, false);
  }
  assert.equal(ferme, 0);
  assert.deepEqual(entrees, []);
});
