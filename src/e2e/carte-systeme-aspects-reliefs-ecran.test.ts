// ecrans: cartes
// Browser test of kanevas-carte-rendu-aspects-reliefs (E-23, P-27, B-114, AD-aspects-reliefs-3): a body carrying `couleur_nuages`
// is drawn differently from the same body without it, and the « Voir l’illustration » window shows the colour of the map's sprite.
// What the keys look like is the recipe's (B-123); the effect of the import is proved by `inject`. Neutral fixture (AD-131):
// invented names, no value of any reference. Screenshots go to /tmp/cap-carte-reliefs (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-reliefs';
const O = { q: 70, r: 70 };
const NUAGES = { couleur_nuages: '#d04020', opacite_nuages: 1 };

describe('E-23 un corps à nuages colorés est dessiné avec sa clé', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let db: Database.Database;
  let univers = 0;
  let gid = 0;
  const ouvrir = async (largeur = 1280, hauteur = 800) => {
    const c = await connecte(browser, srv.base, 'Antor');
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}`);
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await c.page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.etiquettes ?? []).some((e: Any) => e.visible), undefined, { timeout: 30000 });
    await c.page.waitForTimeout(3000);
    return c;
  };
  /** Pixels of the map's sprite of body `cle`, and its mean colour over the opaque pixels. */
  const spriteCarte = (page: Any, cle: string) => page.evaluate((cle: string) => {
    const k0 = (window as Any).__carteSysteme().corps.find((k: Any) => k.cle === cle);
    const t = document.querySelector('canvas.cs-toile') as HTMLCanvasElement;
    const k = t.width / t.getBoundingClientRect().width;
    const r = Math.max(4, Math.round(k0.rayon * k));
    const d = t.getContext('2d')!.getImageData(Math.round(k0.x * k) - r, Math.round(k0.y * k) - r, 2 * r, 2 * r).data;
    let n = 0; const m = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200) { n++; m[0]! += d[i]!; m[1]! += d[i + 1]!; m[2]! += d[i + 2]!; }
    return { signature: Array.from(d).join(','), moyenne: m.map((v) => v / Math.max(n, 1)) };
  }, cle);

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-reliefs-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
    db = new Database(dbPath);
    const centre = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#f2a33c','',0,0)")
      .run(gid, univers, 'rel-centre', 'Système neutre', O.q, O.r).lastInsertRowid as number;
    const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    ast.run(centre, 'etoile', 'etoile', null, 0, 'jaune', 'Étoile neutre', 0, 0, 1, '{}');
    ast.run(centre, 'monde', 'planete', null, 0, 'tellurique', 'Monde neutre', 2, 6, 0.4, JSON.stringify({ graine: 11 }));
  }, { timeout: 180000 });
  after(async () => { db?.close(); await browser?.close(); srv?.stop(); });

  it('le sprite du corps change avec couleur_nuages, et la fenêtre montre la même teinte que la carte', async () => {
    const sans = await ouvrir();
    const avant = await spriteCarte(sans.page, 'monde');
    await sans.ctx.close();
    db.prepare("UPDATE swn_astres SET aspect = ? WHERE cle = 'monde'").run(JSON.stringify({ graine: 11, ...NUAGES }));
    const { page, ctx } = await ouvrir();
    const apres = await spriteCarte(page, 'monde');
    assert.notEqual(apres.signature, avant.signature, 'le sprite à nuages colorés n’est pas celui du même corps sans la clé');
    await page.locator('.cs-corps[data-cle="monde"]').click();
    await page.getByRole('region', { name: 'Corps sélectionné' }).getByRole('button', { name: /Voir l’illustration/ }).click();
    await page.locator('.cs-grande img.cs-net').waitFor({ timeout: 30000 });
    const fenetre = await page.evaluate(async () => {
      const im = document.querySelector('.cs-grande img.cs-net') as HTMLImageElement;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d')!; g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0; const m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200) { n++; m[0]! += d[i]!; m[1]! += d[i + 1]!; m[2]! += d[i + 2]!; }
      return m.map((v) => v / Math.max(n, 1));
    });
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(fenetre[i]! - apres.moyenne[i]!) < 40, `canal ${i} : fenêtre ${fenetre[i]} contre carte ${apres.moyenne[i]}`);
    await page.screenshot({ path: `${SHOTS}/fenetre-1280.png` });
    await ctx.close();
  });
});
