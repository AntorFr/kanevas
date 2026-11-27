// ecrans: cartes
// Browser test of kanevas-carte-rendu-cometes-carte (E-23, P-27, B-116, AD-cometes-3): the chosen comet's trajectory is gold, the other is dashed,
// the tail follows the geometry (read on the canvas hooks, no recompute), head and coma stay drawn at 390 px. Neutral fixture (AD-131).
// Screenshots go to /tmp/cap-carte-cometes (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-cometes';
const O = { q: 90, r: 91 };

describe('E-23 la queue et la trajectoire d’une comète', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const lien = () => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}`;
  const ouvrir = async (largeur: number, hauteur: number, theme = 'dark') => {
    const c = await connecte(browser, srv.base, 'Antor');
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(lien());
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await c.page.waitForFunction(() => (window as Any).__carteSysteme?.()?.pret === true, undefined, { timeout: 30000 });
    await c.page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
    return c;
  };
  const crochet = (page: Any, nom: string) => page.evaluate((n: string) => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute(n) ?? '[]'), nom);
  const attendre = (page: Any, nom: string, cle: string) =>
    page.waitForFunction(([n, k]: string[]) => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute(n) ?? '[]').some((e: Any) => e.cle === k), [nom, cle], { timeout: 30000 });

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-cometes-')), 'k.db');
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
        .run(gid, univers, 'co-centre', 'Système des comètes', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      ast.run(centre, 'etoile', 'etoile', null, 0, 'jaune', 'Étoile', 0, 0, 1, '{}');
      ast.run(centre, 'p1', 'planete', null, 0, 'tellurique', 'Planète', 2, 6, 0.3, '{}');
      ast.run(centre, 'comete', 'comete', null, 0, 'comete', 'Comète', 8, 3, 0.1, JSON.stringify({ perihelie: 1 }));
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('choisir la comète trace sa trajectoire en or continu, choisir la planète la remet en tirets ; la queue est à l’opposé de l’étoile (dark et light)', async () => {
    for (const theme of ['dark', 'light'] as const) {
      const { page, ctx } = await ouvrir(1280, 800, theme);
      await attendre(page, 'data-trajet-comete', 'comete');
      // the colour the gold token resolves to, read in the sky
      const or = await page.evaluate(() => { const i = (document.querySelector('.cs-ciel') as HTMLElement).appendChild(document.createElement('i')); i.style.color = 'var(--ciel-or)'; const c = getComputedStyle(i).color; i.remove(); return c; });
      const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => Math.round(Number(v)));
      const hex = (s: string) => { const m = s.replace('#', ''); const f = m.length === 3 ? [...m].map((x) => x + x).join('') : m; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };

      assert.equal((await crochet(page, 'data-trajet-comete')).find((t: Any) => t.cle === 'comete').tirets, true, `${theme} : au repos, en tirets`);
      await page.locator('.cs-corps[data-cle="comete"]').click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute('data-trajet-comete') ?? '[]').some((t: Any) => t.epaisseur === 2));
      const choisie = (await crochet(page, 'data-trajet-comete')).find((t: Any) => t.cle === 'comete');
      assert.equal(choisie.tirets, false, `${theme} : trait continu`);
      assert.equal(choisie.epaisseur, 2);
      assert.deepEqual(hex(choisie.couleur), rgb(or), `${theme} : couleur de --ciel-or`);
      assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système. Trajectoire de Comète affichée');
      // tail: away from the star (the star is the world's origin of this one-star system; comet drawn right of/above is read on the hook)
      const { corps } = await page.evaluate(() => (window as Any).__carteSysteme());
      const et = corps.find((c: Any) => c.cle === 'etoile'), co = corps.find((c: Any) => c.cle === 'comete');
      const q = (await crochet(page, 'data-queue-comete')).find((e: Any) => e.cle === 'comete');
      const vers = Math.atan2(co.y - et.y, co.x - et.x);
      // the drawn angle is the picture's tail direction, turned: it must point away from the star within a quadrant (the tail of the core's picture is not exactly its axis)
      assert.ok(Math.cos(q.angle - vers) > 0.3, `${theme} : la queue s’éloigne de l’étoile (${q.angle} vs ${vers})`);
      assert.ok(q.longueur > 0);
      await page.screenshot({ path: `${SHOTS}/1280-${theme}.png` });

      await page.locator('.cs-corps[data-cle="p1"]').click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute('data-trajet-comete') ?? '[]').every((t: Any) => t.epaisseur === 1));
      const repos = (await crochet(page, 'data-trajet-comete')).find((t: Any) => t.cle === 'comete');
      assert.equal(repos.tirets, true);
      assert.notEqual(repos.couleur, choisie.couleur, `${theme} : plus d’or`);
      assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système');
      await ctx.close();
    }
  });

  it('la comète rapprochée de l’étoile a une queue plus longue (lue sur le crochet)', async () => {
    const lue = async () => {
      const { page, ctx } = await ouvrir(1280, 800);
      await attendre(page, 'data-queue-comete', 'comete');
      const q = (await crochet(page, 'data-queue-comete')).find((e: Any) => e.cle === 'comete');
      await ctx.close();
      return q.longueur as number;
    };
    const loin = await lue();
    const db = new Database(dbPath);
    try { db.prepare("UPDATE swn_astres SET orbite = 3 WHERE cle = 'comete'").run(); } finally { db.close(); }
    const pres = await lue();
    const db2 = new Database(dbPath);
    try { db2.prepare("UPDATE swn_astres SET orbite = 8 WHERE cle = 'comete'").run(); } finally { db2.close(); }
    assert.ok(pres > loin, `queue ${pres} px près > ${loin} px loin`);
  });

  it('à 390 px dézoomé au minimum la tête et la coma restent dessinées et aucune étiquette ne recouvre la queue', async () => {
    const { page, ctx } = await ouvrir(390, 780);
    await attendre(page, 'data-queue-comete', 'comete');
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /Zoom arrière/ }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom <= 0.51);
    // wait for the head's pixels to be drawn (the canvas is transparent where nothing is drawn), not for a delay
    await page.waitForFunction(() => {
      const co = (window as Any).__carteSysteme().corps.find((c: Any) => c.cle === 'comete');
      const cv = document.querySelector('canvas.cs-toile') as HTMLCanvasElement | null;
      if (!co || !cv) return false;
      const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
      const d = cv.getContext('2d')!.getImageData(Math.round(co.x * k) - 1, Math.round(co.y * k) - 1, 3, 3).data;
      let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i];
      return a > 0;
    }, undefined, { timeout: 30000 });
    const { corps } = await page.evaluate(() => (window as Any).__carteSysteme());
    const co = corps.find((c: Any) => c.cle === 'comete');
    // pixels at the head: not the sky's background (the canvas is transparent where nothing is drawn)
    const alpha = await page.locator('canvas.cs-toile').evaluate((cv: HTMLCanvasElement, p: number[]) => {
      const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
      const d = cv.getContext('2d')!.getImageData(Math.round(p[0] * k) - 1, Math.round(p[1] * k) - 1, 3, 3).data;
      let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s;
    }, [co.x, co.y]);
    assert.ok(alpha > 0, 'la tête est dessinée');
    const q = (await crochet(page, 'data-queue-comete')).find((e: Any) => e.cle === 'comete');
    const boites = await page.evaluate(() => [...document.querySelectorAll('.cs-etiquette')].map((e) => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, id: e.getAttribute('data-cle') }; }));
    const cv = await page.locator('canvas.cs-toile').boundingBox();
    const fin = [cv.x + co.x + Math.cos(q.angle) * q.longueur, cv.y + co.y + Math.sin(q.angle) * q.longueur];
    for (const b of boites as Any[]) {
      for (let t = 0; t <= 1; t += 0.05) {
        const px = cv.x + co.x + (fin[0] - cv.x - co.x) * t, py = cv.y + co.y + (fin[1] - cv.y - co.y) * t;
        assert.ok(!(px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1), `l’étiquette ${b.id} recouvre la queue`);
      }
    }
    await page.screenshot({ path: `${SHOTS}/390-dezoome.png` });
    await ctx.close();
  });
});
