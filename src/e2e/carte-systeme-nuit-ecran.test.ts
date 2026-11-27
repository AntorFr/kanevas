// ecrans: cartes
// Browser test of kanevas-carte-rendu-nuit (E-23, P-27, B-124, AD-nuit-1): a world carrying `lueur`
// has a brighter night side (the half of its disc opposite the star) than the same world without it, on the map and in the
// « Voir l’illustration » window, which shows the colour of the map's sprite.
// What the keys look like is the recipe's (B-123); the effect of the import is proved by `inject`. Neutral fixture (AD-131):
// invented names, no value of any reference. Screenshots go to /tmp/cap-carte-nuit (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-nuit';
const O = { q: 70, r: 70 };
const LUEUR = { lueur: 1, force_lueur: 2 };

describe('E-23 un monde à lueur montre une face nocturne lumineuse', { skip: skipBrowser, timeout: 600000 }, () => {
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
    // The sprites are drawn once every body has opaque pixels at its centre on the canvas (the effect, never a duration).
    await c.page.waitForFunction(() => {
      const corps = ((window as Any).__carteSysteme?.()?.corps ?? []) as Any[];
      const t = document.querySelector('canvas.cs-toile') as HTMLCanvasElement | null;
      if (!t || !corps.length) return false;
      const k = t.width / t.getBoundingClientRect().width;
      const g = t.getContext('2d')!;
      return corps.every((b: Any) => {
        const x = Math.round(b.x * k), y = Math.round(b.y * k);
        if (x < 1 || y < 1 || x >= t.width - 1 || y >= t.height - 1) return false;
        return g.getImageData(x - 1, y - 1, 3, 3).data.some((v, i) => i % 4 === 3 && v > 200);
      });
    }, undefined, { timeout: 30000 });
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
    // Night half: pixels on the side of the body opposite the star.
    const e = (window as Any).__carteSysteme().corps.find((c: Any) => c.cle === 'etoile') ?? { x: 0, y: 0 };
    let ux = (e.x - k0.x) * k, uy = (e.y - k0.y) * k; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    let nn = 0, lum = 0;
    for (let y = 0; y < 2 * r; y++) for (let x = 0; x < 2 * r; x++) {
      const i = (y * 2 * r + x) * 4;
      if (d[i + 3]! > 200 && (x - r) * ux + (y - r) * uy < -0.3 * r) { nn++; lum += 0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!; }
    }
    return { signature: Array.from(d).join(','), moyenne: m.map((v) => v / Math.max(n, 1)), nuit: lum / Math.max(nn, 1) };
  }, cle);

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-nuit-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
    db = new Database(dbPath);
    const centre = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
      .run(gid, univers, 'nuit-centre', 'Système neutre', O.q, O.r).lastInsertRowid as number;
    const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    ast.run(centre, 'etoile', 'etoile', null, 0, 'jaune', 'Étoile neutre', 0, 0, 1, '{}');
    ast.run(centre, 'monde', 'planete', null, 0, 'tellurique', 'Monde neutre', 2, 6, 0.4, JSON.stringify({ graine: 11 }));
  }, { timeout: 180000 });
  after(async () => { db?.close(); await browser?.close(); srv?.stop(); });

  it('la face nocturne du sprite s’éclaire avec lueur, et la fenêtre montre la même teinte que la carte', async () => {
    const sans = await ouvrir();
    const avant = await spriteCarte(sans.page, 'monde');
    await sans.ctx.close();
    db.prepare("UPDATE swn_astres SET aspect = ? WHERE cle = 'monde'").run(JSON.stringify({ graine: 11, ...LUEUR }));
    const { page, ctx } = await ouvrir();
    const apres = await spriteCarte(page, 'monde');
    assert.notEqual(apres.signature, avant.signature, 'le sprite à lueur n’est pas celui du même corps sans la clé');
    assert.ok(apres.nuit > avant.nuit + 2, `face nocturne : ${apres.nuit} avec lueur, ${avant.nuit} sans`);
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
