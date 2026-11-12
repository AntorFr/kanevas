import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { freePort, launch, skipBrowser, type Any } from './harnais.test.js';

// Layer 3 of AD-rust-6: the proof page, served by a Vite dev server started here (random port),
// loads the example module in Chromium and shows the same value as the Rust test.
// Pinned in rust/modules/exemple (fnv1a_kanevas_epingle): fnv1a("kanevas").
const FNV1A_KANEVAS = '3485111814';

let vite: ViteDevServer;
let base: string;
let browser: Any;

before(async () => {
  if (skipBrowser) return;
  const port = await freePort();
  vite = await createServer({
    configFile: `${process.cwd()}/frontend/vite.essai.config.ts`,
    server: { port, strictPort: true, host: '127.0.0.1' },
    logLevel: 'silent',
  });
  await vite.listen();
  base = `http://127.0.0.1:${port}`;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await vite?.close();
});

test('AD-rust-6 the proof page shows the pinned value of fnv1a("kanevas") computed by the Wasm module', { skip: skipBrowser }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('fnv1a')?.textContent !== '…', undefined, { timeout: 20_000 });
    assert.equal(await page.textContent('#fnv1a'), FNV1A_KANEVAS);
    assert.notEqual((await page.textContent('#version'))?.trim(), '');
    assert.equal(await page.isHidden('#erreur'), true);
  } finally {
    await page.close();
  }
});
