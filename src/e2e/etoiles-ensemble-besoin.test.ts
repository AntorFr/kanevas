// Black-box tests of the feature kanevas-carte-spatiale-etoiles (the stars of the galaxy drawn by the Rust core),
// written from its sheet (« Livre », exit criterion as amended), docs/parcours.md (B-86, B-87) and docs/ecrans.md (E-21)
// — not from the code. The expected values are the committed fixtures drawn by Éneria's own generator on the neutral
// seed (rust/modules/coeur/tests/fixtures/generation-galaxie.json) and a few literals read from them.
//
// The application under test is a COPY of the working tree built the way the criterion says: `npm run build:wasm`
// compiles the core, `npm run build` only copies it to dist/wasm/coeur/ (no compiler is called: fake `cargo` and
// `wasm-bindgen` on the PATH record any call), then the Rust sources and rust/pkg are removed so that the server
// can only load the core from dist/ (B-87: the image carries it).
import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { attendreServeurPret, freePort, launch, skipBrowser, withStartupLock, type Any } from './harnais.test.js';

const RACINE = process.cwd();
const FIX = JSON.parse(readFileSync(join(RACINE, 'rust/modules/coeur/tests/fixtures/generation-galaxie.json'), 'utf8')) as Fixtures;

interface Etoile { q: number; r: number; taille: number; lettre: string; x: number; y: number }
interface Fixtures {
  graine: string;
  densites: { defaut: number; zones: { nom: string; densite: number; hexagones: [number, number][] }[] };
  systemes_definis: { q: number; r: number; promu: boolean }[];
  blocs: { bx: number; by: number; etoile: Etoile | null }[];
}

// The two fixture systems the public API cannot reproduce: (22,-49) sits on a drawn star, so placing it promotes it
// (the fixture says not promoted); (-46,-20) is promoted in the fixture without a star under it (placing it cannot promote).
const IMPOSSIBLES = new Set(['22,-49', '-46,-20']);
// The block (4,-10) holds the star under (22,-49): the fixture has none there (it was excluded), the API world has it.
const BLOC_IGNORE = '4,-10';
const placables = FIX.systemes_definis.filter((s) => !IMPOSSIBLES.has(`${s.q},${s.r}`));
const VOISINS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// ---------------------------------------------------------------- the built application

interface Chaine { compile: Buffer; build_sans_pkg: { status: number | null; sortie: string }; wasm: { status: number | null; sortie: string }; build: { status: number | null; sortie: string }; marqueur: string; dir: string }
let chaine: Promise<Chaine> | undefined;
const tmpDirs: string[] = [];
let serveur: { base: string; app: string; child: ChildProcess; stop: () => void } | undefined;

function npm(cwd: string, script: string, path: string): { status: number | null; sortie: string } {
  const r = spawnSync('npm', ['run', script], { cwd, env: { ...process.env, PATH: path }, encoding: 'utf8', timeout: 400_000 });
  return { status: r.status, sortie: `${r.stdout}\n${r.stderr}` };
}

function construire(): Promise<Chaine> {
  chaine ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kanevas-etoiles-'));
    tmpDirs.push(dir);
    const app = join(dir, 'app');
    mkdirSync(app, { recursive: true });
    for (const f of ['package.json', 'package-lock.json', 'tsconfig.json', 'src', 'frontend', 'scripts', 'assets', 'docs']) {
      if (existsSync(join(RACINE, f))) cpSync(join(RACINE, f), join(app, f), { recursive: true });
    }
    mkdirSync(join(app, 'rust'));
    for (const f of ['modules', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml']) cpSync(join(RACINE, 'rust', f), join(app, 'rust', f), { recursive: true });
    symlinkSync(join(RACINE, 'node_modules'), join(app, 'node_modules'));

    // PATH of the node tools alone, plus fake compilers that record any call.
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const marqueur = join(dir, 'compilateur-appele');
    for (const outil of ['node', 'npm', 'npx']) {
      const lien = spawnSync('sh', ['-c', `command -v ${outil}`], { encoding: 'utf8' }).stdout.trim();
      symlinkSync(lien, join(bin, outil));
    }
    for (const outil of ['cargo', 'wasm-bindgen', 'rustup', 'rustc']) {
      writeFileSync(join(bin, outil), `#!/bin/sh\necho ${outil} >> ${marqueur}\nexit 1\n`);
      chmodSync(join(bin, outil), 0o755);
    }
    const pathSansRust = `${bin}:/usr/bin:/bin`;

    // 1. `npm run build` before any `build:wasm`: no rust/pkg, it must stop (it compiles nothing).
    const build_sans_pkg = npm(app, 'build', pathSansRust);
    // 2. `npm run build:wasm` with the real toolchain compiles the core.
    const wasm = npm(app, 'build:wasm', process.env.PATH ?? '');
    const compile = existsSync(join(app, 'rust/pkg/coeur/coeur_bg.wasm')) ? readFileSync(join(app, 'rust/pkg/coeur/coeur_bg.wasm')) : Buffer.alloc(0);
    // 3. `npm run build` copies it, still without any compiler.
    const build = npm(app, 'build', pathSansRust);
    // 4. Only dist/ remains: the server cannot find the core anywhere else.
    rmSync(join(app, 'rust'), { recursive: true, force: true });
    return { compile, build_sans_pkg, wasm, build, marqueur, dir: app };
  })();
  return chaine;
}

async function demarrerServeur(): Promise<NonNullable<typeof serveur>> {
  if (serveur) return serveur;
  const c = await construire();
  return withStartupLock(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kanevas-etoiles-db-'));
    tmpDirs.push(dir);
    const port = await freePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env, PORT: String(port), NODE_ENV: 'production', KANEVAS_STUB: '1',
      DB_PATH: join(dir, 'k.db'), SESSION_SECRET: 'e2e-secret-e2e-secret-e2e',
    };
    for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
    delete env.KANEVAS_SANS_SEMIS;
    delete env.WASM_DIR;
    const child = spawn('node', ['dist/server.js'], { cwd: c.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    for (const flux of [child.stdout, child.stderr]) flux?.on('data', (d: Buffer) => { sortie = (sortie + String(d)).slice(-4096); });
    const base = `http://127.0.0.1:${port}`;
    const stop = () => child.kill('SIGKILL');
    try {
      await attendreServeurPret(child, base, () => sortie);
    } catch (e) {
      stop();
      throw e;
    }
    serveur = { base, app: c.dir, child, stop };
    return serveur;
  });
}

let browser: Any;
before(async () => {
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  serveur?.stop();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------- API helpers

interface Monde { base: string; uid: number; cookies: Record<string, string> }
let monde: Promise<Monde> | undefined;
async function leMonde(): Promise<Monde> {
  monde ??= (async () => {
    const s = await demarrerServeur();
    const cookies: Record<string, string> = {};
    for (const c of ['antor', 'lea']) {
      const r = await fetch(`${s.base}/connexion-bouchon`, {
        method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ compte: c }).toString(),
      });
      cookies[c] = r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
    }
    const univers = (await (await fetch(`${s.base}/api/univers`, { headers: { cookie: cookies.antor! } })).json()) as Any[];
    return { base: s.base, uid: univers.find((u) => u.nom === "Éneria d'essai").id, cookies };
  })();
  return monde;
}

interface Rep { status: number; texte: string; json: Any }
async function appel(m: Monde, compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const r = await fetch(`${m.base}/api/univers/${m.uid}/outils/swn/galaxie/galaxies${chemin}`, {
    method: methode,
    headers: { cookie: m.cookies[compte]!, 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json: Any = null;
  try { json = JSON.parse(texte); } catch { /* not JSON */ }
  return { status: r.status, texte, json };
}

interface Galaxie { m: Monde; id: number; version: number }
/** A galaxy created on the neutral seed, with the fixtures' two density zones, the systems of the fixtures that the API can place. */
async function galaxieNeutre(opts: { zones?: boolean; systemes?: { q: number; r: number; secret?: boolean }[]; visible?: boolean } = {}): Promise<Galaxie> {
  const m = await leMonde();
  const cree = await appel(m, 'antor', 'POST', '', { titre: `Neutre ${Math.random().toString(36).slice(2, 8)}` });
  assert.equal(cree.status, 201, cree.texte);
  const id = cree.json.id as number;
  const graine = await appel(m, 'antor', 'PUT', `/${id}/graine`, { graine: FIX.graine, version: 1, confirme: true });
  assert.equal(graine.status, 200, graine.texte);
  let version = graine.json.version as number;
  if (opts.zones ?? true) {
    for (const z of FIX.densites.zones) {
      const r = await appel(m, 'antor', 'POST', `/${id}/zones`, { nom: z.nom, contour: { hexagones: z.hexagones }, densite: z.densite });
      assert.equal(r.status, 201, r.texte);
    }
  }
  for (const s of opts.systemes ?? []) {
    const r = await appel(m, 'antor', 'POST', `/${id}/systemes`, { nom: `S ${s.q} ${s.r}`, q: s.q, r: s.r, secret: s.secret ?? false });
    assert.equal(r.status, 201, r.texte);
  }
  if (opts.visible) {
    const r = await appel(m, 'antor', 'PATCH', `/${id}`, { visible: true, version });
    assert.equal(r.status, 200, r.texte);
    version = r.json.version;
  }
  return { m, id, version };
}

interface Lecture { generes: Map<string, [number, number][]>; systemes: Any[] }
/** Every block of the fixtures (-10..9 on both axes), read by four rectangles (the route takes 12 × 12 blocks at most). */
async function toutLire(g: Galaxie, compte: string): Promise<Lecture> {
  const generes = new Map<string, [number, number][]>();
  const systemes: Any[] = [];
  for (const x of [-10, 0]) {
    for (const y of [-10, 0]) {
      const r = await appel(g.m, compte, 'GET', `/${g.id}/blocs?de=${x},${y}&a=${x + 9},${y + 9}`);
      assert.equal(r.status, 200, r.texte);
      for (const b of r.json.blocs) generes.set(`${b.bx},${b.by}`, b.generes);
      systemes.push(...r.json.systemes);
    }
  }
  return { generes, systemes };
}

/** The stars of every fixture block, at the fixtures' places; a promoted system sits on its star's hexagon and shows instead. */
function verifierContreFixtures(l: Lecture, promus: Set<string>, ignores: Set<string> = new Set()): void {
  assert.equal(l.generes.size, 400);
  let etoiles = 0;
  for (const b of FIX.blocs) {
    const cle = `${b.bx},${b.by}`;
    if (cle === BLOC_IGNORE || ignores.has(cle)) continue;
    const obtenu = l.generes.get(cle);
    if (b.etoile === null) {
      assert.deepEqual(obtenu, [], `bloc ${cle} : aucune étoile attendue`);
      continue;
    }
    etoiles++;
    const hex = `${b.etoile.q},${b.etoile.r}`;
    if (promus.has(hex)) {
      assert.deepEqual(obtenu, [], `bloc ${cle} : l'étoile ${hex} est remplacée par le système promu`);
      assert.ok(l.systemes.some((s) => s.q === b.etoile!.q && s.r === b.etoile!.r), `le système promu ${hex} est montré`);
    } else {
      assert.deepEqual(obtenu, [[b.etoile.q, b.etoile.r]], `bloc ${cle} : étoile attendue en ${hex}`);
    }
  }
  assert.ok(etoiles >= 100, `au moins 100 étoiles comparées, ${etoiles}`);
}

// ---------------------------------------------------------------- Build and image (criterion as amended)

test('Build : `npm run build:wasm` compile le binaire Wasm du cœur, dont le module generation exporte le tirage', async () => {
  const c = await construire();
  assert.equal(c.wasm.status, 0, c.wasm.sortie.slice(-1500));
  const octets = c.compile; // rust/pkg/coeur/coeur_bg.wasm read right after build:wasm
  assert.deepEqual([...octets.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], 'magic \\0asm');
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(octets)).map((e) => e.name);
  for (const nom of ['tirer_bloc', 'hex_vers_plan', 'plan_vers_hex', 'densite_defaut', 'version_generateur', 'memory']) {
    assert.ok(exports.includes(nom), `le cœur exporte ${nom} (exports : ${exports.join(', ')})`);
  }
});

test('Build : `npm run build` copie le cœur compilé dans dist/wasm/coeur/ sans appeler aucun compilateur', async () => {
  const c = await construire();
  assert.equal(c.build.status, 0, c.build.sortie.slice(-1500));
  assert.equal(existsSync(c.marqueur), false, 'ni cargo ni wasm-bindgen ni rustc appelés par npm run build');
  for (const f of ['coeur_bg.wasm', 'coeur.js']) {
    assert.ok(existsSync(join(c.dir, 'dist/wasm/coeur', f)), `dist/wasm/coeur/${f}`);
  }
  assert.ok(c.compile.length > 1000);
  assert.ok(readFileSync(join(c.dir, 'dist/wasm/coeur/coeur_bg.wasm')).equals(c.compile), 'le .wasm de dist/ est celui que build:wasm a compilé');
});

test('Build échec : `npm run build` sans rust/pkg (build:wasm pas joué) s’arrête sans compiler et ne livre pas de cœur', async () => {
  const c = await construire();
  assert.notEqual(c.build_sans_pkg.status, 0, c.build_sans_pkg.sortie.slice(-800));
  assert.equal(existsSync(c.marqueur), false, 'aucun compilateur appelé');
});

test('B-87 : le serveur d’une image qui ne porte que dist/ charge le cœur et tire les étoiles de la graine neutre', async () => {
  const c = await construire();
  assert.equal(existsSync(join(c.dir, 'rust')), false, 'le dossier rust/ a été retiré : seul dist/ porte le cœur');
  const g = await galaxieNeutre({ zones: false });
  // Block (0,-1) of the fixtures: the star of class… at (2,-3) when no system or zone is around (literal read from the fixtures).
  const r = await appel(g.m, 'antor', 'GET', `/${g.id}/blocs?de=0,-1&a=0,-1`);
  assert.equal(r.status, 200, r.texte);
  assert.deepEqual(r.json.blocs[0].generes, [[2, -3]]);
});

// ---------------------------------------------------------------- B-86 : the stars at the places of the fixtures

test('B-86 nominal : sur la graine neutre, les 400 blocs montrent l’étoile des fixtures à sa place (MJ), 3 systèmes non promus et 2 promus posés', async () => {
  const g = await galaxieNeutre({ systemes: [...placables].sort((a, b) => Number(b.promu) - Number(a.promu)) });
  const l = await toutLire(g, 'antor');
  const promus = new Set(placables.filter((s) => s.promu).map((s) => `${s.q},${s.r}`));
  assert.deepEqual([...promus].sort(), ['-2,38', '18,-27']);
  verifierContreFixtures(l, promus);
  // Literals read from the fixtures: first block, and the star under the promoted system (18,-27).
  assert.deepEqual(l.generes.get('-10,-10'), [[-49, -48]]);
  assert.deepEqual(l.generes.get('-9,-10'), [[-44, -47]]);
});

test('B-86 bords : sans zone ni système, hors des zones de densité les blocs sont ceux des fixtures ; dans les zones basse (0,3) et haute (0,95) les tirages diffèrent', async () => {
  const g = await galaxieNeutre({ zones: false });
  const sans = await toutLire(g, 'antor');
  const avec = await toutLire(await galaxieNeutre({ zones: true }), 'antor');
  // Inside no zone, the density is the default 0.68 either way: block (0,-1) (hexagons 0..4, -5..-1) is outside both zones.
  assert.deepEqual(sans.generes.get('0,-1'), avec.generes.get('0,-1'));
  const dansBasse = (bx: number, by: number) => bx >= -9 && bx <= -5 && by >= -9 && by <= -5; // hexagons -45..-21 on both axes
  const dansHaute = (bx: number, by: number) => bx >= 3 && bx <= 7 && by >= 3 && by <= 7; // hexagons 15..39 on both axes
  let diff = 0;
  for (const b of FIX.blocs) {
    if (!dansBasse(b.bx, b.by) && !dansHaute(b.bx, b.by)) {
      if (`${b.bx},${b.by}` === BLOC_IGNORE) continue;
      assert.deepEqual(avec.generes.get(`${b.bx},${b.by}`), sans.generes.get(`${b.bx},${b.by}`), `bloc ${b.bx},${b.by} hors zone`);
    } else if (JSON.stringify(avec.generes.get(`${b.bx},${b.by}`)) !== JSON.stringify(sans.generes.get(`${b.bx},${b.by}`))) diff++;
  }
  assert.ok(diff >= 1, 'les zones de densité 0,3 et 0,95 changent au moins un bloc');
  // Block counts in the zones, from the fixtures: the low zone holds fewer stars than the high one.
  const compte = (f: (bx: number, by: number) => boolean) => FIX.blocs.filter((b) => f(b.bx, b.by) && b.etoile).length;
  assert.equal(compte(dansBasse), 4);
  assert.equal(compte(dansHaute), 22);
  const lire = (l: Lecture, f: (bx: number, by: number) => boolean) => [...l.generes].filter(([k, v]) => f(...(k.split(',').map(Number) as [number, number])) && v.length).length;
  assert.equal(lire(avec, dansBasse), 4);
  assert.equal(lire(avec, dansHaute), 22);
});

test('B-86 exclusions : autour d’un système défini non promu, les six hexagones voisins (et son hexagone) ne portent aucune étoile tirée, pour le MJ comme pour le joueur', async () => {
  const nonPromus = placables.filter((s) => !s.promu);
  assert.equal(nonPromus.length, 3);
  const g = await galaxieNeutre({ systemes: nonPromus, visible: true });
  for (const compte of ['antor', 'lea']) {
    const l = await toutLire(g, compte);
    const tous = new Set([...l.generes.values()].flat().map(([q, r]) => `${q},${r}`));
    for (const s of nonPromus) {
      for (const [dq, dr] of [[0, 0], ...VOISINS] as [number, number][]) {
        assert.equal(tous.has(`${s.q + dq},${s.r + dr}`), false, `${compte} : aucune étoile en ${s.q + dq},${s.r + dr} autour de ${s.q},${s.r}`);
      }
    }
  }
});

test('B-86 exclusion : le non promu retire l’étoile voisine tirée, rien d’autre ne bouge ; promu, il laisse tout en place', async () => {
  // Baseline: star of block (0,-1) at (2,-3) (literal of the fixtures), no system placed.
  const base = await toutLire(await galaxieNeutre({ zones: false }), 'antor');
  assert.deepEqual(base.generes.get('0,-1'), [[2, -3]]);

  // A defined system next to that star on an empty hexagon (3,-3) is not promoted: the star disappears.
  const g = await galaxieNeutre({ zones: false });
  const pose = await appel(g.m, 'antor', 'POST', `/${g.id}/systemes`, { nom: 'Voisin', q: 3, r: -3 });
  assert.equal(pose.status, 201, pose.texte);
  assert.equal(pose.json.promu, false);
  const apres = await toutLire(g, 'antor');
  assert.deepEqual(apres.generes.get('0,-1'), []);
  for (const [cle, v] of base.generes) if (cle !== '0,-1') assert.deepEqual(apres.generes.get(cle), v, `bloc ${cle} inchangé`);

  // A system anchored on a drawn star (2,-3) is promoted: every other block keeps its star, and the star's place shows the system.
  const h = await galaxieNeutre({ zones: false });
  const promu = await appel(h.m, 'antor', 'POST', `/${h.id}/systemes`, { nom: 'Ancre', q: 2, r: -3 });
  assert.equal(promu.status, 201, promu.texte);
  assert.equal(promu.json.promu, true);
  const lh = await toutLire(h, 'antor');
  for (const [cle, v] of base.generes) if (cle !== '0,-1') assert.deepEqual(lh.generes.get(cle), v, `bloc ${cle} inchangé autour du système promu`);
  assert.ok(lh.systemes.some((s) => s.q === 2 && s.r === -3), 'le système promu est montré à la place de l’étoile');
});

test('B-86 joueur : Léa voit le même tirage que le MJ, même autour d’un système non promu secret (le tirage ne trahit pas sa présence)', async () => {
  const secret = { q: 33, r: -38, secret: true };
  const autres = placables.filter((s) => !(s.q === 33 && s.r === -38));
  const g = await galaxieNeutre({ systemes: [...autres, secret].sort((a, b) => Number(b.promu ?? false) - Number(a.promu ?? false)), visible: true });
  const mj = await toutLire(g, 'antor');
  const lea = await toutLire(g, 'lea');
  assert.deepEqual([...lea.generes], [...mj.generes], 'Léa lit les mêmes blocs que le MJ');
  const promus = new Set(['18,-27', '-2,38']);
  verifierContreFixtures(lea, promus);
  assert.equal(lea.systemes.some((s) => s.q === 33 && s.r === -38), false, 'le système secret n’est pas montré à Léa');
  assert.equal(mj.systemes.some((s) => s.q === 33 && s.r === -38), true, 'le MJ le voit');
});

// ---------------------------------------------------------------- B-87 : the browser binding

test('B-87 : le même cœur chargé par Chromium rend, pour les 400 blocs des fixtures, les mêmes étoiles qu’en Node (à 1e-9), octet pour octet', { skip: skipBrowser, timeout: 120_000 }, async () => {
  const c = await construire();
  const s = await demarrerServeur();
  // dist/wasm/coeur is served by the application's static files? No: it is served by a throw-away static server here.
  const { createServer } = await import('node:http');
  const dossier = join(c.dir, 'dist/wasm/coeur');
  const http = createServer((req, res) => {
    const nom = (req.url ?? '/').split('?')[0]!.replace(/^\//, '');
    if (nom === 'page.html') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>coeur</title>'); return; }
    if (!['coeur.js', 'coeur_bg.wasm'].includes(nom)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', nom.endsWith('.js') ? 'text/javascript' : 'application/wasm');
    res.end(readFileSync(join(dossier, nom)));
  });
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
  const port = (http.address() as { port: number }).port;
  void s;
  const entrees = FIX.blocs.map((b) => {
    const densites: number[] = [];
    const exclus: number[] = [];
    for (let dq = 1; dq <= 3; dq++) {
      for (let dr = 1; dr <= 3; dr++) {
        const q = 5 * b.bx + dq, r = 5 * b.by + dr;
        const z = FIX.densites.zones.filter((zz) => zz.hexagones.some(([a, bb]) => a === q && bb === r)).map((zz) => zz.densite);
        densites.push(z.length ? Math.min(...z) : FIX.densites.defaut);
        const proche = FIX.systemes_definis.some((sy) => !sy.promu && [[0, 0], ...VOISINS].some(([a, bb]) => sy.q + a! === q && sy.r + bb! === r));
        exclus.push(proche ? 1 : 0);
      }
    }
    return { bx: b.bx, by: b.by, densites, exclus };
  });
  // Node binding.
  const glue = await import(join(dossier, 'coeur.js'));
  glue.initSync({ module: readFileSync(join(dossier, 'coeur_bg.wasm')) });
  const node = entrees.map((e) => glue.tirer_bloc(FIX.graine, e.bx, e.by, e.densites, e.exclus) as string);
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/page.html`);
    const navigateur: string[] = await page.evaluate(async ({ entrees: es, graine }: Any) => {
      const m = await import('/coeur.js');
      await m.default('/coeur_bg.wasm');
      return es.map((e: Any) => m.tirer_bloc(graine, e.bx, e.by, e.densites, e.exclus));
    }, { entrees, graine: FIX.graine });
    assert.deepEqual(navigateur, node, 'mêmes octets de JSON');
    let etoiles = 0;
    FIX.blocs.forEach((b, i) => {
      const obtenu = JSON.parse(navigateur[i]!);
      if (b.etoile === null) return assert.equal(obtenu, null, `bloc ${b.bx},${b.by}`);
      etoiles++;
      assert.equal(obtenu.q, b.etoile.q);
      assert.equal(obtenu.r, b.etoile.r);
      assert.equal(obtenu.lettre, b.etoile.lettre);
      for (const k of ['taille', 'x', 'y'] as const) assert.ok(Math.abs(obtenu[k] - b.etoile[k]) <= 1e-9, `${k} du bloc ${b.bx},${b.by}`);
    });
    assert.ok(etoiles >= 100);
  } finally {
    await page.close();
    http.close();
  }
});

// ---------------------------------------------------------------- E-21 on screen

test('E-21 : l’écran de la galaxie montre les étoiles des fixtures à leur place et plus celle que le système non promu voisin exclut', { skip: skipBrowser, timeout: 150_000 }, async () => {
  // (3,-3) is next to the fixtures' star (2,-3) (neighbour (-1,0)); the star (7,-7) is in view too and has no system around it.
  const voisin = { q: 3, r: -3 };
  const g = await galaxieNeutre({ systemes: [voisin] });
  const ctx = await browser.newContext({ baseURL: g.m.base, viewport: { width: 1280, height: 800 } });
  await ctx.request.post('/connexion-bouchon', { form: { compte: 'antor' }, maxRedirects: 0 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(`/univers/${g.m.uid}/outils/swn/galaxie/${g.id}`);
    await page.getByRole('button', { name: `S ${voisin.q} ${voisin.r}` }).waitFor();
    await page.locator('[data-genere]').first().waitFor();
    mkdirSync('/tmp/shots', { recursive: true });
    await page.screenshot({ path: '/tmp/shots/etoiles-e21.png' });
    const visibles: string[] = await page.locator('[data-genere]').evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('data-genere')!));
    const fixture = new Set(FIX.blocs.filter((b) => b.etoile).map((b) => `${b.etoile!.q},${b.etoile!.r}`));
    for (const v of visibles) assert.ok(fixture.has(v), `l'étoile ${v} montrée est une étoile des fixtures`);
    assert.ok(visibles.includes('7,-7'), 'l’étoile (7,-7) des fixtures est montrée');
    for (const [dq, dr] of [[0, 0], ...VOISINS] as [number, number][]) {
      assert.equal(visibles.includes(`${voisin.q + dq},${voisin.r + dr}`), false, `aucune étoile en ${voisin.q + dq},${voisin.r + dr}`);
    }
  } finally {
    await ctx.close();
  }
});
