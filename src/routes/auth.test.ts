import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
for (const k of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']) {
  delete process.env[k];
}

const { buildApp } = await import('../app.js');

test('OIDC unset: config says disabled, login and callback are 404', async () => {
  const app = await buildApp();
  const cfg = await app.inject({ method: 'GET', url: '/api/auth/config' });
  assert.deepEqual(cfg.json(), { oidcEnabled: false });
  for (const url of ['/api/auth/oidc/login', '/api/auth/oidc/callback']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 404, url);
  }
  await app.close();
});

test('no content route exists and /healthz needs no auth', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ method: 'GET', url: '/api/users' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200);
  await app.close();
});
