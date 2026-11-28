// ecrans: cartes
// Whole-feature screen test of kanevas-carte-rendu-habillage-sorties (E-23, B-115, P-27), written from the sheet and
// docs/ecrans.md « Jump points and transition halo »: what the user sees on the map of a system. The effect (distance,
// type, silence for a hidden neighbour) is proved at the door in src/outils/swn/sorties-habillage-ensemble-besoin.test.ts.
// Neutral fixture. Expected colours are the values of the gardien's verdict (docs/charte.md), written as literals.
// Screenshots go to /tmp/cap-carte-sorties-ensemble (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-sorties-ensemble';
const A = { q: 60, r: 60 }; // pirate neighbour 3 cases east, a public one 1 case west, a Contrebande one, a route without type
const B = { q: 70, r: 70 }; // transition radius, every neighbour hidden for a Player
const D = { q: 90, r: 90 }; // distances 1 and 12, a name over 24 characters
const LONG = 'Alpha Beta Gamma Delta Epsilon Zeta';

describe('E-23 la carte montre la flèche, la distance et la couleur de chaque sortie, et le halo légendé', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  const adr = (p: { q: number; r: number }) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${p.q}/${p.r}`;
  const ouvrir = async (compte: string, p: { q: number; r: number }, largeur = 1280, hauteur = 800, theme = 'dark') => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    const sorties = c.page.waitForResponse((r: Any) => r.url().includes(`/interieur/${p.q}/${p.r}/sorties`) && r.request().method() === 'GET');
    await c.page.goto(adr(p));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await sorties;
    await c.page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
    return c;
  };
  const fleches = (page: Any) => page.locator('button[aria-label^="Aller au système"], [role="button"][aria-label^="Aller au système"], a[aria-label^="Aller au système"]');
  const couleur = (loc: Any) => loc.evaluate((e: HTMLElement) => getComputedStyle(e).color);

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-sorties-ens-')), 'k.db');
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
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, transition) VALUES (?,?,?,?,?,?,0.5,NULL,'',?,0,?)");
      const route = db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur, type_lien) VALUES (?,?,?,?,?,?,?)');
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const centre = (cle: string, nom: string, p: { q: number; r: number }, transition: number | null) => {
        const id = sys.run(gid, univers, cle, nom, p.q, p.r, 0, transition).lastInsertRowid as number;
        ast.run(id, 'etoile', 'etoile', null, 0, 'jaune', 'Étoile', 0, 0, 1);
        ast.run(id, 'p1', 'planete', null, 0, 'tellurique', 'Première', 1, 4, 0.3);
        return id;
      };
      const voisin = (cle: string, nom: string, q: number, r: number, secret = 0) => sys.run(gid, univers, cle, nom, q, r, secret, null).lastInsertRowid as number;
      const a0 = centre('ens-a', 'Centre A', A, 8);
      route.run(gid, univers, a0, voisin('ens-a-pir', 'Hesper', A.q + 1, A.r), 1, 3, 'Pirate');
      route.run(gid, univers, a0, voisin('ens-a-pub', 'Vael', A.q - 1, A.r), 1, 1, 'Publique');
      route.run(gid, univers, a0, voisin('ens-a-con', 'Orne', A.q, A.r - 1), 1, 5, 'Contrebande');
      route.run(gid, univers, a0, voisin('ens-a-sans', 'Sylve', A.q + 1, A.r - 1), 1, 2, null);
      route.run(gid, univers, a0, voisin('ens-a-pri', 'Marne', A.q, A.r + 1), 1, 4, 'Privée');
      const b0 = centre('ens-b', 'Centre B', B, 8);
      route.run(gid, univers, b0, voisin('ens-b-prive', 'Voisin privé', B.q + 1, B.r), 0, 3, 'Pirate');
      route.run(gid, univers, b0, voisin('ens-b-cache', 'Voisin caché', B.q - 1, B.r, 1), 1, 3, 'Pirate');
      const d0 = centre('ens-d', 'Centre D', D, 8);
      route.run(gid, univers, d0, voisin('ens-d-un', 'Collé', D.q + 1, D.r), 1, 1, 'Pirate');
      route.run(gid, univers, d0, voisin('ens-d-douze', 'Lointain', D.q - 1, D.r), 1, 12, 'Pirate');
      route.run(gid, univers, d0, voisin('ens-d-long', LONG, D.q, D.r - 1), 1, 3, 'Pirate');
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('E-23 nominal : le voisin à 3 cases par la route pirate montre sa flèche, « 3 cases » et la couleur pirate, dans les deux thèmes', async () => {
    const attendu = { dark: 'rgb(255, 107, 107)', light: 'rgb(255, 107, 107)' }; // the sky stays dark in both themes
    for (const theme of ['dark', 'light'] as const) {
      const { page, ctx } = await ouvrir('Léa', A, 1280, 800, theme);
      const f = page.locator('[aria-label^="Aller au système Hesper"]');
      await f.waitFor();
      assert.equal(await f.getAttribute('aria-label'), 'Aller au système Hesper, 3 cases, route Pirate', theme);
      assert.equal(await couleur(f), attendu[theme], `${theme} : couleur de la flèche pirate`);
      await page.locator('.cs-etiquette', { hasText: 'Hesper · 3 cases' }).waitFor();
      await page.screenshot({ path: `${SHOTS}/nominal-${theme}.png`, fullPage: true });
      await ctx.close();
    }
  });

  it('E-23 la flèche de l’est est à droite du centre et celle de l’ouest à gauche, sur le cercle de transition', async () => {
    const { page, ctx } = await ouvrir('Léa', A);
    const est = page.locator('[aria-label^="Aller au système Hesper"]');
    const ouest = page.locator('[aria-label^="Aller au système Vael"]');
    await est.waitFor();
    await ouest.waitFor();
    const be = await est.boundingBox();
    const bo = await ouest.boundingBox();
    const centre = (b: Any) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const e = centre(be); const o = centre(bo);
    assert.ok(e.x > o.x + 100, `est ${e.x} / ouest ${o.x}`);
    assert.ok(Math.abs(e.y - o.y) < 12, `l’est et l’ouest sont à la même hauteur : ${e.y} / ${o.y}`);
    await ctx.close();
  });

  it('E-23 les quatre couleurs : public, privé, pirate, autre (Contrebande) et sans type ; le type est dans l’aria-label sauf sans type', async () => {
    const { page, ctx } = await ouvrir('Antor', A);
    await page.locator('[aria-label^="Aller au système Hesper"]').waitFor();
    const lu = async (nom: string) => {
      const f = page.locator(`[aria-label^="Aller au système ${nom},"]`);
      return { c: await couleur(f), label: await f.getAttribute('aria-label') };
    };
    assert.deepEqual(await lu('Vael'), { c: 'rgb(90, 209, 196)', label: 'Aller au système Vael, 1 case, route Publique' });
    assert.deepEqual(await lu('Marne'), { c: 'rgb(239, 226, 122)', label: 'Aller au système Marne, 4 cases, route Privée' });
    assert.deepEqual(await lu('Hesper'), { c: 'rgb(255, 107, 107)', label: 'Aller au système Hesper, 3 cases, route Pirate' });
    assert.deepEqual(await lu('Orne'), { c: 'rgb(166, 167, 176)', label: 'Aller au système Orne, 5 cases, route Contrebande' });
    assert.deepEqual(await lu('Sylve'), { c: 'rgb(166, 167, 176)', label: 'Aller au système Sylve, 2 cases' });
    await page.locator('.cs-etiquette', { hasText: 'Vael · 1 case' }).waitFor();
    await ctx.close();
  });

  it('E-23 la zone de transition est un halo légendé « Zone de transition »', async () => {
    const { page, ctx } = await ouvrir('Léa', A);
    await page.getByText('Zone de transition', { exact: true }).waitFor();
    assert.equal(await page.getByText('Zone de transition', { exact: true }).count(), 1);
    await ctx.close();
  });

  it('E-23 exclusion : tous les voisins cachés à Léa, le halo et sa légende restent, aucune flèche, aucun texte sur eux', async () => {
    const { page, ctx } = await ouvrir('Léa', B);
    await page.getByText('Zone de transition', { exact: true }).waitFor();
    assert.equal(await fleches(page).count(), 0);
    const corps = await page.locator('body').innerText();
    for (const m of ['Voisin privé', 'Voisin caché', 'cases']) assert.ok(!corps.includes(m), `« ${m} » visible pour Léa`);
    await page.screenshot({ path: `${SHOTS}/tout-cache-lea.png`, fullPage: true });
    await ctx.close();
    const mj = await ouvrir('Antor', B);
    await mj.page.locator('[aria-label^="Aller au système Voisin privé"]').waitFor();
    assert.equal(await fleches(mj.page).count(), 2);
    await mj.ctx.close();
  });

  it('E-23 bords : « 1 case », « 12 cases », nom de plus de 24 caractères coupé par « … » dans l’étiquette, entier dans l’aria-label', async () => {
    const { page, ctx } = await ouvrir('Léa', D);
    await page.locator('[aria-label^="Aller au système Collé"]').waitFor();
    await page.locator('.cs-etiquette', { hasText: 'Collé · 1 case' }).waitFor();
    await page.locator('.cs-etiquette', { hasText: 'Lointain · 12 cases' }).waitFor();
    assert.equal(await page.locator(`[aria-label="Aller au système ${LONG}, 3 cases, route Pirate"]`).count(), 1);
    const etiquette = page.locator('.cs-etiquette', { hasText: 'Alpha Beta Gamma' });
    await etiquette.waitFor();
    const t = (await etiquette.innerText()).trim();
    assert.ok(t.includes('…'), `nom coupé : « ${t} »`);
    assert.ok(!t.includes(LONG), `nom entier dans l’étiquette : « ${t} »`);
    assert.ok(t.endsWith('3 cases'), t);
    await ctx.close();
  });

  it('E-23 cliquer ou activer au clavier la flèche ouvre le système voisin, la flèche est une cible d’au moins 24 px', async () => {
    const { page, ctx } = await ouvrir('Léa', A);
    const f = page.locator('[aria-label^="Aller au système Hesper"]');
    await f.waitFor();
    const b = await f.boundingBox();
    assert.ok(b.width >= 24 && b.height >= 24, `${b.width} × ${b.height}`);
    await f.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(`/interieur/${A.q + 1}/${A.r}$`));
    await page.getByRole('heading', { name: /Hesper/ }).first().waitFor();
    await ctx.close();
  });

  it('E-23 hors ligne après lecture : les flèches déjà tracées restent, sans message', async () => {
    const { page, ctx } = await ouvrir('Léa', A);
    await page.locator('[aria-label^="Aller au système Hesper"]').waitFor();
    const avant = await fleches(page).count();
    await ctx.setOffline(true);
    assert.equal(await fleches(page).count(), avant);
    assert.equal(await page.getByRole('alert').count(), 0);
    await ctx.close();
  });
});
