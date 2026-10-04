import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
process.env.OIDC_ISSUER = 'http://127.0.0.1:1/';
process.env.OIDC_CLIENT_ID = 'kanevas';
process.env.OIDC_CLIENT_SECRET = 'secret';
process.env.OIDC_REDIRECT_URI = 'https://kanevas.example/api/auth/oidc/callback';

const { buildApp } = await import('../app.js');

test('sans KANEVAS_STUB : /connexion-bouchon répond 404, GET comme POST, sans session', async () => {
  const app = await buildApp();
  const get = await app.inject({ url: '/connexion-bouchon' });
  assert.equal(get.statusCode, 404);
  assert.ok(get.body.includes('Page introuvable.'));
  const post = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'compte=admin',
  });
  assert.equal(post.statusCode, 404);
  assert.equal(post.cookies.length, 0);
  await app.close();
});

test('sans session : /api/moi 401, page → connexion Authelia, pas de bandeau bouchon', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ url: '/api/moi' })).statusCode, 401);
  const page = await app.inject({ url: '/univers' });
  assert.equal(page.statusCode, 302);
  assert.equal(page.headers.location, '/api/auth/oidc/login');
  const nf = await app.inject({ url: '/api/inconnue' });
  assert.ok(!nf.body.includes('Mode bouchon'));
  await app.close();
});

test('page « Connexion refusée » : texte de docs/ecrans.md, lien Réessayer, rien d’autre', async () => {
  const app = await buildApp();
  const res = await app.inject({
    url: '/api/auth/oidc/callback?code=x&state=y',
    headers: { accept: 'text/html' },
  });
  assert.equal(res.statusCode, 401);
  assert.ok(res.body.includes('La connexion a été refusée.'));
  assert.ok(res.body.includes('href="/api/auth/oidc/login">Réessayer</a>'));
  assert.ok(!res.body.includes('Mode bouchon'));
  await app.close();
});

test('page « Connexion indisponible » quand Authelia ne répond pas', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/api/auth/oidc/login' });
  assert.equal(res.statusCode, 503);
  assert.ok(res.body.includes('Authelia ne répond pas pour l’instant. Réessayez dans un moment.'));
  assert.ok(res.body.includes('Réessayer</a>'));
  await app.close();
});
