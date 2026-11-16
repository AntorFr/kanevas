// Browser test of kanevas-carte-spatiale-systeme-ecran (E-23, text version), written from the exit criterion — not from the code.
// Stub world with the seed. Screenshots go to /tmp/cap-systeme-liste (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-systeme-liste';
const INTROUVABLE = 'Page introuvable.';

describe('E-23 liste des corps d’un système', { skip: skipBrowser, timeout: 400000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  let tire = { q: 0, r: 0 };
  const sql = (fn: (db: Any) => void) => { const db = new Database(dbPath); try { fn(db); } finally { db.close(); } };
  const adr = (q: number, r: number, suffixe = '') => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${q}/${r}${suffixe}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const lignes = async (page: Any) => (await page.locator('.gx-lignes li').allInnerTexts()) as string[];

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-sys-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    // a drawn (never defined) system: found by reading, as the screen would
    outer: for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      const x = await a.page.request.get(`/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}/interieur/${q}/${r}`);
      if (x.status() === 200) { const v = (await x.json()) as Any; if (v.etat === 'tire' && v.astres.length > 0) { tire = { q, r }; break outer; } }
    }
    await a.ctx.close();
    sql((db) => {
      const E = univers;
      const ins = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)");
      const g = gid;
      const ouvert = ins.run(g, E, 'sl-ouvert', 'Ouvert-test', 42, 43, 0).lastInsertRowid;
      ins.run(g, E, 'sl-secret', 'Caché-test', 40, 41, 1);
      const a2 = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?)');
      a2.run(ouvert, 'ano', 'planete', 'anomalie', null, 2.03, 4, 0.1);
      a2.run(ouvert, 'nomme', 'planete', 'tellurique', 'Nomée', 4, 7, 1);
    });
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('un hexagone tiré : le MJ voit « Tiré » et la liste, recharge et retrouve les mêmes lignes', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(adr(tire.q, tire.r));
    await page.getByText('Tiré', { exact: true }).waitFor();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    const avant = await lignes(page);
    assert.ok(avant.length > 0);
    assert.match((await texte(page)), /Hexagone -?\d+, -?\d+/);
    await hors(page, 'bureau-mj-tire');
    await page.reload();
    await page.getByText('Tiré', { exact: true }).waitFor();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    assert.deepEqual(await lignes(page), avant);
  });

  it('une joueuse lit un système défini : l’anomalie et l’astre nommé, l’astre sans nom lu « Astre sans nom »', async () => {
    for (const compte of ['Léa', 'Antor']) {
      const { page, ctx } = await connecte(browser, srv.base, compte);
      await page.setViewportSize({ width: 390, height: 780 });
      await page.goto(adr(42, 43));
      await page.getByText('Défini', { exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Corps (2)' }).waitFor();
      const l = (await lignes(page)).join('\n');
      assert.match(l, /Astre sans nom/, compte);
      assert.match(l, /Anomalie/, compte);
      assert.match(l, /Nomée/, compte);
      assert.match(l, /Orbite 2,03 · 4 h/, compte);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'pas de défilement horizontal');
      if (compte === 'Léa') await hors(page, '390-joueuse-defini');
      await ctx.close();
    }
  });

  it('hexagone sans étoile ; système secret pour la joueuse et pour le MJ en mode joueur : « Page introuvable. »', async () => {
    const cas: Array<[string, string]> = [['Léa', adr(41, 7777)], ['Léa', adr(40, 41)], ['Antor', adr(41, 7777)]];
    for (const [compte, url] of cas) {
      const { page, ctx } = await connecte(browser, srv.base, compte);
      await page.goto(url);
      await page.getByText(INTROUVABLE).first().waitFor({ timeout: 8000 }).catch(async (e: Any) => { throw new Error(`${compte} ${url}: ${(await texte(page)).slice(0, 300)} / ${e.message}`); });
      const t = await texte(page);
      assert.ok(!t.includes('Caché-test'), url);
      await ctx.close();
    }
    const { page, ctx } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(adr(40, 41));
    await page.getByRole('heading', { name: 'Caché-test' }).waitFor();
    // the GM switches to Player mode on that very address: the system is no longer his to read
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText(INTROUVABLE).first().waitFor({ timeout: 8000 });
    assert.ok(!(await texte(page)).includes('Caché-test'));
    await ctx.close();
  });
});
