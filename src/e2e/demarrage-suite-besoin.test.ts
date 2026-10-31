// Startup guarantees of the e2e harness (feature kanevas-outils-suite-demarrage), written from
// the need: « server startups of the attested suite hold under load » — one startup at a time,
// a lock that never hangs nor leaks, readiness meaning /healthz answered 200.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lstatSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { attendreServeurPret, freePort, withStartupLock } from './harnais.test.ts';

// The lock is a dangling symlink: existsSync would follow it and say false.
function existe(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

async function avecVerrouPartage<T>(fn: (lock: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'demarrage-besoin-'));
  const lock = join(dir, 'startup.lock');
  const avant = process.env.KANEVAS_E2E_STARTUP_LOCK;
  process.env.KANEVAS_E2E_STARTUP_LOCK = lock;
  try {
    return await fn(lock);
  } finally {
    if (avant === undefined) delete process.env.KANEVAS_E2E_STARTUP_LOCK;
    else process.env.KANEVAS_E2E_STARTUP_LOCK = avant;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('startups called together run one after the other, in call order', async () => {
  // Panne visée : le verrou est retiré, deux démarrages se chevauchent.
  let actifs = 0;
  let maxActifs = 0;
  const journal: string[] = [];
  const demarrage = (nom: string) =>
    withStartupLock(async () => {
      actifs++;
      maxActifs = Math.max(maxActifs, actifs);
      journal.push(`debut ${nom}`);
      await delay(80);
      journal.push(`fin ${nom}`);
      actifs--;
    });
  await Promise.all([demarrage('a'), demarrage('b'), demarrage('c')]);
  assert.equal(maxActifs, 1);
  assert.deepEqual(journal, ['debut a', 'fin a', 'debut b', 'fin b', 'debut c', 'fin c']);
});

test('a startup that fails does not block the next one, and its error reaches the caller', async () => {
  // Panne visée : le verrou n'est pas libéré quand le démarrage échoue.
  await assert.rejects(withStartupLock(async () => { throw new Error('boom'); }), /boom/);
  const suite = await Promise.race([
    withStartupLock(async () => 'suivant'),
    delay(3000).then(() => 'bloque'),
  ]);
  assert.equal(suite, 'suivant');
});

test('with a shared lock path, the lock is held during the startup and removed after', async () => {
  await avecVerrouPartage(async (lock) => {
    let pendant: string | null = null;
    await withStartupLock(async () => {
      pendant = existe(lock) ? readlinkSync(lock) : null;
    });
    assert.equal(pendant, String(process.pid));
    assert.equal(existe(lock), false);
  });
});

test('with a shared lock path, the lock is removed even when the startup fails', async () => {
  await avecVerrouPartage(async (lock) => {
    await assert.rejects(withStartupLock(async () => { throw new Error('boom'); }), /boom/);
    assert.equal(existe(lock), false);
    assert.equal(await withStartupLock(async () => 'ok'), 'ok');
  });
});

test('a startup waits while another live process holds the shared lock, then goes', async () => {
  // Panne visée : le verrou partagé est ignoré, deux fichiers de test démarrent ensemble.
  await avecVerrouPartage(async (lock) => {
    symlinkSync(String(process.ppid), lock); // a live process other than this one
    let demarre = false;
    const p = withStartupLock(async () => { demarre = true; });
    await delay(600);
    assert.equal(demarre, false, 'must wait while the lock is held');
    unlinkSync(lock);
    await p;
    assert.equal(demarre, true);
    assert.equal(existe(lock), false);
  });
});

test('a lock left by a dead process makes the startup fail fast instead of hanging', async () => {
  // Panne visée : l'attente tourne sans fin derrière un travailleur tué.
  await avecVerrouPartage(async (lock) => {
    const mort = spawn('node', ['-e', '0']);
    const pid = mort.pid!;
    await new Promise((r) => mort.on('exit', r));
    symlinkSync(String(pid), lock);
    let demarre = false;
    const issue = await Promise.race([
      withStartupLock(async () => { demarre = true; }).then(() => 'resolu', () => 'rejete'),
      delay(5000).then(() => 'bloque'),
    ]);
    assert.equal(issue, 'rejete');
    assert.equal(demarre, false);
  });
});

function serveurTardif(port: number, avantMs: number, statutAvant: number | null) {
  // Child that starts listening after `avantMs`; /healthz answers `statutAvant` for 1 s, then 200.
  const code = `
    const http = require('node:http');
    const t0 = Date.now();
    setTimeout(() => http.createServer((q, s) => {
      const pret = Date.now() - t0 > ${avantMs} + 1000;
      s.writeHead(q.url === '/healthz' ? (pret ? 200 : ${statutAvant ?? 200}) : 404).end();
    }).listen(${port}, '127.0.0.1'), ${avantMs});`;
  return spawn('node', ['-e', code], { stdio: 'ignore' });
}

test('readiness waits for /healthz to answer 200, not for any HTTP answer', async () => {
  // Panne visée : un délai fixe, ou toute réponse HTTP, vaut « prêt ».
  const port = await freePort();
  const child = serveurTardif(port, 800, 503);
  const t0 = Date.now();
  try {
    await attendreServeurPret(child, `http://127.0.0.1:${port}`, () => '');
    const ecoule = Date.now() - t0;
    assert.ok(ecoule >= 1700, `resolved at ${ecoule} ms, before /healthz answered 200 (>= 1800 ms)`);
    const r = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(r.status, 200);
  } finally {
    child.kill('SIGKILL');
  }
});

test('readiness rejects with « server did not start » when the server exits at once', async () => {
  const port = await freePort();
  const child = spawn('node', ['-e', 'process.exit(3)'], { stdio: 'ignore' });
  await assert.rejects(attendreServeurPret(child, `http://127.0.0.1:${port}`, () => 'sortie-x'), /server did not start/);
});

test('readiness failure carries the server output tail', async () => {
  const port = await freePort();
  const child = spawn('node', ['-e', 'process.exit(3)'], { stdio: 'ignore' });
  await assert.rejects(attendreServeurPret(child, `http://127.0.0.1:${port}`, () => 'sortie-x'), /sortie-x/);
});
