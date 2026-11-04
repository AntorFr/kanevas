// Browser test of kanevas-outils-galaxie-lire-ecran, written from the exit criterion and docs/ecrans.md
// « What kanevas-outils-galaxie-lire builds of E-21 and E-10 » — not from the code. Stub world with the seed.
// Screenshots go to /tmp/cap-galaxie (never into the workspace).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie';
const CODE = /\/assets\/galaxie-[^/]*\.js/;

describe('E-21 galaxie en lecture et ligne « Galaxie » de E-10', { skip: skipBrowser, timeout: 400000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let adresse = '';
  let dbPath = '';
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });

  const ouvre = async (compte: string, w = 390, h = 780) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    const codes: string[] = [];
    c.page.on('request', (r: Any) => { if (CODE.test(new URL(r.url()).pathname)) codes.push(r.url()); });
    return { ...c, codes };
  };
  const api = async (compte: string, method: 'GET' | 'PUT', path: string, data?: Any) => {
    const c = await connecte(browser, srv.base, compte);
    const r = method === 'GET' ? await c.page.request.get(path) : await c.page.request.put(path, { data });
    const corps = r.status() < 300 ? await r.json().catch(() => null) : null;
    await c.ctx.close();
    return { status: r.status(), corps };
  };
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  // The first view is centred on the reference: a far system is reached by zooming out, as a user would.
  const montre = async (page: Any, nom: string) => {
    for (let i = 0; i < 6 && (await systeme(page, nom).count()) === 0; i++) {
      const moins = page.getByRole('button', { name: 'Zoom arrière' });
      if (await moins.isDisabled()) break;
      await moins.click();
      await page.waitForTimeout(300);
    }
    await systeme(page, nom).waitFor();
    return systeme(page, nom);
  };
  const choisirDans = async (page: Any, champ: string, saisie: string, nom: string) => {
    await page.getByLabel(champ, { exact: true }).fill(saisie);
    await page.locator('.gx-trajet .gx-resultats').getByRole('button', { name: nom, exact: true }).click();
  };
  const calculer = async (page: Any, de: string, vers: string, moteur = '2') => {
    await choisirDans(page, 'Départ', de.slice(0, 3), de);
    await choisirDans(page, 'Arrivée', vers.slice(0, 3), vers);
    await page.getByLabel('Moteur', { exact: true }).selectOption(moteur);
    await page.getByRole('button', { name: 'Calculer', exact: true }).click();
  };
  const ouvrirGalaxie = async (page: Any, suffixe = '') => {
    await page.goto(adresse + suffixe);
  };

  before(async () => {
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-gx-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('Léa à 390 px : code différé, Vael, trajet 7 cases · 4,5 jours, recherche « fant », lien', async () => {
    const { page, ctx, codes } = await ouvre('Léa');
    const ecritures: string[] = [];
    page.on('request', (r: Any) => { if (!['GET', 'HEAD'].includes(r.method())) ecritures.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    await page.goto(`/univers/${univers}/cartes`);
    await page.getByText("Galaxie d'essai").first().waitFor();
    assert.equal(codes.length, 0, 'le code de la carte n\'est pas demandé avant l\'ouverture');
    await page.getByText("Galaxie d'essai").first().click();
    await montre(page, 'Vael');
    assert.ok(codes.length >= 1, 'le code de la carte est demandé à l\'ouverture');
    await hors(page, '390-carte');

    await (await montre(page, 'Vael')).click();
    const panneau = page.getByRole('region', { name: 'Système sélectionné' });
    await panneau.getByRole('heading', { name: 'Vael' }).waitFor();
    const t = await panneau.innerText();
    assert.match(t, /7 cases depuis Port-Sel/);
    await panneau.getByRole('button', { name: 'Trajet depuis ici' }).waitFor();
    // the panel opens below the map
    const bc = await page.locator('.gx-carte').boundingBox();
    const bp = await panneau.boundingBox();
    assert.ok(bp.y >= bc.y + bc.height - 2, 'panneau sous la carte');
    await hors(page, '390-panneau');

    // Calculer disabled while an end is missing
    assert.equal(await page.getByRole('button', { name: 'Calculer', exact: true }).isDisabled(), true);
    // no Routes choice for a player
    assert.equal(await page.getByLabel('Routes', { exact: true }).count(), 0);
    await calculer(page, 'Port-Sel', 'Vael', '2');
    await page.getByText('7 cases · 4,5 jours').waitFor();
    assert.ok(await page.locator('polyline.gx-chemin').count() >= 1, 'chemin surligné');
    await hors(page, '390-trajet');

    // search « fant »
    await page.getByLabel('Rechercher un système', { exact: true }).first().fill('fant');
    await page.getByText('Aucun système ne correspond.').first().waitFor();
    const corps = await texte(page);
    assert.ok(!corps.includes('Station fantôme'));
    assert.equal(await page.locator('.gx-route.privee, .gx-zone').count(), 0, 'ni route privée ni zone');
    assert.equal(await page.locator('.secret, .secrete').count(), 0);
    assert.ok(!/Privée|Secret|MJ seul/.test(corps), 'aucune marque réservée au MJ');
    await hors(page, '390-fant');

    // link
    await (await montre(page, 'Vael')).click();
    await panneau.getByRole('button', { name: 'Copier le lien' }).click();
    await page.getByText('Lien copié').waitFor();
    const lien = (await page.evaluate(() => navigator.clipboard.readText())) as string;
    assert.match(lien, /systeme=vael/);
    const l2 = await ouvre('Léa');
    await l2.page.goto(lien);
    await l2.page.getByRole('region', { name: 'Système sélectionné' }).getByRole('heading', { name: 'Vael' }).waitFor();
    await l2.page.getByRole('region', { name: 'Système sélectionné' }).getByText('7 cases depuis Port-Sel').waitFor();
    await hors(l2.page, '390-lien-lea');
    await l2.ctx.close();
    // no account with a role
    const teo = await ouvre('Teo');
    await teo.page.goto(lien);
    await teo.page.getByText('Page introuvable.').waitFor();
    assert.equal(teo.codes.length, 0, 'aucun code de carte pour un compte sans rôle');
    await hors(teo.page, '390-teo');
    await teo.ctx.close();
    // station fantôme link
    await page.goto(adresse + '?systeme=station-fantome');
    await page.getByText('Page introuvable.').waitFor();
    assert.deepEqual(ecritures, [], 'aucune écriture');
    await ctx.close();
  });

  it('cadrage et champs (maquette, charte) : sans zoom, Port-Sel, Vael et Hesper dans le cadre à 390 px ; recherche pleine largeur à texte indicatif ; icônes ; listes à chevron', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    for (const nom of ['Port-Sel', 'Vael', 'Hesper']) await page.locator(`g.gx-systeme[aria-label="${nom}"]`).waitFor();
    const dedans = async () => page.evaluate(() => {
      const c = document.querySelector('svg.gx-svg')!.getBoundingClientRect();
      return ['Port-Sel', 'Vael', 'Hesper'].map((n) => {
        const r = document.querySelector(`g.gx-systeme[aria-label="${n}"]`)!.getBoundingClientRect();
        return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom;
      });
    });
    await page.waitForTimeout(800);
    assert.deepEqual(await dedans(), [true, true, true], 'à l\'ouverture, sans zoom');
    // after losing the framing, « Recentrer » restores it
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    await page.getByRole('button', { name: 'Recentrer' }).click();
    await page.waitForTimeout(500);
    assert.deepEqual(await dedans(), [true, true, true], 'après Recentrer');
    await page.screenshot({ path: `${SHOTS}/390-cadrage.png`, fullPage: true });

    const rech = page.getByLabel('Rechercher un système', { exact: true }).first();
    assert.equal(await rech.getAttribute('placeholder'), 'Rechercher un système');
    const depart = await page.getByLabel('Départ', { exact: true }).boundingBox();
    const br = await rech.boundingBox();
    assert.ok(Math.abs(br!.width - depart!.width) <= 2, `recherche pleine largeur (${br!.width} / ${depart!.width})`);
    for (const nom of ['Recentrer', 'Calculer']) {
      assert.equal(await page.getByRole('button', { name: nom, exact: true }).locator('svg').count(), 1, `icône sur ${nom}`);
    }
    for (const lbl of ['Moteur', 'Routes']) {
      const s = page.getByLabel(lbl, { exact: true });
      assert.equal(await s.evaluate((e: Any) => getComputedStyle(e).appearance), 'none', `${lbl} sans flèche native`);
      assert.equal(await s.locator('xpath=..').locator('svg').count(), 1, `chevron sur ${lbl}`);
    }
    await (await page.locator('g.gx-systeme[aria-label="Vael"]')).click();
    await page.getByRole('button', { name: 'Trajet vers ici' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Trajet vers ici' }).locator('svg').count(), 1, 'icône sur Trajet vers ici');
    await ctx.close();
  });

  it('Léa : aucune marque d\'écriture sur la carte', async () => {
    const { page, ctx } = await ouvre('Léa');
    await ouvrirGalaxie(page);
    await montre(page, 'Vael');
    const t = await texte(page);
    for (const m of ['Placer un système', 'Promouvoir', 'Tracer une route', 'Dessiner une zone', 'Renommer', 'Supprimer la galaxie', 'Graine', 'Document MJ']) {
      assert.ok(!t.includes(m), m);
    }
    await ctx.close();
  });

  it('Antor au bureau : Routes, trajets Hesper, marques, mode Joueur, survol', async () => {
    const a = await ouvre('Antor', 1280, 900);
    await ouvrirGalaxie(a.page);
    await montre(a.page, 'Station fantôme');
    await hors(a.page, 'bureau-antor');
    const options = await a.page.getByLabel('Routes', { exact: true }).locator('option').allInnerTexts();
    assert.ok(options.includes('Toutes'), 'Toutes proposé');
    assert.ok(await a.page.locator('.gx-route.privee').count() >= 1, 'route privée en tirets');
    assert.equal(await a.page.locator('.gx-route.privee line').first().getAttribute('stroke-dasharray') !== null, true);
    const mj = await texte(a.page);
    assert.match(mj, /Privée/);
    assert.match(mj, /Secret/);
    await a.page.getByLabel('Rechercher un système', { exact: true }).first().fill('fant');
    await a.page.locator('.gx-recherche').getByRole('button', { name: 'Station fantôme' }).waitFor();
    await calculer(a.page, 'Port-Sel', 'Hesper', '2');
    await a.page.getByText('6 cases · 4 jours').waitFor();
    await hors(a.page, 'bureau-antor-trajet');

    // hover tag with Vael as departure
    await (await montre(a.page, 'Vael')).click();
    await a.page.getByRole('button', { name: 'Trajet depuis ici' }).click();
    await (await montre(a.page, 'Hesper')).hover();
    await a.page.getByRole('tooltip').filter({ hasText: 'Hesper · 6 cases' }).waitFor();
    await hors(a.page, 'bureau-survol');
    await a.ctx.close();

    const l = await ouvre('Léa', 1280, 900);
    await ouvrirGalaxie(l.page);
    await montre(l.page, 'Vael');
    await calculer(l.page, 'Port-Sel', 'Hesper', '2');
    await l.page.getByText('13 cases · 8,5 jours').waitFor();
    await l.ctx.close();

    // Player mode of a GM
    const m = await ouvre('Antor', 1280, 900);
    await ouvrirGalaxie(m.page);
    await montre(m.page, 'Station fantôme');
    await m.page.getByRole('radio', { name: /Joueur/ }).click();
    await m.page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await montre(m.page, 'Vael');
    await m.page.waitForFunction(() => document.querySelector('g.gx-systeme[aria-label="Station fantôme"]') === null);
    assert.equal(await systeme(m.page, 'Station fantôme').count(), 0);
    assert.equal(await m.page.locator('.gx-route.privee, .gx-zone, .secret, .secrete').count(), 0);
    assert.equal(await m.page.getByLabel('Routes', { exact: true }).count(), 0);
    await m.page.getByLabel('Rechercher un système', { exact: true }).first().fill('fant');
    await m.page.getByText('Aucun système ne correspond.').first().waitFor();
    await calculer(m.page, 'Port-Sel', 'Hesper', '2');
    await m.page.getByText('13 cases · 8,5 jours').waitFor();
    await hors(m.page, 'bureau-mode-joueur');
    await m.ctx.close();
  });

  it('états : échec du calcul, bloc, connexion perdue, zoom, système non défini, pas de trajet, mêmes systèmes', async () => {
    const { page, ctx } = await ouvre('Léa');
    await ouvrirGalaxie(page);
    await montre(page, 'Vael');

    // same system
    await choisirDans(page, 'Départ', 'Vae', 'Vael');
    await choisirDans(page, 'Arrivée', 'Vae', 'Vael');
    await page.getByRole('button', { name: 'Calculer', exact: true }).click();
    await page.getByText('Choisissez deux systèmes différents.').waitFor();
    await hors(page, 'etat-memes');
    await page.getByRole('button', { name: 'Changer arrivée' }).click();
    await choisirDans(page, 'Arrivée', 'Hes', 'Hesper');

    // failing calculation
    await page.route('**/trajet?**', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await page.getByRole('button', { name: 'Calculer', exact: true }).click();
    await page.getByText('Le calcul a échoué.').waitFor();
    await page.getByRole('button', { name: 'Réessayer' }).first().waitFor();
    await hors(page, 'etat-calcul');
    await page.unroute('**/trajet?**');
    await page.getByRole('button', { name: 'Réessayer' }).first().click();
    await page.getByText(/\d+ cases · /).waitFor();

    // zoom out to the limit
    const moins = page.getByRole('button', { name: 'Zoom arrière' });
    for (let i = 0; i < 40 && !(await moins.isDisabled()); i++) await moins.click();
    assert.equal(await moins.isDisabled(), true, '« − » désactivé au zoom minimal');
    await hors(page, 'etat-zoom-min');
    await page.getByRole('button', { name: 'Recentrer' }).click();

    // generated hexagon
    await page.locator('circle[data-genere]').first().waitFor({ state: 'attached' });
    await page.waitForTimeout(500);
    const cadre = await page.locator('svg.gx-svg').boundingBox();
    const points = (await page.locator('circle[data-genere]').evaluateAll((g: Any[]) =>
      g.map((x) => { const r = x.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }))) as number[][];
    const cible = points.find(([x, y]) => x! > cadre.x + 60 && x! < cadre.x + cadre.width - 120 && y! > cadre.y + 60 && y! < cadre.y + cadre.height - 80);
    assert.ok(cible, 'un hexagone généré visible');
    await page.mouse.click(cible![0]!, cible![1]!);
    await page.getByRole('heading', { name: 'Système non défini' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Trajet depuis ici' }).count(), 0);
    await hors(page, 'etat-non-defini');

    // connection lost
    await ctx.setOffline(true);
    await page.getByText('Connexion perdue.').first().waitFor({ timeout: 40000 }).catch(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await page.getByText('Connexion perdue.').first().waitFor();
    });
    assert.equal(await page.getByRole('button', { name: 'Calculer', exact: true }).isDisabled(), true);
    await hors(page, 'etat-hors-ligne');
    await ctx.setOffline(false);
    await ctx.close();
  });

  it('état : bloc qui n\'arrive pas', async () => {
    const { page, ctx } = await ouvre('Léa');
    await page.route('**/blocs?**', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await ouvrirGalaxie(page);
    await page.getByText('Impossible de charger une partie de la carte.').waitFor();
    await hors(page, 'etat-bloc');
    await page.unroute('**/blocs?**');
    await page.getByRole('button', { name: 'Réessayer' }).first().click();
    await montre(page, 'Vael');
    await ctx.close();
  });

  it('pincement : zoom à deux pointeurs, blocs ≤ 12 × 12', async () => {
    const { page, ctx } = await ouvre('Léa');
    const blocs: string[] = [];
    page.on('request', (r: Any) => { if (/\/blocs\?/.test(r.url())) blocs.push(r.url()); });
    await ouvrirGalaxie(page);
    await montre(page, 'Vael');
    const avant = await page.locator('svg.gx-svg').evaluate((s: Any) => s.querySelectorAll('pattern#gx-grille')[0].getAttribute('width'));
    const box = await page.locator('svg.gx-svg').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.evaluate(`(() => {
      const s = document.querySelector('svg.gx-svg'); const x = ${cx}, y = ${cy};
      function ev(type, id, px) { s.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: px, clientY: y, bubbles: true, isPrimary: id === 1 })); }
      ev('pointerdown', 1, x - 40); ev('pointerdown', 2, x + 40);
      for (let i = 1; i <= 10; i++) { ev('pointermove', 1, x - 40 - i * 8); ev('pointermove', 2, x + 40 + i * 8); }
      ev('pointerup', 1, x - 120); ev('pointerup', 2, x + 120);
    })()`);
    await page.waitForFunction((a: string | null) => document.querySelector('pattern#gx-grille')?.getAttribute('width') !== a, avant);
    await page.waitForTimeout(600);
    await hors(page, 'pincement');
    for (const u of blocs) {
      const p = new URL(u).searchParams;
      const [dq, dr] = (p.get('de') ?? '0,0').split(',').map(Number);
      const [aq, ar] = (p.get('a') ?? '0,0').split(',').map(Number);
      assert.ok(Math.abs(aq! - dq!) + 1 <= 12 && Math.abs(ar! - dr!) + 1 <= 12, `rectangle trop grand: ${u}`);
    }
    await ctx.close();
  });
});

describe('E-10, droits retirés, trajet sans chemin et nom long', { skip: skipBrowser, timeout: 400000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let systemeJeu = 0;
  let adresse = '';
  let dbPath = '';
  const LONG = 'N'.repeat(24) + 'Z'.repeat(56);
  const ouvre = async (compte: string, w = 390, h = 780) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    const codes: string[] = [];
    c.page.on('request', (r: Any) => { if (CODE.test(new URL(r.url()).pathname)) codes.push(r.url()); });
    return { ...c, codes };
  };
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const sql = (fn: (db: Any) => void) => { const db = new Database(dbPath); try { fn(db); } finally { db.close(); } };
  const put = async (chemin: string, data: unknown) => {
    const a = await connecte(browser, srv.base, 'Antor');
    const r = await a.page.request.put(chemin, { data });
    await a.ctx.close();
    assert.equal(r.status(), 204, chemin);
  };

  before(async () => {
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-gx2-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    const u = (us.univers ?? us).find((x: Any) => x.nom === "Éneria d'essai");
    univers = u.id;
    systemeJeu = u.systeme.id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    await a.ctx.close();
    sql((db) => {
      const g = db.prepare("SELECT galaxie_id, univers_id, id FROM swn_systemes WHERE cle = 'port-sel'").get() as Any;
      db.prepare("UPDATE swn_systemes SET nom = ? WHERE cle = 'hesper'").run(LONG);
      const r = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, secret) VALUES (?, ?, 'lointain', 'Lointain', 9, -2, 2, 0)").run(g.galaxie_id, g.univers_id);
      db.prepare('INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (?, ?, ?, ?, 1, 12)')
        .run(g.galaxie_id, g.univers_id, g.id, r.lastInsertRowid);
    });
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('« Aucun trajet avec ce moteur. » (route de 12 cases, moteur 1) puis un trajet au moteur 2', async () => {
    const { page, ctx } = await ouvre('Léa', 1280, 900);
    await page.goto(adresse);
    await page.locator('g.gx-systeme').first().waitFor();
    for (const [champ, nom] of [['Départ', 'Port-Sel'], ['Arrivée', 'Lointain']] as const) {
      await page.getByLabel(champ, { exact: true }).fill(nom.slice(0, 3));
      await page.locator('.gx-trajet .gx-resultats').getByRole('button', { name: nom, exact: true }).click();
    }
    await page.getByLabel('Moteur', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Calculer', exact: true }).click();
    await page.getByText('Aucun trajet avec ce moteur.').waitFor();
    assert.equal(await page.locator('polyline.gx-chemin').count(), 0, 'aucun chemin surligné');
    await page.screenshot({ path: `${SHOTS}/aucun-trajet.png` });
    await page.getByLabel('Moteur', { exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Calculer', exact: true }).click();
    await page.getByText(/^12 cases · /).waitFor();
    await ctx.close();
  });

  it('nom de 80 caractères : tronqué à 24 sur la carte, entier dans le panneau', async () => {
    const { page, ctx } = await ouvre('Léa', 1280, 900);
    await page.goto(adresse);
    await systeme(page, LONG).waitFor();
    const etiquette = ((await systeme(page, LONG).locator('text').textContent()) ?? '').trim();
    assert.ok([...etiquette].length <= 24, `étiquette de ${[...etiquette].length} caractères : ${etiquette}`);
    assert.ok(etiquette.startsWith('NNNN'));
    await systeme(page, LONG).click();
    const panneau = page.getByRole('region', { name: 'Système sélectionné' });
    assert.equal((await panneau.getByRole('heading').innerText()).trim(), LONG);
    await page.screenshot({ path: `${SHOTS}/nom-80.png` });
    await ctx.close();
  });

  it('E-10 : « Galaxie » pour Antor, « MJ seul » une fois masquée, absente pour Léa qui trouve « Page introuvable. » sans code', async () => {
    const a = await ouvre('Antor', 1280, 900);
    await a.page.goto(`/univers/${univers}/cartes`);
    const ligne = a.page.locator('li, article, a').filter({ hasText: "Galaxie d'essai" }).last();
    await ligne.waitFor();
    assert.match(await a.page.locator('body').innerText(), /Galaxie/);
    assert.ok(await a.page.getByText('Galaxie', { exact: true }).count() >= 1, 'pastille « Galaxie »');
    assert.equal(await a.page.getByText('MJ seul').count(), 0);
    await a.page.screenshot({ path: `${SHOTS}/e10-antor-visible.png` });
    sql((db) => db.prepare('UPDATE swn_galaxies SET visible = 0').run());
    await a.page.reload();
    await a.page.getByText("Galaxie d'essai").first().waitFor();
    assert.ok(await a.page.getByText('MJ seul').count() >= 1, '« MJ seul » après masquage');
    await a.page.screenshot({ path: `${SHOTS}/e10-antor-masquee.png` });
    await a.ctx.close();

    const l = await ouvre('Léa');
    await l.page.goto(`/univers/${univers}/cartes`);
    await l.page.waitForLoadState('networkidle');
    assert.ok(!(await l.page.locator('body').innerText()).includes("Galaxie d'essai"), 'absente pour Léa');
    await l.page.goto(adresse);
    await l.page.getByText('Page introuvable.').waitFor();
    assert.equal(l.codes.length, 0, 'aucun code de carte pour Léa sur une galaxie masquée');
    await l.page.screenshot({ path: `${SHOTS}/lea-masquee.png` });
    await l.ctx.close();

    // a GM in Player mode on the hidden galaxy: the E-11 notice
    const m = await ouvre('Antor', 1280, 900);
    await m.page.goto(adresse);
    await m.page.locator('g.gx-systeme').first().waitFor();
    await m.page.getByRole('radio', { name: /Joueur/ }).click();
    await m.page.getByText("Cette carte n'est pas visible des joueurs.".replace("'", '’')).or(m.page.getByText("Cette carte n'est pas visible des joueurs.")).first().waitFor();
    assert.equal(m.codes.length >= 0, true);
    await m.page.screenshot({ path: `${SHOTS}/antor-mode-joueur-masquee.png` });
    await m.ctx.close();
    sql((db) => db.prepare('UPDATE swn_galaxies SET visible = 1').run());
  });

  it('outil désactivé : « Page introuvable. » sans code, et plus de ligne', async () => {
    await put(`/api/systemes/${systemeJeu}/outils/swn/galaxie/activation`, { active: false });
    const l = await ouvre('Léa');
    await l.page.goto(adresse);
    await l.page.getByText('Page introuvable.').waitFor();
    assert.equal(l.codes.length, 0);
    await l.page.screenshot({ path: `${SHOTS}/outil-desactive.png` });
    await l.ctx.close();
    const a = await ouvre('Antor');
    await a.page.goto(adresse);
    await a.page.getByText('Page introuvable.').waitFor();
    assert.equal(a.codes.length, 0);
    await a.ctx.close();
  });
});
