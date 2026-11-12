// Refusals of scripts/rust-wasm.sh and scripts/copier-wasm.mjs (AD-rust-3, AD-rust-10): they must name the
// tool, the two versions, or the command to run. None of these paths compiles Rust.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../..', import.meta.url));
const script = join(racine, 'scripts/rust-wasm.sh');
const lockReel = join(racine, 'rust/Cargo.lock');

function cli(nom: string): string | undefined {
  const r = spawnSync('sh', ['-c', `command -v ${nom}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

test('rust-wasm.sh refuse un wasm-bindgen du lock différent du CLI, en nommant les deux versions', () => {
  const installe = cli('wasm-bindgen');
  assert.ok(installe, 'wasm-bindgen CLI must be installed to run the suite');
  const dir = mkdtempSync(join(tmpdir(), 'lock-'));
  try {
    const lock = join(dir, 'Cargo.lock');
    const texte = readFileSync(lockReel, 'utf8');
    assert.match(texte, /name = "wasm-bindgen"\nversion = "0\.2\.130"/);
    writeFileSync(lock, texte.replace(/(name = "wasm-bindgen"\nversion = )"0\.2\.130"/, '$1"0.2.129"'));
    const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, CARGO_LOCK: lock } });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /0\.2\.129/);
    assert.match(r.stderr, /0\.2\.130/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rust-wasm.sh sans le CLI wasm-bindgen sort non nul en nommant wasm-bindgen, sans rien installer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bin-'));
  try {
    for (const nom of ['cargo', 'rustup']) {
      const chemin = cli(nom);
      if (chemin) symlinkSync(chemin, join(dir, nom));
    }
    // /usr/bin:/bin supply bash, awk, grep; wasm-bindgen lives elsewhere (cargo home).
    const sans = spawnSync('sh', ['-c', 'PATH=/usr/bin:/bin command -v wasm-bindgen']).status !== 0;
    assert.ok(sans, 'wasm-bindgen must not be in /usr/bin:/bin for this test');
    const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:/usr/bin:/bin` } });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /wasm-bindgen/);
    assert.match(r.stderr, /Missing tool/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rust-wasm.sh sans cargo sort non nul en nommant cargo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bin-'));
  try {
    const r = spawnSync('/bin/bash', [script], { encoding: 'utf8', env: { ...process.env, PATH: dir } });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /cargo/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('npm run build sans rust/pkg échoue en disant de lancer npm run build:wasm', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sans-pkg-'));
  try {
    mkdirSync(join(dir, 'dist'));
    const r = spawnSync('node', [join(racine, 'scripts/copier-wasm.mjs')], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /npm run build:wasm/);
    assert.equal(spawnSync('test', ['-e', join(dir, 'dist/wasm')]).status, 1, 'nothing copied');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('copier-wasm.mjs copie rust/pkg vers dist/wasm sans compiler', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avec-pkg-'));
  try {
    mkdirSync(join(dir, 'rust/pkg/m'), { recursive: true });
    writeFileSync(join(dir, 'rust/pkg/m/m_bg.wasm'), 'x');
    const r = spawnSync('node', [join(racine, 'scripts/copier-wasm.mjs')], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, 'dist/wasm/m/m_bg.wasm'), 'utf8'), 'x');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
