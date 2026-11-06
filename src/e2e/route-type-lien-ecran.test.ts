// Browser test of kanevas-outils-format-evolue-routes (B-81, E-21), written from the exit criterion — not from the code.
// Stub world with the seed. Screenshots go to /tmp/cap-route-type-lien (never into the workspace).
// Waits are on what the user sees (or on the answer to the gesture), never on `networkidle` nor on a delay.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-route-type-lien';
mkdirSync(SHOTS, { recursive: true });

describe('E-21 : le type de lien d’une route', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let adresse = '';
  let base = '';
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const section = (page: Any, nom: string) => page.getByRole('region', { name: nom });
  const ouvre = async (compte: string, w: number, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    await c.page.goto(adresse);
    await systeme(c.page, 'Vael').waitFor();
    return c;
  };

  // The route is traced between a fresh system (placed through the API, one per scenario) and Vael of the seed.
  const nouveauSysteme = async (nom: string, q: number, r: number) => {
    const c = await connecte(browser, srv.base, 'Antor');
    const res = await c.page.request.post(`${base}/systemes`, { data: { nom, q, r } });
    assert.equal(res.status(), 201, await res.text());
    await c.ctx.close();
  };
  const commande = async (page: Any, nom: string) => {
    const direct = page.getByRole('button', { name: nom, exact: true });
    if (await direct.count()) return direct.click();
    await page.getByRole('button', { name: 'Modifier la carte' }).click();
    await page.getByRole('menuitem', { name: nom }).click();
  };
  // The labels fold away with the system names while the map is zoomed out (E-21): zoom until they are drawn.
  const zoomer = async (page: Any, etiquette: Any) => {
    const plus = page.getByRole('button', { name: 'Zoom avant' });
    for (let i = 0; i < 6 && (await etiquette.count()) === 0 && (await plus.getAttribute('aria-disabled')) !== 'true'; i++) await plus.click();
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(mkdtempSync(join(tmpdir(), 'kanevas-rtl-')), 'k.db') });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    const univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    base = `/api/univers/${univers}/outils/swn/galaxie/galaxies/${adresse.split('/').pop()}`;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  for (const largeur of [1280, 390]) {
    it(`${largeur} px : Antor trace Havre — Vael en « Pirate » ; étiquette sur la carte, « Type : Pirate » dans le panneau ; Léa la voit publique, plus rien privée`, async () => {
      // each width on its own route: the pair is unique, so the first one is removed before the second pass
      const nom = `Havre ${largeur}`;
      await nouveauSysteme(nom, largeur === 1280 ? 3 : 4, largeur === 1280 ? 2 : 1);
      const { page, ctx } = await ouvre('Antor', largeur);
      await systeme(page, nom).waitFor();
      await hors(page, `${largeur}-01-carte`);
      await commande(page, 'Tracer une route');
      await systeme(page, nom).click();
      await systeme(page, 'Vael').click();
      const form = section(page, 'Nouvelle route');
      await form.getByText(`De ${nom} à Vael`).waitFor();
      const champ = form.getByLabel('Type de lien (facultatif)');
      await champ.waitFor();
      await champ.fill('Pirate');
      await hors(page, `${largeur}-02-formulaire`);
      const [rep] = await Promise.all([
        page.waitForResponse((r: Any) => r.url().endsWith('/routes') && r.request().method() === 'POST'),
        form.getByRole('button', { name: 'Tracer', exact: true }).click(),
      ]);
      assert.equal(rep.status(), 201);
      const rid = (await rep.json()).id as number;
      await form.waitFor({ state: 'detached' });
      const etiquette = page.locator(`g[data-route="${rid}"] text`, { hasText: 'Pirate' });
      await zoomer(page, etiquette);
      await etiquette.waitFor();
      await hors(page, `${largeur}-03-etiquette`);

      // the panel of the route
      await page.locator(`g[data-route="${rid}"] line.gx-route-touche`).dispatchEvent('click');
      await page.getByText('Type : Pirate').waitFor();
      await hors(page, `${largeur}-04-panneau`);

      // Léa, route publique: the label is on her map, from the same blocks
      const lea = await ouvre('Léa', largeur);
      await lea.page.locator(`g[data-route="${rid}"] text`, { hasText: 'Pirate' }).waitFor();
      await hors(lea.page, `${largeur}-05-lea-publique`);

      // Antor makes it private (form of the panel): the type stays on his side
      const modifier = page.getByRole('button', { name: 'Modifier', exact: true });
      await modifier.click();
      const fm = page.getByRole('form', { name: 'Modifier la route' });
      assert.equal(await fm.getByLabel('Type de lien (facultatif)').inputValue(), 'Pirate', 'le formulaire reprend le type');
      await fm.getByRole('switch', { name: 'Route publique' }).click();
      await hors(page, `${largeur}-06-modifier`);
      await Promise.all([
        page.waitForResponse((r: Any) => r.url().endsWith(`/routes/${rid}`) && r.request().method() === 'PATCH'),
        fm.getByRole('button', { name: 'Enregistrer' }).click(),
      ]);
      await page.locator(`g[data-route="${rid}"].privee text`, { hasText: 'Pirate' }).waitFor();
      const privee = await (await page.request.get(`${base}/blocs?de=-2,-2&a=9,9`)).json();
      assert.equal(privee.routes.find((r: Any) => r.id === rid).type_lien, 'Pirate');

      // Léa reloads: neither the route nor the type
      await lea.page.reload();
      await systeme(lea.page, 'Vael').waitFor();
      assert.equal(await lea.page.locator(`g[data-route="${rid}"]`).count(), 0);
      assert.equal(await lea.page.getByText('Pirate').count(), 0);
      await hors(lea.page, `${largeur}-07-lea-privee`);
      await lea.ctx.close();

      // clean up for the next width
      const r = await page.request.fetch(`${base}/routes/${rid}?version=${(await (await page.request.get(`${base}/blocs?de=-2,-2&a=9,9`)).json()).routes.find((x: Any) => x.id === rid).version}`, { method: 'DELETE' });
      assert.equal(r.status(), 204);
      await ctx.close();
    });
  }

  it('formulaire : 41 caractères arrêtés dans le champ, rien envoyé ; champ blanc = aucun type', async () => {
    await nouveauSysteme('Havre bis', 2, 3);
    const { page, ctx } = await ouvre('Antor', 1280);
    await page.getByRole('button', { name: 'Tracer une route' }).click();
    await systeme(page, 'Havre bis').click();
    await systeme(page, 'Vael').click();
    const form = section(page, 'Nouvelle route');
    const champ = form.getByLabel('Type de lien (facultatif)');
    await champ.fill('x'.repeat(41));
    await form.getByText('Le type de lien fait 1 à 40 caractères.').waitFor();
    await hors(page, 'form-41');
    let envoye = false;
    page.on('request', (r: Any) => { if (r.url().endsWith('/routes') && r.method() === 'POST') envoye = true; });
    await form.getByRole('button', { name: 'Tracer', exact: true }).click();
    assert.equal(envoye, false, 'rien n’est envoyé');
    await champ.fill('   ');
    await form.getByText('Le type de lien fait 1 à 40 caractères.').waitFor({ state: 'detached' });
    const [rep] = await Promise.all([
      page.waitForResponse((r: Any) => r.url().endsWith('/routes') && r.request().method() === 'POST'),
      form.getByRole('button', { name: 'Tracer', exact: true }).click(),
    ]);
    assert.equal(rep.status(), 201);
    assert.equal(Object.hasOwn(await rep.json(), 'type_lien'), false);
    await ctx.close();
  });
});
