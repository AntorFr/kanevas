// The Dockerfile's Wasm contract (AD-rust-5): read as text, never built (no pod has Docker).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../..', import.meta.url));
const dockerfile = readFileSync(join(racine, 'Dockerfile'), 'utf8');

// Instructions only: comments dropped, line continuations joined.
function instructions(texte: string): string[] {
  return texte
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

function etages(): Map<string, string[]> {
  const res = new Map<string, string[]>();
  let courant: string[] | undefined;
  for (const l of instructions(dockerfile)) {
    const m = /^FROM\s+\S+\s+AS\s+(\S+)$/i.exec(l);
    if (m) {
      courant = [];
      res.set(m[1], courant);
    }
    courant?.push(l);
  }
  return res;
}

function argGlobal(nom: string): string {
  const m = new RegExp(`^ARG ${nom}=(\\S+)$`, 'm').exec(instructions(dockerfile).join('\n'));
  assert.ok(m, `${nom} must have a default before the first FROM`);
  return m[1];
}

test('le Dockerfile a les étages wasm, build et runtime, runtime en dernier', () => {
  const noms = [...etages().keys()];
  for (const n of ['wasm', 'build', 'runtime']) assert.ok(noms.includes(n), `stage ${n}`);
  assert.equal(noms[noms.length - 1], 'runtime');
});

test('les ARG de version du Dockerfile égalent rust-toolchain.toml et Cargo.lock', () => {
  const toolchain = readFileSync(join(racine, 'rust/rust-toolchain.toml'), 'utf8');
  const canal = /^channel\s*=\s*"([^"]+)"/m.exec(toolchain)?.[1];
  const lock = readFileSync(join(racine, 'rust/Cargo.lock'), 'utf8');
  const bindgen = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1];
  assert.ok(canal && bindgen);
  assert.equal(argGlobal('RUST_VERSION'), canal);
  assert.equal(argGlobal('WASM_BINDGEN_VERSION'), bindgen);
});

test("l'étage wasm part de rust:<RUST_VERSION>-bookworm et installe wasm-bindgen-cli verrouillé à la version exacte", () => {
  const wasm = etages().get('wasm')!.join('\n');
  assert.match(wasm, /^FROM rust:\$\{RUST_VERSION\}-bookworm AS wasm/);
  assert.match(wasm, /cargo install --locked --version =\$\{WASM_BINDGEN_VERSION\} wasm-bindgen-cli/);
  assert.match(wasm, /scripts\/rust-wasm\.sh/);
});

test("l'étage wasm ne copie ni src/ ni frontend/ ni rien hors rust/ et rust-wasm.sh", () => {
  const copies = etages().get('wasm')!.filter((l) => /^(COPY|ADD)\s/i.test(l));
  assert.ok(copies.length >= 2);
  for (const c of copies) {
    const sources = c.split(/\s+/).slice(1, -1).filter((s) => !s.startsWith('--'));
    for (const s of sources) {
      assert.ok(/^(\.\/)?(rust\/?|scripts\/rust-wasm\.sh)$/.test(s), `unexpected source in wasm stage: ${s}`);
    }
  }
});

test("l'étage build copie rust/pkg depuis wasm avant npm run build", () => {
  const build = etages().get('build')!;
  const copie = build.findIndex((l) => /^COPY --from=wasm \/app\/rust\/pkg \S*rust\/pkg\/?$/.test(l));
  const run = build.findIndex((l) => /^RUN npm run build$/.test(l));
  assert.ok(copie >= 0, 'COPY --from=wasm rust/pkg');
  assert.ok(run > copie, 'npm run build after the copy');
});

test("l'étage d'exécution ne mentionne ni rust/, ni cargo, ni wasm-bindgen, ni le COPY --from=wasm", () => {
  const rt = etages().get('runtime')!.join('\n');
  assert.doesNotMatch(rt, /rust\//i);
  assert.doesNotMatch(rt, /cargo/i);
  assert.doesNotMatch(rt, /wasm-bindgen/i);
  assert.doesNotMatch(rt, /--from=wasm/);
  assert.doesNotMatch(rt, /rustup|rustc/i);
});

test("l'étage d'exécution se termine par RUN node dist/wasm/verifier.mjs avant EXPOSE/CMD, après COPY dist", () => {
  const rt = etages().get('runtime')!;
  const copieDist = rt.findIndex((l) => /^COPY --from=build \/app\/dist \.\/dist$/.test(l));
  const verif = rt.findIndex((l) => l === 'RUN node dist/wasm/verifier.mjs');
  assert.ok(copieDist >= 0 && verif > copieDist);
  const dernierRun = rt.map((l, i) => (/^RUN\s/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  assert.equal(dernierRun, verif, 'the check is the last RUN');
});
