// ecrans: cartes
// Browser test of kanevas-carte-rendu-habillage-sorties-carte (E-23, P-27, B-115, AD-sorties-3): the transition zone is a legended halo,
// each exit an arrow in the colour of its route. Distance and type are proved at the door by the `-lecture` task; here only what is seen.
// Neutral fixture (AD-131). Screenshots go to /tmp/cap-carte-sorties (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-sorties';
const O = { q: 80, r: 81 };

describe('E-23 le halo de transition et les flèches de sortie', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  const adr = (q: number, r: number) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${q}/${r}`;
  const croquis = (page: Any) => page.evaluate(() => (window as Any).__carteSysteme?.() ?? null);
  const ouvrir = async (compte: string, largeur: number, hauteur: number, theme = 'dark') => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(adr(O.q, O.r));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await c.page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.etiquettes ?? []).some((e: Any) => e.visible), undefined, { timeout: 30000 });
    await c.page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
    return c;
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-sorties-')), 'k.db');
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
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu, transition) VALUES (?,?,?,?,?,?,3,'accent','',?,0,?)");
      const centre = sys.run(gid, univers, 'so-centre', 'Système neutre', O.q, O.r, 0, 8).lastInsertRowid as number;
      const pirate = sys.run(gid, univers, 'so-pirate', 'Voisin pirate', O.q + 1, O.r, 0, null).lastInsertRowid as number;
      const sans = sys.run(gid, univers, 'so-sans', 'Voisin sans type', O.q - 1, O.r, 0, null).lastInsertRowid as number;
      const prive = sys.run(gid, univers, 'so-prive', 'Voisin privé', O.q, O.r - 1, 0, null).lastInsertRowid as number;
      const route = db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur, type_lien) VALUES (?,?,?,?,?,3,?)');
      route.run(gid, univers, centre, pirate, 1, 'Pirate');
      route.run(gid, univers, centre, sans, 1, null);
      route.run(gid, univers, centre, prive, 0, 'Privée');
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      ast.run(centre, 'etoile', 'etoile', null, 0, 'jaune', 'Étoile', 0, 0, 1);
      ast.run(centre, 'p1', 'planete', null, 0, 'tellurique', 'Première', 1, 4, 0.3);
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  const couleurs = async (page: Any) => page.evaluate(() => {
    const lire = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; return e ? getComputedStyle(e).color : null; };
    const jeton = (nom: string) => { const p = document.createElement('i'); p.style.color = `var(${nom})`; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
    return { pirate: lire('.cs-sortie.pirate'), autre: lire('.cs-sortie.autre'), tPirate: jeton('--route-pirate'), tAutre: jeton('--route-autre') };
  });

  it('la flèche pirate et la flèche sans type ont la couleur de leur token, la légende du halo est là, dans les deux thèmes', async () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const [l, h] of [[1280, 800], [390, 780]] as const) {
        const { page, ctx } = await ouvrir('Antor', l, h, theme);
        await page.locator('.cs-sortie.pirate').waitFor();
        const c = await couleurs(page);
        assert.equal(c.pirate, c.tPirate, `${theme} ${l} px : flèche pirate`);
        assert.equal(c.autre, c.tAutre, `${theme} ${l} px : flèche sans type`);
        assert.notEqual(c.pirate, c.autre);
        assert.equal(await page.locator('.cs-halo').count(), 1);
        const cr = await croquis(page);
        const texte = (cr.etiquettes as Any[]).filter((e) => e.visible).map((e) => e.texte);
        assert.ok(texte.includes('Voisin pirate · 3 cases'), `${theme} ${l} px : étiquette de la sortie : ${texte.join(' | ')}`);
        await page.screenshot({ path: `${SHOTS}/${l}-${theme}.png`, fullPage: true });
        await ctx.close();
      }
    }
  });

  it('à 1280 px la légende « Zone de transition » est affichée', async () => {
    const { page, ctx } = await ouvrir('Antor', 1280, 800);
    await page.locator('.cs-etiquette[data-cle="zone:transition"]').waitFor();
    assert.equal(await page.locator('.cs-etiquette[data-cle="zone:transition"]').innerText(), 'Zone de transition');
    await ctx.close();
  });

  it('à 390 px aucune étiquette ne recouvre un astre, un nom ni une flèche (boîtes du DOM)', async () => {
    const { page, ctx } = await ouvrir('Antor', 390, 780);
    await page.locator('.cs-sortie').first().waitFor();
    const boites = await page.evaluate(() => {
      const b = (e: Element) => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, id: e.getAttribute('data-cle') ?? e.getAttribute('aria-label') ?? '' }; };
      return {
        etiquettes: [...document.querySelectorAll('.cs-etiquette')].map(b),
        autres: [...document.querySelectorAll('.cs-corps, .cs-sortie svg')].map(b),
      };
    });
    const se = (a: Any, c: Any) => a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;
    for (const [i, e] of (boites.etiquettes as Any[]).entries()) {
      for (const f of (boites.etiquettes as Any[]).slice(i + 1)) assert.equal(se(e, f), false, `${e.id} chevauche ${f.id}`);
      for (const f of boites.autres as Any[]) assert.equal(se(e, f), false, `${e.id} recouvre ${f.id}`);
    }
    await ctx.close();
  });

  it('cliquer la flèche ouvre le système voisin ; l’aria-label de la pirate finit par « , route Pirate »', async () => {
    const { page, ctx } = await ouvrir('Antor', 1280, 800);
    const f = page.locator('.cs-sortie.pirate');
    const label = (await f.getAttribute('aria-label')) as string;
    assert.match(label, /^Aller au système Voisin pirate, 3 cases, route Pirate$/);
    assert.equal(await f.getAttribute('title'), 'Pirate');
    assert.equal(await page.locator('.cs-sortie.autre').getAttribute('aria-label'), 'Aller au système Voisin sans type, 3 cases');
    await f.click();
    await page.waitForURL(new RegExp(`/interieur/${O.q + 1}/${O.r}$`));
    await ctx.close();
  });

  it('une joueuse ne voit que la flèche de la route publique, sans trou ni compte', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await page.locator('.cs-sortie').first().waitFor();
    const noms = await page.locator('.cs-sortie').evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('aria-label')));
    assert.equal(noms.length, 2, `flèches de la joueuse : ${JSON.stringify(noms)}`);
    assert.ok(noms.every((n: string) => !/privé/i.test(n)));
    await ctx.close();
  });
});
