// Feature-level browser tests of kanevas-outils-format-vaisseaux-suite (B-86, E-22), real server in stub mode, real Chromium.
// Written from the feature sheet (exit criterion), docs/parcours.md (B-86, P-19 step 2) and docs/ecrans.md (« What
// kanevas-outils-format-vaisseaux-suite changes of E-22 »: captions and one display filter only). Selectors are roles and visible
// texts; each gesture waits for what the user sees, never networkidle nor a fixed delay. Expected values are literals, calculated by
// hand. The trial catalogue is written here and absent from the seed. Screenshots go to /tmp/shots, outside the tracked tree.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player author of « Étoile du soir », Teo a reader)
// Frégate R class 2 (cost 300 000, power 20, mass 20, emports 3, armour 5); Frégate R3 class 3 (400 000).
// B-86 (1) moteur système : base coque → « moteur système · rend puissance 3 et masse 1,5 · coût −10 % de la coque », « Ligne : 10 000 cr », prix 310 000 cr ;
//                           sans base → « coût −10 % » sans « de la coque », « Ligne : 36 000 cr » ; extrême : 20 000 cr sous 30 000 → « Ligne : 0 cr » et légende inchangée
// B-86 (2) légendes       : « arrondi par installation » ; les quatre effets du livre ne portent aucune légende (tâche suivante)
// B-86 (2) élément visé   : montage et surcharge → les armes seulement ; l'alerte « choisissez l'élément visé » tombe une fois la cible choisie
// B-86 (2) échange arrondi: 3 points → « 3 points : −3 puissance, +1 masse » ; 5 points → « +2 masse » ; l'échange peut être pris plusieurs fois
// exclusions              : lectrice (Teo) lit les mêmes légendes sans aucun contrôle ; catalogue qui n'en dit rien (semis) : aucune de ces légendes ; 390 px sans défilement horizontal
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-suite-ensemble';
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const sys = { effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'suite-ecran-1',
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 },
    { cle: 'fregate-r3', nom: 'Frégate R3', classe: 3, ...coque, cout: 400000, puissance: 30, vitesse: 3, armure: 5 },
  ],
  amenagements: [
    { cle: 'moteur-coque', nom: 'Moteur base coque', ...el, cout: 40000, ...sys, reduction_cout_pct: 10, reduction_base: 'coque' },
    { cle: 'moteur-muet', nom: 'Moteur sans base', ...el, cout: 40000, ...sys, reduction_cout_pct: 10 },
    { cle: 'moteur-petit', nom: 'Moteur petit', ...el, cout: 20000, ...sys, reduction_cout_pct: 10, reduction_base: 'coque' },
    { cle: 'soute-z', nom: 'Soute Z', ...el, masse: 8, soute: 10 },
    { cle: 'cabine-z', nom: 'Cabine Z', ...el, masse: 2 },
  ],
  armes: [{ cle: 'laser-z', nom: 'Laser Z', ...el, puissance: 10, masse: 1, emport: 1, munitions: 0, cout_munition: 0 }],
  modifications: [
    { cle: 'optimise-z', nom: 'Optimise Z', ...el, limite: 1, effet: 'soutes_optimisees_livre' },
    { cle: 'blindage-z', nom: 'Blindage Z', ...el, limite: 1, effet: 'blindage_renforce', valeur: 2 },
    { cle: 'montage-z', nom: 'Montage Z', ...el, limite: 1, effet: 'montages_specialises', vise: { nature: 'armes', cle: 'laser-z' } },
    { cle: 'surcharge-z', nom: 'Surcharge Z', ...el, limite: 2, effet: 'surcharge_cumulable', effet_pct: 50, vise: { nature: 'armes', cle: 'laser-z' } },
    { cle: 'reacteur-i', nom: 'Réacteur arrondi', ...el, limite: 3, effet: 'echange', sens: 'puissance_vers_masse', points_max: 5, echange_puissance: 1, echange_masse: 0.5, echange_arrondi: 'installation' },
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
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');
const corps = async (p: Any) => norm(await p.locator('body').innerText());
const resultats = async (p: Any) => norm(await p.getByRole('complementary', { name: 'Résultats' }).innerText());
const enregistrer = (p: Any) => p.getByRole('button', { name: 'Enregistrer' });
const points = (p: Any) => p.getByRole('spinbutton', { name: /Points échangés/ });
const visee = (p: Any) => p.getByRole('combobox', { name: /Élément visé/ });
const ligneDe = (p: Any, nom: string) => p.getByRole('button', { name: `Retirer : ${nom}` }).locator('xpath=ancestor::li[1]');
const attendreTexte = (p: Any, re: RegExp) => p.waitForFunction((src: string) => new RegExp(src).test(document.body.innerText.replace(/[\u00A0\u202F]/g, ' ')), re.source, { timeout: 15000 });
const AM = 'Ajouter un aménagement'; const ARME = 'Ajouter une arme'; const MOD = 'Ajouter une modification';
async function ajouter(p: Any, bouton: string, nom: string) {
  const groupe = { [AM]: 'Aménagements', [ARME]: 'Armes', [MOD]: 'Modifications' }[bouton];
  await p.getByRole('button', { name: new RegExp(`^(${bouton}|Ajouter : ${groupe})$`) }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).first().waitFor();
}

describe('B-86 · E-22 : base de la réduction, légendes des effets, élément visé, échange arrondi', { skip: skipBrowser, timeout: 300000 }, () => {
  it('moteur système base coque : légende « coût −10 % de la coque », « Ligne : 10 000 cr », prix 310 000 cr ; sans base : « coût −10 % » seul, « Ligne : 36 000 cr »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-coque')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText('Ligne : 10 000 cr').waitFor();
    await attendreTexte(p, /moteur système · rend puissance 3 et masse 1,5 · coût −10 % de la coque/);
    await attendreTexte(p, /Prix\s*310 000 cr/);
    assert.match(await resultats(p), /Prix\s*310\s000\scr/);
    await p.screenshot({ path: `${SHOTS}-moteur-coque.png`, fullPage: true });
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-muet')] });
    const q = await ouvrir(m, 'Léa', m.etoile);
    await q.getByText('Ligne : 36 000 cr').waitFor();
    await attendreTexte(q, /moteur système · rend puissance 3 et masse 1,5 · coût −10 %/);
    await attendreTexte(q, /Prix\s*336 000 cr/);
    assert.doesNotMatch(await corps(q), /de la coque/);
  });

  it('extrême : un moteur de 20 000 sous une réduction de 30 000 lit « Ligne : 0 cr » et garde « coût −10 % de la coque »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-petit')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText('Ligne : 0 cr').waitFor();
    await attendreTexte(p, /coût −10 % de la coque/);
    await attendreTexte(p, /Prix\s*300 000 cr/);
  });

  it('les quatre effets du livre : lus sans légende ni contrôle de plus tant que l’atelier ne les dit pas (légendes à la tâche suivante)', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r3', choix: [l('armes', 'laser-z'), l('modifications', 'optimise-z'), l('modifications', 'blindage-z'), l('modifications', 'montage-z', { vise: { nature: 'armes', cle: 'laser-z' } }), l('modifications', 'surcharge-z', { vise: { nature: 'armes', cle: 'laser-z' } }), l('modifications', 'reacteur-i', { points: 3 })] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await attendreTexte(p, /arrondi par installation/);
    const t = await corps(p);
    for (const nom of ['Optimise Z', 'Blindage Z', 'Montage Z', 'Surcharge Z']) assert.match(t, new RegExp(nom));
    assert.doesNotMatch(t, /soutes −|armure \+\d · |emports [−+]\d|puissance de l['’]arme/);
    await p.screenshot({ path: `${SHOTS}-legendes.png`, fullPage: true });
  });

  it('échange arrondi : 3 points → « 3 points : −3 puissance, +1 masse » ; 5 points → « 5 points : −5 puissance, +2 masse »', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'reacteur-i', { points: 3 })] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText(/3 points : −3 puissance, \+1 masse/).waitFor();
    await p.screenshot({ path: `${SHOTS}-echange.png`, fullPage: true });
    await points(p).fill('5');
    await p.getByText(/5 points : −5 puissance, \+2 masse/).waitFor();
    assert.equal(await points(p).count(), 1);
  });

  it('élément visé : montage et surcharge → seulement les armes ; l’alerte tombe une fois la cible choisie', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, AM, 'Soute Z');
    await ajouter(p, ARME, 'Laser Z');
    await ajouter(p, MOD, 'Montage Z');
    const options = (await visee(p).last().locator('option').allInnerTexts()).map(norm);
    assert.deepEqual(options, ['Choisir un élément', 'Laser Z']);
    await p.getByText(/choisissez l['’]élément visé/).first().waitFor();
    await visee(p).last().selectOption('armes/laser-z');
    await p.getByText(/choisissez l['’]élément visé/).first().waitFor({ state: 'detached' });
    await ajouter(p, MOD, 'Surcharge Z');
    assert.deepEqual((await visee(p).last().locator('option').allInnerTexts()).map(norm), ['Choisir un élément', 'Laser Z']);
    await visee(p).last().selectOption('armes/laser-z');
    await p.getByText(/choisissez l['’]élément visé/).first().waitFor({ state: 'detached' });
    await p.screenshot({ path: `${SHOTS}-armes-visee.png`, fullPage: true });
  });

  it('élément visé absent de la conception : l’enregistrement n’aboutit pas (désactivé, ou refusé par le serveur)', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await ajouter(p, ARME, 'Laser Z');
    await ajouter(p, MOD, 'Montage Z');
    await p.getByText(/choisissez l['’]élément visé/).first().waitFor();
    if (await enregistrer(p).isEnabled()) {
      const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
      await enregistrer(p).click();
      assert.ok((await rep).status() >= 400);
    }
    const v = (await m.api('antor', 'GET', `${m.V}/conceptions/${m.etoile}`)).json;
    assert.deepEqual(v.choix ?? [], []);
  });

  it('exclusion : une lectrice (Teo) lit les mêmes légendes, sans contrôle de saisie ; à 390 px aucun défilement horizontal', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-coque'), l('amenagements', 'soute-z'), l('armes', 'laser-z'), l('modifications', 'montage-z', { vise: { nature: 'armes', cle: 'laser-z' } }), l('modifications', 'reacteur-i', { points: 3 })] });
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const t = await ouvrir(m, 'Teo', m.etoile);
    for (const re of [/coût −10 % de la coque/, /arrondi par installation/, /3 points/]) await attendreTexte(t, re);
    const texte = await corps(t);
    assert.match(texte, /coût −10 % de la coque/);
    assert.match(texte, /arrondi par installation/);
    assert.match(texte, /3 points/);
    assert.equal(await points(t).count(), 0);
    assert.equal(await visee(t).count(), 0);
    assert.equal(await enregistrer(t).count(), 0);
    const p = await ouvrir(m, 'Léa', m.etoile, 390);
    await attendreTexte(p, /arrondi par installation/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
    await p.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
  });

  it('exclusion : un catalogue qui n’en dit rien (le semis) ne montre aucune de ces légendes dans « Vent d’Orak », prix 685 000 cr', async () => {
    const m = await monde(false);
    const p = await ouvrir(m, 'Léa', m.orak);
    await attendreTexte(p, /685 000 cr/);
    const t = await corps(p);
    assert.doesNotMatch(t, /de la coque|soutes −|emports [−+]\d|puissance de l['’]arme|arrondi par installation|armure \+\d · /);
    assert.match(await resultats(p), /685\s000\scr/);
  });
});
