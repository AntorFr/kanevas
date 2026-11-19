#!/usr/bin/env node
// The declared suite (`tests:` of .sdlc.yaml): typecheck, build, then every test file, with one
// TAP line per test written to `resultats.tap`. It writes no report and posts no status: the
// chain's `attester` plays this command on a clean checkout of the commit, reads the TAP and
// posts `tests-complets` with `--publier`.
//
//   npm run tests:attestes                       # whole suite
//   npm run tests:attestes -- --concurrence 2    # test files at a time (default min(CPUs, 2))
//   npm run tests:local                          # --local: no src/e2e/ file, no `build`, no Playwright
//   npm run tests:ecrans -- <base>               # --ecrans <base>: only the screen tests chosen for <base>..HEAD
//   --installe (after the other arguments): `tests.installation` already ran `build:wasm`; skip only that step
//   npm run tests:fiche -- <base>                # --fiche <base>: the suite minus the screen tests not chosen
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { choisirFichiers } from './niveaux-tests.mjs';
import { assurerPlaywright } from './playwright.mjs';

// The reference run on the 3-CPU pod completed the whole suite with two files at a time and
// no startup/browser launch failure. The harness also serializes startup bursts.
const MAX_CONCURRENCY = 2;
const TAP = 'resultats.tap';

const args = process.argv.slice(2);
const local = args.includes('--local');
const installe = args.includes('--installe');
const niveau = ['ecrans', 'fiche'].find((n) => args.includes(`--${n}`));
const iConc = args.indexOf('--concurrence');
const concurrence = iConc >= 0 ? Number(args[iConc + 1]) : Math.min(availableParallelism(), MAX_CONCURRENCY);
if (!Number.isSafeInteger(concurrence) || concurrence < 1) {
  console.error('--concurrence expects a positive integer.');
  process.exit(2);
}

// The same files as `npm test`.
// The local level leaves out `src/e2e/` (a server and a browser per file).
let fichiers = choisirFichiers(
  ['src', 'frontend/src'].flatMap((racine) => readdirSync(racine, { recursive: true }).map((f) => join(racine, String(f)))),
  { local },
);

if (niveau) {
  // The files the choice lists (`niveaux-tests.mjs --liste`), never a second computation.
  const base = args[args.indexOf(`--${niveau}`) + 1];
  if (!base || base.startsWith('--')) {
    console.error(`--${niveau} expects a base commit: npm run tests:${niveau} -- <base>.`);
    process.exit(2);
  }
  if (local) { console.error(`--${niveau} and --local are two levels: pick one.`); process.exit(2); }
  const existe = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { stdio: 'ignore' });
  if (existe.status !== 0) {
    console.error(`Unknown base « ${base} »: it is not a commit of this checkout (fetch it, or pass a commit id).`);
    process.exit(2);
  }
  const liste = spawnSync(process.execPath, ['scripts/niveaux-tests.mjs', '--liste', niveau, base], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (liste.status !== 0) {
    console.error(liste.stderr.trim() || `Choice of the ${niveau} level failed.`);
    process.exit(liste.status ?? 1);
  }
  fichiers = liste.stdout.split('\n').filter(Boolean);
  if (!fichiers.length) {
    console.log(`Level ${niveau}: no test chosen for ${base}..HEAD, nothing to play.`);
    writeFileSync(TAP, 'TAP version 13\n1..0\n');
    process.exit(0);
  }
}

if (!local && fichiers.some((f) => f.startsWith('src/e2e/'))) assurerPlaywright();

console.log(`Test file concurrency: ${concurrence}${iConc < 0 ? ' (default)' : ' (--concurrence)'}. Harness startups run one at a time.`);
// `ecrans:` plays only what its screen tests need (wasm, build); the rest is the business of `local:`.
const etapes = local ? ['build:wasm', 'typecheck'] : niveau === 'ecrans' ? ['build:wasm', 'build'] : ['build:wasm', 'typecheck', 'build'];
for (const script of etapes.filter((e) => !(installe && e === 'build:wasm'))) {
  // The build too: a screen test checks what the built application serves and skips without dist/.
  const r = spawnSync('npm', ['run', script], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (local) {
  // No build, but src/wasm/verifier.test.ts needs dist/wasm/verifier.mjs when it loads.
  const r = spawnSync(process.execPath, ['scripts/copier-wasm.mjs'], { stdio: 'inherit' });
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
