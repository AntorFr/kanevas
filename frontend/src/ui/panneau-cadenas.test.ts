// kanevas-rv-composants: the « MJ seul » pill of a Panneau says its state by icon, word and tint (charte § Composants),
// like the audience pill: a padlock before the word, and none on a panel open to players.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { createElement } = require('react') as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { Panneau } = (await vite.ssrLoadModule('./composants.tsx')) as typeof import('./composants');
test.after(() => vite.close());

const rendre = (reserveMj: boolean) => renderToStaticMarkup(createElement(Panneau, { titre: 'Scénarios', reserveMj }, 'x'));

test('Panneau réservé au MJ : cadenas puis « MJ seul » dans la pastille ambre', () => {
  const h = rendre(true);
  assert.match(h, /class="pastille mj"[^>]*><svg[^>]*lucide-lock[^>]*>.*?<\/svg>MJ seul<\/span>/);
  assert.match(h, /class="panneau reserve-mj"/);
});

test('Panneau ouvert : ni pastille ni cadenas', () => {
  const h = rendre(false);
  assert.ok(!h.includes('MJ seul') && !h.includes('lucide-lock') && !h.includes('reserve-mj'));
});
