// Browser tests of kanevas-carte-spatiale-systeme (E-23 text version, P-22 opening), written from the sheet, docs/parcours.md,
// docs/ecrans.md (« E-23 — what kanevas-carte-spatiale-systeme builds first ») and the maquette — not from the code.
// Complements systeme-liste-corps-ecran.test.ts. Stub world with the seed. Screenshots go to /tmp/cap-systeme-besoin (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, rx, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-systeme-besoin';
const LONG_NOM = 'Le grand vaisseau fantôme des brumes anciennes de la marche orientale du secteur'; // 80 characters, the maximum

describe('E-23 liste des corps : parcours P-22 en version texte', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let adresseGalaxie = '';
  let dbPath = '';
  let tire = { q: 0, r: 0 };
  const sql = (fn: (db: Any) => void) => { const db = new Database(dbPath); try { fn(db); } finally { db.close(); } };
  const adr = (q: number, r: number, suffixe = '') => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${q}/${r}${suffixe}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  /** The lines of the list that follows the heading « Corps (n) » / « Zones (n) », as arrays of their non-empty text rows. */
  const lignesDe = async (page: Any, titre: RegExp): Promise<string[][]> => {
    const items = page.getByRole('heading', { name: titre }).locator('xpath=following::ul[1]/li');
    const bruts = (await items.allInnerTexts()) as string[];
    return bruts.map((t) => t.split('\n').map((x) => x.trim()).filter(Boolean));
  };
  const trie = (a: string[]) => [...a].sort();
  /** The GM's Player mode, by the product's toggle in the shell; waits for its banner. */
  const modeJoueur = async (page: Any) => {
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText(rx('Mode Joueur : vous voyez ce que voit un joueur.')).waitFor();
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-sysb-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresseGalaxie = String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse);
    gid = Number(adresseGalaxie.split('/').pop());
    outer: for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      const x = await a.page.request.get(`/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}/interieur/${q}/${r}`);
      if (x.status() === 200) { const v = (await x.json()) as Any; if (v.etat === 'tire' && v.astres.length > 0) { tire = { q, r }; break outer; } }
    }
    await a.ctx.close();
    sql((db) => {
      const ins = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)");
      const astre = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const zone = db.prepare('INSERT INTO swn_formations (systeme_id, cle, forme, parametres) VALUES (?,?,?,?)');
      // 1. a defined system of every kind of body, inserted out of order
      const o = ins.run(gid, univers, 'sb-ordre', 'Ordre-test', 44, 45).lastInsertRowid;
      astre.run(o, 'ge', 'planete', null, 0, 'gazeuse', 'Géante', 4.1, 8.8, 1);
      astre.run(o, 'co', 'comete', null, 0, 'comete', null, 6.5, 1.2, 0.1);
      const proche = astre.run(o, 'pr', 'planete', null, 0, 'tellurique', 'Proche', 1.02, 3.4, 1).lastInsertRowid;
      astre.run(o, 'et', 'planete', null, 0, 'tellurique', 'Entière', 4, 7, 1);
      astre.run(o, 'ano', 'planete', null, 0, 'anomalie', null, 2.03, 6.1, 0.1);
      astre.run(o, 'cp', 'etoile', null, 1, 'jaune', null, 0.6, 5, 0.2);
      astre.run(o, 'e0', 'etoile', null, 0, 'jaune', null, 0, 0, 0.3);
      astre.run(o, 'lp', 'lune', proche, 0, 'rocheux', null, null, 9.8, 0.1);
      const geante = db.prepare('SELECT id FROM swn_astres WHERE systeme_id=? AND cle=?').get(o, 'ge').id;
      astre.run(o, 'lg', 'lune', geante, 0, 'rocheux', null, null, 2, 0.1);
      zone.run(o, 'nu', 'nuage', '{}');
      zone.run(o, 'an', 'anneau', '{"de":2.9,"a":3.3}');
      // 2. a defined system with no row in swn_astres
      ins.run(gid, univers, 'sb-vide', 'Cache-test', 46, 47);
      // 3. the long content of the criteria: 12 planets with 4 moons each, 5 companions
      const l = ins.run(gid, univers, 'sb-long', 'Long-test', 48, 49).lastInsertRowid;
      astre.run(l, 'e0', 'etoile', null, 0, 'jaune', 'Étoile-longue', 0, 0, 0.3);
      for (let k = 1; k <= 5; k++) astre.run(l, `c${k}`, 'etoile', null, k, 'jaune', `Compagne-${k}`, 0.1 * k, k, 0.2);
      for (let p = 1; p <= 12; p++) {
        const nom = p === 12 ? LONG_NOM : `Planète-${String(p).padStart(2, '0')}`;
        const pid = astre.run(l, `p${p}`, 'planete', null, 0, 'tellurique', nom, p, p % 12, 1).lastInsertRowid;
        for (let m = 1; m <= 4; m++) astre.run(l, `p${p}m${m}`, 'lune', pid, 0, 'rocheux', null, null, m, 0.1);
      }
    });
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('joueuse et MJ lisent les mêmes lignes d’un système tiré, marqué « Tiré » ; le MJ en mode joueur aussi', async () => {
    const lire = async (compte: string, joueur = false) => {
      const { page, ctx } = await connecte(browser, srv.base, compte);
      await page.goto(adr(tire.q, tire.r));
      if (joueur) await modeJoueur(page);
      await page.getByText('Tiré', { exact: true }).waitFor();
      await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
      const corps = await lignesDe(page, /^Corps \(\d+\)$/);
      const titre = await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).innerText();
      assert.ok(corps.length > 0);
      assert.equal(titre, `Corps (${corps.length})`);
      assert.match(await texte(page), new RegExp(`Hexagone ${tire.q}, ${tire.r}`.replace('-', '[-−]')));
      if (compte === 'Léa') { await page.setViewportSize({ width: 390, height: 780 }); await hors(page, 'tire-joueuse-390'); }
      await ctx.close();
      return { corps, titre };
    };
    const mj = await lire('Antor');
    assert.deepEqual(await lire('Léa'), mj);
    assert.deepEqual(await lire('Antor', true), mj);
  });

  const ATTENDU_CORPS = [
    ['Astre sans nom', 'Étoile jaune', 'Orbite 0 · 0 h'],
    ['Astre sans nom', 'Compagne · Étoile jaune', 'Orbite 0,6 · 5 h'],
    ['Proche', 'Tellurique', 'Orbite 1,02 · 3,4 h'],
    ['Astre sans nom', 'Lune · Rocheux', 'Autour de sa planète · 9,8 h'],
    ['Entière', 'Tellurique', 'Orbite 4 · 7 h'],
    ['Géante', 'Gazeuse', 'Orbite 4,1 · 8,8 h'],
    ['Astre sans nom', 'Lune · Rocheux', 'Autour de sa planète · 2 h'],
    ['Astre sans nom', 'Anomalie', 'Orbite 2,03 · 6,1 h'],
    ['Astre sans nom', 'Comète', 'Orbite 6,5 · 1,2 h'],
  ];
  const lireOrdre = async (compte: string, joueur = false) => {
    const { page, ctx } = await connecte(browser, srv.base, compte);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(adr(44, 45));
    if (joueur) await modeJoueur(page);
    await page.getByRole('heading', { name: 'Corps (9)' }).waitFor();
    await page.getByRole('heading', { name: 'Zones (2)' }).waitFor();
    const corps = await lignesDe(page, /^Corps/);
    const zones = await lignesDe(page, /^Zones/);
    const t = await texte(page);
    if (compte === 'Antor' && !joueur) await hors(page, 'ordre-bureau-mj');
    await ctx.close();
    return { corps, zones, t };
  };

  it('types, lieux et nombres français de chaque corps et zone d’un système défini (comptes, virgule, pas de zéro final), même lecture pour MJ, joueuse et MJ en mode joueur', async () => {
    const vus = [] as Awaited<ReturnType<typeof lireOrdre>>[];
    for (const [compte, joueur] of [['Antor', false], ['Léa', false], ['Antor', true]] as const) {
      const v = await lireOrdre(compte, joueur);
      vus.push(v);
      assert.deepEqual(v.corps.map((l) => trie(l)).sort(), ATTENDU_CORPS.map((l) => trie(l)).sort(), `${compte} ${joueur}`);
      assert.equal(v.zones.length, 2);
      const anneau = v.zones.find((l) => l.includes('Anneau'));
      assert.deepEqual(anneau && trie(anneau), trie(['Zone sans nom', 'Anneau', 'Orbite 2,9 à 3,3']));
      const nuage = v.zones.find((l) => l.includes('Nuage'));
      assert.ok(nuage?.includes('Zone sans nom'));
      assert.match(v.t, /Ordre-test/); assert.match(v.t, /Défini/); assert.match(v.t, /Hexagone 44, 45/); assert.match(v.t, /← Galaxie/);
    }
    assert.deepEqual(vus[1].corps, vus[0].corps, 'joueuse = MJ');
    assert.deepEqual(vus[2].corps, vus[0].corps, 'MJ en mode joueur = joueuse');
    assert.deepEqual(vus[1].zones, vus[0].zones);
  });

  it('ordre de « Corps » : l’étoile, ses compagnes, puis chaque planète suivie de ses lunes', async () => {
    const { corps } = await lireOrdre('Léa');
    const nom = (l: string[]) => (l.includes('Étoile jaune') ? 'étoile' : l.includes('Compagne · Étoile jaune') ? 'compagne' : l.includes('Lune · Rocheux') ? 'lune' : l.includes('Anomalie') ? 'anomalie' : l.includes('Comète') ? 'comète' : l[0]);
    assert.deepEqual(corps.slice(0, 2).map(nom), ['étoile', 'compagne']);
    assert.deepEqual(corps.slice(2, 7).map(nom), ['Proche', 'lune', 'Entière', 'Géante', 'lune']);
  });

  it('ordre de « Corps » : les comètes et anomalies viennent après toutes les planètes et leurs lunes, par orbite croissante', async () => {
    const { corps } = await lireOrdre('Léa');
    const fin = corps.filter((l) => !l.includes('Compagne · Étoile jaune')).slice(-2); // the companion's place is the object of the test above
    assert.deepEqual(fin.map((l) => (l.includes('Anomalie') ? 'anomalie' : l.includes('Comète') ? 'comète' : '?')), ['anomalie', 'comète']);
  });

  it('système défini sans corps : « Ce système est vide. » pour le MJ, « Rien à voir dans ce système pour l’instant. » pour la joueuse', async () => {
    const mj = await connecte(browser, srv.base, 'Antor');
    await mj.page.goto(adr(46, 47));
    await mj.page.getByText('Ce système est vide.').waitFor();
    assert.ok(!(await texte(mj.page)).includes('Rien à voir'));
    assert.equal(await mj.page.getByRole('heading', { name: /^Corps/ }).count(), 0);
    assert.match(await texte(mj.page), /Défini/);
    await hors(mj.page, 'vide-mj');
    await mj.ctx.close();
    for (const [compte, joueur] of [['Léa', false], ['Antor', true]] as const) {
      const j = await connecte(browser, srv.base, compte);
      await j.page.goto(adr(46, 47));
      if (joueur) await modeJoueur(j.page);
      await j.page.getByText(rx("Rien à voir dans ce système pour l'instant.")).waitFor({ timeout: 8000 }).catch(async (e: Any) => { throw new Error(`${compte}: ${(await texte(j.page)).slice(0, 400)} / ${e.message}`); });
      assert.ok(!(await texte(j.page)).includes('Ce système est vide.'), compte);
      if (compte === 'Léa') await hors(j.page, 'vide-joueuse');
      await j.ctx.close();
    }
  });

  it('douze planètes à quatre lunes et cinq compagnes : toutes les lignes, dans l’ordre, sans coupure ni défilement horizontal', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Léa');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(adr(48, 49));
    await page.getByRole('heading', { name: 'Corps (66)' }).waitFor();
    const corps = await lignesDe(page, /^Corps/);
    assert.equal(corps.length, 66);
    const noms = corps.map((l) => l[0]);
    assert.equal(noms[0], 'Étoile-longue');
    assert.deepEqual(noms.filter((n) => /^Compagne-/.test(n)), [1, 2, 3, 4, 5].map((k) => `Compagne-${k}`), 'cinq compagnes, par rang');
    // planets in orbit order, each followed by its four moons (the companions' place is the object of the order test)
    const reste = corps.filter((l) => l[0] !== 'Étoile-longue' && !/^Compagne-/.test(l[0]));
    const attenduNoms: string[] = [];
    for (let p = 1; p <= 12; p++) attenduNoms.push(p === 12 ? LONG_NOM : `Planète-${String(p).padStart(2, '0')}`, ...Array(4).fill('Astre sans nom'));
    assert.deepEqual(reste.map((l) => l[0]), attenduNoms);
    reste.forEach((l, i) => { if (i % 5 !== 0) assert.ok(l.includes('Lune · Rocheux'), `ligne ${i}`); });
    assert.ok(corps[0].includes('Étoile jaune') && corps[0].includes('Orbite 0 · 0 h'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'pas de défilement horizontal');
    assert.equal(await page.getByRole('heading', { name: /^Zones/ }).count(), 0, 'pas de section Zones sans zone');
    await hors(page, 'long-390');
    await ctx.close();
  });

  it('serveur muet à l’ouverture : « Impossible de charger l’outil. » et « Réessayer » ramène la liste', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Léa');
    const motif = /\/interieur\/44\/45$/;
    await page.route((u: URL) => motif.test(u.pathname) && u.pathname.includes('/api/'), (r: Any) => r.abort());
    await page.goto(adr(44, 45));
    await page.getByText(rx("Impossible de charger l'outil.")).waitFor();
    await page.getByRole('button', { name: 'Réessayer' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: /^Corps/ }).count(), 0);
    await hors(page, 'erreur');
    await page.unroute(() => true).catch(() => undefined);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await page.getByRole('heading', { name: 'Corps (9)' }).waitFor();
    assert.ok(!(await texte(page)).includes("Impossible de charger l'outil."));
    await ctx.close();
  });

  it('réseau perdu après la lecture : la liste reste sous « Connexion perdue. », qui s’en va au retour du réseau', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Léa');
    await page.goto(adr(44, 45));
    await page.getByRole('heading', { name: 'Corps (9)' }).waitFor();
    await ctx.setOffline(true);
    await page.getByText('Connexion perdue.', { exact: true }).waitFor();
    assert.equal((await lignesDe(page, /^Corps/)).length, 9);
    await hors(page, 'hors-ligne');
    await ctx.setOffline(false);
    await page.getByText('Connexion perdue.', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal((await lignesDe(page, /^Corps/)).length, 9);
    await ctx.close();
  });

  it('sans session, l’adresse du système passe par la connexion et ne montre aucun corps', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base });
    const page = await ctx.newPage();
    await page.goto(adr(44, 45));
    await page.getByRole('button', { name: /^Se connecter/ }).first().waitFor();
    const t = await texte(page);
    assert.ok(!t.includes('Ordre-test') && !t.includes('Corps ('), t.slice(0, 200));
    await ctx.close();
  });

  it('depuis le panneau d’un système de la galaxie, « Ouvrir le système » mène à son intérieur, pour la joueuse comme pour le MJ', async () => {
    for (const compte of ['Léa', 'Antor']) {
      const { page, ctx } = await connecte(browser, srv.base, compte);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${adresseGalaxie}?systeme=sb-ordre`);
      const panneau = page.getByRole('region', { name: 'Système sélectionné' });
      await panneau.getByRole('heading', { name: 'Ordre-test' }).waitFor();
      await panneau.getByRole('link', { name: 'Ouvrir le système' }).click();
      await page.getByRole('heading', { name: 'Corps (9)' }).waitFor();
      assert.match(new URL(page.url()).pathname, /\/interieur\/44\/45$/, compte);
      await page.getByRole('link', { name: /Galaxie/ }).first().click();
      await page.getByRole('region', { name: 'Système sélectionné' }).waitFor({ timeout: 15000 }).catch(() => undefined);
      assert.ok(!/\/interieur\//.test(new URL(page.url()).pathname), `${compte} : retour à la galaxie`);
      if (compte === 'Léa') await hors(page, 'retour-galaxie');
      await ctx.close();
    }
  });
});
