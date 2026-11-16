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

test('B-28 « Se déconnecter » : retour au choix du compte, et l’adresse « / » y ramène', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Teo');
  await page.goto('/');
  await voit(page, 'Connecté en tant que teo');
  // The account lives behind the avatar at the foot of the bar (docs/ecrans.md, § Barre latérale).
  await page.locator('aside .pied .menu-declencheur').click();
  await page.getByRole('menuitem', { name: rxExact('Se déconnecter') }).click();
  await page.waitForURL((u: URL) => u.pathname === '/connexion-bouchon');
  await voit(page, 'Choisir un compte de test');
  await page.goto('/');
  await page.waitForURL((u: URL) => u.pathname === '/connexion-bouchon');
  await ctx.close();
});

test('AD-55 changer de compte : se déconnecter puis choisir Léa donne l\'identifiant lea', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Teo');
  // The account lives behind the avatar at the foot of the bar (docs/ecrans.md, § Barre latérale).
  await page.locator('aside .pied .menu-declencheur').click();
  await page.getByRole('menuitem', { name: rxExact('Se déconnecter') }).click();
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
