// ecrans: cartes
// Browser test of kanevas-carte-spatiale-reglages-generateur (E-24 « Générateur », E-21 entry « Réglages du générateur… », P-23, B-90),
// written from the exit criterion and docs/ecrans.md « E-24 » — not from the code. The effect of the routes has its door
// (src/outils/swn/reglages-routes.test.ts); the screen keeps the gestures, the texts and the states; the rows read below are
// the proof that the display follows the data (a drawn system shows a comet, the stars did not move, a defined system is the same).
// Screenshots go to /tmp/cap-reglages-generateur (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-reglages-generateur';

describe('E-24 réglages du générateur : compte avant confirmation, refus, conflit, lecture, accès', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const adr = (q = '') => `/univers/${univers}/outils/swn/galaxie/${gid}/reglages${q}`;
  const base = () => `/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const sql = <T>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const ouvrir = async (compte: string, l = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: l, height: h });
    await c.page.goto(adr());
    return c;
  };
  const champ = (page: Any, nom: string | RegExp) => page.getByRole('textbox', { name: nom, exact: false });
  const lecture = async (page: Any) => (await (await page.request.get(`${base()}/reglages`)).json()) as Any;
  /** Hexagons that hold a drawn (not defined) interior, found through the interior route. */
  const tires = async (page: Any): Promise<[number, number][]> => {
    const out: [number, number][] = [];
    for (let q = -12; q <= 12 && out.length < 6; q++) {
      for (let r = -12; r <= 12 && out.length < 6; r++) {
        const res = await page.request.get(`${base()}/interieur/${q}/${r}`);
        if (res.status() === 200) { const b = (await res.json()) as Any; if (b.etat === 'tire') out.push([q, r]); }
      }
    }
    return out;
  };
  const interieur = async (page: Any, [q, r]: [number, number]) => (await (await page.request.get(`${base()}/interieur/${q}/${r}`)).json()) as Any;
  const etoiles = (i: Any) => JSON.stringify(i.astres.filter((a: Any) => a.genre === 'etoile').map((a: Any) => [a.cle, a.type, a.nom]));
  const nbCometes = (i: Any) => i.astres.filter((a: Any) => a.genre === 'comete').length;

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-reglages-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('repos : « Valeurs par défaut », version 1 sans « Passer à la version », Appliquer désactivé, trois exemples', async () => {
    const { page, ctx } = await ouvrir('Antor');
    await page.getByRole('heading', { name: 'Réglages du générateur' }).waitFor();
    await page.getByText('Valeurs par défaut', { exact: true }).waitFor();
    assert.match(await page.getByText(/^Version du générateur/).innerText(), /Version du générateur : 1$/);
    assert.equal(await page.getByRole('button', { name: /Passer à la version/ }).count(), 0);
    assert.equal(await page.getByText('Rien à appliquer.').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Appliquer' }).isDisabled(), true);
    await page.locator('figure.rg-exemple').nth(2).waitFor();
    assert.equal(await page.locator('figure.rg-exemple').count(), 3);
    await hors(page, '1-repos');
    await ctx.close();
  });

  it('les trois exemples changent à la frappe : comète à 1 → « 1 comète » dans chacun', async () => {
    const { page, ctx } = await ouvrir('Antor');
    const lignes = () => page.locator('figure.rg-exemple figcaption span').allInnerTexts();
    await page.waitForFunction(() => [...document.querySelectorAll('figure.rg-exemple figcaption span')].every((e) => /planète/.test(e.textContent ?? '')));
    assert.ok((await lignes()).every((t: string) => /· 0 comète$/.test(t)), 'sans réglage, aucune comète');
    await champ(page, 'Comètes').first().fill('1');
    await page.waitForFunction(() => [...document.querySelectorAll('figure.rg-exemple figcaption span')].every((e) => /· 1 comète$/.test(e.textContent ?? '')));
    await ctx.close();
  });

  it('une fréquence de 2 est refusée au champ « Entre 0 et 1. », Appliquer désactivé, rien d’enregistré', async () => {
    const avant = (await lecture((await ouvrir('Antor')).page)).version;
    const { page, ctx } = await ouvrir('Antor');
    await champ(page, 'Comètes').first().fill('2');
    await page.getByText('Entre 0 et 1.').first().waitFor();
    await page.getByText('Corrigez les champs marqués.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Appliquer' }).isDisabled(), true);
    await hors(page, '3-refus');
    await page.waitForTimeout(700);
    const apres = await lecture(page);
    assert.equal(apres.version, avant);
    assert.equal(apres.par_defaut, true);
    assert.equal(sql((db) => db.prepare('SELECT count(*) n FROM swn_reglages').get().n), 0);
    await ctx.close();
  });

  it('une borne de classe hors limite (planètes 13) et un minimum au-dessus du maximum sont refusés', async () => {
    const { page, ctx } = await ouvrir('Antor');
    const cellule = (n: string) => page.getByRole('textbox', { name: n });
    await cellule('Naine rouge (M), planètes, maximum').fill('13');
    await page.getByText('Entre 0 et 12.').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Appliquer' }).isDisabled(), true);
    await cellule('Naine rouge (M), planètes, maximum').fill('3');
    await cellule('Naine rouge (M), planètes, minimum').fill('9');
    await page.getByText('Le minimum dépasse le maximum.').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Appliquer' }).isDisabled(), true);
    await ctx.close();
  });

  it('le décompte paraît avant la confirmation ; après Appliquer chaque système tiré a une comète, étoiles intactes, un défini identique', async () => {
    const a = await ouvrir('Antor');
    const { page } = a;
    const pris = await tires(page);
    assert.ok(pris.length >= 3, `au moins trois systèmes tirés lisibles (trouvés : ${pris.length})`);
    const avant = await Promise.all(pris.map((p) => interieur(page, p)));
    
    // A defined system: the lines of its tables, before and after.
    sql((db) => {
      const id = Number(db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,1)")
        .run(gid, univers, 'rg-defini', 'Défini', 80, 81).lastInsertRowid);
      db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, 'rg-soleil', 'etoile', null, 0, 'jaune', 'Soleil', 0, 0, 0.3);
    });
    const lignesDefini = () => JSON.stringify(sql((db) => db.prepare('SELECT * FROM swn_astres WHERE cle = ?').all('rg-soleil')));
    const definiAvant = lignesDefini();
    const v0 = (await lecture(page)).version;

    await page.reload();
    await champ(page, 'Comètes').first().fill('1');
    // The count is read BEFORE any confirmation dialogue and before anything is written.
    await page.getByText(/systèmes? tirés? chang(e|ent) d'intérieur/).waitFor();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal((await lecture(page)).version, v0, 'rien d’écrit avant Appliquer');
    const phrase = await page.locator('.phrase-barre').innerText();
    assert.match(phrase, /^[1-9]\d* systèmes? tirés? chang(e|ent) d'intérieur\. (Aucun système défini\.|\d+ systèmes? définis? ne bougent? pas\.)/);
    await hors(page, '2-compte-en-attente');
    await page.getByRole('button', { name: 'Appliquer' }).click();
    const dlg = page.getByRole('alertdialog');
    await dlg.waitFor();
    await hors(page, '2b-confirmation');
    await dlg.getByRole('button', { name: 'Appliquer' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByText('Rien à appliquer.').waitFor();
    assert.equal((await lecture(page)).version, v0 + 1);

    const apres = await Promise.all(pris.map((p) => interieur(page, p)));
    for (let k = 0; k < pris.length; k++) {
      assert.ok(nbCometes(apres[k]) >= 1, `comète sur ${pris[k]}`);
      assert.equal(etoiles(apres[k]), etoiles(avant[k]), `étoiles intactes sur ${pris[k]}`);
    }
    assert.equal(lignesDefini(), definiAvant, 'un système défini ne bouge pas');
    await a.ctx.close();
  });

  it('un second onglet qui a appliqué : « Ces réglages ont changé… » et « Recharger » remet à jour', async () => {
    const un = await ouvrir('Antor');
    const deux = await ouvrir('Antor');
    await champ(un.page, 'Nébuleuses').first().fill('0,2');
    await un.page.getByText(/chang(e|ent) d'intérieur|Aucun système tiré/).waitFor();
    // The second tab applies first.
    const v = (await lecture(deux.page)).version;
    const r = await deux.page.request.put(`${base()}/reglages`, { data: { version: v, valeurs: { frequences: { nebuleuse: 0.5 } }, confirme: true } });
    assert.equal(r.status(), 200);
    await un.page.getByRole('button', { name: 'Appliquer' }).click();
    const dlg = un.page.getByRole('alertdialog');
    if (await dlg.count()) await dlg.getByRole('button', { name: 'Appliquer' }).click();
    await un.page.getByText('Ces réglages ont changé depuis que vous les avez ouverts.', { exact: false }).waitFor();
    await hors(un.page, '4-conflit');
    await un.page.getByRole('button', { name: 'Recharger' }).click();
    await un.page.getByText('Ces réglages ont changé', { exact: false }).waitFor({ state: 'detached' });
    assert.equal(await champ(un.page, 'Nébuleuses').first().inputValue(), '0,5');
    await un.ctx.close(); await deux.ctx.close();
  });

  it('quitter avec une modification non appliquée demande « Quitter sans appliquer ? »', async () => {
    const { page, ctx } = await ouvrir('Antor');
    await champ(page, 'Nébuleuses').first().fill('0,2');
    await page.getByRole('link', { name: '← Galaxie' }).click();
    await page.getByRole('alertdialog', { name: 'Quitter sans appliquer ?' }).waitFor();
    await page.getByRole('button', { name: 'Rester' }).click();
    assert.match(page.url(), /\/reglages/);
    await ctx.close();
  });

  it('Léa n’a pas l’entrée du menu Galaxie et l’adresse répond « Page introuvable. » ; une galaxie inconnue aussi', async () => {
    const { page, ctx } = await ouvrir('Léa');
    await page.getByText('Page introuvable.').waitFor();
    await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}`);
    assert.equal(await page.getByRole('menuitem', { name: 'Réglages du générateur…' }).count(), 0);
    await page.goto(`/univers/${univers}/outils/swn/galaxie/999999/reglages`);
    await page.getByText('Page introuvable.').waitFor();
    await ctx.close();
    const mj = await connecte(browser, srv.base, 'Antor');
    await mj.page.goto(`/univers/${univers}/outils/swn/galaxie/999999/reglages`);
    await mj.page.getByText('Page introuvable.').waitFor();
    await mj.ctx.close();
  });

  it('le MJ trouve l’entrée « Réglages du générateur… » du menu Galaxie ; en mode joueur elle disparaît et la page se lit sans bouton', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}`);
    await page.getByRole('button', { name: 'Galaxie ▾' }).click();
    await page.getByRole('menuitem', { name: 'Réglages du générateur…' }).click();
    await page.getByRole('heading', { name: 'Réglages du générateur' }).waitFor();
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText('Mode joueur actif.').waitFor();
    for (const n of ['Appliquer', 'Changer la graine…', 'Tout remettre aux valeurs par défaut']) {
      assert.equal(await page.getByRole('button', { name: n }).count(), 0, n);
    }
    assert.ok((await page.getByRole('textbox').evaluateAll((els: Any[]) => els.every((e) => e.disabled))), 'champs en lecture');
    await hors(page, '5-mode-joueur');
    await page.getByRole('link', { name: '← Galaxie' }).click();
    await page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await page.waitForTimeout(500);
    if (await page.getByRole('button', { name: 'Galaxie ▾' }).count()) await page.getByRole('button', { name: 'Galaxie ▾' }).click();
    assert.equal(await page.getByRole('menuitem', { name: 'Réglages du générateur…' }).count(), 0, 'pas d’entrée en mode joueur');
    await ctx.close();
  });

  it('390 px : la page tient dans la largeur', async () => {
    const { page, ctx } = await ouvrir('Antor', 390, 800);
    await page.getByRole('heading', { name: 'Réglages du générateur' }).waitFor();
    await champ(page, 'Comètes').first().fill('2');
    await page.getByText('Entre 0 et 1.').first().waitFor();
    await hors(page, '6-refus-390');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement horizontal');
    await ctx.close();
  });
});
