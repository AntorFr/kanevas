// Concurrency of the e2e harness: startups share one lock, a vanished owner is reported, a failed
// startup frees its turn, and the attested runner refuses a bad --concurrence.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { startServer } from './harnais.test.ts';

const VERROU = 'KANEVAS_E2E_STARTUP_LOCK';

async function avecVerrou<T>(chemin: string, run: () => Promise<T>): Promise<T> {
  const avant = process.env[VERROU];
  process.env[VERROU] = chemin;
  try {
    return await run();
  } finally {
    if (avant === undefined) delete process.env[VERROU];
    else process.env[VERROU] = avant;
  }
}

test('un verrou tenu par un processus vivant retient le démarrage jusqu’à sa libération', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-verrou-'));
  const verrou = join(dir, 'startup.lock');
  const proprietaire = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    symlinkSync(String(proprietaire.pid), verrou);
    const demarrage = avecVerrou(verrou, () => startServer());
    let fini = false;
    demarrage.then(() => (fini = true), () => (fini = true));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(fini, false, 'the startup went ahead while another process held the lock');
    unlinkSync(verrou);
    const serveur = await demarrage;
    serveur.stop();
    assert.equal(lstatSync(verrou, { throwIfNoEntry: false }), undefined, 'lock left behind');
  } finally {
    proprietaire.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un propriétaire disparu est signalé, sans attente infinie ni vol du verrou', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-verrou-'));
  const verrou = join(dir, 'startup.lock');
  const mort = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((r) => mort.on('exit', r));
  try {
    symlinkSync(String(mort.pid), verrou);
    const debut = Date.now();
    await avecVerrou(verrou, () =>
      assert.rejects(startServer(), /exited before releasing/));
    assert.ok(Date.now() - debut < 5_000, `${Date.now() - debut} ms`);
    assert.ok(lstatSync(verrou, { throwIfNoEntry: false }), 'the lock of another owner was removed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un démarrage en échec libère son tour : le suivant démarre, le verrou est rendu', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-verrou-'));
  const verrou = join(dir, 'startup.lock');
  const fichier = join(dir, 'fichier');
  writeFileSync(fichier, 'x');
  try {
    await avecVerrou(verrou, async () => {
      await assert.rejects(startServer({ DB_PATH: join(fichier, 'sous', 'k.db') }), /server did not start/);
      assert.equal(lstatSync(verrou, { throwIfNoEntry: false }), undefined, 'lock kept after a failed startup');
      const serveur = await startServer();
      const res = await fetch(`${serveur.base}/healthz`);
      assert.equal(res.status, 200);
      serveur.stop();
      assert.equal(lstatSync(verrou, { throwIfNoEntry: false }), undefined, 'lock kept after a good startup');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deux démarrages simultanés dans un fichier passent l’un après l’autre, tous deux prêts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-verrou-'));
  try {
    await avecVerrou(join(dir, 'startup.lock'), async () => {
      const [a, b] = await Promise.all([startServer(), startServer()]);
      try {
        assert.equal((await fetch(`${a.base}/healthz`)).status, 200);
        assert.equal((await fetch(`${b.base}/healthz`)).status, 200);
        assert.notEqual(a.base, b.base);
      } finally {
        a.stop();
        b.stop();
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const valeur of [['0'], ['-2'], ['1.5'], ['abc'], []]) {
  test(`tests:attestes refuse --concurrence ${valeur.join('') || '(sans valeur)'} par le code 2`, () => {
    const res = spawnSync(process.execPath, ['scripts/tests-attestes.mjs', '--concurrence', ...valeur], { encoding: 'utf8' });
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.match(res.stderr, /positive integer/);
  });
}
