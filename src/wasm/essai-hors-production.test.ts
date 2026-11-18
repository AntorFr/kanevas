import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';

// AD-rust-7: the production build config (frontend/vite.config.ts) emits no Wasm proof page, and nothing
// in the product refers to it. Since the system map (E-23, AD-carte-3) the product loads the `coeur` core
// in the browser: its .wasm IS in the build (amended by the review of kanevas-carte-spatiale-carte-canvas).
function lister(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true }).map((e) => join(e.parentPath, e.name));
}

test('AD-rust-7 the production frontend build has no proof page, and ships the coeur .wasm the map loads', { timeout: 120_000 }, async () => {
  const sortie = mkdtempSync(join(tmpdir(), 'kanevas-prod-'));
  try {
    await build({
      configFile: `${process.cwd()}/frontend/vite.config.ts`,
      build: { outDir: sortie, emptyOutDir: true },
      logLevel: 'silent',
    });
    const fichiers = lister(sortie);
    assert.ok(fichiers.some((f) => f.endsWith('index.html')), 'the build produced the app');
    assert.ok(fichiers.some((f) => /coeur_bg.*\.wasm$/.test(f)), 'the map loads the core: its .wasm is in the build');
    assert.deepEqual(fichiers.filter((f) => /essai/i.test(f)), []);
    const html = readFileSync(join(sortie, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /essai|wasm/i);
  } finally {
    rmSync(sortie, { recursive: true, force: true });
  }
});
