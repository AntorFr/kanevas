#!/usr/bin/env node
// Replays only the named tests (`tests.rejouer` of .sdlc.yaml). Names are `describe > test` as in
// resultats.tap; a name found in no file is an error (an unknown name is not a green).
//
//   node scripts/rejouer-tests.mjs "<name>" ["<name>" ...]    # or names separated by | or line ends
//   node scripts/rejouer-tests.mjs "<name>" --installe        # the Wasm build was done by `tests.installation`: skip it
//   node scripts/rejouer-tests.mjs --fichiers "<name>" ...    # prints `name<TAB>file`, plays and builds nothing (`tests.fichiers`)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { assurerPlaywright } from './playwright.mjs';
import { cheminDeclare, choisirFichiers, motif, resoudre } from './niveaux-tests.mjs';

const args = process.argv.slice(2);
const installe = args.includes('--installe');
const listeFichiers = args.includes('--fichiers');
const demandes = args.filter((a) => a !== '--installe' && a !== '--fichiers');
if (demandes.join('').trim() === '') {
  console.error('Usage: node scripts/rejouer-tests.mjs "<test name>" ...');
  process.exit(2);
}

const tous = choisirFichiers(
  ['src', 'frontend/src'].flatMap((r) => readdirSync(r, { recursive: true }).map((f) => join(r, String(f)))),
);
const { parFichier, introuvables } = resoudre(demandes, tous);
// A qualified name whose describe path the file does not declare names no test: nothing would be replayed.
for (const [f, noms] of [...parFichier]) {
  const src = readFileSync(f, 'utf8');
  for (const n of [...noms]) {
    if (cheminDeclare(n, src)) continue;
    noms.delete(n);
    if (![...parFichier.values()].some((s) => s.has(n)) && !introuvables.includes(n)) introuvables.push(n);
  }
  if (noms.size === 0) parFichier.delete(f);
}
if (introuvables.length > 0) {
  for (const n of introuvables) console.error(`Test not found in any file: ${n}`);
  if (listeFichiers) {
    for (const f of [...parFichier.keys()].sort()) for (const n of [...parFichier.get(f)]) console.log(`${n}\t${f}`);
  }
  process.exit(1);
}

if (listeFichiers) {
  // The replay's own resolution, printed: one line per (name, file) pair, the names found even when another is not.
  for (const f of [...parFichier.keys()].sort()) for (const n of [...parFichier.get(f)]) console.log(`${n}\t${f}`);
  process.exit(0);
}

const fichiers = [...parFichier.keys()].sort();
const noms = [...new Set([...parFichier.values()].flatMap((s) => [...s]))];
// Nothing is decided from the existence of a git-ignored artefact (`dist/`, `dist/wasm`): a leftover
// is a stale build (AD-niveau-6). What the replayed files read is built, every time.
const ecran = fichiers.some((f) => f.startsWith('src/e2e/'));
const wasm = fichiers.some((f) => f.startsWith('src/wasm/'));
const etapes = [];
if ((ecran || wasm) && !installe) etapes.push(['npm', ['run', 'build:wasm']]);
if (ecran) etapes.push(['npm', ['run', 'build']]);
else if (wasm) etapes.push([process.execPath, ['scripts/copier-wasm.mjs']]);
if (ecran) assurerPlaywright();
for (const [cmd, args] of etapes) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`Replaying ${noms.length} test name(s) in ${fichiers.length} file(s).`);
const r = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...noms.map((n) => `--test-name-pattern=${motif(n)}`), ...fichiers],
  {
    stdio: 'inherit',
    // A fresh startup lock: an interrupted run cannot block this one.
    env: { ...process.env, KANEVAS_E2E_STARTUP_LOCK: join(mkdtempSync(join(tmpdir(), 'rejouer-tests-')), 'startup.lock') },
  },
);
process.exit(r.status ?? 1);
