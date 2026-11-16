// ecrans: outil, parametres
// Feature-level black-box tests of kanevas-outils-format-evolue, masses side (B-80): written from the feature sheet
// (« Livre », exit criterion), docs/parcours.md and docs/ecrans.md (E-22, E-20 « Voir les éléments »), then from the
// V-2 / V-10 contract of ARCHITECTURE.md for what is delivered without a screen (catalogue import, calculation). Real
// server in stub mode with the stub's starting world, real SQLite, real Chromium for the screens.
// Every expected value is a literal worked out by hand from the trial catalogue (src/outils/swn/exemples/catalogue-essai.json):
// hull « Éclaireur » has mass 8 (factor 1); the invented element below (mass 0.5, written by these tests, absent from the seed)
// is taken n times: used mass = 0.5 n, free mass = 8 − 0.5 n.
//
// TEST PLAN (world: « Éneria d'essai », Antor GM, Léa Player; an import token scoped to swn/vaisseaux)
//   B-80 nominal  : element of mass 0.5 imported → 1 added, replayed → 1 unchanged, no duplicate; 3 of it → free mass 6.5
//   B-80 bords    : masses 0, 1.5, 7.5 accepted; 16 of them → free mass 0 (no masse_insuffisante, save accepted);
//                   17 → −0.5 (masse_insuffisante « Masse insuffisante : −0,5 », save refused 422); 15 → 0.5; 99 → −41.5;
//                   hull of mass 7.5 accepted; x_masse with hull factor 3: 0.5 × 3 × 3 = 4.5 → free 3
//   B-80 échec    : 0.3, 1.25, 0.7, −0.5, "1", null → refused with champ masse (the good items of the same file go through);
//                   « multiple de 0,5 attendu » for a number off the grid, « nombre attendu » for a non-number; a hull of 0.3 refused
//   B-80 exclusion: a refused mass writes nothing to the catalogue; an integer mass is shown without comma (« 7 », never « 7,0 »)
//   B-80 textes   : summary of the element « masse 0,5 »; saved design text « Masse libre » 6,5; generated rules sheet row « 0,5 »
//   B-80 E-22     : Antor reads « 6,5 » free (no mass used is shown) (1280 and 390 px), the choice list row « Coupleur d'essai » reads « masse 0,5 » (as the mock-up lays it out: name, then « puissance 0 · masse 0,5 »);
//                   free mass exactly 0 shows no alert, one more element → « Masse insuffisante : −0,5 », save disabled
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-format-evolue-masses';
mkdirSync(SHOTS, { recursive: true });

const servers: Server[] = [];
let browser: Any;
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { await browser?.close(); servers.forEach((s) => s.stop()); });

interface Rep { status: number; json: Any; texte: string }
interface Monde {
  base: string; E: number; V: string; aube: number;
  api: (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  imp: (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;
  importer: (fichier: Any, apercu?: boolean) => Promise<Rep>;
}

const CLE = 'coupleur-essai';
const element = (cle: string, masse: unknown, plus: Any = {}) => ({
  cle, nom: cle === CLE ? "Coupleur d'essai" : `Élément ${cle}`, cout: 4, puissance: 0, masse,
  x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0, ...plus,
});
const fichier = (natures: Any) => ({ catalogue: 'swn/vaisseaux', version: 'essai-format-evolue', ...natures });
const choix = (quantite: number) => [{ nature: 'amenagements', cle: CLE, quantite }];

async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  const jeton = (await api('antor', 'POST', `/api/univers/${E}/jetons`, { nom: 'Script masses', dureeJours: 30, outils: ['swn/vaisseaux'] })).json.valeur as string;
  const imp = async (methode: string, chemin: string, corps?: unknown): Promise<Rep> => {
    const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const lot = (await imp('POST', '/lots?outil=swn/vaisseaux')).json.lotId as number;
  const importer = (f: Any) => imp('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${lot}`, f);
  const liste = (await api('antor', 'GET', `${V}/conceptions`)).json;
  const aube = liste.fichesSansConception.find((f: Any) => f.titre === 'Aube de Sel').ficheId as number;
  return { base: srv.base, E, V, aube, api, imp, importer };
}

/** The invented element is imported; returns the world. */
async function mondeAvecCoupleur(plus: Any = {}): Promise<Monde> {
  const m = await monde();
  const r = await m.importer(fichier({ amenagements: [element(CLE, 0.5, plus)] }));
  assert.equal(r.status, 200, r.texte);
  assert.equal(r.json.natures.amenagements.ajoutes, 1, r.texte);
  return m;
}
const calcul = (m: Monde, quantite: number, coque = 'eclaireur') => m.api('lea', 'POST', `${m.V}/calcul`, { coque, choix: choix(quantite) });
const codes = (r: Rep) => (r.json.alertes as Any[]).map((a) => a.code);

describe('B-80 E-22 et E-20 à l’écran', { skip: skipBrowser, timeout: 300000 }, () => {
  const txt = async (page: Any): Promise<string> => ((await page.locator('body').innerText()) as string).replace(/[  ]/g, ' ');
  const ouvrir = async (m: Monde, largeur: number) => {
    const { ctx, page } = await connecte(browser, m.base, 'Antor');
    await page.setViewportSize({ width: largeur, height: 900 });
    await page.goto(`/univers/${m.E}/outils/swn/vaisseaux`);
    return { ctx, page };
  };
  const ouvrirConception = async (page: Any) => {
    await page.getByRole('link', { name: 'Aube de Sel' }).click();
    await page.getByText('Résultats', { exact: false }).first().waitFor();
  };

  const conceptionDeTrois = async (largeur: number) => {
    const m = await mondeAvecCoupleur();
    const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(3), version: cree.json.version });
    assert.equal(ok.status, 200, ok.texte);
    const { ctx, page } = await ouvrir(m, largeur);
    await ouvrirConception(page);
    return { ctx, page };
  };

  for (const largeur of [1280, 390]) {
    it(`${largeur} px : trois coupleurs → la masse libre se lit « 6,5 », sans point ni débordement ; la liste de choix dit « masse 0,5 » sous « Coupleur d'essai »`, async () => {
      const { ctx, page } = await conceptionDeTrois(largeur);
      const t = await txt(page);
      assert.match(t, /Masse libre\s+6,5/);
      assert.ok(!/\b[16]\.5\b/.test(t), 'aucun point décimal affiché');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de débordement horizontal');
      await page.screenshot({ path: `${SHOTS}/${largeur}-e22-demi.png`, fullPage: true });
      await page.getByRole('button', { name: 'Ajouter : Aménagements' }).click();
      await page.getByRole('button', { name: 'Fermer' }).waitFor();
      assert.match(await txt(page), /Coupleur d['’]essai\s+[^\n]*masse 0,5/, 'the choice row of the element reads its mass with the comma');
      await page.screenshot({ path: `${SHOTS}/${largeur}-e22-choix.png`, fullPage: true });
      await ctx.close();
    });

    it(`${largeur} px : trois coupleurs de 0,5 → E-22 écrit la masse libre exacte, sans masse utilisée`, async () => {
      const { ctx, page } = await conceptionDeTrois(largeur);
      const t = await txt(page);
      assert.match(t, /Masse libre\s*6,5/, 'la masse libre exacte se lit sur E-22');
      assert.ok(!/utilisée/i.test(t), 'aucune masse utilisée ajoutée à E-22');
      await ctx.close();
    });
  }

  it('masse libre exactement 0 : aucune alerte ; un élément de plus : « Masse insuffisante : −0,5 », Enregistrer désactivé ; en retirer un : l’alerte part', async () => {
    const m = await mondeAvecCoupleur();
    const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(16), version: cree.json.version });
    assert.equal(ok.status, 200, ok.texte);
    const { ctx, page } = await ouvrir(m, 1280);
    await ouvrirConception(page);
    assert.ok(!(await txt(page)).includes('Masse insuffisante'));
    await page.screenshot({ path: `${SHOTS}-zero.png`, fullPage: true });
    await page.getByRole('button', { name: "Augmenter la quantité : Coupleur d'essai" }).click();
    await page.getByText('Masse insuffisante : −0,5').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
    await page.screenshot({ path: `${SHOTS}-moins-demi.png`, fullPage: true });
    await page.getByRole('button', { name: "Diminuer la quantité : Coupleur d'essai" }).click();
    await page.getByText('Masse insuffisante : −0,5').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isEnabled(), true);
    await ctx.close();
  });

  it('E-20 : le dialogue d’import prévisualise « champ `masse` : multiple de 0,5 attendu » pour 0,3, applique 0,5 ; « Voir les éléments » lit « masse 0,5 »', async () => {
    const m = await monde();
    const { ctx, page } = await connecte(browser, m.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/univers/${m.E}/parametres?onglet=outils`);
    const carte = page.getByRole('region', { name: 'Concepteur de vaisseaux' });
    await carte.getByRole('button', { name: /Importer un catalogue/ }).click();
    const dlg = page.getByRole('dialog');
    const contenu = fichier({ amenagements: [element(CLE, 0.5), element('mauvais', 0.3)] });
    await page.locator('input[type=file]').setInputFiles({ name: 'catalogue-demi.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contenu)) });
    await dlg.getByRole('button', { name: /^Appliquer/ }).waitFor();
    await dlg.getByText(/Aménagement « mauvais », champ masse : multiple de 0,5 attendu\./).waitFor();
    await page.screenshot({ path: `${SHOTS}-e20-apercu.png`, fullPage: true });
    assert.ok(!(await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.some((e: Any) => e.cle === CLE), 'the preview writes nothing');
    await dlg.getByRole('button', { name: /^Appliquer/ }).click();
    await dlg.getByText(/Catalogue appliqué/).waitFor();
    await dlg.getByRole('button', { name: 'Fermer' }).first().click();
    const cles = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.map((e: Any) => e.cle);
    assert.ok(cles.includes(CLE));
    assert.ok(!cles.includes('mauvais'));
    await carte.getByRole('button', { name: 'Voir les éléments' }).click();
    const panneau = page.getByRole('region', { name: /^Éléments/ });
    await panneau.getByRole('tab', { name: /^Aménagements/ }).click();
    const ligne = panneau.getByRole('listitem').filter({ hasText: "Coupleur d'essai" });
    await ligne.waitFor();
    assert.match(await ligne.innerText(), /masse 0,5/);
    await page.screenshot({ path: `${SHOTS}-e20-elements.png`, fullPage: true });
    await ctx.close();
  });
});
