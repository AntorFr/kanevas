// ecrans: cartes
// Browser test of kanevas-carte-spatiale-edition-glisser (E-23, Déplacer 1 and 2), written from the exit criterion — not from the code.
// A defined system (rows laid down by the test) and a drawn one (found through the read API) are dragged and pushed with the arrows.
// What the server holds is read through the API; the screen is read through the map's test hook.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-carte-glisser';
const O = { q: 70, r: 71 };
const VOISIN = { q: 71, r: 71 };

describe('E-23 glisser un corps', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  let tire = { q: 0, r: 0 };
  const sql = <T,>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const base = () => `/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}/interieur`;
  const adr = (q: number, r: number) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${q}/${r}`;
  const croquis = (page: Any) => page.evaluate(() => (window as Any).__carteSysteme?.() ?? null);
  const corps = async (page: Any, cle: string) => ((await croquis(page)).corps as Any[]).find((k) => k.cle === cle);
  const prete = async (page: Any) => {
    await page.waitForFunction(() => (window as Any).__carteSysteme?.()?.pret === true, undefined, { timeout: 30000 });
    await page.waitForFunction(() => ((window as Any).__carteSysteme?.()?.corps ?? []).length > 1, undefined, { timeout: 30000 });
  };
  const lireApi = async (page: Any, q: number, r: number) => (await (await page.request.get(`${base()}/${q}/${r}`)).json()) as Any;
  const astre = async (page: Any, q: number, r: number, cle: string) => (await lireApi(page, q, r)).astres.find((a: Any) => a.cle === cle);
  const ouvrir = async (compte: string, q: number, r: number, largeur = 1280, hauteur = 800) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    const ecritures: Any[] = [];
    c.page.on('request', (rq: Any) => { if (['PATCH', 'POST', 'PUT', 'DELETE'].includes(rq.method()) && rq.url().includes('/interieur/')) ecritures.push({ m: rq.method(), u: rq.url(), t: Date.now(), corps: rq.postData() }); });
    await c.page.goto(adr(q, r));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await prete(c.page);
    return { ...c, ecritures };
  };
  /** The screen position of a body and a drag of the mouse from it to a screen point. */
  const centre = async (page: Any, cle: string) => {
    const b = await page.locator(`.cs-corps[data-cle="${cle}"]`).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  /** Selecting a body opens the side panel and narrows the sky: done before measuring, so the drag does not move the layout. */
  const choisir = async (page: Any, cle: string) => {
    await page.locator(`.cs-corps[data-cle="${cle}"]`).click();
    await dormir(600);
  };
  /** The hour a body is drawn at, read on the map's hook from the star (12 at the top, 3 at the right). */
  const heureSurEcran = async (page: Any, cle: string) => {
    const c = (await croquis(page)).corps as Any[];
    const e = c.find((k) => k.cle === 'etoile') ?? c[0];
    const k = c.find((x) => x.cle === cle);
    return ((((Math.atan2(k.x - e.x, -(k.y - e.y)) * 180) / Math.PI / 30) % 12) + 12) % 12;
  };
  const glisser = async (page: Any, de: { x: number; y: number }, vers: { x: number; y: number }) => {
    await page.mouse.move(de.x, de.y);
    await page.mouse.down();
    await page.mouse.move((de.x + vers.x) / 2, (de.y + vers.y) / 2, { steps: 5 });
    await page.mouse.move(vers.x, vers.y, { steps: 5 });
    await page.mouse.up();
  };
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-glisser-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    sql((db) => {
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',0,0)");
      for (const [cle, nom, p] of [['gl-centre', 'Centre-glisser', O], ['gl-voisin', 'Voisin-glisser', VOISIN]] as const) {
        const id = sys.run(gid, univers, cle, nom, p.q, p.r).lastInsertRowid as number;
        const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
        ast.run(id, 'etoile', 'etoile', null, 0, 'jaune', 'Soleil-glisser', 0, 0, 1);
        const alpha = ast.run(id, 'alpha', 'planete', null, 0, 'tellurique', 'Alpha', 3, 3, 0.3).lastInsertRowid as number;
        ast.run(id, 'alpha-a', 'lune', alpha, 0, 'rocheux', 'Alpha a', null, 6, 0.1);
        ast.run(id, 'beta', 'planete', null, 0, 'gazeuse', 'Bêta', 5, 8, 0.4);
      }
    });
    // a drawn system with at least one planet: looked for around the origin through the read API
    chercher: for (let q = -50; q < -40; q++) for (let r = -50; r < -40; r++) {
      const rep = await a.page.request.get(`${base()}/${q}/${r}`);
      if (!rep.ok()) continue;
      const i = (await rep.json()) as Any;
      if (i.etat === 'tire' && (i.astres ?? []).some((x: Any) => x.genre === 'planete')) { tire = { q, r }; break chercher; }
    }
    await a.ctx.close();
    assert.notEqual(tire.q, 0, 'a drawn system with a planet exists in the seed');
  }, { timeout: 300000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('glisser une planète d\'un système défini : une seule écriture au relâchement, la place suit après rechargement, la voisine n\'a pas bougé', async () => {
    const { page, ctx, ecritures } = await ouvrir('Antor', O.q, O.r);
    const avant = await astre(page, O.q, O.r, 'alpha');
    const voisinAvant = await astre(page, VOISIN.q, VOISIN.r, 'alpha');
    const betaAvant = await astre(page, O.q, O.r, 'beta');
    await choisir(page, 'alpha');
    const de = await centre(page, 'alpha');
    const b = await page.locator('.cs-ciel').boundingBox();
    // towards the lower left of the sky : 6 h to 9 h
    await glisser(page, de, { x: b.x + b.width / 2 - 120, y: b.y + b.height / 2 + 60 });
    await page.waitForFunction(() => true);
    for (let i = 0; i < 50 && ecritures.length === 0; i++) await dormir(100);
    await dormir(400);
    assert.equal(ecritures.length, 1, JSON.stringify(ecritures));
    assert.equal(ecritures[0].m, 'PATCH');
    assert.match(ecritures[0].u, /\/astres\/alpha\?|\/astres\/alpha$/);
    const apres = await astre(page, O.q, O.r, 'alpha');
    assert.ok(apres.heure > 6 && apres.heure < 9, `heure ${apres.heure} ${JSON.stringify({ de, b, avant })}`);
    assert.notEqual(apres.heure, avant.heure);
    assert.ok(apres.orbite > 0, `orbite ${apres.orbite}`);
    assert.deepEqual(await astre(page, O.q, O.r, 'beta'), betaAvant, 'l\'autre planète n\'a pas bougé');
    assert.deepEqual(await astre(page, VOISIN.q, VOISIN.r, 'alpha'), voisinAvant, 'le système voisin n\'a pas bougé');
    // the screen holds the new place, and keeps it after a reload; the moon follows its planet
    await page.reload();
    await prete(page);
    const lune = await corps(page, 'alpha-a');
    const planete = await corps(page, 'alpha');
    assert.ok(Math.hypot(lune.x - planete.x, lune.y - planete.y) < 80, 'la lune suit sa planète');
    assert.ok(Math.abs(await heureSurEcran(page, 'alpha') - apres.heure) < 0.3, 'la planète est dessinée à l\'heure enregistrée');
    await page.screenshot({ path: `${SHOTS}/apres-glisser.png` });
    await ctx.close();
  });

  it('une lune glissée tourne autour de sa planète : son heure seule change, jamais son orbite', async () => {
    const { page, ctx, ecritures } = await ouvrir('Antor', O.q, O.r);
    await choisir(page, 'alpha-a');
    const planete = await centre(page, 'alpha');
    const avant = await astre(page, O.q, O.r, 'alpha-a');
    const alphaAvant = await astre(page, O.q, O.r, 'alpha');
    const lune = await centre(page, 'alpha-a');
    // the moon is dragged to the other side of its planet and far outward
    await glisser(page, lune, { x: planete.x + (planete.x - lune.x) * 2, y: planete.y + (planete.y - lune.y) * 2 });
    for (let i = 0; i < 50 && ecritures.length === 0; i++) await dormir(100);
    await dormir(400);
    assert.equal(ecritures.length, 1);
    const apres = await astre(page, O.q, O.r, 'alpha-a');
    assert.equal(apres.orbite, avant.orbite);
    assert.notEqual(apres.heure, avant.heure);
    assert.equal((await astre(page, O.q, O.r, 'alpha')).heure, alphaAvant.heure, 'la planète est restée');
    await ctx.close();
  });

  it('trois pressions de flèche rapprochées n\'envoient qu\'une requête, 600 ms après la dernière ; « Alpha déplacé. » s\'annonce', async () => {
    const { page, ctx, ecritures } = await ouvrir('Antor', O.q, O.r);
    const avant = await astre(page, O.q, O.r, 'beta');
    await page.locator('.cs-corps[data-cle="beta"]').click();
    await page.locator('.cs-corps[data-cle="beta"]').focus();
    const t0 = Date.now();
    await page.keyboard.press('ArrowRight');
    await dormir(100);
    await page.keyboard.press('ArrowRight');
    await dormir(100);
    await page.keyboard.press('ArrowUp');
    const derniere = Date.now();
    await dormir(400);
    assert.equal(ecritures.length, 0, 'rien n\'est parti avant 600 ms');
    for (let i = 0; i < 40 && ecritures.length === 0; i++) await dormir(50);
    await dormir(500);
    assert.equal(ecritures.length, 1, JSON.stringify(ecritures));
    assert.ok(ecritures[0].t - derniere >= 450, `délai ${ecritures[0].t - derniere} depuis la dernière touche (t0 ${t0})`);
    await page.getByText('Bêta déplacé.').first().waitFor();
    const apres = await astre(page, O.q, O.r, 'beta');
    assert.equal(apres.heure, Math.round((avant.heure + 0.5) * 100) / 100);
    assert.equal(apres.orbite, Math.round((avant.orbite + 0.25) * 100) / 100);
    await ctx.close();
  });

  it('Maj + flèche : pas ×4 ; l\'heure fait le tour de 12', async () => {
    const { page, ctx, ecritures } = await ouvrir('Antor', O.q, O.r);
    sql((db) => db.prepare("UPDATE swn_astres SET heure = 11.5 WHERE cle = 'beta' AND systeme_id = (SELECT id FROM swn_systemes WHERE cle = 'gl-centre')").run());
    await page.reload(); await prete(page);
    await page.locator('.cs-corps[data-cle="beta"]').click();
    await page.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < 40 && ecritures.length === 0; i++) await dormir(100);
    await dormir(400);
    assert.equal(ecritures.length, 1);
    assert.equal((await astre(page, O.q, O.r, 'beta')).heure, 0.5);
    await ctx.close();
  });

  it('erreur du serveur : le corps retourne à sa place et « Impossible d\'enregistrer. » se lit', async () => {
    const { page, ctx, ecritures } = await ouvrir('Antor', O.q, O.r);
    await page.route('**/interieur/**/astres/gamma-absent', (r: Any) => r.continue());
    await page.route(/\/interieur\/\d+\/\d+\/astres\/alpha/, (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }) : r.continue()));
    const avant = await astre(page, O.q, O.r, 'alpha');
    await choisir(page, 'alpha');
    const de = await centre(page, 'alpha');
    await glisser(page, de, { x: de.x - 100, y: de.y + 80 });
    await page.getByText('Impossible d’enregistrer.').first().waitFor();
    assert.equal(ecritures.length, 1);
    const apres = await centre(page, 'alpha');
    assert.ok(Math.hypot(apres.x - de.x, apres.y - de.y) < 3, `le corps est revenu à sa place ${JSON.stringify({ apres, de, ciel: await page.locator('.cs-ciel').boundingBox() })}`);
    assert.deepEqual(await astre(page, O.q, O.r, 'alpha'), avant);
    await page.screenshot({ path: `${SHOTS}/erreur.png` });
    await ctx.close();
  });

  it('système tiré : le dialogue s\'ouvre au relâchement, « Annuler » n\'écrit rien et ramène la planète ; « Ancrer » écrit, la marque lit « Défini »', async () => {
    const { page, ctx, ecritures } = await ouvrir('Antor', tire.q, tire.r);
    const interieur = await lireApi(page, tire.q, tire.r);
    const planete = interieur.astres.find((a: Any) => a.genre === 'planete');
    await choisir(page, planete.cle);
    const de = await centre(page, planete.cle);
    const cible = { x: de.x - 90, y: de.y + 70 };
    await glisser(page, de, cible);
    const dialogue = page.getByRole('dialog', { name: 'Ancrer ce système ?' });
    await dialogue.waitFor();
    assert.equal(ecritures.length, 0, 'rien n\'est écrit avant « Ancrer »');
    const dessous = await centre(page, planete.cle);
    assert.ok(Math.hypot(dessous.x - de.x, dessous.y - de.y) < 3, `sous le dialogue ${JSON.stringify({ dessous, de })}`);
    await page.screenshot({ path: `${SHOTS}/dialogue-ancrage.png` });
    await dialogue.getByRole('button', { name: 'Annuler' }).click();
    await dialogue.waitFor({ state: 'detached' });
    await dormir(500);
    assert.equal(ecritures.length, 0);
    assert.equal((await lireApi(page, tire.q, tire.r)).etat, 'tire');
    // again, and anchor
    const de2 = await centre(page, planete.cle);
    await glisser(page, de2, cible);
    await dialogue.waitFor();
    await dialogue.getByRole('button', { name: 'Ancrer', exact: true }).click();
    await dialogue.waitFor({ state: 'detached' });
    await page.getByText('Défini', { exact: true }).first().waitFor();
    assert.equal(ecritures.length, 1);
    const apres = await lireApi(page, tire.q, tire.r);
    assert.equal(apres.etat, 'defini');
    const nouveau = apres.astres.find((a: Any) => a.cle === planete.cle);
    assert.notEqual(nouveau.heure, planete.heure);
    await page.reload(); await prete(page);
    assert.ok(Math.abs(await heureSurEcran(page, planete.cle) - nouveau.heure) < 0.3, 'la planète est dessinée à sa nouvelle heure après rechargement');
    await ctx.close();
  });

  it('une joueuse n\'a aucune poignée et un glisser n\'écrit rien', async () => {
    const { page, ctx, ecritures } = await ouvrir('Léa', O.q, O.r);
    assert.equal(await page.locator('.cs-corps.glissable').count(), 0);
    const de = await centre(page, 'alpha');
    await glisser(page, de, { x: de.x - 100, y: de.y + 80 });
    await page.locator('.cs-corps[data-cle="alpha"]').click();
    await page.keyboard.press('ArrowRight');
    await dormir(1000);
    assert.equal(ecritures.length, 0);
    assert.equal(await page.getByText('Enregistrement…').count(), 0);
    await ctx.close();
  });

  it('le MJ en mode joueur n\'a pas de poignée non plus', async () => {
    const c = await connecte(browser, srv.base, 'Antor');
    const ecritures: string[] = [];
    c.page.on('request', (rq: Any) => { if (rq.method() !== 'GET' && rq.url().includes('/interieur/')) ecritures.push(rq.url()); });
    await c.page.goto(adr(O.q, O.r));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await prete(c.page);
    assert.equal(await c.page.locator('.cs-corps.glissable').count(), 3, 'le MJ a ses poignées hors mode joueur');
    await c.page.getByRole('radio', { name: /Joueur/ }).click();
    await c.page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await prete(c.page);
    await dormir(500);
    assert.equal(await c.page.locator('.cs-corps.glissable').count(), 0);
    const de = await centre(c.page, 'alpha');
    await glisser(c.page, de, { x: de.x - 100, y: de.y + 80 });
    await dormir(600);
    assert.deepEqual(ecritures, []);
    await c.ctx.close();
  });

  it('au toucher : un glisser simple déplace la vue sans écrire ; un appui long de 300 ms puis glisser déplace le corps', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, hasTouch: true, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    const ecritures: Any[] = [];
    page.on('request', (rq: Any) => { if (rq.method() === 'PATCH' && rq.url().includes('/interieur/')) ecritures.push(rq.url()); });
    await page.goto(adr(O.q, O.r));
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    await prete(page);
    const cdp = await ctx.newCDPSession(page);
    const toucher = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await page.locator('.cs-corps[data-cle="alpha"]').scrollIntoViewIfNeeded();
    const de = await centre(page, 'alpha');
    const vue0 = (await croquis(page)).decalage;
    // quick drag from the body: the view moves, nothing is written
    await toucher('touchStart', de.x, de.y);
    for (let i = 1; i <= 6; i++) { await toucher('touchMove', de.x + 8 * i, de.y + 5 * i); await dormir(20); }
    await toucher('touchEnd', 0, 0);
    await dormir(700);
    assert.equal(ecritures.length, 0, 'un glisser simple n\'écrit rien');
    const vue1 = (await croquis(page)).decalage;
    assert.ok(Math.hypot(vue1[0] - vue0[0], vue1[1] - vue0[1]) > 20, `la vue a bougé (${vue0} → ${vue1})`);
    await page.screenshot({ path: `${SHOTS}/tactile-glisse.png` });
    // long press, then drag
    const de2 = await centre(page, 'alpha');
    await toucher('touchStart', de2.x, de2.y);
    await dormir(450);
    for (let i = 1; i <= 6; i++) { await toucher('touchMove', de2.x - 8 * i, de2.y + 6 * i); await dormir(20); }
    await toucher('touchEnd', 0, 0);
    for (let i = 0; i < 50 && ecritures.length === 0; i++) await dormir(100);
    assert.equal(ecritures.length, 1, 'l\'appui long a déplacé le corps');
    const vue2 = (await croquis(page)).decalage;
    assert.deepEqual(vue2, vue1, 'la vue est restée');
    await ctx.close();
  });
});
