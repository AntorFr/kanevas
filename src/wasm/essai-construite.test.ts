import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { build } from 'vite';

// AD-rust-9: the proof page built by vite.essai.config.ts and served by the app's static handler
// gives the hashed .wasm under /assets/ as application/wasm, starting with the "\0asm" magic bytes.
// AD-rust-7: the production build (`npm run build`) has neither the page nor any .wasm.
const racine = mkdtempSync(join(tmpdir(), 'kanevas-essai-'));
after(() => rmSync(racine, { recursive: true, force: true }));

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;

test('AD-rust-9 the hashed .wasm asset is served as application/wasm with the magic bytes', async () => {
  assert.ok(existsSync('rust/pkg/exemple/exemple_bg.wasm'), 'rust/pkg is missing: run `npm run build:wasm`.');
  await build({
    configFile: `${process.cwd()}/frontend/vite.essai.config.ts`,
    build: { outDir: racine, emptyOutDir: true },
    logLevel: 'silent',
  });
  const wasms = readdirSync(join(racine, 'assets')).filter((f) => f.endsWith('.wasm'));
  // One hashed .wasm per module the page loads: `exemple` and `coeur` (the page was extended by kanevas-carte-spatiale-etoiles-liaisons).
  assert.equal(wasms.length, 2, 'one hashed .wasm per module under assets/');

  const { buildApp } = await import('../app.js');
  const app = await buildApp();
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/connexion-bouchon',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'compte=antor',
    });
    const cookie = login.cookies.find((c) => c.name === 'kanevas_session');
    assert.ok(cookie);
    for (const wasm of wasms) {
      const res = await app.inject({ url: `/assets/${wasm}`, headers: { cookie: `kanevas_session=${cookie.value}` } });
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'] as string, /^application\/wasm/);
      assert.deepEqual([...res.rawPayload.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d]);
    }
  } finally {
    await app.close();
  }
});
