import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');

const BANDEAU = 'Mode bouchon — les comptes sont fictifs. Ne jamais l’ouvrir en production.';

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const set = res.cookies.find((c) => c.name === 'kanevas_session');
  assert.ok(set, 'cookie de session posé');
  return { res, cookie: `kanevas_session=${set.value}` };
}

test('sans session : /api → 401, page → redirection vers le choix du compte', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ url: '/api/moi' })).statusCode, 401);
  const page = await app.inject({ url: '/' });
  assert.equal(page.statusCode, 302);
  assert.equal(page.headers.location, '/connexion-bouchon');
  await app.close();
});

test('routes publiques : /healthz et /api/auth/config sans session', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/auth/config' })).statusCode, 200);
  await app.close();
});

test('cookie à signature invalide ou forgé = pas de session', async () => {
  const app = await buildApp();
  const forge = Buffer.from(JSON.stringify({ id: 1, groups: ['parents'] })).toString('base64url');
  for (const cookie of [
    `kanevas_session=${forge}`,
    `kanevas_session=${forge}.AAAA`,
    'kanevas_session=n-importe-quoi',
  ]) {
    const res = await app.inject({ url: '/api/moi', headers: { cookie } });
    assert.equal(res.statusCode, 401, cookie);
  }
  await app.close();
});

test('cookie dont la signature a été prise sur un autre contenu : 401', async () => {
  const app = await buildApp();
  const { cookie } = await connecter(app, 'lea');
  const [valeur, signature] = decodeURIComponent(cookie.split('=')[1]!).split('.') as [string, string];
  const autre = Buffer.from(JSON.stringify({ id: 1, groups: ['parents'] })).toString('base64url');
  assert.notEqual(valeur, autre);
  const res = await app.inject({
    url: '/api/moi',
    headers: { cookie: `kanevas_session=${autre}.${signature}` },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('choix de compte : liste Antor, Léa, Teo, Mira, Admin (groupes : parents), bandeau', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/connexion-bouchon' });
  assert.equal(res.statusCode, 200);
  for (const nom of ['Antor', 'Léa', 'Teo', 'Mira', 'Admin']) {
    assert.ok(res.body.includes(`Se connecter en tant que ${nom}`), nom);
  }
  assert.ok(res.body.includes('groupes : parents'));
  assert.equal(res.body.split('groupes :').length, 2, 'seul Admin porte des groupes');
  assert.ok(res.body.includes(BANDEAU));
  await app.close();
});

test('Léa : session, compte créé à la 1re fois, /api/moi sans groupe', async () => {
  const app = await buildApp();
  const avant = app.db.prepare("SELECT COUNT(*) AS n FROM comptes WHERE username='lea'").get() as { n: number };
  assert.equal(avant.n, 0);
  const { cookie } = await connecter(app, 'lea');
  const moi = await app.inject({ url: '/api/moi', headers: { cookie } });
  assert.equal(moi.statusCode, 200);
  assert.deepEqual(moi.json(), { username: 'lea', groups: [] });
  await connecter(app, 'lea'); // 2e fois : pas de doublon
  const apres = app.db.prepare("SELECT COUNT(*) AS n FROM comptes WHERE username='lea'").get() as { n: number };
  assert.equal(apres.n, 1);
  await app.close();
});

test('Admin : /api/moi contient parents ; les groupes ne donnent aucun rôle dans la session', async () => {
  const app = await buildApp();
  const { cookie } = await connecter(app, 'admin');
  const moi = await app.inject({ url: '/api/moi', headers: { cookie } });
  assert.deepEqual(moi.json(), { username: 'admin', groups: ['parents'] });
  await app.close();
});

test('compte inconnu dans le formulaire : pas de session', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'compte=root',
  });
  assert.equal(res.cookies.find((c) => c.name === 'kanevas_session'), undefined);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM comptes').get().n, 0);
  await app.close();
});

test('logout efface le cookie de session', async () => {
  const app = await buildApp();
  const { cookie } = await connecter(app, 'lea');
  const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const efface = res.cookies.find((c) => c.name === 'kanevas_session');
  assert.ok(efface);
  assert.equal(efface.value, '');
  assert.ok(efface.expires && efface.expires.getTime() < Date.now());
  await app.close();
});

test('session pointant un compte supprimé : plus de session', async () => {
  const app = await buildApp();
  const { cookie } = await connecter(app, 'teo');
  app.db.prepare("DELETE FROM comptes WHERE username='teo'").run();
  assert.equal((await app.inject({ url: '/api/moi', headers: { cookie } })).statusCode, 401);
  await app.close();
});

test('bandeau sur chaque page rendue par le serveur', async () => {
  const app = await buildApp();
  const { cookie } = await connecter(app, 'lea');
  const introuvable = await app.inject({ url: '/nulle-part', headers: { cookie } });
  assert.equal(introuvable.statusCode, 404);
  assert.ok(introuvable.body.includes(BANDEAU));
  await app.close();
});

test('la session survit à un redémarrage (session.key)', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-'));
  // dbPath is read at import time: run the two "processes" as real subprocesses.
  const { spawnSync } = await import('node:child_process');
  const script = (etape: string) => `
    process.env.NODE_ENV='test'; process.env.KANEVAS_STUB='1'; process.env.DB_PATH=${JSON.stringify(join(dossier, 'k.db'))};
    const { buildApp } = await import(${JSON.stringify(new URL('../app.js', import.meta.url).href)});
    const app = await buildApp();
    ${etape}
    await app.close();`;
  const un = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script(`
      const r = await app.inject({method:'POST',url:'/connexion-bouchon',headers:{'content-type':'application/x-www-form-urlencoded'},payload:'compte=lea'});
      console.log(r.cookies.find(c=>c.name==='kanevas_session').value);`)],
    { encoding: 'utf8' },
  );
  assert.equal(un.status, 0, un.stderr);
  const valeur = un.stdout.trim().split('\n').pop()!;
  const deux = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script(`
      const r = await app.inject({url:'/api/moi',headers:{cookie:'kanevas_session='+${JSON.stringify(valeur)}}});
      console.log(r.statusCode, r.body);`)],
    { encoding: 'utf8' },
  );
  assert.equal(deux.status, 0, deux.stderr);
  assert.ok(deux.stdout.includes('200 {"username":"lea","groups":[]}'), deux.stdout);
});

test('KANEVAS_STUB=1 avec une variable OIDC_* (même vide) : le démarrage échoue', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const [k, v] of [['OIDC_ISSUER', ''], ['OIDC_CLIENT_ID', 'x']]) {
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', '-e', `import(${JSON.stringify(new URL('../config/env.js', import.meta.url).href)})`],
      { encoding: 'utf8', env: { ...process.env, KANEVAS_STUB: '1', [k!]: v! } },
    );
    assert.notEqual(r.status, 0, `${k}=${JSON.stringify(v)} doit faire échouer`);
  }
});
