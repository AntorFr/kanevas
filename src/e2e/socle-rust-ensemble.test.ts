// Feature kanevas-socle-rust, tests d'ensemble écrits depuis le besoin (« Livre — » de la discussion) :
// un module Rust d'exemple rend la même valeur appelé depuis le serveur et depuis une page du frontend ;
// ses tests Rust et JS passent dans la suite ; ajouter un module ne touche aucun script ; le serveur
// démarre avec le module sans rien de Rust autour de lui (équivalent de l'étage d'exécution de l'image).
// Les attendus sont des littéraux : FNV-1a 32 bits sur les octets UTF-8, calculés à part (python3, vecteurs
// publics de FNV pour '', 'a', 'foobar').
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { attendreServeurPret, freePort, launch, skipBrowser, type Any } from './harnais.test.js';

const RACINE = process.cwd();
const VECTEURS: Array<[string, number]> = [
  ['', 2166136261],
  ['a', 3826002220],
  ['foobar', 3214735720],
  ['kanevas', 3485111814],
  ['Kanevas', 1490408358], // la casse change la valeur
  ['é', 513665217], // 2 octets UTF-8
  ['日本語', 2153733351], // 9 octets
  ['🎲', 1171732824], // 4 octets, hors plan multilingue de base
];

const tmps: string[] = [];
function neuf(): string {
  const d = mkdtempSync(join(tmpdir(), 'kanevas-socle-'));
  tmps.push(d);
  return d;
}
after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

async function valeursServeur(dossierWasm: string): Promise<number[]> {
  // Processus neuf : pas de cache de module, WASM_DIR posé comme le fait l'exploitant ou un test.
  const code = `
    const { chargerModule } = await import(${JSON.stringify(pathToFileURL(join(RACINE, 'src/wasm/charger.ts')).href)});
    const m = await chargerModule('exemple');
    console.log(JSON.stringify(${JSON.stringify(VECTEURS.map(([t]) => t))}.map((t) => m.fnv1a(t))));`;
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: RACINE,
    env: { ...process.env, WASM_DIR: dossierWasm },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop() as string);
}

test('serveur : le module construit rend les valeurs FNV-1a attendues (rust/pkg et dist/wasm)', async () => {
  const attendu = VECTEURS.map(([, v]) => v);
  assert.ok(existsSync(join(RACINE, 'rust/pkg/exemple/exemple_bg.wasm')), 'npm run build:wasm avant la suite');
  assert.deepEqual(await valeursServeur(join(RACINE, 'rust/pkg')), attendu);
  assert.ok(existsSync(join(RACINE, 'dist/wasm/exemple/exemple_bg.wasm')), 'npm run build avant la suite');
  assert.deepEqual(await valeursServeur(join(RACINE, 'dist/wasm')), attendu);
});

// ---- navigateur ----
let vite: ViteDevServer;
let base: string;
let browser: Any;
before(async () => {
  if (skipBrowser) return;
  const port = await freePort();
  vite = await createServer({
    configFile: join(RACINE, 'frontend/vite.essai.config.ts'),
    server: { port, strictPort: true, host: '127.0.0.1' },
    logLevel: 'silent',
  });
  await vite.listen();
  base = `http://127.0.0.1:${port}`;
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await vite?.close();
});

test('navigateur : une page du frontend rend, pour chaque entrée, la même valeur que le serveur', { skip: skipBrowser }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    // La page d'essai a fini de charger quand son sortie quitte « … ».
    await page.waitForFunction(() => document.getElementById('fnv1a')?.textContent !== '…', undefined, { timeout: 20_000 });
    const chargeur = `/@fs${join(RACINE, 'frontend/src/wasm/charger.ts')}`;
    const entrees = VECTEURS.map(([t]) => t);
    const navigateur: number[] = await page.evaluate(
      async ([url, textes]: [string, string[]]) => {
        const { chargerModule } = await import(/* @vite-ignore */ url);
        const m = await chargerModule('exemple');
        return textes.map((t) => m.fnv1a(t));
      },
      [chargeur, entrees],
    );
    const attendu = VECTEURS.map(([, v]) => v);
    assert.deepEqual(navigateur, attendu);
    assert.deepEqual(await valeursServeur(join(RACINE, 'rust/pkg')), navigateur);
  } finally {
    await page.close();
  }
});

test('navigateur : la page affiche la valeur épinglée et aucune erreur', { skip: skipBrowser }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.getElementById('fnv1a')?.textContent !== '…', undefined, { timeout: 20_000 });
    assert.equal((await page.textContent('#fnv1a'))?.trim(), '3485111814');
    assert.match((await page.textContent('#version')) ?? '', /^\d+\.\d+\.\d+/);
    assert.equal(await page.isHidden('#erreur'), true);
    mkdirSync(join(tmpdir(), 'kanevas-captures'), { recursive: true });
    await page.screenshot({ path: join(tmpdir(), 'kanevas-captures', 'socle-rust-essai.png') });
  } finally {
    await page.close();
  }
});

// ---- Rust : ajouter un module ----
function copieSocle(): string {
  const d = neuf();
  cpSync(join(RACINE, 'rust'), join(d, 'rust'), {
    recursive: true,
    filter: (src) => !/\/rust\/(target|pkg)(\/|$)/.test(src),
  });
  mkdirSync(join(d, 'scripts'));
  cpSync(join(RACINE, 'scripts/rust-wasm.sh'), join(d, 'scripts/rust-wasm.sh'));
  return d;
}

test('ajouter un module : un crate déposé dans rust/modules est compilé, testé et chargé sans toucher aucun script', { timeout: 600_000 }, async () => {
  const d = copieSocle();
  const mod = join(d, 'rust/modules/doubleur');
  mkdirSync(join(mod, 'src'), { recursive: true });
  writeFileSync(
    join(mod, 'Cargo.toml'),
    '[package]\nname = "doubleur"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n\n[lib]\ncrate-type = ["cdylib", "rlib"]\n\n[dependencies]\nwasm-bindgen = { workspace = true }\n',
  );
  writeFileSync(
    join(mod, 'src/lib.rs'),
    '#![allow(clippy::all)]\nuse wasm_bindgen::prelude::*;\n#[wasm_bindgen]\npub fn doubler(n: u32) -> u32 { n * 2 }\n#[cfg(test)]\nmod tests { use super::*; #[test] fn doubler_vingt_et_un_fait_quarante_deux() { assert_eq!(doubler(21), 42); } }\n',
  );
  const env = { ...process.env }; // cible de compilation propre à la copie : rust/target, comme le script l'attend
  // Un crate neuf entre dans Cargo.lock (commité avec lui) : le geste normal de celui qui ajoute un module.
  const verrou = spawnSync('cargo', ['metadata', '--offline', '--format-version', '1'], { cwd: join(d, 'rust'), env, encoding: 'utf8' });
  assert.equal(verrou.status, 0, verrou.stderr);
  const construit = spawnSync('bash', ['scripts/rust-wasm.sh'], { cwd: d, env, encoding: 'utf8' });
  assert.equal(construit.status, 0, construit.stderr);
  assert.ok(existsSync(join(d, 'rust/pkg/doubleur/doubleur_bg.wasm')));
  assert.ok(existsSync(join(d, 'rust/pkg/exemple/exemple_bg.wasm')), 'le module d\'exemple reste construit');

  const tests = spawnSync('cargo', ['test', '--workspace', '--locked'], { cwd: join(d, 'rust'), env, encoding: 'utf8' });
  assert.equal(tests.status, 0, tests.stderr);
  assert.match(tests.stdout, /doubler_vingt_et_un_fait_quarante_deux \.\.\. ok/);

  const code = `
    const { chargerModule } = await import(${JSON.stringify(pathToFileURL(join(RACINE, 'src/wasm/charger.ts')).href)});
    const m = await chargerModule('doubleur');
    console.log(m.doubler(21));`;
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: RACINE,
    env: { ...process.env, WASM_DIR: join(d, 'rust/pkg') },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '42');
});

test('build:wasm refuse un wasm-bindgen d\'une autre version que le verrou et ne touche pas à rust/pkg', () => {
  const d = copieSocle();
  const lock = join(d, 'rust/Cargo.lock');
  const texte = readFileSync(lock, 'utf8').replace(/(name = "wasm-bindgen"\nversion = ")[^"]+/, '$10.2.1');
  writeFileSync(lock, texte);
  mkdirSync(join(d, 'rust/pkg/temoin'), { recursive: true });
  writeFileSync(join(d, 'rust/pkg/temoin/x'), 'x');
  const r = spawnSync('bash', ['scripts/rust-wasm.sh'], { cwd: d, env: { ...process.env, CARGO_TARGET_DIR: join(d, 'cible') }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /0\.2\.1\b/);
  assert.match(r.stderr, /version mismatch/i);
  assert.ok(existsSync(join(d, 'rust/pkg/temoin/x')), 'rien n\'a été compilé ni effacé');
});

// ---- le serveur démarre avec le module, sans Rust autour ----
test('exécution : dist seul (sans rust/, sans cargo dans le PATH) vérifie le module et démarre avec /healthz', { timeout: 120_000 }, async () => {
  assert.ok(existsSync(join(RACINE, 'dist/server.js')), 'npm run build avant la suite');
  const d = neuf();
  cpSync(join(RACINE, 'dist'), join(d, 'dist'), { recursive: true });
  cpSync(join(RACINE, 'package.json'), join(d, 'package.json'));
  symlinkSync(join(RACINE, 'node_modules'), join(d, 'node_modules'));
  assert.equal(existsSync(join(d, 'rust')), false);
  const sansRust = { ...process.env, PATH: join(tmpdir(), 'chemin-vide-' + process.pid) + ':' + dirNode() };

  const verif = spawnSync(process.execPath, ['dist/wasm/verifier.mjs'], { cwd: d, env: sansRust, encoding: 'utf8' });
  assert.equal(verif.status, 0, verif.stderr);

  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...sansRust,
    PORT: String(port),
    NODE_ENV: 'production',
    KANEVAS_STUB: '1',
    KANEVAS_SANS_SEMIS: '1',
    DB_PATH: join(d, 'k.db'),
    SESSION_SECRET: 'socle-secret-socle-secret-1',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
  const enfant = spawn(process.execPath, ['dist/server.js'], { cwd: d, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = '';
  enfant.stdout?.on('data', (b) => (sortie += String(b)));
  enfant.stderr?.on('data', (b) => (sortie += String(b)));
  try {
    await attendreServeurPret(enfant, `http://127.0.0.1:${port}`, () => sortie);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
  } finally {
    enfant.kill('SIGKILL');
  }
});

function dirNode(): string {
  return process.execPath.replace(/\/[^/]+$/, '');
}

test('exclusion : le build de production n\'embarque ni page d\'essai ni .wasm dans dist/public, et dist ne porte aucune source Rust', () => {
  const tous = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name));
  const publics = tous(join(RACINE, 'dist/public'));
  assert.deepEqual(publics.filter((f) => f.endsWith('.wasm')), []);
  assert.deepEqual(publics.filter((f) => /essai/i.test(f)), []);
  assert.deepEqual(tous(join(RACINE, 'dist')).filter((f) => /\.rs$|Cargo\.(toml|lock)$/.test(f)), []);
});
