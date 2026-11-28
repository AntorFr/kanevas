// Besoin kanevas-web-publie : une version de la page construite, lancée en bouchon avec Node seul.
// Écrit depuis le besoin (fiche + AD-web-publie-2/3), sans lire l'implémentation.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const REPO = resolve(import.meta.dirname, '..', '..');
const VERSION = '7.3.1-besoin.2';
let racine: string; // archive dépaquetée
let travail: string;

function portLibre(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

type Lance = { enfant: ChildProcess; adresse: string; sortie: () => string };
async function lancer(args: string[], env: NodeJS.ProcessEnv = {}, cwd: string = tmpdir()): Promise<Lance> {
  const enfant = spawn('node', [join(racine, 'lancer-bouchon.mjs'), ...args], {
    cwd,
    env: { ...process.env, ...env },
  });
  let out = '';
  enfant.stdout!.on('data', (d) => (out += d));
  enfant.stderr!.on('data', (d) => (out += d));
  const adresse = await new Promise<string>((ok, ko) => {
    const t = setTimeout(() => ko(new Error('pas d\'adresse : ' + out)), 60000);
    const verif = setInterval(() => {
      const m = out.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (m) { clearTimeout(t); clearInterval(verif); ok(m[0]); }
    }, 100);
    enfant.on('exit', () => { clearTimeout(t); clearInterval(verif); ko(new Error('sorti : ' + out)); });
  });
  return { enfant, adresse, sortie: () => out };
}
function arreter(e: ChildProcess): Promise<number | null> {
  return new Promise((ok) => {
    if (e.exitCode !== null) return ok(e.exitCode);
    e.on('exit', (c) => ok(c));
    e.kill('SIGTERM');
  });
}

describe('web publié : contenu de l\'archive', () => {
  before(() => {
    travail = mkdtempSync(join(tmpdir(), 'webpub-'));
    racine = join(travail, 'archive');
    const r = spawnSync('node', [join(REPO, 'scripts', 'assembler-web.mjs'), racine, VERSION], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    symlinkSync(join(REPO, 'node_modules'), join(racine, 'node_modules'));
  });
  after(() => rmSync(travail, { recursive: true, force: true }));

  test('la racine porte la page, le serveur, le lanceur et la version, sans source ni Rust', () => {
    const noms = readdirSync(racine).filter((n) => n !== 'node_modules').sort();
    assert.deepEqual(noms, ['VERSION', 'dist', 'lancer-bouchon.mjs', 'package-lock.json', 'package.json', 'scripts']);
    assert.equal(readFileSync(join(racine, 'VERSION'), 'utf8').trim(), VERSION);
    assert.ok(existsSync(join(racine, 'dist/public/index.html')));
    assert.ok(readdirSync(join(racine, 'dist/wasm')).length > 0, 'dist/wasm vide');
    assert.ok(existsSync(join(racine, 'scripts/faux-setup-token.mjs')));
    for (const interdit of ['rust', 'src', 'frontend']) assert.equal(existsSync(join(racine, interdit)), false, interdit);
  });

  test('l\'assemblage sans version est refusé', () => {
    const r = spawnSync('node', [join(REPO, 'scripts', 'assembler-web.mjs'), join(travail, 'x')], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
  });
});

describe('web publié : lancement du bouchon avec Node seul', () => {
  before(() => {
    travail = mkdtempSync(join(tmpdir(), 'webpub-'));
    racine = join(travail, 'archive');
    const r = spawnSync('node', [join(REPO, 'scripts', 'assembler-web.mjs'), racine, VERSION], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    symlinkSync(join(REPO, 'node_modules'), join(racine, 'node_modules'));
  });
  after(() => rmSync(travail, { recursive: true, force: true }));

  test('le bouchon sert la page sur le port demandé et s\'arrête sur SIGTERM', async () => {
    const port = await portLibre();
    const l = await lancer(['--port', String(port)]);
    assert.equal(l.adresse, `http://127.0.0.1:${port}/`);
    const h = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(h.status, 200);
    const page = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' });
    assert.ok([200, 302, 303].includes(page.status), 'statut ' + page.status);
    const connexion = await fetch(`http://127.0.0.1:${port}/connexion-bouchon`);
    assert.equal(connexion.status, 200);
    await arreter(l.enfant);
    await assert.rejects(fetch(`http://127.0.0.1:${port}/healthz`));
  });

  test('le port 0 est refusé : le consommateur doit connaître l\'adresse', () => {
    const r = spawnSync('node', [join(racine, 'lancer-bouchon.mjs'), '--port', '0'], { encoding: 'utf8', cwd: tmpdir(), timeout: 30000 });
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /http:\/\//);
  });

  test('un OIDC_* hérité de l\'environnement ne empêche pas le bouchon de démarrer', async () => {
    const port = await portLibre();
    const l = await lancer(['--port', String(port)], { OIDC_ISSUER: 'https://exemple.invalid', OIDC_CLIENT_ID: 'x' });
    assert.equal((await fetch(`${l.adresse}healthz`)).status, 200);
    await arreter(l.enfant);
  });

  test('--data garde la base après l\'arrêt', async () => {
    const data = join(travail, 'donnees');
    const port = await portLibre();
    const l = await lancer(['--port', String(port), '--data', data]);
    await arreter(l.enfant);
    assert.ok(existsSync(data), 'dossier --data absent');
    assert.ok(readdirSync(data).length > 0, 'dossier --data vide');
  });

  test('lancé depuis un autre dossier, sans --data, il ne laisse rien dans le dossier courant', async () => {
    const ailleurs = mkdtempSync(join(tmpdir(), 'webpub-cwd-'));
    try {
      const port = await portLibre();
      const l = await lancer(['--port', String(port)], {}, ailleurs);
      assert.equal(l.adresse, `http://127.0.0.1:${port}/`);
      await arreter(l.enfant);
      assert.deepEqual(readdirSync(ailleurs), []);
    } finally { rmSync(ailleurs, { recursive: true, force: true }); }
  });
});
