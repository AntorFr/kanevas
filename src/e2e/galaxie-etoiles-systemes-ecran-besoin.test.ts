// ecrans: outil
// Screen tests (E-21, the galaxy map and the system dialogue / panel) of the feature kanevas-carte-rendu-galaxie-systemes, written from its
// sheet (« Livre », exit criterion), docs/parcours.md (P-28, P-30) and docs/ecrans.md (E-21) — not from the code. Real server in stub mode WITH
// its starting world (Port-Sel (0,0), Vael (7,0), Hesper (1,5), « Station fantôme » secret), real Chromium. The effects of the routes are proved
// in galaxie-etoiles-systemes-ensemble-besoin.test.ts; here only what the user sees and the seam between the dialogue and its route.
//
// TEST PLAN
//   E-21 ouverture : the three readable systems sit inside the map with their names, two of them differ by size or colour, dark and light theme
//                    (the light map is not white), the secret system is nowhere for Léa
//   E-21 dialogue  : a free colour typed in the dialogue tints the star of the map, is stored, and « Effacer la couleur » returns the class colour;
//                    the slider at its maximum stores the largest size (1); « violet » is refused under its field and nothing is saved
//   E-21 panneau   : Léa reads « Étoile de classe G — jaune » for a system of class G and has no field and no « Modifier »
//   E-21 vide      : a galaxy without any system or drawn star says « Le ciel est vide ici. » ; the seeded galaxy does not
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const SHOTS = '/tmp/cap-galaxie-etoiles-systemes-besoin';
mkdirSync(SHOTS, { recursive: true });

describe('E-21 la galaxie dessine ses étoiles par classe et par taille, le dialogue règle l’étoile d’un système', { skip: skipBrowser, timeout: 900000 }, () => {
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
  const disque = (page: Any, nom: string) => systeme(page, nom).locator('.gx-point').evaluate((c: Element) => ({ r: Number(c.getAttribute('r')), fond: getComputedStyle(c).fill }));
  const fondAtteint = async (page: Any, nom: string, attendu: string) => {
    await page.waitForFunction(([n, f]: string[]) => {
      const c = document.querySelector(`g.gx-systeme[aria-label="${n}"] .gx-point`);
      return c !== null && getComputedStyle(c).fill === f;
    }, [nom, attendu], { timeout: 15000 });
  };

  const ouvre = async (compte: string, opts: { schema?: 'light' | 'dark'; largeur?: number; url?: string } = {}) => {
    const ctx = await browser.newContext({ baseURL: srv.base, colorScheme: opts.schema ?? 'dark', viewport: { width: opts.largeur ?? 1280, height: 900 } });
    await ctx.request.post('/connexion-bouchon', { form: { compte }, maxRedirects: 0 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(opts.url ?? adresse);
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

  for (const schema of ['dark', 'light'] as const) {
    it(`ouverture (${schema}) : Antor voit Port-Sel, Vael et Hesper dans la carte avec leurs noms, deux d’entre eux diffèrent par la taille ou la couleur`, async () => {
      const { page, ctx } = await ouvre('antor', { schema });
      for (const nom of ['Port-Sel', 'Vael', 'Hesper']) await systeme(page, nom).waitFor();
      const carte = await page.locator('svg').filter({ has: page.locator('g.gx-systeme') }).first().boundingBox();
      for (const nom of ['Port-Sel', 'Vael', 'Hesper']) {
        const b = await systeme(page, nom).locator('.gx-point').boundingBox();
        assert.ok(b.x >= carte.x && b.y >= carte.y && b.x + b.width <= carte.x + carte.width && b.y + b.height <= carte.y + carte.height, `${nom} est dans la carte`);
        assert.ok(await systeme(page, nom).locator('text', { hasText: nom }).count() >= 1, `le nom ${nom} est écrit sur la carte`);
      }
      const [a, b] = [await disque(page, 'Port-Sel'), await disque(page, 'Vael')];
      assert.ok(a.r !== b.r || a.fond !== b.fond, `deux systèmes définis diffèrent : ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
      const fondCarte = await page.locator('svg').filter({ has: page.locator('g.gx-systeme') }).first().evaluate((e: Element) => {
        let n: Element | null = e;
        while (n) { const c = getComputedStyle(n).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; n = n.parentElement; }
        return 'rgba(0, 0, 0, 0)';
      });
      if (schema === 'light') assert.notEqual(fondCarte, 'rgb(255, 255, 255)', 'la carte n’est plus blanche en thème clair');
      await page.screenshot({ path: `${SHOTS}/ouverture-${schema}.png`, fullPage: true });
      await ctx.close();
    });
  }

  it('ouverture : le ciel de la galaxie d’essai n’est pas déclaré vide et Léa ne voit pas la Station fantôme', async () => {
    const { page, ctx } = await ouvre('lea');
    await systeme(page, 'Vael').waitFor();
    assert.equal(await page.getByText('Le ciel est vide ici.').count(), 0);
    assert.equal(await page.getByText('Station fantôme').count(), 0);
    assert.equal(await page.locator('g.gx-systeme[aria-label="Station fantôme"]').count(), 0);
    await ctx.close();
  });

  it('dialogue : une couleur libre posée teinte l’étoile de la carte, est enregistrée, et « Effacer la couleur » rend l’étoile à sa classe', async () => {
    const { page, ctx } = await ouvre('antor');
    await systeme(page, 'Vael').waitFor();
    let form = await modifier(page, 'Vael');
    await form.getByLabel('Couleur').fill('#d8352a');
    const [rep] = await Promise.all([
      page.waitForResponse((r: Any) => r.request().method() === 'PATCH' && /\/systemes\/vael/.test(r.url())),
      form.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
    ]);
    assert.equal(rep.status(), 200);
    await fondAtteint(page, 'Vael', 'rgb(216, 53, 42)');
    assert.equal((await api('antor', 'GET', `${G()}/systemes/vael`)).json.couleur, '#d8352a');
    await page.screenshot({ path: `${SHOTS}/couleur-libre.png`, fullPage: true });
    form = await modifier(page, 'Vael');
    assert.equal(await form.getByLabel('Couleur').inputValue(), '#d8352a');
    await form.getByRole('button', { name: 'Effacer la couleur' }).click();
    const [rep2] = await Promise.all([
      page.waitForResponse((r: Any) => r.request().method() === 'PATCH' && /\/systemes\/vael/.test(r.url())),
      form.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
    ]);
    assert.equal(rep2.status(), 200);
    assert.equal((await api('antor', 'GET', `${G()}/systemes/vael`)).json.couleur ?? null, null);
    await ctx.close();
  });

  it('dialogue : le curseur de taille au maximum enregistre la taille 1, la plus grande, et à 0 la taille 0', async () => {
    const { page, ctx } = await ouvre('antor');
    await systeme(page, 'Hesper').waitFor();
    for (const t of ['1', '0']) {
      const form = await modifier(page, 'Hesper');
      await form.locator('input[type=range]').fill(t);
      const [rep] = await Promise.all([
        page.waitForResponse((r: Any) => r.request().method() === 'PATCH' && /\/systemes\/hesper/.test(r.url())),
        form.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
      ]);
      assert.equal(rep.status(), 200);
      const lue = (await api('antor', 'GET', `${G()}/systemes/hesper`)).json.taille as number;
      assert.ok(Math.abs(lue - Number(t)) < 0.001, `curseur à ${t} : taille enregistrée ${lue}`);
    }
    await ctx.close();
  });

  it('dialogue : une couleur « violet » est refusée sous le champ, le dialogue reste ouvert et rien n’est enregistré', async () => {
    const { page, ctx } = await ouvre('antor');
    await systeme(page, 'Port-Sel').waitFor();
    const avant = (await api('antor', 'GET', `${G()}/systemes/port-sel`)).json.couleur;
    const form = await modifier(page, 'Port-Sel');
    await form.getByLabel('Couleur').fill('violet');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await form.getByText(/Couleur invalide/).first().waitFor();
    assert.equal(await form.isVisible(), true);
    assert.equal((await api('antor', 'GET', `${G()}/systemes/port-sel`)).json.couleur, avant);
    await page.screenshot({ path: `${SHOTS}/couleur-violet.png`, fullPage: true });
    await ctx.close();
  });

  it('panneau : Léa lit « Étoile de classe G — jaune » d’un système de classe G, sans aucun champ ni « Modifier »', async () => {
    const lu = (await api('antor', 'GET', `${G()}/systemes/vael`)).json;
    const r = await api('antor', 'PATCH', `${G()}/systemes/vael`, { classe: 'G', version: lu.version });
    assert.equal(r.status, 200);
    const { page, ctx } = await ouvre('lea', { largeur: 1280 });
    await systeme(page, 'Vael').click();
    await page.getByRole('img', { name: 'Étoile de classe G — jaune' }).waitFor();
    assert.equal(await page.getByText('Classe G — jaune').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Modifier', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Couleur').count(), 0);
    assert.equal(await page.locator('input[type=range]').count(), 0);
    await page.screenshot({ path: `${SHOTS}/panneau-lea.png`, fullPage: true });
    await ctx.close();
  });

  it('vide : une galaxie sans aucun système ni étoile tirée affiche « Le ciel est vide ici. » et garde « Placer un système » au MJ', async () => {
    const cree = await api('antor', 'POST', `/api/univers/${E}/outils/swn/galaxie/galaxies`, { titre: 'Ciel désert' });
    assert.equal(cree.status, 201);
    const g = cree.json.id as number;
    // a zone of density 0 over the whole known neighbourhood: nothing is drawn
    const jeton = await srv.jetonOutils('antor', E, 'Script désert', ['swn/galaxie']);
    const z = await fetch(`${srv.base}/api/import/v1/univers/${E}/outils/swn/galaxie/galaxies/${g}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({ zones: [{ cle: 'desert', nom: 'Désert', contour: [[-400, -400], [400, -400], [400, 400], [-400, 400]], couleur: 'neutre', densite: 0 }] }),
    });
    assert.equal(z.status, 200, await z.text());
    const { page, ctx } = await ouvre('antor', { url: `/univers/${E}/outils/swn/galaxie/${g}` });
    await page.getByText('Le ciel est vide ici.').waitFor();
    assert.equal(await page.getByText('Le ciel est vide ici.').count(), 1);
    assert.ok((await page.getByRole('button', { name: 'Placer un système' }).count()) >= 1, 'Placer un système reste à portée du MJ');
    await page.screenshot({ path: `${SHOTS}/ciel-vide.png`, fullPage: true });
    await ctx.close();
  });
});
