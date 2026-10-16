import assert from 'node:assert/strict';
import { test } from 'node:test';

// Node has no DOM: a minimal HTMLElement is enough for `saisieEnCours`, which only reads these members.
class FauxElement {
  constructor(
    public tagName: string,
    public isContentEditable = false,
    private dansEditable = false,
  ) {}
  closest(sel: string) {
    return sel === '[contenteditable]' && this.dansEditable ? this : null;
  }
}
(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = FauxElement;

import { createServer } from 'vite';

// Vite's SSR loader resolves the CSS imports of the frame.
const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { saisieEnCours } = (await vite.ssrLoadModule('./Cadre.tsx')) as typeof import('./Cadre');
test.after(() => vite.close());

const sansBoite = { querySelector: () => null } as unknown as Document;
const avecBoite = { querySelector: () => ({}) } as unknown as Document;
const el = (e: FauxElement) => e as unknown as Element;

test('la touche / est ignorée dans input, textarea, select', () => {
  for (const t of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(saisieEnCours(el(new FauxElement(t)), sansBoite), true, t);
});

test('la touche / est ignorée dans un éditeur contenteditable, ou dans son descendant', () => {
  assert.equal(saisieEnCours(el(new FauxElement('DIV', true)), sansBoite), true);
  assert.equal(saisieEnCours(el(new FauxElement('SPAN', false, true)), sansBoite), true);
});

test('la touche / est ignorée quand une boîte est ouverte, même hors champ', () => {
  assert.equal(saisieEnCours(el(new FauxElement('BODY')), avecBoite), true);
  assert.equal(saisieEnCours(null, avecBoite), true);
});

test('la touche / agit depuis le corps de la page ou un lien, sans boîte', () => {
  assert.equal(saisieEnCours(el(new FauxElement('BODY')), sansBoite), false);
  assert.equal(saisieEnCours(el(new FauxElement('A')), sansBoite), false);
  assert.equal(saisieEnCours(null, sansBoite), false);
});
