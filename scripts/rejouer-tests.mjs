#!/usr/bin/env node
// Replays only the named tests (`tests.rejouer` of .sdlc.yaml). Names are `describe > test` as in
// resultats.tap; a name found in no file is an error (an unknown name is not a green).
//
//   node scripts/rejouer-tests.mjs "<name>" ["<name>" ...]    # or names separated by | or line ends
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { cheminDeclare, choisirFichiers, motif, resoudre } from './niveaux-tests.mjs';

const demandes = process.argv.slice(2);
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
  process.exit(1);
}

const fichiers = [...parFichier.keys()].sort();
const noms = [...new Set([...parFichier.values()].flatMap((s) => [...s]))];
// Screen/e2e files read the built application: build only when one is replayed and dist/ is missing.
if (fichiers.some((f) => f.startsWith('src/e2e/')) && !existsSync('dist')) {
  for (const script of ['build:wasm', 'build']) {
    const r = spawnSync('npm', ['run', script], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
if (fichiers.some((f) => f.startsWith('src/wasm/')) && !existsSync('dist/wasm')) {
  for (const cmd of [['run', 'build:wasm'], ['scripts/copier-wasm.mjs']]) {
    const r = cmd[0] === 'run' ? spawnSync('npm', cmd, { stdio: 'inherit' }) : spawnSync(process.execPath, cmd, { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

console.log(`Replaying ${noms.length} test name(s) in ${fichiers.length} file(s).`);
const r = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...noms.map((n) => `--test-name-pattern=${motif(n)}`), ...fichiers],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
