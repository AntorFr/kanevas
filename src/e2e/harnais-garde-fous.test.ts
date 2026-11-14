// Test of the harness itself (AD-harnais-4, AD-harnais-5): no Playwright means a failure, a stale dist/ is rebuilt.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { doitReconstruire } from './harnais.test.ts';

describe('harness guards', () => {
  test('importing the harness without Playwright fails and names it', () => {
    const vide = mkdtempSync(join(tmpdir(), 'sans-pw-'));
    try {
      const r = spawnSync(
        process.execPath,
        ['--import', 'tsx', '-e', `import(${JSON.stringify(resolve('src/e2e/harnais.test.ts'))})`],
        { cwd: resolve('.'), env: { ...process.env, HARNAIS_RACINES_PLAYWRIGHT: vide }, encoding: 'utf8' },
      );
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Playwright/);
    } finally {
      rmSync(vide, { recursive: true, force: true });
    }
  });

  test('doitReconstruire: missing, stale, then fresh', () => {
    const d = mkdtempSync(join(tmpdir(), 'build-'));
    try {
      mkdirSync(join(d, 'src'));
      mkdirSync(join(d, 'dist/public'), { recursive: true });
      writeFileSync(join(d, 'src/a.ts'), '');
      assert.equal(doitReconstruire(d), true, 'dist products missing');
      writeFileSync(join(d, 'dist/server.js'), '');
      writeFileSync(join(d, 'dist/public/index.html'), '');
      const t = (s: number) => new Date(Date.now() + s * 1000);
      utimesSync(join(d, 'src/a.ts'), t(-100), t(-100));
      utimesSync(join(d, 'dist/server.js'), t(-50), t(-50));
      utimesSync(join(d, 'dist/public/index.html'), t(-50), t(-50));
      assert.equal(doitReconstruire(d), false, 'dist newer than sources');
      utimesSync(join(d, 'src/a.ts'), t(-10), t(-10));
      assert.equal(doitReconstruire(d), true, 'a source is newer');
      utimesSync(join(d, 'src/a.ts'), t(-100), t(-100));
      utimesSync(join(d, 'dist/public/index.html'), t(-200), t(-200));
      assert.equal(doitReconstruire(d), true, 'index.html older than a source');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
