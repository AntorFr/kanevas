// ecrans: outil
// The galaxy map draws its stars by class and size and opens on the known zone (kanevas-carte-rendu-galaxie-systemes-carte,
// AD-galaxie-systemes-3 and 4, E-21). Real server in stub mode (the stub's starting world: Port-Sel (0,0), Vael (7,0), Hesper (1,5),
// « Station fantôme » secret), real SQLite, real Chromium. The pure rules (radius, framing, names) are proved in
// `carte-rendu-pures.test.ts`; the screen keeps what is seen: the opening view, two systems that differ, both themes, 390 px, the empty sky.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-rendu-carte';
mkdirSync(SHOTS, { recursive: true });

describe('E-21 la carte de la galaxie : étoiles par classe et taille, ouverture sur la zone connue', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let dbPath = '';
  let adresse = '';
  const sql = (fn: (db: Any) => void) => { const db = new Database(dbPath); try { fn(db); } finally { db.close(); } };
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);

  const ouvre = async (compte: string, schema: 'light' | 'dark', largeur: number) => {
    const a = await connecte(browser, srv.base, compte);
    const ctx = await browser.newContext({ storageState: await a.ctx.storageState(), colorScheme: schema, baseURL: srv.base, viewport: { width: largeur, height: 900 } });
    await a.ctx.close();
    const page = await ctx.newPage();
    await page.goto(adresse);
    return { page, ctx };
  };
  /** The disc of a system: radius (user units) and fill. */
  const disque = (page: Any, nom: string) => systeme(page, nom).locator('.gx-point').evaluate((c: Element) => ({ r: Number(c.getAttribute('r')), fond: getComputedStyle(c).fill, classe: c.getAttribute('data-classe') }));
  const dansLaCarte = async (page: Any, nom: string) => {
    const [c, p] = await Promise.all([page.locator('.gx-carte').boundingBox(), systeme(page, nom).locator('.gx-point').boundingBox()]);
    return p.x >= c.x && p.y >= c.y && p.x + p.width <= c.x + c.width && p.y + p.height <= c.y + c.height;
  };

  before(async () => {
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-gxr-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    const E = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${E}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    await a.ctx.close();
    // two defined systems that differ: Vael large with a free colour, Port-Sel small with none (its class is drawn from its key)
    sql((db) => {
      db.prepare("UPDATE swn_systemes SET taille = 1, couleur = '#d8352a', classe = NULL WHERE cle = 'vael'").run();
      db.prepare("UPDATE swn_systemes SET taille = 0, couleur = NULL, classe = NULL WHERE cle = 'port-sel'").run();
    });
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  const ouverture = async (schema: 'light' | 'dark') => {
    {
      const { page, ctx } = await ouvre('Antor', schema, 1280);
      await systeme(page, 'Vael').waitFor();
      await page.locator('circle.gx-genere').first().waitFor();
      for (const nom of ['Port-Sel', 'Vael', 'Hesper', 'Station fantôme']) assert.equal(await dansLaCarte(page, nom), true, `${nom} est dans le cadre à l'ouverture`);
      for (const nom of ['Port-Sel', 'Vael', 'Hesper']) assert.equal(await systeme(page, nom).locator('text', { hasText: nom }).count(), 1, `le nom de ${nom} est écrit`);
      const [vael, port] = [await disque(page, 'Vael'), await disque(page, 'Port-Sel')];
      assert.ok(vael.r > port.r, `Vael (taille 1) est plus grand que Port-Sel (taille 0) : ${vael.r} / ${port.r}`);
      assert.equal(vael.r, 12);
      assert.equal(port.r, 3);
      assert.equal(vael.fond, 'rgb(216, 53, 42)', 'la couleur libre gagne');
      assert.notEqual(port.fond, vael.fond);
      assert.match(port.classe ?? '', /^[MKGFAB]$/, 'la classe de Port-Sel est tirée de sa clé');
      // the drawn stars carry their class colour: not all one fill
      const fonds = await page.locator('circle.gx-genere').evaluateAll((cs: Element[]) => new Set(cs.map((c) => getComputedStyle(c).fill)).size);
      assert.ok(fonds >= 2, `les étoiles tirées ne sont pas toutes de la même couleur (${fonds})`);
      const rayons = await page.locator('circle.gx-genere').evaluateAll((cs: Element[]) => new Set(cs.map((c) => c.getAttribute('r'))).size);
      assert.ok(rayons >= 2, 'les étoiles tirées ne sont pas toutes de la même taille');
      const fondCarte = await page.locator('.gx-carte').evaluate((e: Element) => getComputedStyle(e).backgroundColor);
      if (schema === 'light') assert.notEqual(fondCarte, 'rgb(255, 255, 255)', 'plus de carte blanche en thème clair');
      else assert.notEqual(fondCarte, 'rgb(255, 255, 255)');
      const luminance = (rgb: string) => { const [r, g, b] = rgb.match(/\d+/g)!.map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      if (schema === 'dark') assert.ok(luminance(fondCarte) < 100, `fond sombre en thème sombre : ${fondCarte}`);
      assert.equal(await page.getByText('Le ciel est vide ici.').count(), 0);
      await page.screenshot({ path: `${SHOTS}/1280-${schema}.png`, fullPage: true });
      await ctx.close();
    }
  };
  it("light : la carte s'ouvre sur toute la zone connue avec les noms ; deux systèmes définis diffèrent par la taille et la couleur ; le fond suit le thème", () => ouverture('light'));
  it("dark : la carte s'ouvre sur toute la zone connue avec les noms ; deux systèmes définis diffèrent par la taille et la couleur ; le fond suit le thème", () => ouverture('dark'));

  it('à 390 px : Léa voit toute la zone qu\'elle lit dans le cadre, sans débordement, et aucune trace de la station secrète', async () => {
    const { page, ctx } = await ouvre('Léa', 'light', 390);
    await systeme(page, 'Vael').waitFor();
    for (const nom of ['Port-Sel', 'Vael', 'Hesper']) assert.equal(await dansLaCarte(page, nom), true, `${nom} est dans le cadre à 390 px`);
    assert.equal(await systeme(page, 'Station fantôme').count(), 0);
    assert.equal(await page.getByText('Station fantôme').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'aucun débordement horizontal');
    assert.equal((await disque(page, 'Vael')).r, 12);
    await page.screenshot({ path: `${SHOTS}/390-lea.png`, fullPage: true });
    await ctx.close();
  });

  it('une galaxie sans système lu ni étoile affiche « Le ciel est vide ici. » au lieu de la grille', async () => {
    const vide = join(mkdtempSync(join(tmpdir(), 'kanevas-gxr-vide-')), 'k.db');
    const srv2 = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: vide });
    try {
      const a = await connecte(browser, srv2.base, 'Antor');
      const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
      const E = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
      const cartes = (await (await a.page.request.get(`/api/univers/${E}/cartes`)).json()) as Any;
      const ad = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
      const db = new Database(vide);
      try {
        db.pragma('foreign_keys = OFF');
        db.prepare('DELETE FROM swn_routes').run();
        db.prepare('DELETE FROM swn_zones').run();
        db.prepare('DELETE FROM swn_systemes').run();
        db.prepare('UPDATE swn_galaxies SET densite_defaut = 0').run();
      } finally { db.close(); }
      const page = await a.ctx.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(ad);
      await page.getByText('Le ciel est vide ici.').waitFor();
      assert.equal(await page.locator('g.gx-systeme').count(), 0);
      assert.equal(await page.locator('circle.gx-genere').count(), 0);
      assert.equal(await page.locator('rect.gx-zone-connue').count(), 0, 'pas de grille sur un ciel vide');
      await page.screenshot({ path: `${SHOTS}/ciel-vide.png`, fullPage: true });
      await a.ctx.close();
    } finally { srv2.stop(); }
  });
});
