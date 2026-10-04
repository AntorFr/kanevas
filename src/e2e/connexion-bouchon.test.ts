// Black-box tests of the session and of the stub mode (B-28, AD-55, docs/ecrans.md « Session et
// connexion »). Real server process, real HTTP, real Chromium.
//
// TEST PLAN
//   B-28 nominal  : without an account, neither page nor API serves content; /healthz says only name and version
//        edges    : /healthz stays public; once signed in, /api/moi returns {username, groups}
//        exclusions: only Admin carries « parents »; signing out closes everything
//   AD-55 nominal : /connexion-bouchon lists Antor, Léa, Teo, Mira, Admin under the banner, on every page
//        failure  : an OIDC_* variable (even alone) -> refuses to start; without KANEVAS_STUB, unknown address
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startExpectingExit,
  startServer,
  texte,
  voit,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const BANDEAU = 'Mode bouchon — les comptes sont fictifs. Ne jamais l\'ouvrir en production.';

test('B-28 sans compte, ni les pages ni l\'API ne servent de contenu', opts, async () => {
  for (const chemin of ['/', '/univers/1', '/univers/1/fiche/1', '/univers/nouveau', '/api/moi', '/api/univers', '/api/univers/1']) {
    const res = await fetch(srv.base + chemin, { redirect: 'manual' });
    assert.ok([302, 401, 403].includes(res.status), `${chemin} answered ${res.status} without a session`);
    const corps = await res.text();
    assert.ok(!/Lame|Aldric|<h1/.test(corps), `${chemin} served content without a session`);
  }
});

test('B-28 /healthz reste public et ne dit que « kanevas <version> »', opts, async () => {
  const res = await fetch(srv.base + '/healthz');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'kanevas 0.0.0-dev');
});

test('AD-55 l\'écran de choix liste Antor, Léa, Teo, Mira et Admin (groupes : parents) sous le bandeau', opts, async () => {
  const ctx = await browser.newContext({ baseURL: srv.base });
  const page = await ctx.newPage();
  await page.goto('/connexion-bouchon');
  const t = await texte(page);
  assert.ok(t.includes(BANDEAU));
  for (const n of ['Antor', 'Léa', 'Teo', 'Mira', 'Admin']) {
    assert.equal(await page.getByRole('button', { name: rxExact(`Se connecter en tant que ${n}`) }).count(), 1, n);
  }
  assert.ok(t.includes('groupes : parents'));
  assert.equal((t.match(/groupes :/g) ?? []).length, 1, 'only Admin carries groups');
  await ctx.close();
});

test('AD-55 /api/moi rend {username, groups} : Admin porte « parents », Léa aucun groupe', opts, async () => {
  const admin = await connecte(browser, srv.base, 'Admin');
  const moiAdmin = await (await admin.page.request.get('/api/moi')).json();
  assert.deepEqual(moiAdmin, { username: 'admin', groups: ['parents'], limites: { contenuSection: 20000 } });
  const lea = await connecte(browser, srv.base, 'Léa');
  const moiLea = await (await lea.page.request.get('/api/moi')).json();
  assert.deepEqual(moiLea, { username: 'lea', groups: [], limites: { contenuSection: 20000 } });
  await admin.ctx.close();
  await lea.ctx.close();
});

test('AD-55 le bandeau « mode bouchon » est sur chaque page : accueil, création, vue d\'ensemble, page introuvable', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Antor');
  await creerUnivers(page, 'Bandeau');
  await page.getByRole('heading', { name: 'Bandeau', level: 1 }).waitFor();
  const urlUnivers = new URL(page.url()).pathname;
  for (const chemin of ['/', '/univers/nouveau', urlUnivers, urlUnivers + '/membres', urlUnivers + '/fiches/personnages', '/adresse/inconnue']) {
    await page.goto(chemin);
    await attendre(page);
    await page.getByText(rx(BANDEAU)).first().waitFor();
  }
  await ctx.close();
});

test('B-28 « Se déconnecter » efface la session : plus de contenu, retour au choix du compte', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Teo');
  await page.goto('/');
  await voit(page, 'Connecté en tant que teo');
  await page.getByRole('button', { name: rxExact('Se déconnecter') }).click();
  await page.waitForURL((u: URL) => u.pathname === '/connexion-bouchon');
  await voit(page, 'Choisir un compte de test');
  const res = await page.request.get('/api/moi', { maxRedirects: 0 });
  assert.equal(res.status(), 401);
  await page.goto('/');
  await page.waitForURL((u: URL) => u.pathname === '/connexion-bouchon');
  await ctx.close();
});

test('AD-55 changer de compte : se déconnecter puis choisir Léa donne l\'identifiant lea', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Teo');
  await page.getByRole('button', { name: rxExact('Se déconnecter') }).click();
  await page.waitForURL((u: URL) => u.pathname === '/connexion-bouchon');
  await page.getByRole('button', { name: rxExact('Se connecter en tant que Léa') }).click();
  await voit(page, 'Connecté en tant que lea');
  await ctx.close();
});

for (const variable of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']) {
  test(`AD-55 KANEVAS_STUB=1 avec ${variable} posée : Kanevas refuse de démarrer`, async () => {
    const valeur = variable === 'OIDC_ISSUER' || variable === 'OIDC_REDIRECT_URI' ? 'https://auth.example.org/x' : 'x';
    const r = await startExpectingExit({ KANEVAS_STUB: '1', [variable]: valeur });
    assert.equal(r.exited, true, 'the process must stop by itself');
    assert.notEqual(r.code, 0);
    assert.ok(/OIDC/.test(r.stderr), 'the refusal names the OIDC variables');
  });
}

test('AD-55 KANEVAS_STUB=1 sans variable OIDC_* : Kanevas démarre', async () => {
  const s = await startServer();
  try {
    const res = await fetch(s.base + '/connexion-bouchon');
    assert.equal(res.status, 200);
  } finally {
    s.stop();
  }
});

test('AD-55 sans KANEVAS_STUB, /connexion-bouchon répond « Page introuvable. »', async () => {
  const s = await startServer({ KANEVAS_STUB: '' });
  try {
    const res = await fetch(s.base + '/connexion-bouchon', { redirect: 'manual' });
    assert.equal(res.status, 404);
    assert.ok((await res.text()).includes('Page introuvable.'));
    const post = await fetch(s.base + '/connexion-bouchon', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'compte=antor',
      redirect: 'manual',
    });
    assert.equal(post.status, 404);
    assert.ok(!(post.headers.get('set-cookie') ?? '').includes('='), 'no session is opened');
  } finally {
    s.stop();
  }
});
