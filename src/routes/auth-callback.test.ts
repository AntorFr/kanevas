import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.OIDC_ISSUER = 'http://127.0.0.1:1/';
process.env.OIDC_CLIENT_ID = 'kanevas';
process.env.OIDC_CLIENT_SECRET = 'secret';
process.env.OIDC_REDIRECT_URI = 'https://kanevas.tantive.berard.me/api/auth/oidc/callback';

const { buildApp } = await import('../app.js');

test('OIDC set: config says enabled', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
  assert.deepEqual(res.json(), { oidcEnabled: true });
  await app.close();
});

test('callback without transaction cookie is 401, not authenticated', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/callback?code=x&state=y' });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { authenticated: false });
  await app.close();
});

test('callback with a forged (unsigned) cookie is 401', async () => {
  const app = await buildApp();
  const forged = Buffer.from(JSON.stringify({ state: 'y', codeVerifier: 'v' })).toString('base64url');
  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/oidc/callback?code=x&state=y',
    headers: { cookie: `kanevas_oidc_tx=${forged}` },
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { authenticated: false });
  assert.equal(res.headers['set-cookie'] !== undefined, true); // transaction cookie cleared
  await app.close();
});
