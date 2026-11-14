import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Browser layer of the `coeur` proof (AD-139, AD-etoiles-3): the same fixtures as the Node test, through the same .wasm.
const fixtures = (f: string) => JSON.parse(readFileSync(`${process.cwd()}/rust/modules/coeur/tests/fixtures/${f}`, 'utf8'));

test('the coeur module in Chromium finds the fixtures\' stars and the exact JSON bytes of generation-sortie-coeur.json', { skip: skipBrowser }, async () => {
  const galaxie = fixtures('generation-galaxie.json');
  const sortie = fixtures('generation-sortie-coeur.json');
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('coeur-sortie')?.textContent, undefined, { timeout: 30_000 });
    assert.equal(await page.isHidden('#erreur'), true);
    assert.equal(await page.textContent('#densite'), '0.68');

    const etoiles: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-etoiles')!.textContent!));
    assert.equal(etoiles.length, galaxie.blocs.length);
    galaxie.blocs.forEach((b: Any, i: number) => {
      const obtenu = JSON.parse(etoiles[i]!);
      if (!b.etoile) return assert.equal(obtenu, null, `block ${b.bx},${b.by}`);
      assert.equal(obtenu.q, b.etoile.q);
      assert.equal(obtenu.r, b.etoile.r);
      assert.equal(obtenu.lettre, b.etoile.lettre);
      for (const k of ['taille', 'x', 'y']) assert.ok(Math.abs(obtenu[k] - b.etoile[k]) <= 1e-9, `${k} ${b.bx},${b.by}`);
    });

    const octets: string[] = JSON.parse(await page.evaluate(() => document.getElementById('coeur-sortie')!.textContent!));
    assert.deepEqual(octets, sortie.blocs.map((b: Any) => b.json));

    const hex = JSON.parse((await page.textContent('#coeur-hex'))!);
    assert.deepEqual([hex.q, hex.r], [7, -3]);
  } finally {
    await page.close();
  }
});
