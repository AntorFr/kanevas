// E-9 report window: the content ceiling comes from /api/moi, as for section editing.
// Browser proof of the boundary lost with E-6; no networkidle waits.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let uid: number;
let aventure: number;

async function connexion() {
  const ctx = await browser.newContext({ baseURL: srv.base });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: 'Se connecter en tant que Antor', exact: true }).click();
  await page.getByRole('heading', { name: 'Mes univers', exact: true }).waitFor();
  return { ctx, page };
}

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  assert.ok(r.ok(), `${method} ${path}: ${r.status()}`);
  return r.json();
}

async function ouvrir(page: Any) {
  await page.goto(`/univers/${uid}/fiche/${aventure}`);
  await page.getByRole('region', { name: 'Comptes-rendus', exact: true })
    .getByRole('button', { name: 'Nouveau compte-rendu', exact: true }).click();
  return page.getByRole('dialog', { name: 'Nouveau compte-rendu', exact: true });
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  const { ctx, page } = await connexion();
  try {
    uid = (await api(page, 'POST', '/api/univers', { nom: 'Plafond des comptes-rendus' })).id;
    aventure = (await api(page, 'POST', `/api/univers/${uid}/fiches`, {
      type: 'aventure', titre: 'La Couronne brisée',
      sections: [{ titre: 'Présentation', joueursLisent: true }],
    })).id;
  } finally { await ctx.close(); }
});

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('Nouveau compte-rendu : 100 001 caractères refusés sans envoi ni perte, 100 000 créés et relus', opts, async () => {
  const { ctx, page } = await connexion();
  try {
    let envois = 0;
    page.on('request', (r: Any) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === `/api/univers/${uid}/comptes-rendus`) envois++;
    });
    const d = await ouvrir(page);
    const champ = d.getByLabel('Texte');
    await d.getByLabel('Titre', { exact: true }).fill('Séance au plafond');
    const trop = 'a'.repeat(100001);
    await champ.fill(trop);
    await d.getByText(/100\s001\s*\/\s*100\s000/).waitFor();
    await d.getByRole('button', { name: 'Créer', exact: true }).click();
    await d.getByText('Erreur : 100 000 caractères au plus.', { exact: true }).waitFor();
    assert.equal(envois, 0);
    assert.equal(await champ.inputValue(), trop);
    assert.equal(await champ.getAttribute('aria-invalid'), 'true');
    assert.equal(await d.getByLabel('Titre', { exact: true }).inputValue(), 'Séance au plafond');

    const plein = 'b'.repeat(100000);
    await champ.fill(plein);
    await d.getByText(/100\s000\s*\/\s*100\s000/).waitFor();
    const reponse = page.waitForResponse((r: Any) => r.request().method() === 'POST'
      && new URL(r.url()).pathname === `/api/univers/${uid}/comptes-rendus`);
    await d.getByRole('button', { name: 'Créer', exact: true }).click();
    const r = await reponse;
    assert.equal(r.status(), 201);
    const cr = await r.json();
    await page.getByRole('heading', { name: 'Séance au plafond', exact: true, level: 1 }).waitFor();
    assert.equal(await d.count(), 0);
    assert.equal(envois, 1);
    const fiche = await api(page, 'GET', `/api/univers/${uid}/fiches/${cr.id}`);
    assert.equal(fiche.sections[0].contenu, plein);
  } finally { await ctx.close(); }
});

test('Nouveau compte-rendu : compteur et refus suivent la limite annoncée par /api/moi', opts, async () => {
  const { ctx, page } = await connexion();
  try {
    // A different advertised ceiling catches a screen that still hardcodes 100 000.
    await page.route('**/api/moi', async (route: Any) => {
      const r = await route.fetch();
      const moi = await r.json();
      await route.fulfill({ response: r, json: { ...moi, limites: { ...moi.limites, contenuSection: 8 } } });
    });
    const d = await ouvrir(page);
    await d.getByLabel('Titre', { exact: true }).fill('Limite annoncée');
    await d.getByLabel('Texte').fill('123456789');
    await d.getByText('9 / 8', { exact: true }).waitFor();
    await d.getByRole('button', { name: 'Créer', exact: true }).click();
    await d.getByText('Erreur : 8 caractères au plus.', { exact: true }).waitFor();
    assert.equal(await d.getByLabel('Texte').inputValue(), '123456789');
  } finally { await ctx.close(); }
});
