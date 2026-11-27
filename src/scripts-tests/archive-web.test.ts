// kanevas-web-publie-archive (AD-web-publie-6, first half): the web archive assembled from the repository's own
// `dist/`, unpacked beside nothing of the repository, is served by Node alone in stub mode.
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');
const construit = existsSync(join(RACINE, 'dist/server.js')) && existsSync(join(RACINE, 'dist/public/index.html'));
const modulesPresents = existsSync(join(RACINE, 'node_modules'));
const raisonSaut = !construit
  ? 'dist/ is not built (run `npm run build`): the suite that builds first plays this test'
  : !modulesPresents
    ? 'node_modules is missing'
    : false;

function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

describe('archive web du bouchon', { skip: raisonSaut }, () => {
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-archive-'));
  let serveur: ChildProcess | null = null;
  after(async () => {
    if (serveur && serveur.exitCode === null) {
      const fini = new Promise((r) => serveur!.once('exit', r));
      serveur.kill('SIGTERM');
      await fini;
    }
    rmSync(dossier, { recursive: true, force: true });
  });

  test('assembled, unpacked without rust/src/frontend, the launcher serves the page in stub mode', { timeout: 120_000 }, async () => {
    const dest = join(dossier, 'archive');
    const r = spawnSync(process.execPath, [join(RACINE, 'scripts/assembler-web.mjs'), dest, '9.8.7-test'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const racine = readdirSync(dest).sort();
    assert.deepEqual(racine, ['VERSION', 'dist', 'lancer-bouchon.mjs', 'package-lock.json', 'package.json', 'scripts']);
    assert.ok(existsSync(join(dest, 'scripts/faux-setup-token.mjs')));
    for (const absent of ['rust', 'src', 'frontend', 'node_modules']) assert.ok(!existsSync(join(dest, absent)), absent);
    symlinkSync(join(RACINE, 'node_modules'), join(dest, 'node_modules'));

    const port = await portLibre();
    const horsOidc = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('OIDC_')));
    // An inherited OIDC_* must be dropped by the launcher (AD-55).
    serveur = spawn(process.execPath, [join(dest, 'lancer-bouchon.mjs'), '--port', String(port)], {
      cwd: dossier,
      env: { ...horsOidc, OIDC_ISSUER: 'https://exemple.invalide', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let sortie = '';
    let erreurs = '';
    serveur.stdout!.on('data', (d) => (sortie += d));
    serveur.stderr!.on('data', (d) => (erreurs += d));
    const adresse = `http://127.0.0.1:${port}/`;
    const limite = Date.now() + 60_000;
    while (!sortie.includes(adresse)) {
      assert.ok(serveur.exitCode === null, `launcher exited: ${erreurs}`);
      assert.ok(Date.now() < limite, `address never printed: ${sortie} ${erreurs}`);
      await new Promise((res) => setTimeout(res, 100));
    }

    const sante = await fetch(`${adresse}healthz`);
    assert.equal(sante.status, 200);
    assert.match(await sante.text(), /9\.8\.7-test/);

    // Anonymous, the page is behind the session guard: the stub sign-in page is what answers.
    const anonyme = await fetch(adresse, { redirect: 'manual' });
    assert.equal(anonyme.status, 302);
    assert.match(anonyme.headers.get('location') ?? '', /connexion/);
    const connexion = await fetch(`${adresse}connexion-bouchon`);
    assert.equal(connexion.status, 200);
    assert.match(await connexion.text(), /name="compte"/);
    const ouverture = await fetch(`${adresse}connexion-bouchon`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'compte=antor',
    });
    const cookie = (ouverture.headers.getSetCookie()[0] ?? '').split(';')[0]!;
    assert.match(cookie, /^kanevas_session=/);
    const entetes = { cookie };

    const accueil = await fetch(adresse, { headers: entetes });
    assert.equal(accueil.status, 200);
    const corps = await accueil.text();
    const indexConstruit = readFileSync(join(dest, 'dist/public/index.html'), 'utf8');
    const reference = indexConstruit.match(/\/assets\/[^"']+\.js/)?.[0];
    assert.ok(reference, 'the built index.html names no script');
    assert.ok(corps.includes(reference), 'GET / is not the built index.html');

    const wasms = readdirSync(join(dest, 'dist/public/assets')).filter((f) => f.endsWith('.wasm'));
    assert.ok(wasms.length > 0, 'no wasm in the built page');
    const wasm = await fetch(`${adresse}assets/${wasms[0]}`, { headers: entetes });
    assert.equal(wasm.status, 200);
    assert.equal(wasm.headers.get('content-type')?.split(';')[0], 'application/wasm');
  });
});
