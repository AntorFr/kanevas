// ecrans: cartes
// Browser test of kanevas-carte-spatiale-carte-panneau (E-23, the panel of a body and its illustration window), written from the exit criterion.
// The illustration route is intercepted for the error cases (the effect of the route itself has its door: src/outils/swn/illustration-routes.test.ts).
// Screenshots go to /tmp/cap-carte-panneau (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-panneau';
const O = { q: 60, r: 61 };
const TYPES: [string, string, string][] = [
  ['soleil', 'etoile', 'jaune'], ['alpha', 'planete', 'tellurique'], ['beta', 'planete', 'gazeuse'], ['gamma', 'planete', 'glace'],
  ['delta', 'planete', 'lave'], ['eps', 'planete', 'rocheux'], ['anomalie', 'planete', 'anomalie'], ['comete', 'comete', 'comete'],
];

describe('E-23 le panneau d’un corps', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const adr = (suffixe = '') => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}${suffixe}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const ouvrir = async (compte: string, largeur: number, hauteur: number, url = adr(), avant?: (p: Any) => Promise<void>) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    if (avant) await avant(c.page);
    await c.page.goto(url);
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    return c;
  };
  const ligne = (page: Any, nom: string) => page.locator('.gx-lignes li', { hasText: nom }).getByRole('button');
  const panneau = (page: Any) => page.getByRole('region', { name: 'Corps sélectionné' });

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-panneau-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
    const db = new Database(dbPath);
    try {
      const centre = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',0,0)")
        .run(gid, univers, 'pn-centre', 'Centre-panneau', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      TYPES.forEach(([cle, genre, type], i) => ast.run(centre, cle, genre, null, 0, type, cle === 'gamma' ? null : `Corps-${cle}`, cle === 'soleil' ? 0 : i, cle === 'alpha' ? 7 : i + 1, 0.3));
      // Alpha: « Orbite 1 · 7 h ». Gamma: no name.
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  for (const [l, h] of [[1280, 800], [390, 780]] as const) {
    it(`${l} px : un corps sélectionné ouvre son panneau (nom, type, lieu, hexagone) ; le ciel vide le ferme`, async () => {
      const { page, ctx } = await ouvrir('Léa', l, h);
      assert.equal(await panneau(page).count(), 0, 'pas de panneau sans sélection');
      await page.locator('.cs-corps[data-cle="alpha"]').click();
      const p = panneau(page);
      await p.waitFor();
      assert.equal(await p.getByRole('heading', { name: 'Corps-alpha' }).count(), 1);
      const texte = await p.innerText();
      assert.match(texte, /Tellurique/);
      assert.match(texte, /Orbite 1 · 7 h/);
      assert.match(texte, new RegExp(`Hexagone ${O.q}, ${O.r}`));
      // « Voir l'illustration » only: no GM action
      for (const m of ['Déplacer', 'Modifier', 'Lier', 'Illustrer la fiche', 'Retirer']) assert.equal(await p.getByRole('button', { name: new RegExp(m) }).count(), 0, m);
      if (l === 390) {
        const bc = await page.locator('.cs-ciel').boundingBox();
        const bp = await p.boundingBox();
        assert.ok(bp.y >= bc.y + bc.height - 1, 'à 390 px le panneau est sous la carte');
      } else {
        const bc = await page.locator('.cs-ciel').boundingBox();
        const bp = await p.boundingBox();
        assert.ok(bp.x >= bc.x + bc.width - 1, 'au bureau le panneau est à droite');
      }
      // the sharp version arrives
      await page.waitForFunction(() => document.querySelector('.cs-panneau .cs-net.pret') !== null, undefined, { timeout: 30000 });
      await hors(page, `${l}-panneau`);
      const b = await page.locator('.cs-ciel').boundingBox();
      await page.mouse.click(b.x + 8, b.y + 8);
      await page.waitForFunction(() => document.querySelector('.cs-panneau') === null);
      await ctx.close();
    });
  }

  it('un astre sans nom lit « Astre sans nom »', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await ligne(page, 'Astre sans nom').click();
    await panneau(page).getByRole('heading', { name: 'Astre sans nom' }).waitFor();
    await ctx.close();
  });

  it('le MJ lit le panneau de la joueuse et seulement trois gestes d’écriture de plus (E-23 édition)', async () => {
    const lus: string[] = [];
    for (const compte of ['Léa', 'Antor']) {
      const { page, ctx } = await ouvrir(compte, 1280, 800);
      await ligne(page, 'Corps-alpha').click();
      await panneau(page).waitFor();
      lus.push(await panneau(page).innerText());
      await ctx.close();
    }
    // a fourth gesture since E-23 lien: « Lier à une fiche… » (the title keeps its inventory line)
    assert.equal(lus[1], `${lus[0]}\nDéplacer\nModifier…\nLier à une fiche…\nRetirer l’astre`);
  });

  it('cœur indisponible : une ligne de liste ouvre le panneau', async () => {
    const { page, ctx } = await ouvrir('Léa', 390, 780, adr(), async (p) => { await p.route('**/*.wasm', (r: Any) => r.abort()); });
    await ligne(page, 'Corps-beta').click();
    const p = panneau(page);
    await p.waitFor();
    assert.match(await p.innerText(), /Gazeuse/);
    await hors(page, '390-coeur-indisponible-panneau');
    await ctx.close();
  });

  it('route d’illustration en erreur : « Illustration indisponible. » et « Réessayer » relance la requête', async () => {
    let tentatives = 0;
    let panne = true;
    const { page, ctx } = await ouvrir('Léa', 390, 780, adr(), async (p) => {
      await p.route('**/astres/alpha/illustration*', (r: Any) => { tentatives++; return panne ? r.fulfill({ status: 500, body: 'x' }) : r.continue(); });
    });
    await page.locator('.cs-corps[data-cle="alpha"]').click();
    const p = panneau(page);
    await p.getByText('Illustration indisponible.').waitFor();
    assert.equal(await p.locator('.cs-net').count(), 0, 'pas d’image nette');
    await hors(page, '390-panneau-indisponible');
    const avant = tentatives;
    panne = false;
    await p.getByRole('button', { name: 'Réessayer' }).click();
    await page.waitForFunction(() => document.querySelector('.cs-panneau .cs-net.pret') !== null);
    assert.ok(tentatives > avant, 'une nouvelle requête est partie');
    assert.equal(await p.getByText('Illustration indisponible.').count(), 0);
    await ctx.close();
  });

  it('« Voir l’illustration » : fenêtre sur le flou, « Chargement de l’illustration… », puis l’image nette ; Esc ferme et rend le focus', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800, adr(), async (p) => {
      await p.route('**/astres/alpha/illustration*', async (r: Any) => {
        if (!r.request().url().includes('cote=512')) await new Promise((ok) => setTimeout(ok, 1200));
        await r.continue();
      });
    });
    await page.locator('.cs-corps[data-cle="alpha"]').click();
    const bouton = panneau(page).getByRole('button', { name: 'Voir l’illustration' });
    await bouton.focus();
    await bouton.click();
    const f = page.getByRole('dialog');
    await f.getByText('Chargement de l’illustration…').waitFor();
    assert.equal(await f.locator('.cs-flou').count(), 1, 'la version floue est dans la fenêtre');
    await hors(page, '1280-fenetre-chargement');
    await f.locator('.cs-net.pret').waitFor({ timeout: 30000 });
    assert.equal(await f.getByText('Chargement de l’illustration…').count(), 0);
    const cote = await f.locator('.cs-net').evaluate((i: Any) => i.naturalWidth);
    assert.ok(cote > 512 || cote === 512, `image nette servie (${cote} px)`);
    await hors(page, '1280-fenetre-nette');
    await page.keyboard.press('Escape');
    await f.waitFor({ state: 'detached' });
    assert.equal(await bouton.evaluate((e: Any) => e === document.activeElement), true, 'le focus revient au bouton');
    await ctx.close();
  });

  it('fenêtre : route en erreur → « Illustration indisponible. », « Réessayer », « Fermer »', async () => {
    let panne = true;
    const { page, ctx } = await ouvrir('Léa', 390, 780, adr(), async (p) => {
      await p.route('**/astres/alpha/illustration*', (r: Any) => (!r.request().url().includes('cote=512') && panne ? r.fulfill({ status: 500, body: 'x' }) : r.continue()));
    });
    await page.locator('.cs-corps[data-cle="alpha"]').click();
    await panneau(page).getByRole('button', { name: 'Voir l’illustration' }).click();
    const f = page.getByRole('dialog');
    await f.getByText('Illustration indisponible.').waitFor();
    await f.getByRole('button', { name: 'Fermer' }).waitFor();
    await hors(page, '390-fenetre-indisponible');
    panne = false;
    await f.getByRole('button', { name: 'Réessayer' }).click();
    await f.locator('.cs-net.pret').waitFor({ timeout: 30000 });
    await f.getByRole('button', { name: 'Fermer' }).click();
    await f.waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('fenêtre : une route qui répond introuvable → « Page introuvable. »', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800, adr(), async (p) => {
      await p.route('**/astres/alpha/illustration*', (r: Any) => (!r.request().url().includes('cote=512') ? r.fulfill({ status: 404, body: '{}' }) : r.continue()));
    });
    await page.locator('.cs-corps[data-cle="alpha"]').click();
    await panneau(page).getByRole('button', { name: 'Voir l’illustration' }).click();
    const f = page.getByRole('dialog');
    await f.getByText('Page introuvable.').waitFor();
    assert.equal(await f.getByText('Illustration indisponible.').count(), 0);
    await f.getByRole('button', { name: 'Fermer' }).click();
    await f.waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('captures de recette : chaque famille de corps, chaque thème, 1280 et 390 px', async () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const [l, h] of [[1280, 800], [390, 780]] as const) {
        const { page, ctx } = await ouvrir('Léa', l, h);
        await page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
        for (const [cle] of TYPES) {
          await page.locator(`.cs-corps[data-cle="${cle}"]`).click();
          await page.waitForFunction(() => document.querySelector('.cs-panneau .cs-net.pret') !== null, undefined, { timeout: 30000 });
          await hors(page, `${l}-${theme}-${cle}`);
        }
        await ctx.close();
      }
    }
  });
});
