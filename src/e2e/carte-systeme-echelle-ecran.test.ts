// ecrans: cartes
// Browser test of kanevas-carte-rendu-echelle-carte (E-23, P-27, AD-echelle-1): bodies keep their size at every zoom, each body has its own
// orbit ring, a moon's is around its planet. The effect (geometry) is proved by `carte-echelle.test.ts`; here only what is seen.
// Neutral fixture (AD-131). Screenshots go to /tmp/cap-carte-echelle (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-echelle';
const O = { q: 70, r: 71 };

describe('E-23 les astres à l’échelle de leurs orbites', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  const croquis = (page: Any) => page.evaluate(() => (window as Any).__carteSysteme?.() ?? null);
  const ouvrir = async (largeur: number, hauteur: number) => {
    const c = await connecte(browser, srv.base, 'Antor');
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}`);
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await c.page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.etiquettes ?? []).some((e: Any) => e.visible), undefined, { timeout: 30000 });
    return c;
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-echelle-')), 'k.db');
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
      const centre = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
        .run(gid, univers, 'ech-centre', 'Système neutre', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const id = (cle: string, genre: string, type: string, nom: string, orbite: number | null, heure: number, taille: number, parent: number | null = null) =>
        ast.run(centre, cle, genre, parent, 0, type, nom, orbite, heure, taille).lastInsertRowid as number;
      id('etoile', 'etoile', 'jaune', 'Étoile', 0, 0, 1);
      const p1 = id('p1', 'planete', 'tellurique', 'Première', 1, 3, 0.3);
      id('p1-lune', 'lune', 'rocheux', 'Première a', null, 6, 0.1, p1);
      id('p2', 'planete', 'gazeuse', 'Deuxième', 2, 7, 0.6);
      id('p3', 'planete', 'glace', 'Troisième', 3.5, 10, 0.3);
      id('p4', 'planete', 'lave', 'Quatrième', 5, 1, 0.3);
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('un astre garde sa taille entre deux zooms, la position seule suit', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    const avant = await croquis(page);
    await page.getByRole('button', { name: /Zoom avant/ }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme?.()?.zoom > 1, undefined, { timeout: 10000 });
    const apres = await croquis(page);
    for (const c of (avant.corps as Any[]).filter((k) => !k.cle.includes(':'))) {
      assert.equal(apres.corps.find((k: Any) => k.cle === c.cle).rayon, c.rayon, `${c.cle} : même rayon à l’écran`);
      assert.ok(c.rayon >= 3, `${c.cle} : jamais sous 3 px`);
    }
    await ctx.close();
  });

  it('chaque astre a son orbite tracée, la lune sur celle de sa planète', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    const c = await croquis(page);
    const cercles = await page.locator('.cs-orbite').evaluateAll((els: Element[]) =>
      els.map((e) => ({ cle: e.getAttribute('data-cle'), cx: Number(e.getAttribute('cx')), cy: Number(e.getAttribute('cy')), r: Number(e.getAttribute('r')) })));
    assert.deepEqual(cercles.map((o: Any) => o.cle).sort(), ['p1', 'p1-lune', 'p2', 'p3', 'p4']);
    const mere = (c.corps as Any[]).find((k) => k.cle === 'p1');
    const lune = cercles.find((o: Any) => o.cle === 'p1-lune');
    assert.ok(Math.abs(lune.cx - mere.x) <= 1 && Math.abs(lune.cy - mere.y) <= 1, 'l’orbite de la lune est centrée sur sa planète');
    const rayons = cercles.filter((o: Any) => o.cle !== 'p1-lune').map((o: Any) => o.r);
    assert.equal(new Set(rayons.map((r: number) => Math.round(r))).size, 4, 'quatre orbites distinctes');
    await ctx.close();
  });

  it('captures dans les deux thèmes à 1280 et 390 px, tous les noms posés', async () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const [l, h] of [[1280, 800], [390, 780]] as const) {
        const { page, ctx } = await ouvrir(l, h);
        await page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
        const c = await croquis(page);
        const noms = (c.etiquettes as Any[]).filter((e) => !e.cle.includes(':') && e.cle !== 'p1-lune');
        assert.ok(noms.every((e) => e.visible), `${l} px : noms non posés : ${JSON.stringify(noms.filter((e) => !e.visible))}`);
        await page.screenshot({ path: `${SHOTS}/${l}-${theme}.png`, fullPage: true });
        await ctx.close();
      }
    }
  });
});
