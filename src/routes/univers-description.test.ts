import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

// E-2: the description holds 500 characters at most; if the service stops checking, 501 is stored.
test('E-2 : description de 500 caractères acceptée, de 501 refusée sans créer d’univers', async () => {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const ok = await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'A', description: 'd'.repeat(500) } });
  assert.equal(ok.statusCode, 201);
  const trop = await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'B', description: 'd'.repeat(501) } });
  assert.equal(trop.statusCode, 400);
  const liste = (await app.inject({ url: '/api/univers', headers: antor })).json();
  assert.deepEqual(liste.map((u: { nom: string }) => u.nom), ['A']);
  await app.close();
});

// E-3 refusal: the 404 answer for a role-less account must not carry the universe's name.
test('E-3 : un compte sans rôle reçoit 404 sans le nom, comme pour un univers inconnu', async () => {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const teo = await connecter(app, 'teo');
  const u = (await app.inject({ method: 'POST', url: '/api/univers', headers: antor, payload: { nom: 'Lame d’Ébène' } })).json();
  const refus = await app.inject({ url: `/api/univers/${u.id}`, headers: teo });
  const inconnu = await app.inject({ url: '/api/univers/99999', headers: teo });
  assert.equal(refus.statusCode, 404);
  assert.ok(!refus.body.includes('Ébène'));
  assert.equal(refus.body, inconnu.body);
  await app.close();
});
