import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const racine = mkdtempSync(join(tmpdir(), 'kanevas-front-'));
mkdirSync(join(racine, 'assets'));
writeFileSync(join(racine, 'index.html'), '<html><head><!--KANEVAS_BOUCHON--></head><body>SHELL</body></html>');
writeFileSync(join(racine, 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(racine, 'secret.txt'), 'hors assets');

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = racine;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');

async function session(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'compte=antor',
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

test('sans session : adresse d’écran et asset redirigent vers la connexion', async () => {
  const app = await buildApp();
  for (const url of ['/', '/univers/1', '/assets/app.js']) {
    const r = await app.inject({ url });
    assert.equal(r.statusCode, 302, url);
    assert.equal(r.headers.location, '/connexion-bouchon', url);
  }
  await app.close();
});

test('avec session : toute adresse inconnue sert index.html, avec la meta bouchon', async () => {
  const app = await buildApp();
  const h = await session(app);
  for (const url of ['/', '/univers/1/fiches/lieux', '/n-importe-quoi']) {
    const r = await app.inject({ url, headers: h });
    assert.equal(r.statusCode, 200, url);
    assert.match(r.headers['content-type'] as string, /text\/html/);
    assert.ok(r.body.includes('SHELL'), url);
    assert.ok(r.body.includes('<meta name="kanevas-bouchon"'), url);
    assert.ok(!r.body.includes('KANEVAS_BOUCHON'), url);
  }
  await app.close();
});

test('avec session : /assets/ sert le fichier ; un fichier hors assets n’est pas servi', async () => {
  const app = await buildApp();
  const h = await session(app);
  const a = await app.inject({ url: '/assets/app.js', headers: h });
  assert.equal(a.statusCode, 200);
  assert.equal(a.body, 'console.log(1)');
  const s = await app.inject({ url: '/secret.txt', headers: h });
  assert.ok(!s.body.includes('hors assets'));
  const t = await app.inject({ url: '/assets/../secret.txt', headers: h });
  assert.ok(!t.body.includes('hors assets'));
  await app.close();
});

test('/api inconnu ne sert pas le shell ; POST inconnu non plus', async () => {
  const app = await buildApp();
  const h = await session(app);
  const r = await app.inject({ url: '/api/inexistant', headers: h });
  assert.equal(r.statusCode, 404);
  assert.ok(!r.body.includes('SHELL'));
  const p = await app.inject({ method: 'POST', url: '/univers/1', headers: h });
  assert.ok(!p.body.includes('SHELL'));
  const m = await app.inject({ url: '/api/moi' });
  assert.equal(m.statusCode, 401);
  await app.close();
});
