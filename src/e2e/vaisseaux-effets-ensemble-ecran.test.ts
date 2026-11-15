// Feature-level browser tests of kanevas-outils-format-vaisseaux-effets (B-83, E-22), real server in stub mode, real Chromium.
// Written from the feature sheet (exit criterion), docs/parcours.md (P-19 step 2) and docs/ecrans.md (« What
// kanevas-outils-format-vaisseaux-effets builds of E-22 »). Selectors are roles and visible texts; each gesture waits for what
// the user sees, never networkidle nor a fixed delay. Expected values are literals, calculated by hand. The trial catalogue is
// written here and absent from the seed.
//
// TEST PLAN (world « Éneria d'essai »: Antor GM, Léa Player author of « Vent d'Orak » and « Étoile du soir », Teo added as Player)
// Hand-calculated: Frégate R class 2 (cost 300 000, power 20, mass 20, speed 3, armour 5); Soute d'essai (cost 1 000, soute 10);
// Blindage 10 % armour +2; Réacteur 1 power for 0,5 mass, 5 points at most; Cale doubles a cargo; Réparation asks 2.
// B-83 pourcentage : choosing Blindage (gesture) shows « 10 % de la coque », « Ligne : 30 000 cr », price 330 000 cr, Armure 7
// B-83 points      : « Points échangés » at 3 reads « 3 points : −3 puissance, +1,5 masse » ; + → 4 « −4 puissance, +2 masse » ; 5 is the top (+ disabled) ;
//                    0 the bottom (− disabled) ; 6 typed → invalid + « Points échangés : un nombre entier de 0 à 5. », typed value kept
// B-83 visée       : Cale with no target → « Élément visé » select with « Choisir un élément », blocking alert, Enregistrer disabled ; target the Soute → « Soutes 20 »,
//                    save possible ; only the Soute is offered (not the plain fitting) ; no eligible line → « Aucun élément à viser dans cette conception. »
// B-83 réparation  : block present only when a line asks ; 0 → alert « (0 choisie) », 1 → « (1 choisie) » and save stays possible, 2 → no alert ; 21 → invalid + line ; saved 1 reopens 1
// B-83 moteur sys. : caption « moteur système · rend puissance 3 et masse 1,5 » ; a second one → « Un seul moteur système par vaisseau. », save disabled
// exclusions       : seed catalogue (says nothing): no repair block, no Soutes row, no new caption ; Teo (reader) sees text only, no stepper, no select ;
//                    connexion lost disables the controls
// 390 px           : no horizontal scroll, steppers and select 44 px high
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-effets-ensemble';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const mod = { ...el, cout: 0, puissance: 0, masse: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'effets-ecran-1',
  coques: [{ cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5 }],
  amenagements: [
    { cle: 'soute-r', nom: "Soute d'essai", ...el, soute: 10 },
    { cle: 'libre', nom: "Libre d'essai", ...el },
    { cle: 'moteur-sys', nom: "Moteur système d'essai", ...mod, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] },
    { cle: 'moteur-sys-bis', nom: "Moteur système bis d'essai", ...mod, effet: 'moteur_systeme', rend_puissance: [1, 1, 1, 1], rend_masse: [0, 0, 0, 0] },
  ],
  modifications: [
    { cle: 'blindage', nom: "Blindage d'essai", ...mod, cout_pct: 10, effet: 'armure', valeur: 2 },
    { cle: 'reacteur', nom: "Réacteur d'essai", ...mod, limite: 1, effet: 'echange', points_max: 5, sens: 'puissance_vers_masse', echange_puissance: 1, echange_masse: 0.5 },
    { cle: 'cale', nom: "Cale d'essai", ...mod, limite: 1, effet: 'soutes_doublees' },
    { cle: 'repar2', nom: "Réparation d'essai", ...mod, effet: 'reparation_min', valeur: 2 },
  ],
});
const l = (nature: string, cle: string, plus: Any = {}) => ({ nature, cle, quantite: 1, ...plus });
const SOUTE = { vise: { nature: 'amenagements', cle: 'soute-r' } };

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

describe('B-83 · E-22 : modifications à coût en pourcentage et effets de jeu', { skip: skipBrowser, timeout: 240000 }, () => {
  it('Léa choisit Blindage (10 %) : « 10 % de la coque », « Ligne : 30 000 cr », prix 330 000 cr, Armure 7', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    assert.match(await resultats(p), /Armure\s*5/);
    await p.getByRole('button', { name: /^(Ajouter une modification|Ajouter : Modifications)$/ }).click();
    await p.locator('li').filter({ hasText: "Blindage d'essai" }).first().getByRole('button').first().click();
    await p.getByText('Ligne : 30 000 cr').waitFor();
    const ligne = norm(await ligneDe(p, "Blindage d'essai").innerText());
    assert.match(ligne, /10 % de la coque/);
    assert.match(ligne, /armure \+2/);
    await attendreResultat(p, /Armure\s*7/);
    assert.match(await resultats(p), /Prix\s*330\s000\scr/);
    await p.screenshot({ path: `${SHOTS}-pourcentage.png`, fullPage: true });
  });

  it('points échangés : 3 → « 3 points : −3 puissance, +1,5 masse » ; + donne 4 « −4 puissance, +2 masse » ; haut à 5 (+ désactivé) ; bas à 0 (− désactivé)', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'reacteur', { points: 3 })] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await points(p).waitFor();
    assert.equal(await points(p).inputValue(), '3');
    await p.getByText('3 points : −3 puissance, +1,5 masse').waitFor();
    await attendreResultat(p, /Puissance libre\s*17/);
    assert.match(await resultats(p), /Masse libre\s*21,5/);
    const plus = p.getByRole('button', { name: /Augmenter : Points échangés/ });
    const moins = p.getByRole('button', { name: /Diminuer : Points échangés/ });
    await plus.click();
    await p.getByText('4 points : −4 puissance, +2 masse').waitFor();
    await plus.click();
    await p.getByText('5 points : −5 puissance, +2,5 masse').waitFor();
    assert.equal(await points(p).inputValue(), '5');
    assert.equal(await plus.isDisabled(), true, '+ is disabled at the maximum');
    assert.equal(await moins.isDisabled(), false);
    await p.screenshot({ path: `${SHOTS}-points-max.png`, fullPage: true });
    await points(p).fill('0');
    await attendreResultat(p, /Puissance libre\s*20/);
    assert.match(await resultats(p), /Masse libre\s*20\b/);
    assert.equal(await moins.isDisabled(), true, '− is disabled at 0');
    assert.equal(await plus.isDisabled(), false);
  });

  it('échec : 6 tapé (au-delà du maximum 5) marque le champ invalide, affiche « Points échangés : un nombre entier de 0 à 5. », garde la saisie et ne change pas le résultat', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'reacteur', { points: 3 })] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await points(p).waitFor();
    await points(p).fill('6');
    await p.getByText('Points échangés : un nombre entier de 0 à 5.').waitFor();
    assert.equal(await points(p).inputValue(), '6');
    assert.equal(await points(p).getAttribute('aria-invalid'), 'true');
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.screenshot({ path: `${SHOTS}-points-6.png`, fullPage: true });
    assert.equal(await m.api('lea', 'GET', `${m.V}/conceptions/${m.etoile}`).then((r) => r.json.resultat.lignes.find((x: Any) => x.cle === 'reacteur').points), 3);
  });

  it('élément visé : une Cale sans visée lève l’alerte bloquante et désactive Enregistrer ; viser la Soute donne « Soutes 20 » et rouvre l’enregistrement ; seule la Soute est proposée', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), l('amenagements', 'libre')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    assert.match(await resultats(p), /Soutes\s*10/);
    await p.getByRole('button', { name: /^(Ajouter une modification|Ajouter : Modifications)$/ }).click();
    await p.locator('li').filter({ hasText: "Cale d'essai" }).first().getByRole('button').first().click();
    await visee(p).waitFor();
    await p.getByText("« Cale d'essai » : choisissez l'élément visé.").first().waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    const options = (await visee(p).locator('option').allInnerTexts()).map(norm);
    assert.deepEqual(options, ['Choisir un élément', "Soute d'essai"]);
    await p.screenshot({ path: `${SHOTS}-visee-vide.png`, fullPage: true });
    await visee(p).selectOption({ label: "Soute d'essai" });
    await attendreResultat(p, /Soutes\s*20/);
    await p.getByText("« Cale d'essai » : choisissez l'élément visé.").waitFor({ state: 'detached' });
    assert.equal(await enregistrer(p).isEnabled(), true);
    const put = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await enregistrer(p).click();
    assert.equal((await put).status(), 200);
    await p.getByText('Conception enregistrée.').waitFor();
    assert.equal(await m.api('lea', 'GET', `${m.V}/conceptions/${m.etoile}`).then((r) => r.json.resultat.soutes), 20);
    await p.screenshot({ path: `${SHOTS}-visee.png`, fullPage: true });
  });

  it('élément visé : sans aucune ligne éligible, le choix est remplacé par « Aucun élément à viser dans cette conception. » et l’alerte bloque ; retirer la soute visée vide le choix et relève l’alerte', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'libre'), l('modifications', 'cale', SOUTE), l('amenagements', 'soute-r')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await visee(p).waitFor();
    assert.equal(await visee(p).inputValue() !== '', true, 'the Soute is the chosen target');
    await p.getByRole('button', { name: "Retirer : Soute d'essai" }).click();
    await p.getByText('Aucun élément à viser dans cette conception.').waitFor();
    assert.equal(await visee(p).count(), 0);
    await p.getByText(/Cale d'essai » : /).first().waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.screenshot({ path: `${SHOTS}-visee-aucune.png`, fullPage: true });
  });

  it('compétence de réparation : bloc présent, 0 → « (0 choisie) », 1 → « (1 choisie) » sans bloquer, 2 → plus d’alerte ; 21 tapé → invalide ; enregistré à 1, rouvert à 1', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('modifications', 'repar2')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await reparation(p).waitFor();
    assert.equal(await reparation(p).inputValue(), '0');
    await p.getByText("« Réparation d'essai » : réparation 2 au moins (0 choisie).").waitFor();
    await reparation(p).fill('1');
    await p.getByText("« Réparation d'essai » : réparation 2 au moins (1 choisie).").waitFor();
    assert.equal(await enregistrer(p).isEnabled(), true, 'a watch alert does not stop the save');
    await p.screenshot({ path: `${SHOTS}-reparation-1.png`, fullPage: true });
    const put = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await enregistrer(p).click();
    assert.equal((await put).status(), 200);
    await p.getByText('Conception enregistrée.').waitFor();
    const q = await ouvrir(m, 'Léa', m.etoile);
    await reparation(q).waitFor();
    assert.equal(await reparation(q).inputValue(), '1');
    await reparation(q).fill('2');
    await q.getByText(/réparation 2 au moins \(/).waitFor({ state: 'detached' });
    await reparation(q).fill('21');
    await q.getByText('Compétence de réparation : un nombre entier de 0 à 20.').waitFor();
    assert.equal(await reparation(q).inputValue(), '21');
    assert.equal(await reparation(q).getAttribute('aria-invalid'), 'true');
  });

  it('moteur système : la ligne dit « moteur système · rend puissance 3 et masse 1,5 » pour la coque de classe 2 ; un second lève « Un seul moteur système par vaisseau. » et bloque l’enregistrement', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'moteur-sys')] });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await p.getByText(/moteur système · rend puissance 3 et masse 1,5/).waitFor();
    await attendreResultat(p, /Puissance libre\s*23/);
    assert.match(await resultats(p), /Masse libre\s*21,5/);
    assert.equal(await p.getByText('Un seul moteur système par vaisseau.').count(), 0);
    await p.getByRole('button', { name: 'Ajouter : Aménagements' }).click();
    await p.locator('li').filter({ hasText: "Moteur système bis d'essai" }).first().getByRole('button').first().click();
    await p.getByText('Un seul moteur système par vaisseau.').first().waitFor();
    assert.equal(await enregistrer(p).isDisabled(), true);
    await p.screenshot({ path: `${SHOTS}-moteur-systeme.png`, fullPage: true });
  });

  it('exclusion : Teo (joueur, non auteur) lit « Points échangés : 3 », « Élément visé : Soute d’essai », « Compétence de réparation : 1 » en texte, sans pas ni liste', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), l('modifications', 'reacteur', { points: 3 }), l('modifications', 'cale', SOUTE), l('modifications', 'repar2')], reparation: 1 });
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/membres`, { username: 'teo', role: 'joueur' })).status, 201);
    const p = await ouvrir(m, 'Teo', m.etoile);
    await p.getByText('Points échangés : 3').waitFor();
    await p.getByText("Élément visé : Soute d'essai").waitFor();
    await p.getByText('Compétence de réparation : 1').waitFor();
    await p.getByText('3 points : −3 puissance, +1,5 masse').waitFor();
    assert.equal(await p.getByRole('spinbutton').count(), 0);
    assert.equal(await p.getByRole('combobox').count(), 0);
    assert.equal(await p.getByRole('button', { name: /Augmenter : Points échangés|Diminuer : Points échangés|compétence de réparation/ }).count(), 0);
    await p.screenshot({ path: `${SHOTS}-lecteur.png`, fullPage: true });
  });

  it('exclusion : connexion perdue, le pas des points, la compétence et le choix de l’élément sont désactivés', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), l('modifications', 'reacteur', { points: 3 }), l('modifications', 'cale', SOUTE), l('modifications', 'repar2')], reparation: 2 });
    const p = await ouvrir(m, 'Léa', m.etoile);
    await points(p).waitFor();
    await p.context().setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.waitForFunction(() => (document.querySelector('input[aria-label="Compétence de réparation"]') as HTMLInputElement | null)?.disabled === true, null, { timeout: 15000 });
    assert.equal(await points(p).isDisabled(), true);
    assert.equal(await visee(p).isDisabled(), true);
    await p.screenshot({ path: `${SHOTS}-hors-ligne.png`, fullPage: true });
    await p.context().setOffline(false);
  });

  it('exclusion : le catalogue du semis, qui ne dit rien, ne montre ni compétence de réparation, ni ligne Soutes, ni légende d’effet', async () => {
    const m = await monde(false);
    const p = await ouvrir(m, 'Léa', m.orak);
    await p.getByText('685 000 cr').first().waitFor();
    assert.equal(await reparation(p).count(), 0);
    assert.equal(await p.getByText('Compétence de réparation').count(), 0);
    assert.doesNotMatch(await resultats(p), /Soutes|Vitesse|Armure/);
    assert.equal(await p.getByText(/Points échangés|Élément visé|Ligne :|moteur système/).count(), 0);
    await p.screenshot({ path: `${SHOTS}-semis.png`, fullPage: true });
  });

  it('390 px : points, compétence et élément visé sont chacun sur leur ligne, cibles de 44 px, sans défilement horizontal', async () => {
    const m = await monde(true);
    await m.poser(m.etoile, { coque: 'fregate-r', choix: [l('amenagements', 'soute-r'), l('modifications', 'reacteur', { points: 3 }), l('modifications', 'cale', SOUTE), l('modifications', 'repar2'), l('modifications', 'blindage')], reparation: 2 });
    const p = await ouvrir(m, 'Léa', m.etoile, 390);
    await points(p).waitFor();
    await visee(p).waitFor();
    await reparation(p).waitFor();
    for (const cible of [p.getByRole('button', { name: /Diminuer : Points échangés/ }), points(p), p.getByRole('button', { name: /Augmenter : Points échangés/ }), visee(p), p.getByRole('button', { name: 'Diminuer la compétence de réparation' }), reparation(p), p.getByRole('button', { name: 'Augmenter la compétence de réparation' })]) {
      const b = await cible.boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `44 px target, got ${b.width}x${b.height}`);
      assert.ok(b.x >= 0 && b.x + b.width <= 390, 'inside the width');
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
    await p.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
  });
});
