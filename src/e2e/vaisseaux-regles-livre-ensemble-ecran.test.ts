// Feature-level browser tests of kanevas-outils-format-vaisseaux-regles-livre (B-87, E-22), real server in stub mode, real Chromium.
// Written from the feature sheet (exit criterion), docs/parcours.md (B-87, P-19 step 2) and docs/ecrans.md (« What
// kanevas-outils-format-vaisseaux-regles-livre changes of E-22 »: captions, consequence lines, repair-skill block, target select).
// Selectors are roles and visible texts; each wait is for what the user sees, never networkidle nor a fixed delay. Expected values are
// literals, calculated by hand. The trial catalogue is written here and absent from the seed. Screenshots go to /tmp/shots, outside the tree.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player author of « Étoile du soir », Teo a reader)
// Frégate R: class 2, cost 300 000, power 20, mass 20, armour 5. Laser Z: power 10, mass 1. Soute Z: mass 8, cargo 10.
// B-87 légendes       : « soutes −10 % de masse libre, fret ×2 », « armure +2 et réparation », « puissance et masse de l'arme visée ÷ 2 », « puissance de l'arme +50 % par installation »
// B-87 conséquences   : soutes sur coque nue « masse −2 » ; montage sur Laser Z « masse +1, puissance +5 » ; surcharge ×2 « puissance +10 » ;
//                       blindage 2 + réparation 3 « armure +5 » ; bords : blindage de valeur 0 « armure +0 et réparation », sans ligne de conséquence à réparation 0 ;
//                       masse libre négative : aucune ligne « masse − »
// B-87 réparation     : le bloc « Compétence de réparation » apparaît dès qu'un blindage renforcé est choisi, prérempli à 0, et le résultat lit armure 5 → 7 puis 10 à 3
// B-87 élément visé   : montage et surcharge → les armes seulement ; sans arme : « Aucun élément à viser dans cette conception. » et alerte bloquante
// exclusions          : une lectrice (Teo) lit les mêmes légendes sans contrôle ; catalogue sans les quatre effets : aucune de leurs légendes ; 390 px sans défilement horizontal
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-livre-ensemble';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const cible = { nature: 'armes', cle: 'laser-z' };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'livre-ecran-1',
  coques: [{ cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 }],
  amenagements: [
    { cle: 'soute-z', nom: 'Soute Z', ...el, masse: 8, soute: 10 },
    { cle: 'lourd-22', nom: 'Lourd 22', ...el, masse: 22 },
  ],
  armes: [{ cle: 'laser-z', nom: 'Laser Z', ...el, puissance: 10, masse: 1, emport: 1, munitions: 0, cout_munition: 0 }],
  modifications: [
    { cle: 'optimise-z', nom: 'Optimise Z', ...el, limite: 1, effet: 'soutes_optimisees_livre' },
    { cle: 'blindage-z', nom: 'Blindage Z', ...el, limite: 1, effet: 'blindage_renforce', valeur: 2 },
    { cle: 'blindage-0', nom: 'Plaque nulle', ...el, limite: 1, effet: 'blindage_renforce', valeur: 0 },
    { cle: 'montage-z', nom: 'Montage Z', ...el, limite: 1, effet: 'montages_specialises', vise: cible },
    { cle: 'surcharge-z', nom: 'Surcharge Z', ...el, limite: 2, effet: 'surcharge_cumulable', effet_pct: 50, vise: cible },
  ],
});
const l = (nature: string, cle: string, plus: Any = {}) => ({ nature, cle, quantite: 1, ...plus });
const viseLaser = { vise: cible };

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function monde(importer: boolean) {
  srv?.stop();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown) => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const t = await r.text();
    let json: Any = null;
    try { json = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const V = `/api/univers/${E}/outils/swn/vaisseaux`;
  if (importer) {
    const r = await api('antor', 'POST', `${V}/catalogue/application`, catalogue());
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.refusTotal, 0, JSON.stringify(r.json));
  }
  const liste = (await api('antor', 'GET', `${V}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  const poser = async (fiche: number, corps: Any) => {
    const v = (await api('antor', 'GET', `${V}/conceptions/${fiche}`)).json;
    const r = await api('antor', 'PUT', `${V}/conceptions/${fiche}`, { ...corps, version: v.version });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  };
  return { E, V, api, poser, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function ouvrir(m: Monde, compte: string, fiche: number, largeur = 1280): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${m.E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await page.getByRole('complementary', { name: 'Résultats' }).waitFor();
  return page;
}
const norm = (s: string) => s.replace(/[  ]/g, ' ');
const corps = async (p: Any) => norm(await p.locator('body').innerText());
const resultats = async (p: Any) => norm(await p.getByRole('complementary', { name: 'Résultats' }).innerText());
const attendreTexte = (p: Any, re: RegExp) => p.waitForFunction((src: string) => new RegExp(src).test(document.body.innerText.replace(/[  ]/g, ' ')), re.source, { timeout: 15000 });
const reparation = (p: Any) => p.getByRole('spinbutton', { name: 'Compétence de réparation' });
const visee = (p: Any) => p.getByRole('combobox', { name: /Élément visé/ });
const AM = 'Ajouter un aménagement'; const ARME = 'Ajouter une arme'; const MOD = 'Ajouter une modification';
async function ajouter(p: Any, bouton: string, nom: string) {
  const groupe = { [AM]: 'Aménagements', [ARME]: 'Armes', [MOD]: 'Modifications' }[bouton];
  await p.getByRole('button', { name: new RegExp(`^(${bouton}|Ajouter : ${groupe})$`) }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).first().waitFor();
}

describe('B-87 · E-22 : légendes des quatre règles du livre et ligne de conséquence', { skip: skipBrowser, timeout: 300000 }, () => {
  it('les quatre légendes s’affichent en toutes lettres, sans « emports » ni ancien libellé', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('armes', 'laser-z'), l('modifications', 'optimise-z'), l('modifications', 'blindage-z'), l('modifications', 'montage-z', viseLaser), l('modifications', 'surcharge-z', viseLaser)] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(p, /par installation/);
    const t = await corps(p);
    for (const re of [/soutes −10 % de masse libre, fret ×2/, /armure \+2 et réparation/, /puissance et masse de l['’]arme visée ÷ 2/, /puissance de l['’]arme \+50 % par installation/]) assert.match(t, re);
    assert.doesNotMatch(t, /emports|arrondi par installation|soutes −10 % de masse\b(?! libre)/);
    await p.screenshot({ path: `${SHOTS}-legendes.png`, fullPage: true });
  });

  it('lignes de conséquence : soutes « masse −2 », montage « masse +1, puissance +5 », surcharge ×2 « puissance +10 », blindage « armure +5 »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'optimise-z')] });
    const a = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(a, /masse −2/);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('armes', 'laser-z'), l('modifications', 'montage-z', viseLaser)] });
    const b = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(b, /masse \+1, puissance \+5/);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('armes', 'laser-z'), { ...l('modifications', 'surcharge-z', viseLaser), quantite: 2 }] });
    const c = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(c, /puissance \+10/);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'blindage-z')], reparation: 3 });
    const d = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(d, /armure \+5/);
    await d.screenshot({ path: `${SHOTS}-consequences.png`, fullPage: true });
    assert.match(await resultats(d), /Armure\s*10/);
  });

  it('bord : blindage de valeur 0 « armure +0 et réparation », sans ligne de conséquence tant que la réparation est 0', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'blindage-0')] });
    const a = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(a, /armure \+0 et réparation/);
    await a.screenshot({ path: `${SHOTS}-valeur-zero.png`, fullPage: true });
    assert.doesNotMatch(await corps(a), /armure \+[1-9]/);
  });

  it('bord : masse libre négative, aucune ligne de conséquence « masse − » sous les soutes optimisées', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [] });
    const b = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(b, AM, 'Lourd 22');
    await ajouter(b, MOD, 'Optimise Z');
    await attendreTexte(b, /soutes −10 % de masse libre, fret ×2/);
    await b.getByText('Masse insuffisante : −2').first().waitFor();
    await b.screenshot({ path: `${SHOTS}-masse-negative.png`, fullPage: true });
    assert.doesNotMatch(await corps(b), /masse −\d/);
  });
});

describe('B-87 · E-22 : compétence de réparation et élément visé', { skip: skipBrowser, timeout: 300000 }, () => {
  it('le bloc « Compétence de réparation » apparaît avec un blindage renforcé, prérempli à 0 ; la saisir fait passer l’armure de 7 à 10', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    assert.equal(await reparation(p).count(), 0);
    await ajouter(p, MOD, 'Blindage Z');
    await reparation(p).waitFor();
    assert.equal(await reparation(p).inputValue(), '0');
    await attendreTexte(p, /armure \+2 et réparation/);
    await p.getByText(/Armure\s*7/).first().waitFor();
    await reparation(p).fill('3');
    await p.getByText(/Armure\s*10/).first().waitFor();
    await p.screenshot({ path: `${SHOTS}-reparation.png`, fullPage: true });
  });

  it('élément visé : montage et surcharge proposent les armes seulement ; sans arme : « Aucun élément à viser dans cette conception. » et une alerte bloquante', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, AM, 'Soute Z');
    await ajouter(p, MOD, 'Montage Z');
    await p.getByText('Aucun élément à viser dans cette conception.').first().waitFor();
    await p.getByText(/choisissez l['’]élément visé/).first().waitFor();
    await ajouter(p, ARME, 'Laser Z');
    assert.deepEqual((await visee(p).last().locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Laser Z']);
    await p.screenshot({ path: `${SHOTS}-vise.png`, fullPage: true });
  });
});

describe('B-87 · E-22 : exclusions', { skip: skipBrowser, timeout: 300000 }, () => {
  it('une lectrice (Teo) lit les mêmes légendes sans contrôle ; à 390 px aucun défilement horizontal', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('armes', 'laser-z'), l('modifications', 'optimise-z'), l('modifications', 'blindage-z'), l('modifications', 'surcharge-z', viseLaser)] });
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const t = await ouvrir(m, 'Teo', m.etoile);
    await attendreTexte(t, /puissance de l['’]arme \+50 % par installation/);
    const texte = await corps(t);
    assert.match(texte, /soutes −10 % de masse libre, fret ×2/);
    assert.equal(await reparation(t).count(), 0);
    assert.equal(await t.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    const q = await ouvrir(m, 'Léa', m.etoile, 390);
    await attendreTexte(q, /puissance de l['’]arme \+50 % par installation/);
    const [sw, cw] = await q.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `horizontal scroll: ${sw} > ${cw}`);
    await q.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
  });

  it('catalogue sans les quatre effets (le semis) : « Vent d’Orak » ne porte aucune de leurs légendes', async () => {
    const m = await monde(false);
    const p = await ouvrir(m, 'Léa', m.orak);
    await attendreTexte(p, /Prix\s*685 000 cr/);
    assert.doesNotMatch(await corps(p), /fret ×2|armure \+\d+ et réparation|÷ 2|par installation/);
  });
});
