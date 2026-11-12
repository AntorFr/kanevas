import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';

// AD-rust-7: the production build config (frontend/vite.config.ts) emits neither the Wasm proof
// page nor any .wasm file, and nothing in the product refers to the proof page.
function lister(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true }).map((e) => join(e.parentPath, e.name));
}

test('AD-rust-7 the production frontend build has no proof page and no .wasm file', { timeout: 120_000 }, async () => {
  const sortie = mkdtempSync(join(tmpdir(), 'kanevas-prod-'));
  try {
    await build({
      configFile: `${process.cwd()}/frontend/vite.config.ts`,
      build: { outDir: sortie, emptyOutDir: true },
      logLevel: 'silent',
    });
    const fichiers = lister(sortie);
    assert.ok(fichiers.some((f) => f.endsWith('index.html')), 'the build produced the app');
    assert.deepEqual(fichiers.filter((f) => f.endsWith('.wasm')), []);
    assert.deepEqual(fichiers.filter((f) => /essai/i.test(f)), []);
    const html = readFileSync(join(sortie, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /essai|wasm/i);
  } finally {
    rmSync(sortie, { recursive: true, force: true });
  }
});
