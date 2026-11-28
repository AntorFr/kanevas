// ecrans: cartes
// Whole-feature screen test of kanevas-carte-rendu-cometes (E-23, B-116, P-27), written from the sheet, docs/parcours.md B-116 and
// docs/ecrans.md « Comets »: what the user sees on the map of a system. Nothing here is a server effect (the comets are drawn from rows
// the system already serves); the pure geometry has its own test in frontend/src/outils/swn/galaxie/cometes-ensemble-besoin.test.ts.
// Neutral fixture. Expected values are literals: the gold of the gardien's verdict is #f2c36b = rgb(242, 195, 107) (docs/charte.md).
// Screenshots go to /tmp/cap-carte-cometes-ensemble (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-cometes-ensemble';
const S1 = { q: 80, r: 80 }; // star, planet, three comets (east, near west, far west)
const PLUS = { q: 81, r: 80 }; // one comet, sens +1
const MOINS = { q: 82, r: 80 }; // the same comet, sens -1
const VIDE = { q: 83, r: 80 }; // no comet
const COMPAGNON = { q: 84, r: 80 }; // a companion star, a comet that turns round it
const BORDS = { q: 85, r: 80 }; // perihelion absent / 0 / larger than the orbit, comet on its star
const LOIN = { q: 86, r: 80 }; // a far comet, read at 390 px zoomed out

describe('E-23 une comète montre sa queue détournée de l’étoile et sa trajectoire, la choisie en or', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  const adr = (p: { q: number; r: number }) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${p.q}/${p.r}`;
  const ouvrir = async (compte: string, p: { q: number; r: number }, largeur = 1280, hauteur = 800, theme = 'dark') => {
    const c = await connecte(browser, srv.base, compte);
    const erreurs: string[] = [];
    c.page.on('pageerror', (e: Any) => erreurs.push(String(e)));
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(adr(p));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await c.page.waitForFunction(() => (window as Any).__carteSysteme?.()?.pret === true, undefined, { timeout: 30000 });
    await c.page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
    return { ...c, erreurs };
  };
  const crochet = (page: Any, nom: string) => page.evaluate((n: string) => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute(n) ?? '[]'), nom);
  const attendre = (page: Any, nom: string, cle: string) =>
    page.waitForFunction(([n, k]: string[]) => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute(n) ?? '[]').some((e: Any) => e.cle === k), [nom, cle], { timeout: 30000 });
  const trajet = async (page: Any, cle: string) => (await crochet(page, 'data-trajet-comete')).find((t: Any) => t.cle === cle);
  const queue = async (page: Any, cle: string) => (await crochet(page, 'data-queue-comete')).find((t: Any) => t.cle === cle);
  const corps = async (page: Any, cle: string) => ((await page.evaluate(() => (window as Any).__carteSysteme())).corps as Any[]).find((c) => c.cle === cle);
  const choisir = async (page: Any, cle: string) => {
    await page.locator(`.cs-corps[data-cle="${cle}"]`).click();
    await page.waitForFunction((k: string) => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute('data-trajet-comete') ?? '[]').every((t: Any) => (t.cle === k) === (t.epaisseur === 2)), cle, { timeout: 30000 });
  };
  /** The full-alpha pixels of the gold line (242, 195, 107, ±12), read on the canvas, away from the star's and the comet's own picture. */
  const orSurToile = (page: Any, etoile: Any, comete: Any) => page.locator('canvas.cs-toile').evaluate((cv: HTMLCanvasElement, [e, c]: Any) => {
    const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    const pts: number[][] = [];
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 3] < 250 || Math.abs(d[i]! - 242) > 12 || Math.abs(d[i + 1]! - 195) > 12 || Math.abs(d[i + 2]! - 107) > 12) continue;
      const px = x / k, py = y / k;
      if (Math.hypot(px - e.x, py - e.y) < 45 || Math.hypot(px - c.x, py - c.y) < 30) continue;
      pts.push([px, py]);
    }
    return pts;
  }, [etoile, comete]);

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-cometes-ens-')), 'k.db');
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
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)");
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      const nouveau = (cle: string, nom: string, p: { q: number; r: number }) => {
        const id = sys.run(gid, univers, cle, nom, p.q, p.r).lastInsertRowid as number;
        ast.run(id, 'etoile', 'etoile', null, 0, 'jaune', 'Étoile', 0, 0, 1, '{}');
        return id;
      };
      const comete = (id: number, cle: string, nom: string, orbite: number, heure: number, aspect: Record<string, unknown>, rang = 0) =>
        ast.run(id, cle, 'comete', null, rang, 'comete', nom, orbite, heure, 0.1, JSON.stringify(aspect));
      const s1 = nouveau('ce-s1', 'Système des comètes', S1);
      ast.run(s1, 'p1', 'planete', null, 0, 'tellurique', 'Planète', 2, 6, 0.3, '{}');
      comete(s1, 'aurore', 'Aurore', 6, 3, { perihelie: 1 });
      comete(s1, 'brume', 'Brume', 3, 9, { perihelie: 1 });
      comete(s1, 'lointaine', 'Lointaine', 12, 9, { perihelie: 1 });
      comete(nouveau('ce-plus', 'Sens direct', PLUS), 'c', 'Comète', 6, 3, { perihelie: 1, sens: 1 });
      comete(nouveau('ce-moins', 'Sens inverse', MOINS), 'c', 'Comète', 6, 3, { perihelie: 1, sens: -1 });
      const v = nouveau('ce-vide', 'Sans comète', VIDE);
      ast.run(v, 'p1', 'planete', null, 0, 'tellurique', 'Planète', 2, 6, 0.3, '{}');
      const comp = nouveau('ce-comp', 'Étoile double', COMPAGNON);
      ast.run(comp, 'etoile2', 'etoile', null, 1, 'rouge', 'Compagne', 5, 3, 0.8, '{}');
      comete(comp, 'rouge', 'Rouge', 2, 9, { perihelie: 1 }, 1);
      const b = nouveau('ce-bords', 'Bords', BORDS);
      ast.run(b, 'p1', 'planete', null, 0, 'tellurique', 'Planète', 2, 6, 0.3, '{}');
      comete(b, 'sansperi', 'Sans périhélie', 6, 2, {});
      comete(b, 'perizero', 'Périhélie zéro', 6, 4, { perihelie: 0 });
      comete(b, 'perigrand', 'Périhélie trop grand', 6, 8, { perihelie: 99 });
      comete(b, 'surplace', 'Sur l’étoile', 0, 0, { perihelie: 1 });
      comete(nouveau('ce-loin', 'Comète lointaine', LOIN), 'c', 'Comète', 12, 3, { perihelie: 1 });
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('E-23 nominal : au repos chaque comète a sa trajectoire en tirets ; choisir Aurore la trace en or continu #f2c36b, les autres restent en tirets (dark et light)', async () => {
    for (const theme of ['dark', 'light'] as const) {
      const { page, ctx } = await ouvrir('Léa', S1, 1280, 800, theme);
      await attendre(page, 'data-trajet-comete', 'aurore');
      for (const cle of ['aurore', 'brume', 'lointaine']) {
        const t = await trajet(page, cle);
        assert.ok(t, `${theme} : ${cle} a une trajectoire`);
        assert.equal(t.tirets, true, `${theme} : ${cle} au repos, en tirets`);
        assert.equal(t.epaisseur, 1);
      }
      await choisir(page, 'aurore');
      const a = await trajet(page, 'aurore');
      assert.equal(a.tirets, false, `${theme} : trait continu`);
      assert.equal(a.epaisseur, 2);
      assert.deepEqual((a.couleur as string).toLowerCase(), '#f2c36b', `${theme} : couleur d’or`);
      for (const cle of ['brume', 'lointaine']) assert.equal((await trajet(page, cle)).tirets, true, `${theme} : ${cle} reste en tirets`);
      assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système. Trajectoire de Aurore affichée');
      await page.screenshot({ path: `${SHOTS}/nominal-${theme}.png` });
      await ctx.close();
    }
  });

  it('E-23 la trajectoire d’or est dessinée : des pixels or de part et d’autre de l’étoile, et au voisinage de la comète', async () => {
    const { page, ctx } = await ouvrir('Léa', S1);
    await attendre(page, 'data-trajet-comete', 'aurore');
    await choisir(page, 'aurore');
    const et = await corps(page, 'etoile'); const co = await corps(page, 'aurore');
    // wait for pixels (the canvas is redrawn after the choice), not for a delay
    await page.waitForFunction(([e, c]: Any) => {
      const cv = document.querySelector('canvas.cs-toile') as HTMLCanvasElement; const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
      const d = cv.getContext('2d')!.getImageData(Math.round((c.x - 60) * k), Math.round((c.y - 60) * k), Math.round(120 * k), Math.round(120 * k)).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]! >= 250 && Math.abs(d[i]! - 242) <= 12 && Math.abs(d[i + 1]! - 195) <= 12 && Math.abs(d[i + 2]! - 107) <= 12) return true;
      return false;
    }, [et, co], { timeout: 30000 });
    const pts = await orSurToile(page, et, co);
    assert.ok(pts.length > 150, `la ligne d’or compte ${pts.length} pixels`);
    const xs = pts.map((p: number[]) => p[0]!); const ys = pts.map((p: number[]) => p[1]!);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 150 || Math.max(...ys) - Math.min(...ys) > 150, 'la ligne est étendue (une trajectoire entière)');
    // the line goes round the star: points on both sides of it
    assert.ok(pts.some((p: number[]) => p[0]! < et.x) && pts.some((p: number[]) => p[0]! > et.x), 'de part et d’autre de l’étoile (en x)');
    // and through the comet: gold pixels within 60 px of its head
    assert.ok(pts.some((p: number[]) => Math.hypot(p[0]! - co.x, p[1]! - co.y) < 60), 'la ligne passe par la comète');
    await page.screenshot({ path: `${SHOTS}/ligne-or.png` });
    await ctx.close();
  });

  it('E-23 la queue est tournée à l’opposé de l’étoile : Aurore à l’est (3 h) traîne vers la droite, Brume à l’ouest (9 h) vers la gauche', async () => {
    const { page, ctx } = await ouvrir('Léa', S1);
    await attendre(page, 'data-queue-comete', 'aurore');
    await attendre(page, 'data-queue-comete', 'brume');
    const a = await queue(page, 'aurore'); const b = await queue(page, 'brume');
    assert.ok(Math.cos(a.angle) > 0.3, `Aurore (est) : queue vers la droite, angle ${a.angle}`);
    assert.ok(Math.cos(b.angle) < -0.3, `Brume (ouest) : queue vers la gauche, angle ${b.angle}`);
    await ctx.close();
  });

  it('E-23 la queue d’une comète proche de l’étoile (3 unités) est plus longue que celle de la même comète loin (12 unités)', async () => {
    const { page, ctx } = await ouvrir('Léa', S1);
    await attendre(page, 'data-queue-comete', 'brume');
    await attendre(page, 'data-queue-comete', 'lointaine');
    const pres = (await queue(page, 'brume')).longueur; const loin = (await queue(page, 'lointaine')).longueur;
    assert.ok(loin > 0, 'la queue lointaine existe (jamais coupée net)');
    assert.ok(pres > loin * 1.2, `proche ${pres} px > lointaine ${loin} px`);
    await ctx.close();
  });

  it('E-23 choisir une planète retire l’or et le texte alternatif ; toucher le ciel vide remet les tirets', async () => {
    const { page, ctx } = await ouvrir('Léa', S1);
    await attendre(page, 'data-trajet-comete', 'aurore');
    await choisir(page, 'aurore');
    assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système. Trajectoire de Aurore affichée');
    await choisir(page, 'p1');
    assert.equal((await trajet(page, 'aurore')).tirets, true, 'plus d’or après avoir choisi la planète');
    assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système');
    await choisir(page, 'brume');
    assert.equal((await trajet(page, 'brume')).epaisseur, 2, 'Brume est la choisie');
    assert.equal((await trajet(page, 'aurore')).epaisseur, 1, 'Aurore n’est plus la choisie');
    assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système. Trajectoire de Brume affichée');
    // empty sky: the top-left corner of the canvas holds no body
    const cv = await page.locator('canvas.cs-toile').boundingBox();
    await page.mouse.click(cv.x + 4, cv.y + 4);
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute('data-trajet-comete') ?? '[]').every((t: Any) => t.epaisseur === 1), undefined, { timeout: 30000 });
    assert.equal((await trajet(page, 'brume')).tirets, true);
    assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système');
    await ctx.close();
  });

  it('E-23 la comète se choisit au clavier : son bouton est dans l’ordre des tabulations et Entrée trace sa trajectoire en or', async () => {
    const { page, ctx } = await ouvrir('Léa', S1);
    await attendre(page, 'data-trajet-comete', 'aurore');
    const b = page.locator('.cs-corps[data-cle="aurore"]');
    assert.notEqual(await b.getAttribute('tabindex'), '-1', 'le bouton de la comète est atteint par Tab');
    await b.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas.cs-toile')?.getAttribute('data-trajet-comete') ?? '[]').some((t: Any) => t.cle === 'aurore' && t.epaisseur === 2), undefined, { timeout: 30000 });
    assert.equal((await trajet(page, 'aurore')).tirets, false);
    // the line is never a target: the only focusable elements of the sky are the bodies' buttons
    const sansLigne = await page.locator('.cs-ciel').evaluate((ciel: HTMLElement) => [...ciel.querySelectorAll('[tabindex]')].every((e) => (e as HTMLElement).classList.contains('cs-corps') || e.getAttribute('tabindex') === '-1' || e.tagName === 'BUTTON' || e.tagName === 'A'));
    assert.ok(sansLigne, 'rien d’autre qu’un corps ou un bouton dans l’ordre des tabulations du ciel');
    await ctx.close();
  });

  it('E-23 sens −1 : la trajectoire est la symétrique de celle du sens +1 par rapport à l’axe étoile–comète', async () => {
    const cote = async (p: { q: number; r: number }) => {
      const { page, ctx } = await ouvrir('Léa', p);
      await attendre(page, 'data-trajet-comete', 'c');
      await choisir(page, 'c');
      const et = await corps(page, 'etoile'); const co = await corps(page, 'c');
      await page.waitForFunction(([e, c]: Any) => {
        const cv = document.querySelector('canvas.cs-toile') as HTMLCanvasElement; const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
        const d = cv.getContext('2d')!.getImageData(Math.round((c.x - 60) * k), Math.round((c.y - 60) * k), Math.round(120 * k), Math.round(120 * k)).data;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3]! >= 250 && Math.abs(d[i]! - 242) <= 12 && Math.abs(d[i + 1]! - 195) <= 12 && Math.abs(d[i + 2]! - 107) <= 12) return true;
        return false;
      }, [et, co], { timeout: 30000 });
      const pts = await orSurToile(page, et, co);
      const n = pts.length;
      const cx = pts.reduce((s: number, q: number[]) => s + q[0]!, 0) / n - et.x, cy = pts.reduce((s: number, q: number[]) => s + q[1]!, 0) / n - et.y;
      const ax = co.x - et.x, ay = co.y - et.y;
      const croise = (ax * cy - ay * cx) / (Math.hypot(ax, ay) * Math.hypot(cx, cy));
      await page.screenshot({ path: `${SHOTS}/sens-${p.q}.png` });
      await ctx.close();
      return { n, croise };
    };
    const plus = await cote(PLUS); const moins = await cote(MOINS);
    assert.ok(plus.n > 100 && moins.n > 100, `lignes dessinées : ${plus.n} / ${moins.n}`);
    assert.ok(Math.abs(plus.croise) > 0.2, `sens +1 : la ligne est d’un côté de l’axe (${plus.croise})`);
    assert.ok(plus.croise * moins.croise < 0, `sens −1 : de l’autre côté (${plus.croise} / ${moins.croise})`);
    assert.ok(Math.abs(Math.abs(plus.croise) - Math.abs(moins.croise)) < 0.05, 'et symétrique');
  });

  it('E-23 bords : périhélie absente, nulle, plus grande que l’orbite, comète sur son étoile : chacune a sa ligne et sa queue, sans erreur, et se choisit en or', async () => {
    const { page, ctx, erreurs } = await ouvrir('Léa', BORDS);
    for (const cle of ['sansperi', 'perizero', 'perigrand', 'surplace']) {
      await attendre(page, 'data-trajet-comete', cle);
      await attendre(page, 'data-queue-comete', cle);
      assert.ok((await queue(page, cle)).longueur > 0, `${cle} : une queue`);
      await choisir(page, cle);
      assert.deepEqual([(await trajet(page, cle)).tirets, (await trajet(page, cle)).epaisseur], [false, 2], `${cle} : en or`);
    }
    const s = await queue(page, 'surplace');
    assert.ok(Math.sin(s.angle) < -0.3, `la comète sur son étoile : queue vers le haut, angle ${s.angle}`);
    assert.deepEqual(erreurs, [], 'aucune erreur de page');
    await page.screenshot({ path: `${SHOTS}/bords.png` });
    await ctx.close();
  });

  it('E-23 Léa (Joueuse) et Antor (MJ) voient les mêmes queues, les mêmes lignes et le même texte alternatif', async () => {
    const lire = async (compte: string) => {
      const { page, ctx } = await ouvrir(compte, S1);
      await attendre(page, 'data-trajet-comete', 'lointaine');
      await attendre(page, 'data-queue-comete', 'lointaine');
      await choisir(page, 'brume');
      const out = { trajets: await crochet(page, 'data-trajet-comete'), queues: (await crochet(page, 'data-queue-comete')).map((q: Any) => ({ cle: q.cle, longueur: Math.round(q.longueur) })), aria: await page.locator('.cs-ciel').getAttribute('aria-label') };
      await ctx.close();
      return out;
    };
    const lea = await lire('Léa'); const antor = await lire('Antor');
    assert.equal(lea.aria, 'Carte du système. Trajectoire de Brume affichée');
    assert.deepEqual(lea.trajets, antor.trajets);
    assert.deepEqual(lea.queues, antor.queues);
    assert.equal(lea.trajets.length, 3);
    assert.equal(lea.aria, antor.aria);
  });

  it('E-23 une comète qui tourne autour de la compagne a sa queue à l’opposé de la compagne, pas de l’étoile principale', async () => {
    const { page, ctx } = await ouvrir('Léa', COMPAGNON);
    await attendre(page, 'data-queue-comete', 'rouge');
    const comp = await corps(page, 'etoile2'); const co = await corps(page, 'rouge'); const q = await queue(page, 'rouge');
    const vers = Math.atan2(co.y - comp.y, co.x - comp.x);
    assert.ok(Math.cos(q.angle - vers) > 0.3, `queue à l’opposé de la compagne : angle ${q.angle}, direction ${vers}`);
    await page.screenshot({ path: `${SHOTS}/compagne.png` });
    await ctx.close();
  });

  it('E-23 un système sans comète ne montre ni queue ni trajectoire et garde son texte alternatif', async () => {
    const { page, ctx } = await ouvrir('Léa', VIDE);
    await page.locator('.cs-corps[data-cle="p1"]').waitFor();
    assert.deepEqual(await crochet(page, 'data-trajet-comete'), []);
    assert.deepEqual(await crochet(page, 'data-queue-comete'), []);
    assert.equal(await page.locator('.cs-ciel').getAttribute('aria-label'), 'Carte du système');
    await ctx.close();
  });

  it('E-23 à 390 px dézoomé au minimum, la tête et la coma d’une comète lointaine restent dessinées', async () => {
    const { page, ctx } = await ouvrir('Léa', LOIN, 390, 780);
    await attendre(page, 'data-queue-comete', 'c');
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /Zoom arrière/ }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom <= 0.51);
    await page.waitForFunction(() => {
      const co = (window as Any).__carteSysteme().corps.find((c: Any) => c.cle === 'c');
      const cv = document.querySelector('canvas.cs-toile') as HTMLCanvasElement | null;
      if (!co || !cv) return false;
      const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
      const d = cv.getContext('2d')!.getImageData(Math.round(co.x * k) - 3, Math.round(co.y * k) - 3, 7, 7).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n >= 9; // a head of 4 px radius covers well over 9 of the 49 pixels sampled
    }, undefined, { timeout: 30000 });
    await page.screenshot({ path: `${SHOTS}/390-dezoome.png` });
    await ctx.close();
  });
});
