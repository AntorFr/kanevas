// ecrans: cartes
// Browser test of kanevas-carte-rendu-aspects-socle (E-23, P-27, P-30, B-114): the brightest side of every body looks at its star and the
// « Voir l’illustration » window shows the same side as the map. The angles are proved by literal values in `lumiere-corps.test.ts`;
// here only what is seen. Neutral fixture (AD-131). Screenshots go to /tmp/cap-carte-lumiere (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { attendreTransitions, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-lumiere';
const O = { q: 72, r: 73 };

describe('E-23 la face éclairée de chaque astre regarde son étoile', { skip: skipBrowser, timeout: 600000 }, () => {
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
  /** Light barycentre of the canvas around a body, relative to its centre, in the sprite's own pixels (x right, y down). */
  const mesureBarycentre = ({ x, y, rayon }: Any) => {
    const t = document.querySelector('canvas.cs-toile') as HTMLCanvasElement;
    const k = t.width / t.getBoundingClientRect().width;
    const r = Math.max(4, Math.round(rayon * k));
    const g = t.getContext('2d')!;
    const d = g.getImageData(Math.round(x * k) - r, Math.round(y * k) - r, 2 * r, 2 * r);
    let s = 0, bx = 0, by = 0;
    for (let j = 0; j < 2 * r; j++) for (let i = 0; i < 2 * r; i++) {
      const o = (j * 2 * r + i) * 4;
      if ((i - r) ** 2 + (j - r) ** 2 > r * r) continue;
      const l = (d.data[o]! + d.data[o + 1]! + d.data[o + 2]!) * (d.data[o + 3]! / 255);
      s += l; bx += l * (i - r); by += l * (j - r);
    }
    return { dx: bx / s, dy: by / s };
  };
  const barycentre = (page: Any, x: number, y: number, rayon: number) => page.evaluate(mesureBarycentre, { x, y, rayon });

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-lumiere-')), 'k.db');
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
      const centre = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#f2a33c','',0,0)")
        .run(gid, univers, 'lum-centre', 'Système double', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      const id = (cle: string, genre: string, rang: number, type: string, nom: string, orbite: number | null, heure: number, taille: number, parent: number | null = null, aspect: object = {}) =>
        ast.run(centre, cle, genre, parent, rang, type, nom, orbite, heure, taille, JSON.stringify(aspect)).lastInsertRowid as number;
      id('etoile', 'etoile', 0, 'jaune', 'Première étoile', 0, 0, 1);
      id('compagne', 'etoile', 1, 'blanche', 'Seconde étoile', 4, 3, 0.8);
      const pa = id('pa', 'planete', 0, 'tellurique', 'Planète A', 1, 9, 0.35, null, { palette: ['#2f5d8a', '#6fa8dc', '#d9ead3'] });
      id('pa-lune', 'lune', 0, 'rocheux', 'Lune A', null, 6, 0.1, pa);
      id('pb', 'planete', 1, 'rocheux', 'Planète B', 3, 3, 0.35);
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('la face la plus claire de chaque planète et de la lune regarde son étoile', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    // Sprites are drawn after the map is up: wait until the sharp ones light planet A on the right (the measured effect), then read.
    const c0 = await croquis(page);
    const pa0 = (c0.corps as Any[]).find((k) => k.cle === 'pa');
    await page.waitForFunction(
      ([mesure, arg]: Any) => (0, eval)(`(${mesure})`)(arg).dx > 0.5,
      [mesureBarycentre.toString(), { x: pa0.x, y: pa0.y, rayon: pa0.rayon }],
      { timeout: 30000 },
    );
    const c = await croquis(page);
    const corps = (cle: string) => (c.corps as Any[]).find((k) => k.cle === cle);
    const a = await barycentre(page, corps('pa').x, corps('pa').y, corps('pa').rayon);
    assert.ok(a.dx > 0.5, `planète A, à gauche de son étoile : éclairée à droite (${a.dx})`);
    const b = await barycentre(page, corps('pb').x, corps('pb').y, corps('pb').rayon);
    assert.ok(b.dx > 0.5, `planète B, à gauche de sa compagne : éclairée à droite (${b.dx})`);
    const l = await barycentre(page, corps('pa-lune').x, corps('pa-lune').y, corps('pa-lune').rayon);
    // The moon's place depends on the fit's scale: what is seen is the light looking at the star, whatever the direction on screen.
    const lune = corps('pa-lune'), etoile = corps('etoile');
    const versEtoile = (etoile.x - lune.x) * l.dx + (etoile.y - lune.y) * l.dy;
    assert.ok(versEtoile > 0, `lune A : éclairée du côté de son étoile (${l.dx}, ${l.dy} ; étoile à ${etoile.x - lune.x}, ${etoile.y - lune.y})`);
    await ctx.close();
  });

  it('« Voir l’illustration » d’une planète montre la même face que la carte', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    await page.locator('.cs-corps[data-cle="pa"]').click();
    const p = page.getByRole('region', { name: 'Corps sélectionné' });
    await p.getByRole('button', { name: /Voir l’illustration/ }).click();
    await page.locator('.cs-grande img.cs-net').waitFor({ timeout: 30000 });
    const dx = await page.evaluate(async () => {
      const im = document.querySelector('.cs-grande img.cs-net') as HTMLImageElement;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d')!; g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = 0, bx = 0;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
        const o = (j * c.width + i) * 4;
        const l = (d[o]! + d[o + 1]! + d[o + 2]!) * (d[o + 3]! / 255);
        s += l; bx += l * (i - c.width / 2);
      }
      return bx / s;
    });
    assert.ok(dx > 0.5, `la fenêtre éclaire la planète A à droite, comme la carte (${dx})`);
    await page.screenshot({ path: `${SHOTS}/fenetre-1280.png` });
    await ctx.close();
  });

  it('captures dans les deux thèmes à 1280 et 390 px', async () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const [l, h] of [[1280, 800], [390, 780]] as const) {
        const { page, ctx } = await ouvrir(l, h);
        await page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
        await page.waitForFunction((t: string) => document.documentElement.getAttribute('data-theme') === t
          && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)', theme, { timeout: 30000 });
        await attendreTransitions(page);
        await page.screenshot({ path: `${SHOTS}/${l}-${theme}.png`, fullPage: true });
        await ctx.close();
      }
    }
  });
});
