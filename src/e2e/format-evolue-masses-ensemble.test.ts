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

describe('B-80 import du catalogue : une masse multiple de 0,5', () => {
  it('nominal : un élément de masse 0,5 est créé, inchangé au rejeu, sans doublon ; son résumé dit « masse 0,5 »', async () => {
    const m = await monde();
    const un = await m.importer(fichier({ amenagements: [element(CLE, 0.5)] }));
    assert.equal(un.status, 200, un.texte);
    assert.equal(un.json.natures.amenagements.ajoutes, 1);
    assert.equal(un.json.refusTotal, 0);
    const deux = await m.importer(fichier({ amenagements: [element(CLE, 0.5)] }));
    assert.equal(deux.json.natures.amenagements.inchanges, 1);
    assert.equal(deux.json.natures.amenagements.ajoutes, 0);
    assert.equal(deux.json.natures.amenagements.modifies, 0);
    const cat = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.filter((e: Any) => e.cle === CLE);
    assert.equal(cat.length, 1);
    assert.match(cat[0].resume, /masse 0,5/);
    assert.ok(!cat[0].resume.includes('0.5'), cat[0].resume);
  });

  it('bords : 0, 1,5 et 7,5 passent ; une coque de masse 7,5 passe', async () => {
    const m = await monde();
    const r = await m.importer(fichier({
      amenagements: [element('zero', 0), element('un-et-demi', 1.5), element('sept-et-demi', 7.5)],
      coques: [{ cle: 'coque-demi', nom: 'Coque demie', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 7.5, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 }],
    }));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.refusTotal, 0, r.texte);
    assert.equal(r.json.natures.amenagements.ajoutes, 3);
    assert.equal(r.json.natures.coques.ajoutes, 1);
    const res = (await m.api('lea', 'POST', `${m.V}/calcul`, { coque: 'coque-demi', choix: [{ nature: 'amenagements', cle: 'un-et-demi', quantite: 1 }] })).json.resultat;
    assert.equal(res.masseLibre, 6);
  });

  it('échec : 0,3, 1,25, 0,7, −0,5, "1" et null sont refusés avec champ masse ; l’élément correct du même fichier passe et rien des refusés n’est écrit', async () => {
    const m = await monde();
    const mauvais: Array<[string, unknown, string]> = [
      ['m-03', 0.3, 'multiple de 0,5 attendu'], ['m-125', 1.25, 'multiple de 0,5 attendu'], ['m-07', 0.7, 'multiple de 0,5 attendu'],
      ['m-neg', -0.5, ''], ['m-texte', '1', 'nombre attendu'], ['m-null', null, ''],
    ];
    const r = await m.importer(fichier({ amenagements: [element(CLE, 0.5), ...mauvais.map(([c, v]) => element(c, v))] }));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.natures.amenagements.ajoutes, 1);
    assert.equal(r.json.natures.amenagements.refuses, 6);
    assert.equal(r.json.refusTotal, 6);
    for (const [cle, , raison] of mauvais) {
      const refus = (r.json.refus as Any[]).find((x) => x.cle === cle);
      assert.ok(refus, `refus de ${cle} : ${r.texte}`);
      assert.equal(refus.champ, 'masse', cle);
      if (raison) assert.equal(refus.raison, raison, cle);
    }
    const cles = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.map((e: Any) => e.cle);
    assert.ok(cles.includes(CLE));
    for (const [cle] of mauvais) assert.ok(!cles.includes(cle), `${cle} ne doit pas être écrit`);
  });

  it('échec : une coque de masse 0,3 est refusée avec champ masse', async () => {
    const m = await monde();
    const r = await m.importer(fichier({ coques: [{ cle: 'coque-fausse', nom: 'Coque fausse', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 0.3, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 }] }));
    assert.equal(r.status, 200, r.texte);
    assert.deepEqual(r.json.refus.map((x: Any) => [x.nature, x.cle, x.champ]), [['coques', 'coque-fausse', 'masse']]);
    assert.ok(!(await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.some((e: Any) => e.cle === 'coque-fausse'));
  });

  it('exclusion : une masse entière du catalogue se lit sans virgule dans son résumé (« masse 2 », jamais « 2,0 »)', async () => {
    const m = await monde();
    const cabines = (await m.api('antor', 'GET', `${m.V}/catalogue`)).json.elements.find((e: Any) => e.cle === 'cabines');
    assert.match(cabines.resume, /masse 2$/);
  });
});

describe('B-80 calcul exact et alertes', () => {
  it('trois éléments de 0,5 : masse libre 6,5 ; quinze : 0,5 ; quatre-vingt-dix-neuf : −41,5', async () => {
    const m = await mondeAvecCoupleur();
    assert.equal((await calcul(m, 3)).json.resultat.masseLibre, 6.5);
    assert.equal((await calcul(m, 15)).json.resultat.masseLibre, 0.5);
    assert.equal((await calcul(m, 99)).json.resultat.masseLibre, -41.5);
  });

  it('la masse libre est exactement 0 à seize éléments : pas d’alerte masse_insuffisante ; à dix-sept (−0,5) : bloquante « Masse insuffisante : −0,5 »', async () => {
    const m = await mondeAvecCoupleur();
    const zero = await calcul(m, 16);
    assert.equal(zero.json.resultat.masseLibre, 0);
    assert.ok(!codes(zero).includes('masse_insuffisante'), zero.texte);
    const trop = await calcul(m, 17);
    assert.equal(trop.json.resultat.masseLibre, -0.5);
    assert.deepEqual(trop.json.alertes.filter((a: Any) => a.code === 'masse_insuffisante').map((a: Any) => [a.niveau, a.texte]), [['bloquante', 'Masse insuffisante : −0,5']]);
    const demi = await calcul(m, 15);
    assert.ok(!codes(demi).includes('masse_insuffisante'));
  });

  it('un enregistrement à masse libre 0 passe, à −0,5 est refusé 422 sans rien écrire', async () => {
    const m = await mondeAvecCoupleur();
    const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    assert.equal(cree.status, 201, cree.texte);
    const refus = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(17), version: cree.json.version });
    assert.equal(refus.status, 422, refus.texte);
    assert.equal((await m.api('antor', 'GET', `${m.V}/conceptions/${m.aube}`)).json.version, cree.json.version);
    const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(16), version: cree.json.version });
    assert.equal(ok.status, 200, ok.texte);
    assert.equal(ok.json.resultat.masseLibre, 0);
  });

  it('le facteur de coque multiplie exactement : coque de masse 7,5 facteur 3, élément x_masse de 0,5 pris trois fois → masse libre 3', async () => {
    const m = await monde();
    const r = await m.importer(fichier({
      coques: [{ cle: 'coque-x3', nom: 'Coque x3', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 7.5, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 3 }],
      amenagements: [element(CLE, 0.5, { x_masse: true })],
    }));
    assert.equal(r.json.refusTotal, 0, r.texte);
    const res = (await calcul(m, 3, 'coque-x3')).json.resultat;
    assert.equal(res.masseLibre, 3);
  });

  it('exclusion : une masse entière reste entière (Éclaireur nu : masse libre 7)', async () => {
    const m = await monde();
    const r = await m.api('lea', 'POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [{ nature: 'moteurs', cle: 'moteur-1', quantite: 1 }] });
    assert.equal(r.json.resultat.masseLibre, 7);
  });
});

describe('B-80 textes de la conception enregistrée et des fiches de règles', () => {
  it('la section « Caractéristiques » dit « Masse libre » 6,5 ; la fiche de règles des aménagements dit 0,5 pour le coupleur et 3 pour la soute', async () => {
    const m = await mondeAvecCoupleur();
    const cree = await m.api('antor', 'POST', `${m.V}/conceptions`, { ficheId: m.aube, coque: 'eclaireur' });
    const ok = await m.api('antor', 'PUT', `${m.V}/conceptions/${m.aube}`, { coque: 'eclaireur', choix: choix(3), version: cree.json.version });
    assert.equal(ok.status, 200, ok.texte);
    const fiche = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${m.aube}`)).json;
    const section = fiche.sections.find((s: Any) => s.titre === 'Caractéristiques');
    const plat = (section.html as string).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(plat, /Masse libre 6,5/);
    assert.ok(!plat.includes('6.5'));

    const gen = await m.api('antor', 'POST', `${m.V}/fiches-regles`);
    assert.equal(gen.status, 200, gen.texte);
    const regles = gen.json.fiches.find((f: Any) => f.cle === 'regles-amenagements');
    const fr = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches/${regles.ficheId}`)).json;
    const lignes = (fr.sections[0].html as string).split('<tr>').map((l) => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const coupleur = lignes.find((l) => l.startsWith("Coupleur d'essai"))!;
    assert.match(coupleur, /^Coupleur d'essai \(Univers\) 4 cr 0 0,5 0 0 /);
    assert.match(lignes.find((l) => l.startsWith('Soute'))!, /^Soute 10 000 cr 0 3 /);
    assert.ok(!coupleur.includes('0.5'));
  });
});

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
