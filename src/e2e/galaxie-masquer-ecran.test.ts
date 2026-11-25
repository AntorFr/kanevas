// ecrans: cartes
// Browser test of kanevas-carte-spatiale-masquer-ecran (E-21 « hiding a system », B-97, P-26), written from the exit criterion and
// docs/ecrans.md « E-21 — hiding a system » — not from the code. The galaxy of the hiding fixture is seeded straight into the stub
// database (fixed seed `masquage-14`: a star drawn at (3, -4); `aube` and `brume` are readable defined neighbours).
// Screenshots go to /tmp/cap-masq-r (never into the workspace). Waits are on what the user sees or on the answer to the gesture.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-masq-r';

describe('E-21 masquer un système : « Secret (MJ seul) » du panneau, case vide de la joueuse', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let dbPath = '';
  let univers = 0;
  let adresse = '';
  let base = '';
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const sql = <T>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const ouvre = async (compte: string, w = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    return c;
  };
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const etoile = (page: Any) => page.locator('circle[data-genere="3,-4"]');
  const toucherEtoile = async (page: Any) => {
    const b = await etoile(page).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  const lire = async (compte: string, chemin: string) => {
    const c = await connecte(browser, srv.base, compte);
    const r = await c.page.request.get(chemin);
    const corps = await r.json().catch(() => null);
    await c.ctx.close();
    return { status: r.status(), corps };
  };

  before(async () => {
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-masq-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    await a.ctx.close();
    const g = sql((db) => {
      const id = Number(db.prepare(`INSERT INTO swn_galaxies (univers_id, titre, visible, graine, densite_defaut)
        VALUES (?, 'Galaxie du secret', 1, 'masquage-14', (SELECT densite_defaut FROM swn_galaxies WHERE univers_id = ? LIMIT 1))`).run(univers, univers).lastInsertRowid);
      const sys = db.prepare(`INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret)
        VALUES (?, ?, ?, ?, ?, ?, 0.45, '#f2a33c', 'Inventé.', 0)`);
      sys.run(id, univers, 'aube', 'Aube', 5, -4);
      sys.run(id, univers, 'brume', 'Brume', 1, -3);
      return id;
    });
    adresse = `/univers/${univers}/outils/swn/galaxie/${g}`;
    base = `/api/univers/${univers}/outils/swn/galaxie/galaxies/${g}`;
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  const lignes = () => sql((db) => db.prepare('SELECT cle, q, r, promu, secret FROM swn_systemes WHERE q = 3 AND r = -4').all());
  // The opening view frames the known zone and the map pans a little when a system is added, so a star at the very edge of the window
  // may be drawn or not: only the stars well inside the map (90 px) stand for « the drawn neighbours ».
  const genere = async (page: Any) => (await page.locator('circle[data-genere]').evaluateAll((l: Any[]) => {
    const svg = l[0]?.ownerSVGElement?.getBoundingClientRect();
    return l.filter((e) => {
      const b = e.getBoundingClientRect();
      const x = b.x + b.width / 2 - svg.x, y = b.y + b.height / 2 - svg.y;
      return x >= 90 && y >= 90 && x <= svg.width - 90 && y <= svg.height - 90;
    }).map((e) => e.getAttribute('data-genere'));
  })).sort();
  const contient = (vus: string[], attendus: string[], msg?: string) => assert.deepEqual(attendus.filter((c) => !vus.includes(c)), [], msg);
  let voisins: string[] = [];
  let adresseInterieur = '';
  let cle = '';

  it('Antor : « Annuler » n\'écrit rien ; « Masquer » après le dialogue : commutateur actif, « MJ seul » au panneau et dans l\'en-tête de E-23 « Défini »', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    voisins = (await genere(page)).filter((c: string) => c !== '3,-4');
    await toucherEtoile(page);
    const interrupteur = page.getByRole('switch', { name: 'Secret (MJ seul)' });
    assert.equal(await interrupteur.getAttribute('aria-checked'), 'false');
    await interrupteur.click();
    const dialogue = page.getByRole('alertdialog', { name: 'Masquer ce système ?' });
    await dialogue.waitFor();
    await hors(page, '01-dialogue');
    await dialogue.getByText('Masquer ce système le définit : son intérieur sera figé tel que vous le voyez, les réglages du générateur ne le changeront plus.').waitFor();
    await dialogue.getByRole('button', { name: 'Annuler' }).click();
    await dialogue.waitFor({ state: 'detached' });
    assert.equal(await interrupteur.getAttribute('aria-checked'), 'false', 'Annuler laisse le commutateur éteint');
    assert.deepEqual(await lignes(), [], 'Annuler n\'écrit rien');

    await interrupteur.click();
    await dialogue.waitFor();
    const reponse = page.waitForResponse((r: Any) => r.url().endsWith('/secret') && r.request().method() === 'PUT');
    await dialogue.getByRole('button', { name: 'Masquer', exact: true }).click();
    assert.equal((await reponse).status(), 200);
    await dialogue.waitFor({ state: 'detached' });
    const panneau = page.getByRole('region', { name: 'Système sélectionné' });
    await panneau.getByText('MJ seul', { exact: true }).waitFor();
    assert.equal(await page.getByRole('switch', { name: 'Secret (MJ seul)' }).getAttribute('aria-checked'), 'true');
    await hors(page, '02-masque');
    const l = await lignes();
    assert.equal(l.length, 1);
    assert.equal(l[0].promu, 1);
    assert.equal(l[0].secret, 1);
    cle = l[0].cle;
    contient(await genere(page), voisins, 'les voisins tirés n\'ont pas bougé');

    adresseInterieur = (await panneau.getByRole('link', { name: 'Ouvrir le système' }).getAttribute('href')) ?? '';
    await page.goto(adresseInterieur);
    const entete = page.locator('header.gx-entete');
    await entete.getByText('Défini', { exact: true }).waitFor();
    await entete.getByText('MJ seul', { exact: true }).waitFor();
    await hors(page, '03-e23-mj');
    await ctx.close();
    // two routes led to the hidden system (a route needs both ends as rows)
    sql((db) => {
      const id = (c: string) => db.prepare('SELECT id FROM swn_systemes WHERE cle = ?').get(c).id;
      const g = db.prepare('SELECT galaxie_id FROM swn_systemes WHERE cle = ?').get(cle).galaxie_id;
      const r = db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?, ?, ?, ?, 1, 2)');
      r.run(g, univers, id('aube'), id(cle));
      r.run(g, univers, id('brume'), id(cle));
    });
  });

  it('Antor : la galaxie montre l\'étoile masquée, avec « MJ seul » et ses deux routes', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    assert.equal(await page.locator('.gx-route').count(), 2);
    assert.ok(await page.locator('g.gx-systeme').count() >= 3, 'trois étoiles pour le MJ');
    // the badge « MJ seul » under the hidden star (E-21): the GM only, and only on the hidden one
    const marque = page.locator('g.gx-marque-mj');
    await marque.first().waitFor();
    assert.equal(await marque.count(), 1, 'un seul badge : le système masqué');
    assert.equal((await marque.textContent())?.trim(), 'MJ seul');
    await hors(page, '04-galaxie-mj');
    await ctx.close();
  });

  it('Léa recharge : case vide à (3, -4), routes absentes, adresse « Page introuvable. », lecture serveur introuvable', async () => {
    const { page, ctx } = await ouvre('Léa');
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    assert.equal(await page.locator('g.gx-systeme').count(), 2, 'Aube et Brume seulement');
    assert.equal(await page.locator('.gx-route').count(), 0, 'aucune route vers (3, -4)');
    assert.equal(await page.locator('circle[data-genere="3,-4"]').count(), 0, 'case vide : pas d\'étoile tirée');
    contient(await genere(page), voisins);
    assert.equal(await page.getByText('MJ seul').count(), 0);
    assert.equal(await page.locator('g.gx-marque-mj').count(), 0, 'aucun badge pour la joueuse');
    await hors(page, '05-lea');
    await page.goto(`${adresse}?systeme=${cle}`);
    await page.getByText('Page introuvable.').waitFor();
    await page.goto(adresseInterieur);
    await page.getByText('Page introuvable.').waitFor();
    await hors(page, '06-lea-adresse');
    await ctx.close();
  });

  it('Antor en Mode Joueur lit ce que lit Léa ; il quitte le mode et le système revient', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('g.gx-systeme').length === 2);
    assert.equal(await page.locator('.gx-route').count(), 0);
    assert.equal(await page.locator('circle[data-genere="3,-4"]').count(), 0);
    assert.equal(await page.getByRole('switch', { name: 'Secret (MJ seul)' }).count(), 0, 'pas de commutateur en Mode Joueur');
    await hors(page, '07-mode-joueur');
    // The mode lives in the page (a reload leaves it): the address is reached by the router, the mode kept (with the universe named as the page names it now, its key: another reference reloads the universe and the mode with it).
    await page.evaluate((a: string) => { history.pushState({}, '', a.replace(/^\/univers\/[^/]+/, '/univers/' + location.pathname.split('/')[2])); dispatchEvent(new PopStateEvent('popstate')); }, adresseInterieur);
    await page.getByText('Page introuvable.').waitFor();
    await hors(page, '07b-mode-joueur-adresse');
    await page.evaluate((a: string) => { history.pushState({}, '', a.replace(/^\/univers\/[^/]+/, '/univers/' + location.pathname.split('/')[2])); dispatchEvent(new PopStateEvent('popstate')); }, adresse);
    await systeme(page, 'Aube').waitFor();
    await page.getByRole('radio', { name: /^Mode MJ$|MJ$/ }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('g.gx-systeme').length === 3);
    await ctx.close();
  });

  it('Antor démasque sans dialogue : Léa relit le système et les voisins n\'ont pas bougé', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    const trois = page.locator('g.gx-systeme');
    const dernier = trois.last();
    await dernier.locator('.gx-zone-touche').click();
    const interrupteur = page.getByRole('switch', { name: 'Secret (MJ seul)' });
    await page.waitForFunction(() => document.querySelector('[role=switch][aria-checked=true]') !== null);
    const reponse = page.waitForResponse((r: Any) => r.url().endsWith('/secret') && r.request().method() === 'PUT');
    await interrupteur.click();
    assert.equal((await reponse).status(), 200);
    assert.equal(await page.getByRole('alertdialog').count(), 0, 'démasquer ne demande rien');
    await page.waitForFunction(() => document.querySelector('[role=switch][aria-checked=true]') === null);
    assert.deepEqual(sql((db) => db.prepare('SELECT promu, secret FROM swn_systemes WHERE cle = ?').get(cle)), { promu: 1, secret: 0 });
    await ctx.close();
    const l = await ouvre('Léa');
    await l.page.goto(adresse);
    await systeme(l.page, 'Aube').waitFor();
    assert.equal(await l.page.locator('g.gx-systeme').count(), 3, 'le système est revenu');
    assert.equal(await l.page.locator('.gx-route').count(), 2, 'ses routes aussi');
    contient(await genere(l.page), voisins);
    await hors(l.page, '08-lea-demasque');
    await l.ctx.close();
  });

  it('Léa à 390 px : la même case vide ; refus d\'écriture par l\'API', async () => {
    sql((db) => db.prepare('UPDATE swn_systemes SET secret = 1 WHERE cle = ?').run(cle));
    const { page, ctx } = await ouvre('Léa', 390, 780);
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    assert.equal(await page.locator('g.gx-systeme').count(), 2);
    await hors(page, '09-lea-390');
    const r = await page.request.put(`${base}/systemes/3/-4/secret`, { data: { secret: false } });
    assert.ok([403, 404].includes(r.status()), `statut ${r.status()}`);
    assert.equal(sql((db) => db.prepare('SELECT secret FROM swn_systemes WHERE cle = ?').get(cle).secret), 1);
    await ctx.close();
  });

  it('états : échec réseau (commutateur rendu à sa place), conflit « a_change » avec « Recharger »', async () => {
    sql((db) => db.prepare('UPDATE swn_systemes SET secret = 0 WHERE cle = ?').run(cle));
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await systeme(page, 'Aube').waitFor();
    await systeme(page, 'Aube').locator('.gx-zone-touche').click();
    const interrupteur = page.getByRole('switch', { name: 'Secret (MJ seul)' });
    await interrupteur.waitFor();
    await page.route('**/secret', (r: Any) => (r.request().method() === 'PUT' ? r.abort() : r.continue()));
    await interrupteur.click();
    await page.getByText('Impossible d’enregistrer. Réessayer.').waitFor();
    assert.equal(await interrupteur.getAttribute('aria-checked'), 'false', 'le commutateur revient à sa position');
    await hors(page, '10-reseau');
    await page.unroute('**/secret');
    // another write since the panel opened: the system's version moves
    sql((db) => db.prepare('UPDATE swn_systemes SET version = version + 1 WHERE cle = ?').run('aube'));
    await interrupteur.click();
    await page.getByText('Ce système a changé depuis que vous l’avez ouvert.').waitFor();
    await hors(page, '11-conflit');
    assert.equal(sql((db) => db.prepare('SELECT secret FROM swn_systemes WHERE cle = ?').get('aube').secret), 0, 'rien n\'est écrit');
    await page.getByRole('button', { name: 'Recharger' }).click();
    await page.getByText('Ce système a changé depuis que vous l’avez ouvert.').waitFor({ state: 'detached' });
    await ctx.close();
  });
});
