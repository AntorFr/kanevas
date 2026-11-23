// ecrans: cartes
// Browser test of kanevas-carte-rendu-echelle (E-23, B-113, B-115), written from the need — not from the code.
// A neutral system (8 bodies: a star, 5 planets, 2 moons round one of them) is laid down by the test. Screenshots go to /tmp/cap-carte-echelle-besoin.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-echelle-besoin';
const O = { q: 70, r: 71 };

describe('E-23 besoin : les astres à l’échelle, sans grossir au zoom, chacun avec son orbite', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  const croquis = (page: Any) => page.evaluate(() => (window as Any).__carteSysteme?.() ?? null);
  const prete = async (page: Any) => {
    await page.waitForFunction(() => (window as Any).__carteSysteme?.()?.pret === true, undefined, { timeout: 30000 });
    await page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.etiquettes ?? []).some((e: Any) => e.visible), undefined, { timeout: 30000 });
  };
  const ouvrir = async (largeur: number, hauteur: number) => {
    const c = await connecte(browser, srv.base, 'Léa');
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}`);
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await prete(c.page);
    return c;
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-echelle-besoin-')), 'k.db');
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
        .run(gid, univers, 'ech-centre', 'Centre-échelle', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const id = (cle: string, genre: string, type: string, nom: string, orbite: number | null, heure: number, taille: number, parent: number | null = null) =>
        ast.run(centre, cle, genre, parent, 0, type, nom, orbite, heure, taille).lastInsertRowid as number;
      id('etoile', 'etoile', 'jaune', 'Soleil-neutre', 0, 0, 1);
      const alpha = id('alpha', 'planete', 'tellurique', 'Alpha', 1, 3, 0.3);
      id('alpha-a', 'lune', 'rocheux', 'Alpha a', null, 1, 0.1, alpha);
      id('alpha-b', 'lune', 'glace', 'Alpha b', null, 5, 0.1, alpha);
      id('beta', 'planete', 'gazeuse', 'Bêta', 2.5, 7, 0.6);
      id('gamma', 'planete', 'lave', 'Gamma', 4, 10, 0.3);
      id('delta', 'planete', 'glace', 'Delta', 5, 2, 0.2);
      id('epsilon', 'planete', 'rocheux', 'Epsilon', 7, 6, 0.4);
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('un astre garde sa taille entre deux zooms, seule sa position suit (zoom 1, 2, 0,5)', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    const avant = await croquis(page);
    const rayons = (c: Any) => Object.fromEntries((c.corps as Any[]).filter((k) => !k.cle.startsWith('zone:') && !k.cle.startsWith('sortie:')).map((k) => [k.cle, k.rayon]));
    const r1 = rayons(avant);
    assert.equal(Object.keys(r1).length, 8);
    assert.equal(avant.zoom, 1);
    const largeurs = () => page.locator('.cs-corps').evaluateAll((els: Element[]) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    const l1 = await largeurs();
    const x1 = Object.fromEntries((avant.corps as Any[]).map((k) => [k.cle, [k.x, k.y]]));
    await page.getByRole('button', { name: /Zoom avant/ }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom > 1.1);
    const zoome = await croquis(page);
    assert.deepEqual(rayons(zoome), r1, 'rayons identiques après un zoom avant');
    assert.deepEqual(await largeurs(), l1, 'boîtes des astres identiques après un zoom avant');
    // the position follows: the star is the origin of the zoom pivot only if unmoved, so compare a distance between two bodies
    const dist = (c: Any, a: string, b: string) => { const p = (c.corps as Any[]).find((k) => k.cle === a), q = (c.corps as Any[]).find((k) => k.cle === b); return Math.hypot(p.x - q.x, p.y - q.y); };
    assert.ok(dist(zoome, 'beta', 'epsilon') > dist(avant, 'beta', 'epsilon') * 1.1, 'les distances grandissent avec le zoom');
    assert.ok(x1.beta[0] !== (zoome.corps as Any[]).find((k) => k.cle === 'beta').x || x1.beta[1] !== (zoome.corps as Any[]).find((k) => k.cle === 'beta').y);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Zoom arrière/ }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom < 0.9);
    assert.deepEqual(rayons(await croquis(page)), r1, 'rayons identiques après un zoom arrière');
    await page.screenshot({ path: `${SHOTS}/zoom-arriere.png`, fullPage: true });
    await ctx.close();
  });

  it('un astre ne dépasse pas la moitié de l’écart entre deux orbites voisines, sans descendre sous 3 px', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    const c = await croquis(page);
    const par = Object.fromEntries((c.corps as Any[]).map((k) => [k.cle, k]));
    const d = (k: string) => Math.hypot(par[k].x - par.etoile.x, par[k].y - par.etoile.y);
    // planets on orbits 1, 2.5, 4, 5, 7: the smallest gap of the neighbours bounds the radius
    const ordre = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    ordre.forEach((k, i) => {
      const voisins = [ordre[i - 1], ordre[i + 1]].filter(Boolean).map((v) => Math.abs(d(v!) - d(k)));
      const demi = Math.min(...voisins) / 2;
      assert.ok(par[k].rayon <= Math.max(3, demi) + 0.6, `${k} : rayon ${par[k].rayon}, moitié de l’écart ${demi}`);
      assert.ok(par[k].rayon >= 3, `${k} : rayon ${par[k].rayon}`);
    });
    for (const k of ['alpha-a', 'alpha-b']) assert.ok(par[k].rayon >= 3, `${k} : rayon ${par[k].rayon}`);
    await ctx.close();
  });

  it('chaque astre a son orbite tracée, la lune autour de sa planète', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    const c = await croquis(page);
    const par = Object.fromEntries((c.corps as Any[]).map((k) => [k.cle, k]));
    const anneaux = await page.locator('.cs-orbite').evaluateAll((els: Element[]) =>
      els.map((e) => ({ cle: e.getAttribute('data-cle'), cx: Number(e.getAttribute('cx')), cy: Number(e.getAttribute('cy')), r: Number(e.getAttribute('r')) })));
    const cles = anneaux.map((a: Any) => a.cle).sort();
    assert.deepEqual(cles, ['alpha', 'alpha-a', 'alpha-b', 'beta', 'delta', 'epsilon', 'gamma']);
    // the svg and the canvas do not share a frame in pixels, so compare ratios: a planet's ring radius grows with its orbit (1, 2.5, 4, 5, 7)
    const r = (k: string) => anneaux.find((a: Any) => a.cle === k).r;
    for (const [petit, grand] of [['alpha', 'beta'], ['beta', 'gamma'], ['gamma', 'delta'], ['delta', 'epsilon']]) assert.ok(r(petit!) < r(grand!), `${petit} < ${grand}`);
    // not regular: the step from 4 to 5 is smaller than the step from 5 to 7
    assert.ok(r('delta') - r('gamma') < r('epsilon') - r('delta'));
    // the moons' rings are round their planet, further for the second moon
    assert.ok(r('alpha-a') < r('alpha-b'));
    const mere = anneaux.find((a: Any) => a.cle === 'alpha-a');
    const mere2 = anneaux.find((a: Any) => a.cle === 'alpha-b');
    assert.equal(mere.cx, mere2.cx); assert.equal(mere.cy, mere2.cy);
    assert.ok(par.alpha);
    await page.screenshot({ path: `${SHOTS}/orbites.png`, fullPage: true });
    await ctx.close();
  });

  for (const [largeur, hauteur] of [[1280, 800], [390, 780]] as const) {
    it(`${largeur} px : le nom de chaque astre hors lunes est posé, sans recouvrir un autre nom (capture)`, async () => {
      const { page, ctx } = await ouvrir(largeur, hauteur);
      const c = await croquis(page);
      const visibles = (c.etiquettes as Any[]).filter((e) => e.visible);
      for (const nom of ['Soleil-neutre', 'Alpha', 'Bêta', 'Gamma', 'Delta', 'Epsilon']) assert.ok(visibles.some((e) => e.texte === nom), `« ${nom} » posé`);
      for (let i = 0; i < visibles.length; i++) for (let j = i + 1; j < visibles.length; j++) {
        const a = visibles[i], b = visibles[j];
        assert.equal(a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur, false, `« ${a.texte} » chevauche « ${b.texte} »`);
      }
      await page.screenshot({ path: `${SHOTS}/${largeur}-noms.png`, fullPage: true });
      await ctx.close();
    });
  }
});
