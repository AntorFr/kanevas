// ecrans: accueil
// Tests d'ensemble de la feature kanevas-harnais-preuve, écrits depuis son « Livre » :
//  L1  attendre() attend un signe visible du résultat, plus le silence du réseau ;
//  L2  les attentes fixes de page sont retirées ;
//  L3  sans Playwright la suite échoue au lieu de sauter les tests d'écran et de sortir à 0 ;
//  L4  dist/ est reconstruit avant les tests au lieu d'être pris périmé.
// Aucun attendu n'est tiré du code : durées, textes et codes de sortie sont écrits en dur.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { type Any, attendre, launch } from './harnais.test.js';

const RACINE = resolve('.');

// ---------------------------------------------------------------------------------------------
// L1 — attendre() attend le résultat visible
// ---------------------------------------------------------------------------------------------

// « /lent » répond après 600 ms ; la page montre alors « Chargement… » 1800 ms, puis le résultat.
// Le réseau est silencieux dès la fin de la réponse : un attendre() qui n'attend que le silence du
// réseau rend la main (≈ 500 ms plus tard) avant le résultat.
const PAGE = `<!doctype html><html><body><main id="m">pret</main>
<button onclick="fetch('/lent').then(r => r.text()).then(t => { const c = document.createElement('p'); c.setAttribute('role', 'status'); c.textContent = 'Chargement…'; document.body.append(c); setTimeout(() => { c.remove(); document.getElementById('m').textContent = t; }, 1800); })">Lancer lent</button>
<button onclick="fetch('/erreur').then(r => { document.getElementById('m').textContent = 'erreur ' + r.status; })">Lancer erreur</button>
<button onclick="fetch('/infini')">Lancer infini</button>
</body></html>`;

describe('L1 · attendre attend la preuve que l’action a abouti', () => {
  let srv: Server;
  let base = '';
  let browser: Any;
  const ouvertes: Array<{ destroy: () => void }> = [];

  before(async () => {
    srv = createServer((req, res) => {
      if (req.url === '/lent') setTimeout(() => res.end('resultat final'), 600);
      else if (req.url === '/erreur') {
        res.statusCode = 500;
        res.end('boum');
      } else if (req.url === '/infini') ouvertes.push(res);
      else {
        res.setHeader('content-type', 'text/html');
        res.end(PAGE);
      }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    for (const r of ouvertes) r.destroy();
    srv.close();
    srv.closeAllConnections();
  });

  async function ouvrir(): Promise<Any> {
    const ctx = await browser.newContext({ baseURL: base });
    const p = await ctx.newPage();
    p.setDefaultTimeout(60_000);
    await p.goto('/');
    return p;
  }

  // Panne visée : attendre() qui revient dès que le réseau se tait, avant le rendu qui suit la réponse.
  test('nominal : après un clic, attendre rend la main quand le résultat est affiché, pas avant', async () => {
    const p = await ouvrir();
    await p.getByRole('button', { name: 'Lancer lent' }).click();
    await attendre(p);
    assert.equal(await p.locator('#m').innerText(), 'resultat final');
    assert.equal(await p.getByText('Chargement…').count(), 0);
  });

  // Panne visée : attendre() qui attend sans fin (ou échoue) quand il n'y a rien à attendre.
  test('bord : sur une page posée, attendre rend la main en moins de 5 s', async () => {
    const p = await ouvrir();
    const debut = Date.now();
    await attendre(p);
    assert.ok(Date.now() - debut < 5000, `attendre a pris ${Date.now() - debut} ms sur une page posée`);
    assert.equal(await p.locator('#m').innerText(), 'pret');
  });

  // Panne visée : une réponse en erreur prise pour « pas fini ».
  test('bord : une réponse 500 est une réponse, attendre rend la main et la page montre l’erreur', async () => {
    const p = await ouvrir();
    await p.getByRole('button', { name: 'Lancer erreur' }).click();
    await attendre(p);
    assert.equal(await p.locator('#m').innerText(), 'erreur 500');
  });

  // Panne visée : attendre() qui rend la main alors qu'une requête de l'application ne s'est jamais terminée.
  test('échec : une requête qui ne se termine jamais fait échouer attendre, elle n’est pas ignorée', async () => {
    const p = await ouvrir();
    p.setDefaultTimeout(3000);
    await p.getByRole('button', { name: 'Lancer infini' }).click();
    await assert.rejects(() => attendre(p), Error);
  });
});

// ---------------------------------------------------------------------------------------------
// L2 — plus d'attente fixe dans les tests d'écran
// ---------------------------------------------------------------------------------------------

// Le mot est assemblé : ce fichier ne se trouve pas lui-même.
const MOT = 'wait' + 'ForTimeout';

function sources(dossier: string): string[] {
  return readdirSync(dossier, { recursive: true })
    .map((f) => join(dossier, String(f)))
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !f.includes('node_modules'));
}

describe('L2 · les attentes fixes sont retirées', () => {
  // Panne visée : un fichier de test qui garde une pause de page de durée fixe.
  test('nominal : aucun fichier de src/ ne contient l’attente fixe de page', () => {
    const fichiers = sources(join(RACINE, 'src'));
    assert.ok(fichiers.length > 200, `le balayage ne voit que ${fichiers.length} fichiers`);
    const fautifs = fichiers.filter((f) => readFileSync(f, 'utf8').includes(MOT)).map((f) => f.slice(RACINE.length + 1));
    assert.deepEqual(fautifs, []);
  });

  test('bord : ni frontend/src ni scripts/ n’en contiennent', () => {
    const fichiers = [...sources(join(RACINE, 'frontend/src')), ...sources(join(RACINE, 'scripts'))];
    assert.ok(fichiers.length > 20, `le balayage ne voit que ${fichiers.length} fichiers`);
    const fautifs = fichiers.filter((f) => readFileSync(f, 'utf8').includes(MOT)).map((f) => f.slice(RACINE.length + 1));
    assert.deepEqual(fautifs, []);
  });
});

// ---------------------------------------------------------------------------------------------
// L3 — sans Playwright, la suite échoue
// ---------------------------------------------------------------------------------------------

/** Joue un fichier d'écran réel dans un processus à part, Playwright rendu introuvable. */
function jouerSansPlaywright(env: Record<string, string>): { status: number | null; sortie: string } {
  // Le runner de tests refuse de se relancer dans un fichier de test tant que cette variable est posée.
  const { NODE_TEST_CONTEXT: _ctx, ...base } = process.env;
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', 'src/e2e/healthz.test.ts'], {
    cwd: RACINE,
    env: { ...base, ...env },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: r.status, sortie: r.stdout + r.stderr };
}

describe('L3 · sans Playwright la suite échoue au lieu de sauter', () => {
  // Panne visée : un harnais qui saute les tests d'écran et sort à 0 quand Playwright manque.
  test('nominal : Playwright introuvable, un fichier d’écran sort non nul, échoue et ne saute rien', () => {
    const vide = mkdtempSync(join(tmpdir(), 'sans-pw-ensemble-'));
    try {
      const { status, sortie } = jouerSansPlaywright({ HARNAIS_RACINES_PLAYWRIGHT: vide });
      assert.notEqual(status, 0, sortie.slice(-1500));
      assert.match(sortie, /# fail [1-9]/);
      assert.match(sortie, /# skipped 0/);
      assert.match(sortie, /Playwright/);
    } finally {
      rmSync(vide, { recursive: true, force: true });
    }
  });

  // Panne visée : Playwright présent mais sans Chromium, pris pour « rien à tester » et sauté.
  test('échec : Chromium absent, le fichier d’écran échoue et le dit', () => {
    const vide = mkdtempSync(join(tmpdir(), 'sans-chromium-ensemble-'));
    try {
      const { status, sortie } = jouerSansPlaywright({ PLAYWRIGHT_BROWSERS_PATH: vide });
      assert.notEqual(status, 0, sortie.slice(-1500));
      assert.match(sortie, /# fail [1-9]/);
      assert.match(sortie, /# skipped 0/);
    } finally {
      rmSync(vide, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// L4 — dist/ périmé ou absent est reconstruit avant les tests
// ---------------------------------------------------------------------------------------------

/** Copie le dépôt (sans node_modules, dist, .git) dans un dossier temporaire où l'on peut abîmer dist/. */
function copieDuDepot(): string {
  const d = mkdtempSync(join(tmpdir(), 'dist-ensemble-'));
  for (const e of ['src', 'frontend', 'scripts', 'rust', 'docs', 'assets', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    if (!existsSync(join(RACINE, e))) continue;
    cpSync(join(RACINE, e), join(d, e), {
      recursive: true,
      preserveTimestamps: true,
      filter: (s) => !/\/(node_modules|target)(\/|$)/.test(s),
    });
  }
  symlinkSync(join(RACINE, 'node_modules'), join(d, 'node_modules'));
  return d;
}

/** Démarre le serveur d'écran comme un fichier de test le fait, depuis la copie, et rend le code de /healthz. */
function demarrerDepuis(d: string): { status: number | null; sortie: string } {
  const script =
    "import('./src/e2e/harnais.test.ts').then(async (m) => { const s = await m.startServer(); " +
    "const r = await fetch(s.base + '/healthz'); console.log('HEALTHZ=' + r.status); s.stop(); process.exit(0); })" +
    ".catch((e) => { console.error('ECHEC ' + e.message); process.exit(1); })";
  const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], { cwd: d, encoding: 'utf8', timeout: 540_000 });
  return { status: r.status, sortie: r.stdout + r.stderr };
}

describe('L4 · dist/ n’est pas pris périmé', { timeout: 1_200_000 }, () => {
  let d = '';
  before(() => {
    d = copieDuDepot();
  });
  after(() => rmSync(d, { recursive: true, force: true }));

  // Panne visée : un dist/ plus ancien que les sources servi tel quel (ici : un serveur qui plante en démarrant).
  test('nominal : un dist/ plus ancien que les sources est reconstruit, le serveur répond 200', () => {
    const vieux = new Date(Date.now() - 3_600_000);
    mkdirSync(join(d, 'dist/public'), { recursive: true });
    writeFileSync(join(d, 'dist/server.js'), "throw new Error('dist périmé servi tel quel');\n");
    writeFileSync(join(d, 'dist/public/index.html'), '<!doctype html><title>périmé</title>');
    utimesSync(join(d, 'dist/server.js'), vieux, vieux);
    utimesSync(join(d, 'dist/public/index.html'), vieux, vieux);
    const maintenant = new Date();
    utimesSync(join(d, 'src/server.ts'), maintenant, maintenant);
    const { status, sortie } = demarrerDepuis(d);
    assert.equal(status, 0, sortie.slice(-2000));
    assert.match(sortie, /HEALTHZ=200/);
    assert.doesNotMatch(readFileSync(join(d, 'dist/server.js'), 'utf8'), /dist périmé servi tel quel/);
  });

  // Panne visée : un dist/ absent qui fait échouer le démarrage au lieu d'être construit.
  test('bord : sans dist/, il est construit et le serveur répond 200', () => {
    rmSync(join(d, 'dist'), { recursive: true, force: true });
    const { status, sortie } = demarrerDepuis(d);
    assert.equal(status, 0, sortie.slice(-2000));
    assert.match(sortie, /HEALTHZ=200/);
    assert.ok(existsSync(join(d, 'dist/server.js')));
  });
});
