// kanevas-carte-spatiale-liens-charte: the Toast with an action (charte § « Toast with an action »), in a real DOM.
// The repo has no DOM environment, so the real FournisseurToasts is mounted by Vite in Chromium (Playwright of the
// image, like the screen tests) with a fake clock: pointer/focus holding and the 4 s are read without waiting.
// Without Playwright or its Chromium the file is skipped (the local level plays no browser); the full suite plays it.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, describe, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function chargerPlaywright(): Any | null {
  for (const r of [process.cwd() + '/', '/usr/lib/node_modules/', '/usr/local/lib/node_modules/']) {
    try {
      const pw = createRequire(r)('playwright');
      const chemin = pw.chromium.executablePath();
      if (chemin && existsSync(chemin)) return pw;
    } catch {
      /* next */
    }
  }
  return null;
}
const pw = chargerPlaywright();
const opts = { skip: pw ? false : 'Playwright or its Chromium is missing' };

const ENTREE = `
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { FournisseurToasts, useToasts } from '/src/ui/toast.tsx';
import '/src/ui/tokens.css';
import '/src/ui/ui.css';
window.clics = [];
function Boutons() {
  const { toast } = useToasts();
  window.toast = toast;
  return h('button', { id: 'avant' }, 'avant');
}
createRoot(document.getElementById('racine')).render(h(FournisseurToasts, null, h(Boutons)));
`;

let vite: ViteDevServer;
let url = '';
let browser: Any;

async function page(): Promise<Any> {
  const p = await browser.newPage();
  await p.clock.install();
  await p.goto(url, { timeout: 8000 });
  await p.waitForFunction("typeof window.toast === 'function'");
  return p;
}
const nb = (p: Any) => p.locator('.toast').count();
const MS = 4000;

describe('Toast avec action (composant, DOM réel)', { ...opts, timeout: 25000 }, () => {
  before(async () => {
    if (!pw) return;
    vite = await createServer({
      configFile: false,
      root: `${import.meta.dirname}/../..`,
      plugins: [
        react(),
        {
          name: 'essai-toast',
          resolveId: (id) => (id === '/essai-toast.tsx' ? '\0essai-toast.tsx' : null),
          load: (id) => (id === '\0essai-toast.tsx' ? ENTREE : null),
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (req.url !== '/essai.html') return next();
              res.setHeader('content-type', 'text/html');
              res.end(await s.transformIndexHtml('/essai.html', '<!doctype html><html><head></head><body><div id="racine"></div><script type="module" src="/@id/__x00__essai-toast.tsx"></script></body></html>'));
            });
          },
      },
    ],
      server: { port: 0, host: '127.0.0.1' },
      logLevel: 'silent',
    });
    await vite.listen();
    url = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}/essai.html`;
    browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
  });
  after(async () => {
    await browser?.close();
    await vite?.close();
  });

  test('un toast sans action est inchangé : ni lien ni bouton d’action, retiré à 4 s même sous le pointeur', async () => {
    const p = await page();
    await p.evaluate("window.toast('Enregistré')");
    assert.equal(await nb(p), 1);
    assert.equal(await p.locator('.toast-action').count(), 0);
    assert.equal(await p.locator('.toast button').count(), 1, 'seulement « Fermer »');
    await p.locator('.toast').hover();
    await p.clock.runFor(MS + 100);
    assert.equal(await nb(p), 0);
    await p.close();
  });

  test('un toast avec action rend le bouton entre le texte et « Fermer » ; onClick se déclenche au clic', async () => {
    const p = await page();
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Illustrer la fiche', onClick: () => window.clics.push('clic') })");
    const bouton = p.locator('button.toast-action');
    assert.equal(await bouton.textContent(), 'Illustrer la fiche');
    const ordre = await p.evaluate("[...document.querySelector('.toast').children].map((c) => c.className || c.tagName)");
    assert.deepEqual(ordre.slice(-2), ['toast-action', 'bouton-icone']);
    await bouton.click();
    assert.deepEqual(await p.evaluate('window.clics'), ['clic']);
    await p.close();
  });

  test('l’action se déclenche au clavier (Entrée et Espace) et le toast ne vole pas le focus', async () => {
    const p = await page();
    await p.focus('#avant');
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Illustrer', onClick: () => window.clics.push('k') })");
    assert.equal(await p.evaluate('document.activeElement?.id'), 'avant', 'le focus reste où il était');
    await p.keyboard.press('Tab');
    assert.equal(await p.evaluate('document.activeElement?.className'), 'toast-action', 'Tab atteint l’action');
    await p.keyboard.press('Enter');
    await p.keyboard.press('Space');
    assert.deepEqual(await p.evaluate('window.clics'), ['k', 'k']);
    await p.close();
  });

  test('une action en lien est un vrai <a href>', async () => {
    const p = await page();
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Voir', href: '/univers/1/fiches/2' })");
    assert.equal(await p.locator('a.toast-action').getAttribute('href'), '/univers/1/fiches/2');
    await p.close();
  });

  test('tenu tant que le pointeur est dessus, retiré 4 s après sa sortie', async () => {
    const p = await page();
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Voir', onClick: () => {} })");
    await p.locator('.toast').hover();
    await p.clock.runFor(MS * 3);
    assert.equal(await nb(p), 1, 'conservé sous le pointeur');
    await p.mouse.move(0, 0);
    await p.clock.runFor(MS - 500);
    assert.equal(await nb(p), 1, 'pas encore retiré avant 4 s après la sortie');
    await p.clock.runFor(1000);
    assert.equal(await nb(p), 0, 'retiré ensuite');
    await p.close();
  });

  test('tenu tant que le focus est dans le toast, retiré après sa sortie ; le focus qui passe de l’action à « Fermer » ne le relâche pas', async () => {
    const p = await page();
    await p.focus('#avant');
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Voir', onClick: () => {} })");
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    assert.equal(await p.evaluate("document.activeElement?.getAttribute('aria-label')"), 'Fermer');
    await p.clock.runFor(MS * 3);
    assert.equal(await nb(p), 1, 'conservé au focus');
    await p.focus('#avant');
    await p.clock.runFor(MS - 500);
    assert.equal(await nb(p), 1);
    await p.clock.runFor(1000);
    assert.equal(await nb(p), 0);
    await p.close();
  });

  test('pointeur parti mais focus encore dedans : conservé ; focus parti mais pointeur dessus : conservé', async () => {
    const p = await page();
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Voir', onClick: () => {} })");
    await p.locator('button.toast-action').focus();
    await p.locator('.toast').hover();
    await p.mouse.move(0, 0);
    await p.clock.runFor(MS * 2);
    assert.equal(await nb(p), 1, 'le focus tient seul');
    await p.locator('.toast').hover();
    await p.focus('#avant');
    await p.clock.runFor(MS * 2);
    assert.equal(await nb(p), 1, 'le pointeur tient seul');
    await p.close();
  });

  test('« Fermer » retire un toast tenu', async () => {
    const p = await page();
    await p.evaluate("window.toast('Fiche liée', { libelle: 'Voir', onClick: () => {} })");
    await p.getByRole('button', { name: 'Fermer' }).click();
    assert.equal(await nb(p), 0);
    await p.close();
  });

  test('un toast tenu n’empêche pas les autres de partir à 4 s', async () => {
    const p = await page();
    await p.evaluate("window.toast('Tenu', { libelle: 'Voir', onClick: () => {} }); window.toast('Simple')");
    await p.locator('.toast', { hasText: 'Tenu' }).hover();
    await p.clock.runFor(MS + 100);
    assert.equal(await nb(p), 1);
    assert.match((await p.locator('.toast').textContent()) ?? '', /Tenu/);
    await p.close();
  });
});
