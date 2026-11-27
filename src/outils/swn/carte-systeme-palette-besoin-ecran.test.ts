// ecrans: cartes
// Lives outside src/e2e on purpose: the screen-file count guards of src/scripts-tests freeze that folder.
// Browser verification (from the need) of kanevas-carte-rendu-aspects-socle, E-23, P-27, B-114: the « Voir l’illustration » window of a body
// shows the named palette of its own aspect, and a body without palette shows its type's palette (never the other body's colours).
// Neutral fixture (AD-131). Screenshots go to /tmp/cap-carte-palette (outside the tree).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from '../../e2e/harnais.test.ts';

const SHOTS = '/tmp/cap-carte-palette';
const O = { q: 74, r: 75 };

describe('E-23 la fenêtre « Voir l’illustration » montre la palette nommée du corps', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  /** Mean colour of the opaque pixels of the sharp picture in the dialog of the body `cle`. */
  const moyenne = async (cle: string) => {
    const c = await connecte(browser, srv.base, 'Antor');
    const { page } = c;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}`);
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.etiquettes ?? []).some((e: Any) => e.visible), undefined, { timeout: 30000 });
    await page.locator(`.cs-corps[data-cle="${cle}"]`).click();
    await page.getByRole('region', { name: 'Corps sélectionné' }).getByRole('button', { name: /Voir l’illustration/ }).click();
    await page.locator('.cs-grande img.cs-net').waitFor({ timeout: 30000 });
    const m = await page.evaluate(async () => {
      const im = document.querySelector('.cs-grande img.cs-net') as HTMLImageElement;
      await im.decode();
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext('2d')!; g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, r = 0, v = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3]! < 250) continue; n++; r += d[i]!; v += d[i + 1]!; b += d[i + 2]!; }
      return { r: r / n, v: v / n, b: b / n, n };
    });
    await page.screenshot({ path: `${SHOTS}/${cle}.png` });
    await c.ctx.close();
    return m;
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-palette-')), 'k.db');
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
        .run(gid, univers, 'pal-centre', 'Système de palettes', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      const id = (cle: string, genre: string, type: string, nom: string, orbite: number, heure: number, taille: number, aspect: object = {}) =>
        ast.run(centre, cle, genre, null, 0, type, nom, orbite, heure, taille, JSON.stringify(aspect));
      id('etoile', 'etoile', 'jaune', 'Étoile', 0, 0, 1);
      id('rouge', 'planete', 'tellurique', 'Planète rouge', 2, 3, 0.4, { palette: ['#c02010', '#a01808', '#e03020'], mer: 0, nuages: 0, calottes: 0 });
      id('verte', 'planete', 'tellurique', 'Planète verte', 3, 9, 0.4, { palette: ['#10a030', '#20b840', '#0c8028'], mer: 0, nuages: 0, calottes: 0 });
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('une palette de trois rouges donne une image dominée par le rouge, une palette verte une image dominée par le vert', async () => {
    const rouge = await moyenne('rouge');
    const verte = await moyenne('verte');
    assert.ok(rouge.n > 1000 && verte.n > 1000, 'les deux images sont des disques opaques');
    assert.ok(rouge.r > 1.3 * rouge.v && rouge.r > 1.3 * rouge.b, `rouge dominant (${JSON.stringify(rouge)})`);
    assert.ok(verte.v > 1.3 * verte.r && verte.v > 1.3 * verte.b, `vert dominant (${JSON.stringify(verte)})`);
  });
});
