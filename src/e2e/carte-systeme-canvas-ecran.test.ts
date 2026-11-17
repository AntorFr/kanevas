// ecrans: cartes
// Browser test of kanevas-carte-spatiale-carte-canvas (E-23, the canvas), written from the exit criterion — not from the code.
// A defined system of 12 bodies (moons, a ring, a cloud, a companion, a comet, an anomaly) is laid down in rows by the test.
// Screenshots go to /tmp/cap-carte-canvas (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-canvas';
const LONG = 'Grande-Planète-au-nom-démesurément-long-qui-ne-tient-pas-sur-390-pixels-ok';
const O = { q: 60, r: 61 };

describe('E-23 le système sur un canvas', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const sql = (fn: (db: Any) => void) => { const db = new Database(dbPath); try { fn(db); } finally { db.close(); } };
  const adr = (q: number, r: number, suffixe = '') => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${q}/${r}${suffixe}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const croquis = (page: Any) => page.evaluate(() => (window as Any).__carteSysteme?.() ?? null);
  const prete = async (page: Any) => {
    await page.waitForFunction(() => (window as Any).__carteSysteme?.()?.pret === true, undefined, { timeout: 30000 });
    // the sky is laid out and the sprites asked: wait for the labels to be placed
    await page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.etiquettes ?? []).some((e: Any) => e.visible), undefined, { timeout: 30000 });
  };
  const ouvrir = async (compte: string, largeur: number, hauteur: number, url = adr(O.q, O.r)) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(url);
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    return c;
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-canvas-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
    sql((db) => {
      const E = univers;
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)");
      const centre = sys.run(gid, E, 'cv-centre', 'Centre-canvas', O.q, O.r, 0).lastInsertRowid as number;
      const voisinPublic = sys.run(gid, E, 'cv-est', 'Voisin-est', O.q + 1, O.r, 0).lastInsertRowid as number;
      const voisinPrive = sys.run(gid, E, 'cv-ouest', 'Voisin-privé', O.q - 1, O.r, 0).lastInsertRowid as number;
      const voisinCache = sys.run(gid, E, 'cv-cache', 'Voisin-caché', O.q, O.r - 1, 1).lastInsertRowid as number;
      const route = db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?,?,?,?,?,3)');
      route.run(gid, E, centre, voisinPublic, 1);
      route.run(gid, E, centre, voisinPrive, 0);
      route.run(gid, E, centre, voisinCache, 1);
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const id = (cle: string, genre: string, type: string, nom: string, orbite: number | null, heure: number, taille: number, rang = 0, parent: number | null = null) =>
        ast.run(centre, cle, genre, parent, rang, type, nom, orbite, heure, taille).lastInsertRowid as number;
      id('etoile', 'etoile', 'jaune', 'Soleil-test', 0, 0, 1);
      id('compagne', 'etoile', 'naine_rouge', 'Compagne-test', 6.5, 2, 0.5, 1);
      const alpha = id('alpha', 'planete', 'tellurique', 'Alpha', 1, 3, 0.3);
      id('alpha-a', 'lune', 'rocheux', 'Alpha a', null, 1, 0.1, 0, alpha);
      id('alpha-b', 'lune', 'glace', 'Alpha b', null, 5, 0.1, 0, alpha);
      const beta = id('beta', 'planete', 'gazeuse', 'Bêta', 2, 7, 0.6);
      id('beta-a', 'lune', 'rocheux', 'Bêta a', null, 9, 0.1, 0, beta);
      id('longue', 'planete', 'glace', LONG, 3.4, 10, 0.3);
      id('gamma', 'planete', 'lave', 'Gamma', 4, 1, 0.3);
      id('anomalie', 'planete', 'anomalie', 'Anomalie-test', 5, 5, 0.1);
      id('comete', 'comete', 'comete', 'Comète-test', 7, 9, 0.1);
      id('delta', 'planete', 'rocheux', 'Delta', 5.5, 8, 0.2);
      const form = db.prepare('INSERT INTO swn_formations (systeme_id, cle, forme, etoile_rang, nom, parametres) VALUES (?,?,?,?,?,?)');
      form.run(centre, 'ceinture', 'anneau', 0, 'Ceinture-test', JSON.stringify({ de: 2.6, a: 3.0, rochers: 0.8 }));
      form.run(centre, 'nuage', 'nuage', 0, 'Nuage-test', JSON.stringify({ orbite: 6, heure: 4 }));
    });
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  const rect = (e: Any) => ({ x0: e.x, y0: e.y, x1: e.x + e.largeur, y1: e.y + e.hauteur });
  const nonChevauchement = (c: Any, contexte: string) => {
    const vues = (c.etiquettes as Any[]).filter((e) => e.visible);
    assert.ok(vues.length >= 8, `${contexte} : au moins 8 étiquettes placées, ${vues.length} obtenues`);
    for (let i = 0; i < vues.length; i++) {
      const a = rect(vues[i]);
      assert.ok(a.x0 >= 0 && a.y0 >= 0 && a.x1 <= c.largeur && a.y1 <= c.hauteur, `${contexte} : ${vues[i].cle} sort du ciel`);
      for (let j = i + 1; j < vues.length; j++) {
        const b = rect(vues[j]);
        const meme = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        assert.equal(meme, false, `${contexte} : « ${vues[i].texte} » chevauche « ${vues[j].texte} »`);
      }
      for (const k of c.corps as Any[]) {
        if (k.rayon <= 0) continue;
        const px = Math.max(a.x0, Math.min(k.x, a.x1));
        const py = Math.max(a.y0, Math.min(k.y, a.y1));
        assert.ok(Math.hypot(px - k.x, py - k.y) >= k.rayon, `${contexte} : « ${vues[i].texte} » recouvre le corps ${k.cle}`);
      }
    }
  };

  for (const [largeur, hauteur] of [[1280, 800], [390, 780]] as const) {
    it(`${largeur} px : 12 corps dessinés, aucune étiquette ne chevauche une autre ni un corps (crochet de test)`, async () => {
      const { page, ctx } = await ouvrir('Léa', largeur, hauteur);
      await prete(page);
      const c = await croquis(page);
      const corps = (c.corps as Any[]).filter((k) => !k.cle.startsWith('zone:') && !k.cle.startsWith('sortie:'));
      assert.equal(corps.length, 12);
      assert.equal(c.zoom, 1);
      nonChevauchement(c, `${largeur} px`);
      // the hour marks (12 h, 3 h, 6 h, 9 h) are obstacles too: no label covers them (recette B-89)
      const heures = await page.locator('.cs-heure text').evaluateAll((els: Element[]) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      assert.equal(heures.length, 4);
      const etiq = await page.locator('.cs-etiquette').evaluateAll((els: Element[]) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const h of heures) for (const e of etiq) {
        const recouvre = e.x < h.x + h.w && h.x < e.x + e.w && e.y < h.y + h.h && h.y < e.y + e.h;
        assert.equal(recouvre, false, `${largeur} px : « ${e.t} » recouvre « ${h.t} »`);
      }
      await hors(page, `${largeur}-systeme-12-corps`);
      await ctx.close();
    });
  }

  it('un glisser déplace la vue ; Recentrer la ramène', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    const ciel = page.locator('.cs-ciel');
    const b = await ciel.boundingBox();
    const avant = await croquis(page);
    // from an empty corner of the sky: a drag of 80 × 40 px
    await page.mouse.move(b.x + 12, b.y + 12);
    await page.mouse.down();
    await page.mouse.move(b.x + 52, b.y + 32, { steps: 4 });
    await page.mouse.move(b.x + 92, b.y + 52, { steps: 4 });
    await page.mouse.up();
    const apres = await croquis(page);
    assert.equal(Math.round(apres.decalage[0] - avant.decalage[0]), 80);
    assert.equal(Math.round(apres.decalage[1] - avant.decalage[1]), 40);
    assert.equal(apres.zoom, 1);
    await page.getByRole('button', { name: 'Recentrer' }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().decalage[0] === 0);
    assert.deepEqual((await croquis(page)).decalage, [0, 0]);
    await ctx.close();
  });

  it('un glisser n’est pas un toucher : il ne désélectionne pas', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    const b = await page.locator('.cs-ciel').boundingBox();
    await page.locator('.cs-corps').first().click();
    assert.equal(await page.locator('.cs-corps[aria-pressed="true"]').count(), 1);
    await page.mouse.move(b.x + 12, b.y + 12);
    await page.mouse.down();
    await page.mouse.move(b.x + 60, b.y + 40, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.locator('.cs-corps[aria-pressed="true"]').count(), 1);
    await ctx.close();
  });

  it('la molette et « + » « − » zooment entre 0,5× et 4× et pas au-delà', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    const b = await page.locator('.cs-ciel').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400);
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom >= 3.99);
    assert.equal((await croquis(page)).zoom, 4);
    await page.getByRole('button', { name: /Zoom avant/ }).click();
    assert.equal((await croquis(page)).zoom, 4);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /Zoom arrière/ }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom <= 0.51);
    assert.equal((await croquis(page)).zoom, 0.5);
    await page.getByRole('button', { name: 'Recentrer' }).click();
    await page.waitForFunction(() => (window as Any).__carteSysteme().zoom === 1);
    await ctx.close();
  });

  it('un pincement (deux doigts simulés) zoome la vue, borné à [0,5×, 4×]', async () => {
    const { page, ctx } = await ouvrir('Léa', 390, 780);
    await prete(page);
    const b = await page.locator('.cs-ciel').boundingBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const cdp = await ctx.newCDPSession(page);
    const touch = (type: string, pts: { x: number; y: number; id: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
    const deux = (d: number) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    const avant = (await croquis(page)).zoom;
    await touch('touchStart', deux(30));
    for (const d of [40, 55, 75, 100, 130]) await touch('touchMove', deux(d));
    await touch('touchEnd', []);
    const ouvert = (await croquis(page)).zoom;
    assert.ok(ouvert > avant * 1.5 && ouvert <= 4, `zoom après écartement : ${ouvert}`);
    // pinching in, far more than needed: the floor holds
    await touch('touchStart', deux(130));
    for (const d of [100, 70, 40, 20, 10, 4]) await touch('touchMove', deux(d));
    await touch('touchEnd', []);
    const ferme = (await croquis(page)).zoom;
    assert.ok(ferme < ouvert && ferme >= 0.5, `zoom après rapprochement : ${ferme}`);
    // pinching out, far more than needed: the ceiling holds
    await touch('touchStart', deux(10));
    for (let d = 20; d < 700; d += 60) await touch('touchMove', deux(d));
    await touch('touchEnd', []);
    assert.ok((await croquis(page)).zoom <= 4);
    await ctx.close();
  });

  it('les cases « orbites » et « heures » sont cochées et masquent puis montrent leurs traits', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    const orbites = page.getByRole('checkbox', { name: 'orbites' });
    const heures = page.getByRole('checkbox', { name: 'heures' });
    assert.equal(await orbites.isChecked(), true);
    assert.equal(await heures.isChecked(), true);
    assert.ok((await page.locator('.cs-orbite').count()) > 0);
    assert.equal(await page.locator('.cs-heure').count(), 12);
    await orbites.uncheck();
    assert.equal(await page.locator('.cs-orbite').count(), 0);
    assert.equal(await page.locator('.cs-heure').count(), 12, 'les heures restent');
    await heures.uncheck();
    assert.equal(await page.locator('.cs-heure').count(), 0);
    assert.equal(await page.locator('.cs-transition').count(), 1, 'le cercle de transition reste');
    await orbites.check();
    await heures.check();
    assert.ok((await page.locator('.cs-orbite').count()) > 0);
    assert.equal(await page.locator('.cs-heure').count(), 12);
    await ctx.close();
  });

  it('un toucher sur le ciel vide désélectionne ; un toucher sur un corps le sélectionne', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    const b = await page.locator('.cs-ciel').boundingBox();
    const alpha = page.locator('.cs-corps[data-cle="alpha"]');
    await alpha.click();
    assert.equal(await alpha.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.gx-lignes li.choisi').count(), 1, 'la ligne de liste du corps est choisie aussi');
    await page.mouse.click(b.x + 8, b.y + 8);
    assert.equal(await page.locator('.cs-corps[aria-pressed="true"]').count(), 0);
    assert.equal(await page.locator('.gx-lignes li.choisi').count(), 0);
    await hors(page, '1280-deselection');
    await ctx.close();
  });

  it('au toucher (écran tactile), un tap sur le ciel vide désélectionne', async () => {
    const c = await connecte(browser, srv.base, 'Léa');
    const ctx = await browser.newContext({ baseURL: srv.base, hasTouch: true, viewport: { width: 390, height: 780 }, storageState: await c.ctx.storageState() });
    await c.ctx.close();
    const page = await ctx.newPage();
    await page.goto(adr(O.q, O.r));
    await prete(page);
    const b = await page.locator('.cs-ciel').boundingBox();
    await page.locator('.cs-corps[data-cle="gamma"]').tap();
    assert.equal(await page.locator('.cs-corps[aria-pressed="true"]').count(), 1);
    await page.touchscreen.tap(b.x + 8, b.y + 8);
    assert.equal(await page.locator('.cs-corps[aria-pressed="true"]').count(), 0);
    await ctx.close();
  });

  it('une entrée au clavier sur un corps le sélectionne, la barre d’espace aussi', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    const gamma = page.getByRole('button', { name: /^Gamma, / });
    await gamma.focus();
    await page.keyboard.press('Enter');
    assert.equal(await gamma.getAttribute('aria-pressed'), 'true');
    const delta = page.getByRole('button', { name: /^Delta, / });
    await delta.focus();
    await page.keyboard.press('Space');
    assert.equal(await delta.getAttribute('aria-pressed'), 'true');
    assert.equal(await gamma.getAttribute('aria-pressed'), 'false', 'un seul corps sélectionné');
    await ctx.close();
  });

  it('une ligne de liste porte le nom entier en title ; la carte le raccourcit par « … » à 390 px ; cliquer la ligne sélectionne le corps', async () => {
    const { page, ctx } = await ouvrir('Léa', 390, 780);
    await prete(page);
    const ligne = page.locator('.gx-lignes li', { hasText: LONG });
    assert.equal(await ligne.getAttribute('title'), LONG);
    const c = await croquis(page);
    const e = (c.etiquettes as Any[]).find((x) => x.cle === 'longue');
    assert.ok(e.visible, 'l’étiquette du corps long est placée');
    assert.ok(e.texte.endsWith('…') && e.texte.length < LONG.length, `étiquette : ${e.texte}`);
    await ligne.getByRole('button').click();
    assert.equal(await page.locator('.cs-corps[data-cle="longue"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await ligne.getByRole('button').getAttribute('aria-pressed'), 'true');
    await ctx.close();
  });

  it('une joueuse ne voit que la sortie vers le voisin lisible par une route publique ; le MJ voit aussi la privée et le caché ; le MJ en mode joueur comme la joueuse', async () => {
    const lea = await ouvrir('Léa', 1280, 800);
    await prete(lea.page);
    await lea.page.locator('.cs-sortie').first().waitFor();
    assert.equal(await lea.page.locator('.cs-sortie').count(), 1);
    assert.deepEqual((await croquis(lea.page)).sorties.map((s: Any) => [s.q, s.r]), [[O.q + 1, O.r]]);
    assert.ok(!(await lea.page.locator('body').innerText()).includes('Voisin-privé'));
    assert.ok(!(await lea.page.locator('body').innerText()).includes('Voisin-caché'));
    await hors(lea.page, '1280-sortie-joueuse');
    await lea.ctx.close();

    const mj = await ouvrir('Antor', 1280, 800);
    await prete(mj.page);
    await mj.page.locator('.cs-sortie').first().waitFor();
    await mj.page.waitForFunction(() => (window as Any).__carteSysteme().sorties.length === 3);
    assert.equal(await mj.page.locator('.cs-sortie').count(), 3);
    await mj.page.getByRole('radio', { name: /Joueur/ }).click();
    await mj.page.waitForFunction(() => (window as Any).__carteSysteme?.()?.sorties?.length === 1);
    assert.equal(await mj.page.locator('.cs-sortie').count(), 1);
    await mj.ctx.close();
  });

  it('une sortie ouvre le système voisin', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    await page.getByRole('button', { name: /Aller au système Voisin-est/ }).click();
    await page.waitForURL(`**${adr(O.q + 1, O.r)}`);
    await ctx.close();
  });

  it('le cœur indisponible : « La carte ne peut pas s’afficher ici. » et les listes restent', async () => {
    const c = await connecte(browser, srv.base, 'Léa');
    await c.page.setViewportSize({ width: 390, height: 780 });
    await c.page.route('**/*.wasm', (r: Any) => r.abort());
    await c.page.goto(adr(O.q, O.r));
    await c.page.getByText('La carte ne peut pas s’afficher ici.').waitFor();
    await c.page.getByRole('heading', { name: 'Corps (12)' }).waitFor();
    assert.equal(await c.page.locator('.gx-lignes li').count(), 12 + 2, '12 corps et 2 zones');
    assert.equal(await c.page.locator('.cs-ciel').count(), 0);
    // a row still exposes its selection (to the panel of the next task)
    const ligne = c.page.locator('.gx-lignes li', { hasText: 'Gamma' });
    await ligne.getByRole('button').click();
    assert.equal(await ligne.getByRole('button').getAttribute('aria-pressed'), 'true');
    await hors(c.page, '390-coeur-indisponible');
    await c.ctx.close();
  });

  it('hors ligne : « Connexion perdue. » une seule fois, la carte reste', async () => {
    const { page, ctx } = await ouvrir('Léa', 1280, 800);
    await prete(page);
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.getByText(/Connexion perdue\./).first().waitFor();
    assert.equal(await page.getByText(/Connexion perdue\./).count(), 1);
    assert.equal(await page.locator('.cs-ciel').count(), 1);
    assert.equal((await croquis(page)).corps.filter((k: Any) => !k.cle.includes(':')).length, 12);
    await hors(page, '1280-hors-ligne');
    await ctx.close();
  });

  it('les deux thèmes : captures du ciel (1280 et 390 px), le ciel reste sombre', async () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const [l, h] of [[1280, 800], [390, 780]] as const) {
        const { page, ctx } = await ouvrir('Léa', l, h);
        await page.evaluate((t: string) => { document.documentElement.setAttribute('data-theme', t); }, theme);
        await prete(page);
        const fond = await page.locator('.cs-ciel').evaluate((e: Any) => getComputedStyle(e).backgroundImage);
        assert.match(fond, /rgb\(11, 11, 16\)/, `${theme} : le ciel garde son fond sombre`);
        await hors(page, `${l}-${theme}-systeme`);
        await ctx.close();
      }
    }
  });
});
