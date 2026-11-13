// Layer 2 of the Wasm proof (AD-rust-6): the server loads the example module and gets the value pinned by
// the Rust test (`fnv1a_kanevas_epingle`), written here as a literal. Needs `npm run build:wasm` (rust/pkg).
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type * as Exemple from '../../rust/pkg/exemple/exemple.js';

const pkg = fileURLToPath(new URL('../../rust/pkg', import.meta.url));
const dossiers: string[] = [];
function neuf(): string {
  const d = mkdtempSync(join(tmpdir(), 'kanevas-wasm-'));
  dossiers.push(d);
  return d;
}
const initial = process.env.WASM_DIR;
afterEach(() => {
  if (initial === undefined) delete process.env.WASM_DIR;
  else process.env.WASM_DIR = initial;
});
after(() => {
  for (const d of dossiers) rmSync(d, { recursive: true, force: true });
});

// Module-level cache: each test that needs a cold cache imports a fresh copy of the loader.
let n = 0;
async function chargeur(): Promise<typeof import('./charger.js')> {
  return (await import(`./charger.js?frais=${n++}`)) as typeof import('./charger.js');
}

test('le module chargé côté serveur rend la valeur épinglée par le test Rust', async () => {
  delete process.env.WASM_DIR;
  const { chargerModule } = await chargeur();
  const m = await chargerModule<typeof Exemple>('exemple');
  assert.equal(m.fnv1a('kanevas'), 3485111814);
  assert.equal(m.fnv1a(''), 0x811c9dc5);
  assert.equal(m.fnv1a('a'), 0xe40c292c);
  assert.equal(typeof m.version(), 'string');
  assert.notEqual(m.version(), '');
});

test('deux appels successifs rendent la même instance', async () => {
  delete process.env.WASM_DIR;
  const { chargerModule } = await chargeur();
  const a = await chargerModule('exemple');
  const b = await chargerModule('exemple');
  assert.equal(a, b);
});

test('deux premiers appels concurrents rendent la même instance', async () => {
  delete process.env.WASM_DIR;
  const { chargerModule } = await chargeur();
  const [a, b] = await Promise.all([chargerModule('exemple'), chargerModule('exemple')]);
  assert.equal(a, b);
});

test('WASM_DIR est le dossier cherché : un module copié ailleurs est chargé', async () => {
  const dir = neuf();
  cpSync(join(pkg, 'exemple'), join(dir, 'exemple'), { recursive: true });
  process.env.WASM_DIR = dir;
  const { chargerModule } = await chargeur();
  const m = await chargerModule<typeof Exemple>('exemple');
  assert.equal(m.fnv1a('kanevas'), 3485111814);
});

test('WASM_DIR vers un dossier vide : erreur sans aucun chemin, même quand rust/pkg existe', async () => {
  assert.ok(existsSync(join(pkg, 'exemple', 'exemple_bg.wasm')), 'run npm run build:wasm first');
  const dir = neuf();
  process.env.WASM_DIR = dir;
  const { chargerModule } = await chargeur();
  await assert.rejects(chargerModule('exemple'), (e: Error) => {
    assert.ok(e instanceof Error);
    assert.ok(e.message.length > 0);
    assert.ok(!e.message.includes(dir), 'no tmp path');
    assert.ok(!e.message.includes(tmpdir()), 'no tmp root');
    assert.ok(!e.message.includes(pkg), 'no rust/pkg path');
    assert.ok(!/(^|[\s"'(])\/[\w.-]+\/[\w.-]+/.test(e.message), `absolute path in "${e.message}"`);
    assert.ok(!/[A-Za-z]:\\/.test(e.message));
    assert.equal(e.cause, undefined);
    return true;
  });
});

test('un .wasm illisible : même erreur sans chemin, rien n’est mis en cache', async () => {
  const dir = neuf();
  mkdirSync(join(dir, 'exemple'));
  cpSync(join(pkg, 'exemple', 'exemple.js'), join(dir, 'exemple', 'exemple.js'));
  writeFileSync(join(dir, 'exemple', 'exemple_bg.wasm'), 'pas du wasm');
  process.env.WASM_DIR = dir;
  const { chargerModule } = await chargeur();
  await assert.rejects(chargerModule('exemple'), (e: Error) => {
    assert.ok(!e.message.includes(dir));
    assert.ok(!e.message.includes(tmpdir()));
    assert.equal(e.cause, undefined);
    return true;
  });
  // The failure is not cached: the dir repaired, the next call loads.
  cpSync(join(pkg, 'exemple', 'exemple_bg.wasm'), join(dir, 'exemple', 'exemple_bg.wasm'));
  const m = await chargerModule<typeof Exemple>('exemple');
  assert.equal(m.fnv1a('kanevas'), 3485111814);
});

test('un nom de module qui sort du dossier ou n’existe pas est refusé sans chemin', async () => {
  delete process.env.WASM_DIR;
  const { chargerModule } = await chargeur();
  for (const nom of ['../exemple', 'exemple/../exemple', '/etc/passwd', '', 'inconnu']) {
    await assert.rejects(chargerModule(nom), (e: Error) => {
      assert.ok(!e.message.includes(pkg));
      return true;
    });
  }
});

test('importer le chargeur ne charge aucun module (rien au démarrage)', async () => {
  const dir = neuf();
  process.env.WASM_DIR = dir; // empty: an eager load at import would throw here
  await assert.doesNotReject(chargeur());
});
