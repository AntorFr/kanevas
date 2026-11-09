#!/usr/bin/env node
// The declared suite (`tests:` of .sdlc.yaml): typecheck, build, then every test file, with one
// TAP line per test written to `resultats.tap`. It writes no report and posts no status: the
// chain's `attester` plays this command on a clean checkout of the commit, reads the TAP and
// posts `tests-complets` with `--publier`.
//
//   npm run tests:attestes                       # whole suite
//   npm run tests:attestes -- --concurrence 2    # test files at a time (default min(CPUs, 2))
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';

// The reference run on the 3-CPU pod completed the whole suite with two files at a time and
// no startup/browser launch failure. The harness also serializes startup bursts.
const MAX_CONCURRENCY = 2;
const TAP = 'resultats.tap';

const args = process.argv.slice(2);
const iConc = args.indexOf('--concurrence');
const concurrence = iConc >= 0 ? Number(args[iConc + 1]) : Math.min(availableParallelism(), MAX_CONCURRENCY);
if (!Number.isSafeInteger(concurrence) || concurrence < 1) {
  console.error('--concurrence expects a positive integer.');
  process.exit(2);
}

// The same files as `npm test`.
const fichiers = ['src', 'frontend/src']
  .flatMap((racine) => readdirSync(racine, { recursive: true }).map((f) => join(racine, String(f))))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

// Playwright is not a dependency of the repository: the pods' image carries a system install the
// harness finds (`src/e2e/harnais.test.ts`). Without one, install it here (not saved) with Chromium,
// otherwise the screen tests would be skipped, hence red.
const playwrightVu = [process.cwd() + '/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']
  .some((racine) => existsSync(join(racine, 'playwright')));
if (!playwrightVu) {
  console.log('Playwright not found: installing playwright@1.63.0 (--no-save) and Chromium.');
  for (const cmd of [['npm', ['install', '--no-save', 'playwright@1.63.0']], ['npx', ['playwright', 'install', 'chromium']]]) {
    const r = spawnSync(cmd[0], cmd[1], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

console.log(`Test file concurrency: ${concurrence}${iConc < 0 ? ' (default)' : ' (--concurrence)'}. Harness startups run one at a time.`);
for (const script of ['typecheck', 'build']) {
  // The build too: a screen test checks what the built application serves and skips without dist/.
  const r = spawnSync('npm', ['run', script], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const suite = spawnSync(
  process.execPath,
  [
    '--import', 'tsx', '--test',
    `--test-concurrency=${concurrence}`,
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=tap', `--test-reporter-destination=${TAP}`,
    ...fichiers,
  ],
  {
    stdio: 'inherit',
    // A fresh lock for each run: an interrupted suite cannot block the next one.
    env: { ...process.env, KANEVAS_E2E_STARTUP_LOCK: join(mkdtempSync(join(tmpdir(), 'tests-attestes-')), 'startup.lock') },
  },
);
process.exit(suite.status ?? 1);
