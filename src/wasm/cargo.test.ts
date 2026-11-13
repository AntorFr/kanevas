// Layer 1 of the Wasm proof (AD-rust-6): `cargo test --workspace --locked` is played once and every
// Rust test it reports becomes one `node:test` test of the same name, so each is its own line of
// resultats.tap. A build error (no test reported, or a non-zero exit without any test line) fails the file.
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const rust = fileURLToPath(new URL('../../rust', import.meta.url));
// stderr is merged into stdout so the `Running` lines stay in order with the test lines.
const r = spawnSync('sh', ['-c', 'cargo test --workspace --locked 2>&1'], {
  cwd: rust,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, CARGO_TERM_COLOR: 'never' },
});
if (r.error) throw new Error(`cargo could not be run: ${r.error.message}`);

// `Running unittests src/lib.rs (target/debug/deps/exemple-…)` precedes the tests of one crate.
const resultats: { nom: string; etat: string }[] = [];
let crate = '';
for (const ligne of r.stdout.split('\n')) {
  const course = /^\s*Running .*\(target\/[^/]+\/deps\/([A-Za-z0-9_]+)-[0-9a-f]+\)/.exec(ligne);
  if (course) crate = course[1]!;
  const t = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(ligne);
  if (t) resultats.push({ nom: crate ? `${crate}::${t[1]}` : t[1]!, etat: t[2]! });
}

if (resultats.length === 0) {
  throw new Error(`cargo test reported no test (exit ${r.status}):\n${r.stdout.slice(-4000)}`);
}

for (const { nom, etat } of resultats) {
  test(nom, (t) => {
    if (etat === 'ignored') return t.skip('ignored in Rust');
    assert.equal(etat, 'ok', `Rust test ${nom} failed:\n${r.stdout.slice(-4000)}`);
  });
}

test('cargo test exits cleanly (build included)', () => {
  assert.equal(r.status, 0, `cargo test exited with ${r.status}:\n${r.stdout.slice(-4000)}`);
});
