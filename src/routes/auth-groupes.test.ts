import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
process.env.OIDC_ISSUER = 'https://idp.example/';
process.env.OIDC_CLIENT_ID = 'kanevas';
process.env.OIDC_CLIENT_SECRET = 'secret';
process.env.OIDC_REDIRECT_URI = 'https://kanevas.example/api/auth/oidc/callback';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
let userinfo: Record<string, unknown> = {};

// Simulated Authelia: discovery, token and userinfo. The id_token signature is not checked by
// the code flow (the token endpoint is the trust anchor), so an unsigned shape is enough.
const vraiFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  const json = (o: object) =>
    new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/.well-known/openid-configuration')) {
    return json({
      issuer: 'https://idp.example/',
      authorization_endpoint: 'https://idp.example/authorize',
      token_endpoint: 'https://idp.example/token',
      userinfo_endpoint: 'https://idp.example/userinfo',
      jwks_uri: 'https://idp.example/jwks',
    });
  }
  if (url === 'https://idp.example/token') {
    const now = Math.floor(Date.now() / 1000);
    const idToken = `${b64({ alg: 'RS256' })}.${b64({
      iss: 'https://idp.example/', aud: 'kanevas', sub: 'sub-1', iat: now, exp: now + 300,
    })}.c2ln`;
    return json({ access_token: 'at', token_type: 'Bearer', id_token: idToken, expires_in: 300 });
  }
  if (url === 'https://idp.example/userinfo') return json({ sub: 'sub-1', ...userinfo });
  return vraiFetch(input);
}) as typeof fetch;

async function connecterOidc(app: Awaited<ReturnType<typeof buildApp>>, info: Record<string, unknown>) {
  userinfo = info;
  const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
  assert.equal(login.statusCode, 302);
  const state = new URL(String(login.headers.location)).searchParams.get('state');
  const tx = login.cookies.find((c) => c.name === 'kanevas_oidc_tx');
  assert.ok(state && tx);
  const cb = await app.inject({
    method: 'GET',
    url: `/api/auth/oidc/callback?code=c&state=${state}`,
    headers: { cookie: `kanevas_oidc_tx=${tx.value}` },
  });
  assert.equal(cb.statusCode, 302, cb.body);
  const s = cb.cookies.find((c) => c.name === 'kanevas_session');
  assert.ok(s);
  return { cookie: `kanevas_session=${s.value}` };
}

test('callback : groups ["parents"] ouvre une session qui passe /api/instance, sans ce groupe non', async () => {
  const app = await buildApp();
  const admin = await connecterOidc(app, { preferred_username: 'parent', groups: ['parents'] });
  assert.deepEqual((await app.inject({ url: '/api/moi', headers: admin })).json().groups, ['parents']);
  assert.equal((await app.inject({ url: '/api/instance/univers', headers: admin })).statusCode, 200);

  for (const [i, info] of [
    { preferred_username: 'autre', groups: ['enfants'] },
    { preferred_username: 'sansgroupe' },
    { preferred_username: 'mal', groups: 'parents' },
    { preferred_username: 'casse', groups: ['Parents'] },
  ].entries()) {
    const h = await connecterOidc(app, info);
    const r = await app.inject({ url: '/api/instance/univers', headers: h });
    assert.equal(r.statusCode, 404, `cas ${i}`);
  }
  await app.close();
});
