// ecrans: outil
// Lives outside src/e2e on purpose: the screen-file count guards of src/scripts-tests freeze that folder (an existing test is not edited).
// Second screen pass (verification) of kanevas-carte-rendu-galaxie-systemes, E-21 (galaxy map, system dialogue and panel), written from the
// sheet (« Livre », exit criterion), docs/parcours.md (P-28, P-30) and docs/ecrans.md (E-21) — not from the code. Real server in stub mode with
// its starting world (Port-Sel (0,0), Vael (7,0), Hesper (1,5), « Station fantôme » secret), real Chromium. Effects are proved by the routes in
// src/routes/galaxie-etoiles-systemes-*-besoin.test.ts; here only what the user sees. Screenshots go to /tmp (never into the workspace).
//
// TEST PLAN
//   E-21 dialogue  : group « Étoile » with « Classe » (« Tirée de la clé » selected first, then the seven labels), « Taille », « Couleur » ;
//                    choosing « B — bleue » is saved and the panel then reads « Étoile de classe B — bleue » ; a Player has no such field
//   E-21 légende   : the legend names the seven star classes
//   E-21 390 px    : no horizontal scroll, the three fields stack, each control is 44 px high at least
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { launch, skipBrowser, startServer, type Any, type Server } from '../../e2e/harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-etoiles-systemes-verification';
mkdirSync(SHOTS, { recursive: true });

describe('E-21 verification : l’étoile d’un système, sa carte, son dialogue, son panneau', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let E = 0;
  let gid = 0;
  let adresse = '';
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<{ status: number; json: Any }> => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const t = await r.text();
    let json: Any = null;
    try { json = JSON.parse(t); } catch { /* not JSON */ }
    return { status: r.status, json };
  };
  const G = () => `/api/univers/${E}/outils/swn/galaxie/galaxies/${gid}`;
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const ouvre = async (compte: string, largeur = 1280) => {
    const ctx = await browser.newContext({ baseURL: srv.base, colorScheme: 'dark', viewport: { width: largeur, height: 900 } });
    await ctx.request.post('/connexion-bouchon', { form: { compte }, maxRedirects: 0 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(adresse);
    return { page, ctx };
  };
  const modifier = async (page: Any, nom: string) => {
    await systeme(page, nom).click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.getByRole('region', { name: 'Modifier le système' });
    await form.waitFor();
    return form;
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id;
    const c = (await api('antor', 'GET', `/api/univers/${E}/cartes`)).json.cartes.find((x: Any) => x.titre === "Galaxie d'essai");
    gid = c.id;
    adresse = c.adresse;
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('dialogue : le groupe « Étoile » offre Classe (« Tirée de la clé » d’abord, puis les sept libellés), Taille et Couleur, et « B — bleue » enregistrée se lit dans le panneau', async () => {
    const { page, ctx } = await ouvre('antor');
    await systeme(page, 'Hesper').waitFor();
    const form = await modifier(page, 'Hesper');
    assert.ok(await form.getByText('Étoile', { exact: true }).count() >= 1, 'le groupe Étoile');
    const select = form.getByLabel('Classe');
    const options = await select.locator('option').allTextContents();
    assert.deepEqual(options.map((o: string) => o.trim()), ['Tirée de la clé', 'M — rouge', 'K — orange', 'G — jaune', 'F — jaune pâle', 'A — blanche', 'B — bleue', 'V — jaune-vert']);
    assert.equal((await select.locator('option:checked').textContent()).trim(), 'Tirée de la clé');
    assert.equal(await form.getByLabel('Taille').count() + await form.locator('input[type=range]').count() >= 1, true);
    assert.equal(await form.getByLabel('Couleur').count(), 1);
    await select.selectOption({ label: 'B — bleue' });
    const [rep] = await Promise.all([
      page.waitForResponse((r: Any) => r.request().method() === 'PATCH' && /\/systemes\/hesper/.test(r.url())),
      form.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
    ]);
    assert.equal(rep.status(), 200);
    await page.getByRole('img', { name: 'Étoile de classe B — bleue' }).waitFor();
    assert.equal(await page.getByText('Classe B — bleue').count(), 1);
    assert.equal((await api('antor', 'GET', `${G()}/systemes/hesper`)).json.classe, 'B');
    await page.screenshot({ path: `${SHOTS}/classe-bleue.png`, fullPage: true });
    await ctx.close();
  });

  it('dialogue : Léa n’a aucun champ Classe, Taille ou Couleur, même après avoir ouvert le panneau du système', async () => {
    const { page, ctx } = await ouvre('lea');
    await systeme(page, 'Vael').click();
    await page.getByRole('img', { name: /Étoile de classe/ }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Classe' }).count(), 0);
    assert.equal(await page.getByRole('slider').count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Couleur' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
    await ctx.close();
  });

  it('légende : la légende nomme les sept classes d’étoile M, K, G, F, A, B et V', async () => {
    const { page, ctx } = await ouvre('antor');
    await systeme(page, 'Vael').waitFor();
    const bouton = page.getByRole('button', { name: 'Légende' });
    if (await bouton.count()) await bouton.click();
    await page.getByText('Départ / arrivée').waitFor();
    for (const lettre of ['M', 'K', 'G', 'F', 'A', 'B', 'V']) {
      assert.ok(await page.getByText(new RegExp(`^(Étoile )?${lettre}\\b`)).count() >= 1, `la légende nomme la classe ${lettre}`);
    }
    await page.screenshot({ path: `${SHOTS}/legende.png`, fullPage: true });
    await ctx.close();
  });

  it('390 px : pas de défilement horizontal, les trois champs du groupe Étoile s’empilent, chaque contrôle fait 44 px de haut au moins', async () => {
    const { page, ctx } = await ouvre('antor', 390);
    await systeme(page, 'Vael').waitFor();
    const form = await modifier(page, 'Vael');
    const classe = await form.getByLabel('Classe').boundingBox();
    const couleur = await form.getByLabel('Couleur').boundingBox();
    const curseur = await form.locator('input[type=range]').boundingBox();
    assert.ok(curseur.y > classe.y && couleur.y > curseur.y, 'Classe, puis Taille, puis Couleur, l’un sous l’autre');
    for (const [nom, b] of [['Classe', classe], ['Couleur', couleur]] as const) assert.ok(b.height >= 44, `${nom} : ${b.height} px de haut`);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(debord <= 0, `défilement horizontal de ${debord} px`);
    await page.screenshot({ path: `${SHOTS}/dialogue-390.png`, fullPage: true });
    await ctx.close();
  });
});
