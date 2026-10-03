import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { test } from 'node:test';

// Black-box tests of B-1 (kanevas-socle): the real server process is started
// as a user's deployment would (APP_VERSION from the environment), and
// /healthz is opened over real HTTP.

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function startServer(extraEnv: Record<string, string>) {
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), NODE_ENV: 'production' };
  for (const k of ['APP_VERSION', 'APP_NAME', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']) {
    delete env[k];
  }
  Object.assign(env, extraEnv);
  const child: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/healthz`);
      return { base, stop: () => child.kill('SIGKILL') };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill('SIGKILL');
  throw new Error('server did not start');
}

test('B-1 open /healthz on a deployment tagged 0.1.0 answers "kanevas 0.1.0"', async () => {
  const s = await startServer({ APP_VERSION: '0.1.0' });
  try {
    const res = await fetch(`${s.base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'kanevas 0.1.0');
  } finally {
    s.stop();
  }
});

test('B-1 the answer carries the exact tag version, pre-release suffix included', async () => {
  const s = await startServer({ APP_VERSION: '12.34.56-rc.1' });
  try {
    const res = await fetch(`${s.base}/healthz`);
    assert.equal(await res.text(), 'kanevas 12.34.56-rc.1');
  } finally {
    s.stop();
  }
});

test('B-1 the version follows the deployed tag, not a fixed value', async () => {
  const a = await startServer({ APP_VERSION: '0.1.0' });
  const b = await startServer({ APP_VERSION: '0.2.7' });
  try {
    assert.equal(await (await fetch(`${a.base}/healthz`)).text(), 'kanevas 0.1.0');
    assert.equal(await (await fetch(`${b.base}/healthz`)).text(), 'kanevas 0.2.7');
  } finally {
    a.stop();
    b.stop();
  }
});

test('B-1 anyone can open /healthz: no credentials, no cookie, OIDC unconfigured', async () => {
  const s = await startServer({ APP_VERSION: '0.1.0' });
  try {
    const res = await fetch(`${s.base}/healthz`, { redirect: 'manual' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'kanevas 0.1.0');
  } finally {
    s.stop();
  }
});

test('B-1 anyone can open /healthz when OIDC is configured (no login redirect)', async () => {
  const s = await startServer({
    APP_VERSION: '0.1.0',
    OIDC_ISSUER: 'http://127.0.0.1:9/unreachable',
    OIDC_CLIENT_ID: 'kanevas',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_REDIRECT_URI: 'http://127.0.0.1/api/auth/oidc/callback',
  });
  try {
    const res = await fetch(`${s.base}/healthz`, { redirect: 'manual' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'kanevas 0.1.0');
  } finally {
    s.stop();
  }
});

test('B-1 the answer is only name and version: nothing else in the body', async () => {
  const s = await startServer({ APP_VERSION: '0.1.0' });
  try {
    const body = await (await fetch(`${s.base}/healthz`)).text();
    assert.equal(body.trim(), 'kanevas 0.1.0');
    assert.equal(body.includes('<'), false);
    assert.equal(body.includes('{'), false);
  } finally {
    s.stop();
  }
});
