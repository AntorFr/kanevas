// Feature-level browser tests of kanevas-outils-format-vaisseaux-ecarts (B-85, E-22), real server in stub mode, real Chromium.
// Written from the feature sheet (exit criterion), docs/parcours.md (B-85, P-19 step 2) and docs/ecrans.md (« What
// kanevas-outils-format-vaisseaux-ecarts changes of E-22 »: captions only). Selectors are roles and visible texts; each gesture waits for
// what the user sees, never networkidle nor a fixed delay. Expected values are literals, calculated by hand. The trial catalogue is
// written here and absent from the seed.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player author of « Étoile du soir », Teo a reader)
// Frégate R class 2 (cost 300 000, power 20, mass 20, speed 3, armour 5); Frégate R3 class 3.
// B-85 vitesse   : defence « Rotors lourds » (bonus −2) reads « vitesse −2 » in its row and « Vitesse 1 » in the results ; bonus +2 reads « vitesse +2 », 0 « vitesse 0 » ;
//                  a bonus of −5 floors the speed at 0
// B-85 réparation: Blindage (armour +2, repair 2) reads « armure +2 · réparation 2 au moins », armour 7, the repair block is present, skill 1 → watch alert
//                  « réparation 2 au moins (1 choisie) » and Enregistrer stays available, skill 2 → no alert ; a modification with the field alone shows the block
// B-85 soute     : per-class cargo reads « soutes 20 » (class 2) and « Soutes 20 » in the results, « soutes 40 » on class 3
// B-85 moteur    : « moteur système · rend puissance 3 et masse 1,5 · coût −10 % », « Ligne : 36 000 cr », price 336 000 cr
// exclusions     : catalogue that states none (seed): no « soutes » caption, no repair block, no Ligne ; Teo (reader) reads the captions and has no control
// 390 px         : no horizontal scroll
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-ecarts-ensemble';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const mod = { ...el, cout: 0, puissance: 0, masse: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'ecarts-ecran-1',
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 },
    { cle: 'fregate-r3', nom: 'Frégate R3', classe: 3, ...coque, cout: 400000, vitesse: 3, armure: 5 },
  ],
  defenses: [
    { cle: 'rotors-lourds', nom: 'Rotors lourds', ...el, bonus_vitesse: -2 },
    { cle: 'rotors-tres-lourds', nom: 'Rotors très lourds', ...el, bonus_vitesse: -5 },
    { cle: 'rotors-vifs', nom: 'Rotors vifs', ...el, bonus_vitesse: 2 },
    { cle: 'rotors-neutres', nom: 'Rotors neutres', ...el, bonus_vitesse: 0 },
  ],
  amenagements: [
    { cle: 'soute-r2', nom: 'Soute par classe', ...el, soute_par_classe: [10, 20, 40, 80] },
    { cle: 'moteur-sys', nom: 'Moteur système réduit', ...mod, cout: 40000, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10 },
  ],
  modifications: [
    { cle: 'blindage-r', nom: "Blindage d'essai", ...mod, cout_pct: 10, effet: 'armure', valeur: 2, reparation_min: 2 },
    { cle: 'repar-champ', nom: 'Réparation par champ', ...mod, reparation_min: 3 },
  ],
});
const l = (nature: string, cle: string, plus: Any = {}) => ({ nature, cle, quantite: 1, ...plus });

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
const norm = (s: string) => s.replace(/[  ]/g, ' ');
const resultats = async (p: Any) => norm(await p.getByRole('complementary', { name: 'Résultats' }).innerText());
const enregistrer = (p: Any) => p.getByRole('button', { name: 'Enregistrer' });
const points = (p: Any) => p.getByRole('spinbutton', { name: /Points échangés/ });
const reparation = (p: Any) => p.getByRole('spinbutton', { name: 'Compétence de réparation' });
const visee = (p: Any) => p.getByRole('combobox', { name: /Élément visé/ });
const ligneDe = (p: Any, nom: string) => p.locator('li').filter({ hasText: nom }).last();
const attendreResultat = (p: Any, re: RegExp) => p.waitForFunction((src: string) => new RegExp(src).test((document.querySelector('[aria-label="Résultats"]') as HTMLElement).innerText.replace(/[  ]/g, ' ')), re.source);

const ligneTexte = async (p: Any, nom: string) => norm(await ligneDe(p, nom).innerText());

describe('B-85 · E-22 : légendes du bonus de vitesse, de la réparation, de la soute par classe et du moteur système', { skip: skipBrowser, timeout: 240000 }, () => {
  it('bonus de vitesse −2 : « vitesse −2 » dans la ligne (U+2212), Vitesse 1 dans les résultats ; +2 « vitesse +2 » ; 0 « vitesse 0 »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('defenses', 'rotors-lourds'), l('defenses', 'rotors-vifs'), l('defenses', 'rotors-neutres')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText(/vitesse −2/).first().waitFor();
    assert.match(await ligneTexte(p, 'Rotors lourds'), /vitesse −2/);
    assert.match(await ligneTexte(p, 'Rotors vifs'), /vitesse \+2/);
    assert.match(await ligneTexte(p, 'Rotors neutres'), /vitesse 0/);
    assert.match(await resultats(p), /Vitesse\s*3/);
    await p.screenshot({ path: `${SHOTS}-vitesse.png`, fullPage: true });
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('defenses', 'rotors-lourds')] });
    const q = await ouvrir(m, 'Léa', m.etoile);
    assert.match(await resultats(q), /Vitesse\s*1/);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('defenses', 'rotors-tres-lourds')] });
    const r = await ouvrir(m, 'Léa', m.etoile);
    assert.match(await resultats(r), /Vitesse\s*0\b/);
  });

  it('réparation à part de l’effet : « armure +2 · réparation 2 au moins », Armure 7, bloc de compétence présent, 1 → alerte à surveiller et Enregistrer reste possible, 2 → plus d’alerte', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'blindage-r')], reparation: 1 });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await reparation(p).waitFor();
    await ligneDe(p, "Blindage d'essai").getByText(/armure \+2 · réparation 2 au moins/).waitFor();
    assert.match(await resultats(p), /Armure\s*7/);
    await p.getByText(/réparation 2 au moins \(1 choisie\)/).first().waitFor();
    await p.screenshot({ path: `${SHOTS}-reparation.png`, fullPage: true });
    await reparation(p).fill('2');
    await p.getByText(/réparation 2 au moins \(1 choisie\)/).first().waitFor({ state: 'detached' });
    assert.equal(await enregistrer(p).isEnabled(), true);
  });

  it('une modification qui n’a que le champ de réparation (sans effet) montre aussi le bloc « Compétence de réparation »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'repar-champ')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await reparation(p).waitFor();
    await p.getByText(/réparation 3 au moins \(0 choisie\)/).first().waitFor();
    assert.equal(await enregistrer(p).isEnabled(), true);
  });

  it('soute par classe : « soutes 20 » dans la ligne et « Soutes 20 » dans les résultats sur la classe 2 ; « soutes 40 » et « Soutes 40 » sur la classe 3', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r2')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText(/soutes 20/).first().waitFor();
    assert.match(await resultats(p), /Soutes\s*20/);
    await p.screenshot({ path: `${SHOTS}-soute.png`, fullPage: true });
    await m.poser(m.etoile, { coque: 'fregate-r3', choix: [l('amenagements', 'soute-r2')] });
    const q = await ouvrir(m, 'Léa', m.etoile);
    await q.getByText(/soutes 40/).first().waitFor();
    assert.match(await resultats(q), /Soutes\s*40/);
  });

  it('moteur système réduit de 10 % : « moteur système · rend puissance 3 et masse 1,5 · coût −10 % », « Ligne : 36 000 cr », prix 336 000 cr', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-sys')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText('Ligne : 36 000 cr').waitFor();
    await ligneDe(p, 'Moteur système réduit').getByText(/moteur système · rend puissance 3 et masse 1,5 · coût −10 %/).waitFor();
    assert.match(await resultats(p), /Prix\s*336\s000\scr/);
    await p.screenshot({ path: `${SHOTS}-moteur.png`, fullPage: true });
  });

  it('exclusion : une lectrice (Teo) lit les mêmes légendes sans contrôle de saisie ; à 390 px aucun défilement horizontal', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'blindage-r'), l('amenagements', 'moteur-sys'), l('amenagements', 'soute-r2'), l('defenses', 'rotors-lourds')] });
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const t = await ouvrir(m, 'Teo', m.etoile);
    await t.getByText(/vitesse −2/).first().waitFor();
    assert.equal(await reparation(t).count(), 0);
    assert.equal(await enregistrer(t).count(), 0);
    const p = await ouvrir(m, 'Léa', m.etoile, 390);
    await p.getByText(/vitesse −2/).first().waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
    await p.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
  });

  it('exclusion : un catalogue qui n’en dit rien (le semis) ne montre ni bloc de réparation ni légende « soutes » ni « Ligne : » dans « Vent d’Orak »', async () => {
    const m = await monde(false);
    const p = await ouvrir(m, 'Léa', m.orak);
    assert.equal(await reparation(p).count(), 0);
    const corps = norm(await p.locator('body').innerText());
    assert.doesNotMatch(corps, /réparation \d+ au moins|soutes \d|coût −/);
    assert.match(await resultats(p), /685\s000\scr/);
  });
});
