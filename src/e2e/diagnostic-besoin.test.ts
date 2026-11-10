// Black-box tests of `kanevas-tests-attestes-pod`, written from the need only (the suite says why it fails in a pod:
// the harness waits 30 s for the server and shows its error output when it does not start). The server is the real built one (dist/server.js); only what it does before listening is
// chosen by the test, through a preloaded script (src/e2e/fixtures/demarrage/).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { startServer } from './harnais.test.ts';

const precharge = (nom: string) => ({ NODE_OPTIONS: `--require ${process.cwd()}/src/e2e/fixtures/demarrage/${nom}` });

async function echec(env: Record<string, string>): Promise<{ message: string; ms: number }> {
  const debut = Date.now();
  try {
    const s = await startServer(env);
    s.stop();
  } catch (e) {
    return { message: (e as Error).message, ms: Date.now() - debut };
  }
  assert.fail('the server was expected not to start');
}

describe('kanevas-tests-attestes-pod : le harnais e2e attend le serveur et dit pourquoi il ne démarre pas', () => {
  // Panne visée : l'attente retombe à ~10 s ; un serveur lent mais sain (pod chargé) est déclaré mort.
  it('un serveur qui met 12 s à démarrer est attendu : /healthz répond', { timeout: 60_000 }, async () => {
    const debut = Date.now();
    const s = await startServer(precharge('lent.cjs'));
    try {
      const r = await fetch(`${s.base}/healthz`);
      assert.equal(r.status, 200);
      assert.ok(Date.now() - debut >= 11_000, `parti trop vite : ${Date.now() - debut} ms`);
    } finally {
      s.stop();
    }
  });

  // Panne visée : stdio ignoré, message nu.
  it('un serveur qui sort au démarrage : « server did not start » et la fin de sa sortie d’erreur', { timeout: 60_000 }, async () => {
    const { message } = await echec(precharge('sortie.cjs'));
    assert.match(message, /server did not start/);
    assert.ok(message.includes('FIN-4471 impossible de demarrer'), message.slice(-300));
  });

  // Panne visée : on attend les 30 s pleines alors que le processus est déjà sorti.
  it('l’attente s’arrête dès que le serveur sort : bien avant 30 s', { timeout: 60_000 }, async () => {
    const { ms } = await echec(precharge('sortie.cjs'));
    assert.ok(ms < 20_000, `${ms} ms`);
  });

  // Panne visée : la sortie entière est collée dans le message (non bornée).
  it('la sortie montrée est la fin, bornée à quelques Ko : le début de 100 000 caractères n’y est pas', { timeout: 60_000 }, async () => {
    const { message } = await echec(precharge('sortie.cjs'));
    assert.ok(!message.includes('DEBUT-4471'), 'le début de la sortie ne doit pas être là');
    assert.ok(message.length < 16_000, `${message.length} caractères`);
  });

  // Panne visée : la sortie du serveur est captée sans être vidée, le processus se bloque sur un tube plein.
  it('un serveur très bavard (1 Mo sur stderr et stdout) démarre quand même', { timeout: 60_000 }, async () => {
    const s = await startServer(precharge('bavard.cjs'));
    try {
      const r = await fetch(`${s.base}/healthz`);
      assert.equal(r.status, 200);
    } finally {
      s.stop();
    }
  });

  // Panne visée : l'attente est abandonnée trop tôt, ou n'a pas de fin.
  it('un serveur vivant qui ne répond jamais : « server did not start » après environ 30 s', { timeout: 90_000 }, async () => {
    const { message, ms } = await echec(precharge('muet.cjs'));
    assert.match(message, /server did not start/);
    assert.ok(ms >= 29_000, `abandonné après ${ms} ms`);
    assert.ok(ms < 45_000, `${ms} ms`);
  });
});
