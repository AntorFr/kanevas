// ecrans: cartes
// Browser test of kanevas-carte-spatiale-reglages-aspects-ecran (E-24 « Aspects », P-23, B-90, AD-149, AD-reglages-6),
// written from the exit criterion and docs/ecrans.md « E-24 » — not from the code. The effect of the routes has its door
// (src/outils/swn/reglages-routes.test.ts); the screen keeps the gestures, the texts and the states; the reads below are the
// proof that the display follows the data (the same bodies, same places, another illustration).
// Screenshots go to /tmp/cap-reglages-aspects (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-reglages-aspects';

describe('E-24 réglages, onglet Aspects : vignette en direct, enregistrer, revenir au défaut, #12, onglets, conflit, lecture', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const adr = (q = '?onglet=aspects') => `/univers/${univers}/outils/swn/galaxie/${gid}/reglages${q}`;
  const base = () => `/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const sql = <T>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const ouvrir = async (compte: string, l = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: l, height: h });
    await c.page.goto(adr());
    await c.page.getByRole('listbox', { name: "Types d'astre" }).waitFor();
    return c;
  };
  const lecture = async (page: Any) => (await (await page.request.get(`${base()}/reglages`)).json()) as Any;
  const ligneType = (v: Any, t: string) => v.aspects.find((a: Any) => a.type === t) as Any;
  const choisir = (page: Any, libelle: string) => page.getByRole('option', { name: new RegExp(`^${libelle}`) }).click();
  const champ = (page: Any, nom: string) => page.getByRole('textbox', { name: nom, exact: true });
  const vignetteGrande = (page: Any) => page.locator('.rg-aspect-grand canvas');
  const pixels = (page: Any) => vignetteGrande(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const aspectsEnBase = () => sql((db) => db.prepare('SELECT type, parametres FROM swn_aspects').all()) as Any[];

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-aspects-')), 'k.db');
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

  it('repos : liste groupée Corps / Étoile, aucun « Modifié », pas de barre Appliquer, invite à choisir', async () => {
    const { page, ctx } = await ouvrir('Antor');
    assert.equal(await page.getByRole('tab', { name: 'Aspects', selected: true }).count(), 1);
    assert.equal(await page.getByText('Corps', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Étoile', { exact: true }).count(), 1);
    assert.ok((await page.getByRole('option').count()) >= 10);
    assert.equal(await page.getByRole('option').filter({ hasText: 'Modifié' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Appliquer' }).count(), 0, 'la barre d’application est absente');
    await page.getByText('Choisissez un type pour modifier son aspect.').waitFor();
    await hors(page, '1-repos');
    await ctx.close();
  });

  it('palette tellurique : la vignette suit la frappe, Enregistrer change l’illustration des astres sans en bouger un, Modifié paraît ; Revenir au défaut le retire', async () => {
    const { page, ctx } = await ouvrir('Antor');
    const v0 = await lecture(page);
    const defaut = ligneType(v0, 'tellurique').defaut as Any;
    await choisir(page, 'Tellurique');
    await page.getByText('Les illustrations de tous les astres de ce type changent. Aucun astre ne bouge.').waitFor();
    assert.equal(await page.getByText(/changent d'intérieur|confirm/i).count(), 0, 'ni décompte ni confirmation');
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true, 'rien à enregistrer au repos');
    assert.equal(await page.getByRole('button', { name: 'Revenir au défaut' }).isDisabled(), true);
    const champPalette = champ(page, 'Palette, couleur 1');
    assert.equal((await champPalette.inputValue()).toLowerCase(), String(defaut.palette[0]).toLowerCase(), 'le défaut vient du cœur');
    await page.waitForTimeout(500);
    const avant = await pixels(page);
    await hors(page, '2-tellurique-defaut');
    await champPalette.fill('#ff0000');
    await page.waitForFunction((a: string) => (document.querySelector('.rg-aspect-grand canvas') as HTMLCanvasElement).toDataURL() !== a, avant);
    const brouillon = await pixels(page);
    assert.notEqual(brouillon, avant, 'la vignette change à la frappe');
    assert.deepEqual(aspectsEnBase(), [], 'rien d’écrit avant Enregistrer');
    await hors(page, '3-tellurique-brouillon');

    // The bodies of a drawn system, before.
    const lireAstres = async () => {
      const out: Any[] = [];
      for (let q = -6; q <= 6 && out.length < 40; q++) for (let r = -6; r <= 6 && out.length < 40; r++) {
        const res = await page.request.get(`${base()}/interieur/${q}/${r}`);
        if (res.status() === 200) for (const a of ((await res.json()) as Any).astres ?? []) out.push([q, r, a]);
      }
      return out;
    };
    const astresAvant = await lireAstres();
    const telluriquesAvant = astresAvant.filter(([, , a]) => a.type === 'tellurique');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('option', { name: /^Tellurique.*Modifié/ }).waitFor();
    const ligne = aspectsEnBase();
    assert.equal(ligne.length, 1);
    assert.equal(ligne[0].type, 'tellurique');
    assert.deepEqual(Object.keys(JSON.parse(ligne[0].parametres)), ['palette'], 'seule la palette qui diffère est envoyée');
    assert.equal(JSON.parse(ligne[0].parametres).palette[0], '#ff0000');
    const v1 = await lecture(page);
    assert.equal(v1.version, v0.version, 'la version de la galaxie ne bouge pas');
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    const astresApres = await lireAstres();
    assert.equal(astresApres.length, astresAvant.length);
    assert.ok(telluriquesAvant.length > 0, `au moins un astre tellurique lisible (trouvés : ${telluriquesAvant.length})`);
    {
      const pos = (l: Any[]) => JSON.stringify(l.map(([q, r, a]) => [q, r, a.cle, a.type, a.nom, a.orbite, a.heure, a.taille]));
      assert.equal(pos(astresApres), pos(astresAvant), 'aucun astre ne bouge');
      assert.notEqual(JSON.stringify(astresApres.filter(([, , a]) => a.type === 'tellurique')), JSON.stringify(telluriquesAvant), 'l’illustration des astres du type change');
      for (const [, , a] of astresApres.filter(([, , x]) => x.type === 'tellurique')) assert.equal(a.aspect.palette[0], '#ff0000');
    }
    await hors(page, '4-enregistre');

    // Reload keeps the saved value; revert.
    await page.reload();
    await page.getByRole('listbox', { name: "Types d'astre" }).waitFor();
    await choisir(page, 'Tellurique');
    assert.equal((await champ(page, 'Palette, couleur 1').inputValue()).toLowerCase(), '#ff0000');
    await page.getByRole('button', { name: 'Revenir au défaut' }).click();
    await page.getByRole('option', { name: /^Tellurique/ }).filter({ hasText: 'Modifié' }).waitFor({ state: 'detached' });
    assert.deepEqual(aspectsEnBase(), [], 'la ligne est supprimée');
    assert.equal((await champ(page, 'Palette, couleur 1').inputValue()).toLowerCase(), String(defaut.palette[0]).toLowerCase());
    assert.equal(await page.getByRole('button', { name: 'Revenir au défaut' }).isDisabled(), true);
    assert.deepEqual(await astresAvantApres(lireAstres), JSON.stringify(telluriquesAvant), 'le défaut rend l’illustration d’origine');
    await ctx.close();
  });

  it('#12 : « Couleur invalide : #rrggbb. », Enregistrer désactivé, rien d’envoyé ni d’enregistré', async () => {
    const { page, ctx } = await ouvrir('Antor');
    const ecritures: string[] = [];
    page.on('request', (rq: Any) => { if (rq.method() !== 'GET') ecritures.push(`${rq.method()} ${rq.url()}`); });
    await choisir(page, 'Tellurique');
    await champ(page, 'Palette, couleur 1').fill('#12');
    await page.getByText('Couleur invalide : #rrggbb.').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    await hors(page, '5-couleur-invalide');
    assert.deepEqual(ecritures, []);
    assert.deepEqual(aspectsEnBase(), []);
    await ctx.close();
  });

  it('un nombre hors borne est refusé au champ et rien n’est enregistré', async () => {
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'Tellurique');
    const champRelief = champ(page, 'Relief');
    await champRelief.waitFor();
    await page.getByText(/^Entre .+ et .+\.$/).first().waitFor();
    await champRelief.fill('99999');
    await page.getByText(/^Entre .+ et .+\.$/).filter({ hasText: /Entre/ }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    assert.deepEqual(aspectsEnBase(), []);
    await ctx.close();
  });

  it('un brouillon non enregistré survit au changement d’onglet ; quitter la page ouvre « Quitter sans appliquer ? »', async () => {
    const { page, ctx } = await ouvrir('Antor');
    await choisir(page, 'Tellurique');
    await champ(page, 'Palette, couleur 1').fill('#00ff00');
    await page.getByRole('tab', { name: 'Générateur' }).click();
    await page.getByRole('heading', { name: 'Réglages du générateur' }).waitFor();
    await page.getByRole('tab', { name: 'Aspects' }).click();
    await choisir(page, 'Tellurique');
    assert.equal(await champ(page, 'Palette, couleur 1').inputValue(), '#00ff00');
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), false);
    assert.deepEqual(aspectsEnBase(), []);
    await page.getByRole('link', { name: '← Galaxie' }).click();
    await page.getByRole('alertdialog', { name: 'Quitter sans appliquer ?' }).waitFor();
    await page.getByRole('button', { name: 'Rester' }).click();
    assert.match(page.url(), /\/reglages/);
    await ctx.close();
  });

  it('conflit : l’autre onglet a enregistré le type → même alerte « Ces réglages ont changé… », Recharger remet à jour', async () => {
    const un = await ouvrir('Antor');
    const deux = await ouvrir('Antor');
    await choisir(un.page, 'Gazeuse');
    await champ(un.page, 'Palette, couleur 1').fill('#112233');
    const gaz = ligneType(await lecture(deux.page), 'gazeuse');
    const r = await deux.page.request.put(`${base()}/aspects/gazeuse`, { data: { version: gaz.version, parametres: { palette: gaz.defaut.palette.map(() => '#445566') } } });
    assert.equal(r.status(), 200);
    await un.page.getByRole('button', { name: 'Enregistrer' }).click();
    await un.page.getByText('Ces réglages ont changé depuis que vous les avez ouverts.', { exact: false }).waitFor();
    await hors(un.page, '6-conflit');
    assert.equal(JSON.parse(aspectsEnBase().find((a) => a.type === 'gazeuse')!.parametres).palette[0], '#445566', 'l’autre écriture est intacte');
    await un.page.getByRole('button', { name: 'Recharger' }).click();
    await un.page.getByText('Ces réglages ont changé', { exact: false }).waitFor({ state: 'detached' });
    await choisir(un.page, 'Gazeuse');
    assert.equal(await champ(un.page, 'Palette, couleur 1').inputValue(), '#445566');
    await un.ctx.close(); await deux.ctx.close();
  });

  it('mode joueur : le MJ lit l’onglet sans bouton ni champ éditable', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(adr());
    await page.getByRole('listbox', { name: "Types d'astre" }).waitFor();
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText('Mode joueur actif.').waitFor();
    await choisir(page, 'Tellurique');
    await champ(page, 'Palette, couleur 1').waitFor();
    for (const n of ['Enregistrer', 'Revenir au défaut']) assert.equal(await page.getByRole('button', { name: n }).count(), 0, n);
    assert.ok(await page.getByRole('textbox').evaluateAll((els: Any[]) => els.every((e) => e.disabled)), 'champs en lecture');
    await hors(page, '7-mode-joueur');
    await ctx.close();
  });

  it('Léa : « Page introuvable. » sur l’onglet', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Léa');
    await page.goto(adr());
    await page.getByText('Page introuvable.').waitFor();
    await ctx.close();
  });

  it('390 px : l’éditeur passe sous la liste et la page tient dans la largeur', async () => {
    const { page, ctx } = await ouvrir('Antor', 390, 800);
    await choisir(page, 'Tellurique');
    await champ(page, 'Palette, couleur 1').waitFor();
    const l = await page.getByRole('listbox', { name: "Types d'astre" }).boundingBox();
    const e = await page.locator('.rg-aspects-editeur').boundingBox();
    assert.ok(e.y >= l.y + l.height - 1, 'l’éditeur est dessous');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement horizontal');
    await hors(page, '8-390');
    await ctx.close();
  });
});

async function astresAvantApres(lire: () => Promise<Any[]>): Promise<string> {
  return JSON.stringify((await lire()).filter(([, , a]) => a.type === 'tellurique'));
}
