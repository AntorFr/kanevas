// dist/wasm/verifier.mjs (AD-rust-5), the Dockerfile's last step: exit 0 on the built example module,
// non-zero on a corrupted or absent one. Runs on copies of dist/wasm, so it needs `build:wasm` and `build`
// (the attested suite plays both first).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../..', import.meta.url));
const source = join(racine, 'dist/wasm');
assert.ok(existsSync(join(source, 'verifier.mjs')), 'dist/wasm/verifier.mjs missing: run `npm run build:wasm && npm run build`');

function copie(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verifier-'));
  cpSync(source, join(dir, 'wasm'), { recursive: true });
  return dir;
}
function jouer(dir: string) {
  return spawnSync('node', [join(dir, 'wasm/verifier.mjs')], { encoding: 'utf8' });
}

test('verifier.mjs sort 0 sur le module construit', () => {
  const dir = copie();
  try {
    const r = jouer(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Wasm check passed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifier.mjs sort non nul quand exemple_bg.wasm est absent', () => {
  const dir = copie();
  try {
    rmSync(join(dir, 'wasm/exemple/exemple_bg.wasm'));
    const r = jouer(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Wasm check failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifier.mjs sort non nul quand le dossier du module est absent', () => {
  const dir = copie();
  try {
    rmSync(join(dir, 'wasm/exemple'), { recursive: true });
    assert.notEqual(jouer(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifier.mjs sort non nul quand exemple_bg.wasm est corrompu (octets sans module)', () => {
  const dir = copie();
  try {
    writeFileSync(join(dir, 'wasm/exemple/exemple_bg.wasm'), 'not a wasm module');
    assert.notEqual(jouer(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifier.mjs sort non nul quand exemple_bg.wasm est tronqué', () => {
  const dir = copie();
  try {
    const f = join(dir, 'wasm/exemple/exemple_bg.wasm');
    writeFileSync(f, readFileSync(f).subarray(0, 200));
    assert.notEqual(jouer(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifier.mjs sort non nul sur une valeur fausse (fnv1a rend 0 au lieu de 3485111814)', () => {
  const dir = copie();
  try {
    const f = join(dir, 'wasm/exemple/exemple.js');
    const glue = readFileSync(f, 'utf8');
    assert.match(glue, /export function fnv1a\(/);
    writeFileSync(f, glue.replace('export function fnv1a(', 'export function fnv1a_reel(') + '\nexport function fnv1a() { return 0; }\n');
    const r = jouer(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Wasm check failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
