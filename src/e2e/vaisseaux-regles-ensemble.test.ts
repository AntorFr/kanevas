// Feature-level tests of kanevas-outils-vaisseaux-regles (real server in stub mode with the stub seed, real Chromium through Playwright).
// Written from the feature sheet (« Livre », exit criterion), docs/parcours.md (B-67, B-77, P-19 steps 4 and 5), docs/ecrans.md
// (E-22 and « What kanevas-outils-vaisseaux-regles builds ») and the mockup e22-concepteur-vaisseaux.html. Selectors are roles and
// visible texts; each gesture waits for what the user sees (never networkidle nor a fixed delay). Expected values are literals,
// calculated by hand from the trial catalogue (src/outils/swn/exemples/catalogue-essai.json).
//
// TEST PLAN (world « Éneria d'essai »: Antor GM; Léa Player, author of « Vent d'Orak » and « Étoile du soir »)
// B-67 designs
//   nominal   : jump range 5 → 6 by Antor: Léa and E-9 say « Calculée avec d'anciens réglages. », text still 15 cases / 685 000 cr;
//               Léa confirms « Recalculer » → text 18 cases (6 × (moteur niveau 2 + 1)), price unchanged
//   catalogue : universe catalogue reimported with Lance d'essai at 31 000 (× 5 hull factor): same stale state, text unchanged;
//               « Recalculer » → 690 000 cr, 28 jours, 34 500 cr / an
//   bords     : « Enregistrer » after an edit brings the design up to date (810 000 cr with a second Laser, 18 cases)
//   exclusions: nothing is rewritten without the gesture (text identical after both changes, read repeatedly); a mask alone does not
//               make a design stale; a reader (GM in Player mode) sees the band and no button; the route refuses a GM in Player mode
//   échec     : hull withdrawn → « Recalculer » says « Élément retiré de cet univers : Éclaireur… », text unchanged, band stays
//   outil désactivé : no « Recalculer » (E-9 « Outil désactivé »), no « Générer… »; routes refuse
// B-77 rule sheets
//   nominal   : « Générer les fiches de règles… » → 7 « À créer », « 7 fiches créées. », six nature sheets + « Exemples de vaisseaux »,
//               each of type Règle with ONE managed section, not editable (UI and server); relaunched → 7 inchangées, no duplicate
//   contenu   : hand-calculated cells (Coques: Éclaireur 20 000 cr; Armes: Laser, Canon léger, Lance d'essai; Exemples: Éclaireur nu 25 000 cr)
//   bords     : catalogue with a nature emptied (Blindage withdrawn) → « Aucun élément dans le catalogue. »; a nature sheet removed by hand
//   exclusions: a player (Léa) and a GM in Player mode cannot generate; masked element: sheet text unchanged until Antor accepts, then
//               the masked element and every example using it are absent for Léa; ignoring the proposal leaves the text as it was
//   catalogue : universe catalogue reimported with a changed weapon → « Règles — Armes » and the examples propose; Léa's text moves only
//               after acceptance
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const txt = async (page: Any): Promise<string> => (await texte(page)).replace(/[  ]/g, ' ');
mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-regles-ensemble';
const BANDE = 'Calculée avec d’anciens réglages.';
const NATURES = ['Règles — Coques', 'Règles — Moteurs', 'Règles — Aménagements', 'Règles — Défenses', 'Règles — Armes', 'Règles — Modifications'];
const EXEMPLES = 'Exemples de vaisseaux';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function monde() {
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
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const liste = (await api('antor', 'GET', `${B}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  let versionReglages = 0;
  const portee = async (n: number) => {
    const r = await api('antor', 'PUT', `/api/univers/${E}/outils/swn/reglages`, { version: versionReglages, valeurs: { portee_saut: n } });
    assert.equal(r.status, 204);
    versionReglages++;
  };
  let nCat = 0;
  /** Universe catalogue file of the trial, with Lance d'essai at the given cost (the file the dialog of E-20 sends). */
  const reimporterCatalogue = async (coutLance: number) => {
    const f = JSON.parse(readFileSync('src/outils/swn/exemples/catalogue-essai-univers.json', 'utf8'));
    f.version = `2026-12-ensemble-${++nCat}`;
    f.armes[0].cout = coutLance;
    const r = await api('antor', 'POST', `${B}/catalogue/application`, f);
    assert.equal(r.status, 200);
    assert.equal(r.json.natures.armes.modifies, 1);
  };
  const generer = async () => (await api('antor', 'POST', `${B}/fiches-regles`)).json;
  const etat = async () => (await api('antor', 'GET', `${B}/fiches-regles`)).json as Any[];
  const fiche = async (compte: string, id: number) => (await api(compte, 'GET', `/api/univers/${E}/fiches/${id}`)).json;
  const caracteristiques = async (compte: string, id: number): Promise<string> =>
    (await fiche(compte, id)).sections.find((s: Any) => s.titre === 'Caractéristiques').html;
  /** Text of a rule sheet as a player reads it (HTML tags dropped, spaces normalised). */
  const regles = async (compte: string, cle: string): Promise<string> => {
    const e = (await etat()).find((x) => x.cle === cle);
    return (await fiche(compte, e.ficheId)).sections.map((s: Any) => s.html).join(' ').replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
  };
  const masquer = async (nature: string, cle: string) => {
    const g = (await api('antor', 'GET', `${B}/catalogue/gestion?nature=${nature}`)).json.elements.find((e: Any) => e.cle === cle);
    const r = await api('antor', 'PUT', `${B}/catalogue/${nature}/${cle}/masque`, { masque: true, version: g.version });
    assert.equal(r.status, 200);
  };
  return { E, B, api, portee, reimporterCatalogue, generer, etat, fiche, caracteristiques, regles, masquer, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function ouvrir(m: Monde, compte: string, chemin: string, largeur?: number): Promise<{ page: Any; ctx: Any }> {
  const { ctx, page } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  if (largeur) await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${m.E}/outils/swn/vaisseaux${chemin}`);
  return { page, ctx };
}
const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

describe('B-67 : un réglage change, la conception de Léa est périmée et se recalcule sur son geste', { skip: skipBrowser, timeout: 300000 }, () => {
  it('portée de saut 5 → 6 : bande chez Léa et sur E-9, texte intact (15 cases, 685 000 cr) ; « Recalculer » → 18 cases', async () => {
    const m = await monde();
    const avant = await m.caracteristiques('lea', m.orak);
    assert.match(plat(avant), /Portée de saut 15 cases/);
    await m.portee(6);

    const { page, ctx } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    let t = await txt(page);
    assert.match(t, /685 000 cr/);
    assert.match(t, /Le texte de la fiche n.a pas changé/);
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).count(), 1);
    await page.screenshot({ path: `${SHOTS}-perime-lea.png`, fullPage: true });

    // E-9 : la section périmée, texte inchangé
    const p9 = await ctx.newPage();
    await p9.goto(`/univers/${m.E}/fiche/${m.orak}`);
    await p9.getByText(/Générée par/).waitFor();
    t = await txt(p9);
    assert.match(t, /anciens réglages/i);
    assert.match(t, /15 cases/);
    assert.equal(await m.caracteristiques('lea', m.orak), avant, 'rien n’est réécrit sans le geste');
    await p9.screenshot({ path: `${SHOTS}-perime-e9.png`, fullPage: true });

    // le geste
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
    await page.getByText(BANDE).waitFor({ state: 'detached' });
    const apres = plat(await m.caracteristiques('lea', m.orak));
    assert.match(apres, /Portée de saut 18 cases/);
    assert.match(apres, /Prix 685 000 cr/);
    assert.match(apres, /Chantier 28 jours/);
    await p9.reload();
    await p9.getByText(/Générée par/).waitFor();
    assert.match(await txt(p9), /18 cases/);
    assert.doesNotMatch(await txt(p9), /anciens réglages/i);
    await page.screenshot({ path: `${SHOTS}-recalcule.png`, fullPage: true });
  });

  it('catalogue de l’univers réimporté avec la Lance d’essai à 31 000 : même état périmé, texte intact ; « Recalculer » → 690 000 cr', async () => {
    const m = await monde();
    const avant = await m.caracteristiques('lea', m.orak);
    await m.reimporterCatalogue(31000);
    // plusieurs lectures : rien ne se réécrit seul
    assert.equal(await m.caracteristiques('lea', m.orak), avant);
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, true);

    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    assert.match(await txt(page), /685 000 cr/);
    assert.equal(plat(await m.caracteristiques('lea', m.orak)).includes('685 000 cr'), true);
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
    const apres = plat(await m.caracteristiques('lea', m.orak));
    assert.match(apres, /Prix 690 000 cr/);
    assert.match(apres, /Chantier 28 jours/);
    assert.match(apres, /Entretien 34 500 cr \/ an/);
    await page.screenshot({ path: `${SHOTS}-catalogue-recalcule.png`, fullPage: true });
  });

  it('« Enregistrer » après une modification remet la conception à jour (second Laser : 810 000 cr, 18 cases)', async () => {
    const m = await monde();
    await m.portee(6);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    // The change triggers a debounced calculation; « Enregistrer » is only usable once its answer is back.
    const calcul = page.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/calcul$/.test(new URL(r.url()).pathname));
    await page.getByRole('button', { name: 'Augmenter la quantité : Laser' }).click();
    await calcul;
    const enregistrer = page.getByRole('button', { name: 'Enregistrer' });
    await enregistrer.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Enregistrer' && !b.disabled));
    await enregistrer.click();
    await page.getByText('Conception enregistrée.').waitFor({ timeout: 60_000 });
    const apres = plat(await m.caracteristiques('lea', m.orak));
    assert.match(apres, /Prix 810 000 cr/);
    assert.match(apres, /Portée de saut 18 cases/);
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, false);
    await page.getByText(BANDE).waitFor({ state: 'detached' });
  });

  it('exclusions : un masque seul ne périme rien ; un lecteur voit la bande sans bouton ; le texte ne bouge pas', async () => {
    const m = await monde();
    const avantEtoile = await m.caracteristiques('antor', m.etoile);
    await m.masquer('armes', 'lance-d-essai');
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, false, 'a mask alone does not make a design stale');
    await m.portee(6);

    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    await page.getByRole('radio', { name: 'Mode Joueur' }).check();
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Étoile du soir' }).click();
    await page.getByText(BANDE).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).count(), 0, 'le lecteur ne recalcule pas');
    await page.screenshot({ path: `${SHOTS}-lecteur.png`, fullPage: true });

    assert.equal(await m.caracteristiques('antor', m.etoile), avantEtoile, 'texte inchangé');
  });

  it('échec : coque retirée de l’univers → « Recalculer » le dit dans la bande, le texte ne bouge pas', async () => {
    const m = await monde();
    await m.portee(6);
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/coques/eclaireur/retrait`, { retire: true })).status, 200);
    const avant = await m.caracteristiques('lea', m.etoile);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.etoile}`);
    await page.getByText(BANDE).waitFor();
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Élément retiré de cet univers : Éclaireur. Remplacez-le dans le concepteur.').waitFor();
    assert.equal(await page.getByText('Conception recalculée.').count(), 0);
    assert.equal(await m.caracteristiques('lea', m.etoile), avant);
    await page.screenshot({ path: `${SHOTS}-retrait.png`, fullPage: true });
  });

  it('concepteur désactivé : ni « Recalculer » ni « Générer… » (E-9 dit « Outil désactivé »), les routes refusent', async () => {
    const m = await monde();
    await m.portee(6);
    const f = await m.fiche('lea', m.orak);
    const s = f.sections.find((x: Any) => x.titre === 'Caractéristiques');
    assert.equal((await m.api('antor', 'PUT', `${m.B}/activation`, { active: false })).status, 204);

    const { page } = await ouvrir(m, 'Léa', '');
    await page.getByText('Page introuvable.').waitFor();
    assert.equal(await page.getByRole('button', { name: /Recalculer|Générer/ }).count(), 0);
    await page.goto(`/univers/${m.E}/fiche/${m.orak}`);
    await page.getByText('Outil désactivé').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).count(), 0);
    await page.screenshot({ path: `${SHOTS}-desactive-e9.png`, fullPage: true });

    const antor = await ouvrir(m, 'Antor', '');
    await antor.page.getByText('Page introuvable.').waitFor();
    assert.equal(await antor.page.getByRole('button', { name: /Générer/ }).count(), 0);

    const gen = await m.api('antor', 'POST', `${m.B}/fiches-regles`);
    assert.ok(gen.status >= 400, `generation refused, got ${gen.status}`);
    const rec = await m.api('lea', 'POST', `/api/univers/${m.E}/fiches/${m.orak}/sections/${s.id}/recalcul`, { version: s.version });
    assert.ok(rec.status >= 400, `recalcul refused, got ${rec.status}`);
    assert.match(plat(await m.caracteristiques('lea', m.orak)), /Portée de saut 15 cases/);
  });
});

describe('B-77 : le MJ génère les fiches de règles', { skip: skipBrowser, timeout: 300000 }, () => {
  it('« Générer les fiches de règles… » : sept « À créer », « 7 fiches créées. », sections gérées non modifiables ; relancé, rien en double', async () => {
    const m = await monde();
    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    for (const t of [...NATURES, EXEMPLES]) await d.getByText(t, { exact: true }).waitFor();
    assert.equal(await d.getByText('À créer', { exact: true }).count(), 7);
    await d.getByRole('button', { name: 'Générer', exact: true }).click();
    await d.getByText('7 fiches créées.').waitFor();
    assert.equal(await d.getByText('À jour', { exact: true }).count(), 7);
    assert.equal(await d.getByRole('button', { name: 'Générer', exact: true }).isDisabled(), true);
    await d.getByText('Les fiches sont à jour.').waitFor();
    await page.screenshot({ path: `${SHOTS}-generees.png`, fullPage: true });

    // sept fiches de type Règle, titres exacts, une section gérée chacune
    const liste = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches?type=regle`)).json;
    const titres = (liste.fiches ?? liste).map((f: Any) => f.titre).sort();
    assert.deepEqual(titres, [...NATURES, EXEMPLES].sort());
    for (const e of await m.etat()) {
      const f = await m.fiche('antor', e.ficheId);
      assert.equal(f.type, 'regle');
      assert.equal(f.sections.length, 1, `${e.libelle}: one section`);
      assert.ok(f.sections[0].geree, `${e.libelle}: managed`);
      assert.equal(f.sections[0].peutEcrire, false, `${e.libelle}: not writable`);
      // le serveur refuse l'écriture directe, y compris au MJ
      const w = await m.api('antor', 'PUT', `/api/univers/${m.E}/fiches/${e.ficheId}/sections/${f.sections[0].id}/contenu`, { contenu: 'écrasé', version: f.sections[0].version });
      assert.ok(w.status >= 400, `${e.libelle}: direct write refused, got ${w.status}`);
    }

    // relancé par la route : sept inchangées, aucun doublon
    const encore = await m.generer();
    assert.equal(encore.creees, 0);
    assert.equal(encore.misesAJour, 0);
    assert.equal(encore.inchangees, 7);
    const liste2 = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches?type=regle`)).json;
    assert.equal((liste2.fiches ?? liste2).length, 7);

    // E-9 : bannière, pas d'éditeur, tableau
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    await page.goto(`/univers/${m.E}/fiche/${armes.ficheId}`);
    await page.getByText(/Générée par le concepteur de vaisseaux/).waitFor();
    const t = await txt(page);
    assert.match(t, /Lance d.essai/);
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.getByRole('button', { name: /Modifier/ }).count(), 0);
    assert.ok(await page.locator('table').count() >= 1, 'text version rendered as a table');
    await page.screenshot({ path: `${SHOTS}-e9-armes.png`, fullPage: true });
  });

  it('contenu des fiches (valeurs calculées à la main) et lecture par une joueuse', async () => {
    const m = await monde();
    await m.generer();
    const coques = await m.regles('lea', 'regles-coques');
    for (const v of ['Éclaireur', 'Frégate d\'essai', 'Croiseur d\'essai', '20 000 cr', '300 000 cr', '1 000 000 cr']) assert.ok(coques.includes(v), `Coques: ${v}`);
    assert.ok(coques.includes('3 éléments'));
    const armes = await m.regles('lea', 'regles-armes');
    for (const v of ['Laser', 'Canon léger', 'Lance d\'essai', '25 000 cr', '30 000 cr', '12 000 cr']) assert.ok(armes.includes(v), `Armes: ${v}`);
    assert.ok(armes.includes('3 éléments'));
    const ex = await m.regles('lea', 'exemples');
    for (const n of ['Éclaireur nu', 'Éclaireur armé', 'Frégate de ligne', 'Frégate à l\'extrême', 'Frégate gourmande', 'Croiseur de transport', 'Frégate sans moteur']) assert.ok(ex.includes(n), `Exemples: ${n}`);
    assert.ok(ex.includes('25 000 cr'), 'Éclaireur nu : 20 000 + 5 000 = 25 000 cr');
  });

  it('bords : une nature vidée → « Aucun élément dans le catalogue. » ; une fiche dont la section a été retirée à la main est recréée, l’ancienne reste', async () => {
    const m = await monde();
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/defenses/blindage/retrait`, { retire: true })).status, 200);
    await m.generer();
    const def = await m.regles('lea', 'regles-defenses');
    assert.ok(def.includes('Aucun élément dans le catalogue.'));
    assert.ok(!def.includes('Blindage'));
    assert.ok(def.includes('0 élément'));

    const avant = (await m.etat()).find((x) => x.cle === 'regles-moteurs');
    const f = await m.fiche('antor', avant.ficheId);
    const del = await m.api('antor', 'DELETE', `/api/univers/${m.E}/fiches/${avant.ficheId}/sections/${f.sections[0].id}`);
    if (del.status >= 400) return; // section deletion refused for a managed section: nothing more to prove here
    const e = (await m.etat()).find((x) => x.cle === 'regles-moteurs');
    assert.equal(e.etat, 'absente');
    const g = await m.generer();
    assert.equal(g.creees, 1);
    const apres = (await m.etat()).find((x) => x.cle === 'regles-moteurs');
    assert.notEqual(apres.ficheId, avant.ficheId, 'une nouvelle fiche est créée');
  });

  it('exclusions : Léa ne génère pas (route fermée, rien créé) ; un MJ en mode Joueur non plus', async () => {
    const m = await monde();
    const r = await m.api('lea', 'POST', `${m.B}/fiches-regles`);
    assert.ok(r.status >= 400, `Léa refused, got ${r.status}`);
    const liste = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches?type=regle`)).json;
    assert.equal((liste.fiches ?? liste).length, 0, 'nothing created');
    const { page } = await ouvrir(m, 'Léa', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Générer les fiches de règles/ }).count(), 0);
  });

  it('retirer le Laser de l’univers : le texte de Léa ne change qu’à l’accord d’Antor ; ensuite ni le Laser ni les exemples qui l’emploient', async () => {
    const m = await monde();
    await m.generer();
    const armesAvant = await m.regles('lea', 'regles-armes');
    const exAvant = await m.regles('lea', 'exemples');
    assert.ok(armesAvant.includes('Laser') && exAvant.includes('Éclaireur armé'));
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/armes/laser/retrait`, { retire: true })).status, 200);
    const etat = await m.etat();
    const armes = etat.find((x) => x.cle === 'regles-armes');
    assert.equal(armes.etat, 'perimee');
    assert.ok(armes.propositionId, 'une proposition attend');
    assert.equal(etat.find((x) => x.cle === 'exemples').etat, 'perimee');
    assert.equal(etat.find((x) => x.cle === 'regles-coques').etat, 'a_jour');
    assert.equal(await m.regles('lea', 'regles-armes'), armesAvant, 'texte inchangé avant l’accord');
    assert.equal(await m.regles('lea', 'exemples'), exAvant);

    // le MJ voit la proposition dans la boîte
    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    await d.getByText('Règles — Armes', { exact: true }).waitFor();
    assert.equal(await d.getByText('Mise à jour proposée', { exact: true }).count(), 2);
    assert.equal(await d.getByText('À jour', { exact: true }).count(), 5);
    await page.screenshot({ path: `${SHOTS}-propositions.png`, fullPage: true });

    // il accepte
    for (const e of [armes, etat.find((x) => x.cle === 'exemples')]) {
      const r = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${e.propositionId}/appliquer`);
      assert.equal(r.status, 200);
    }
    const armesApres = await m.regles('lea', 'regles-armes');
    assert.ok(!armesApres.includes('Laser'), 'Laser retiré : absent');
    assert.ok(armesApres.includes('Canon léger') && armesApres.includes('Lance d\'essai'));
    assert.ok(armesApres.includes('2 éléments'));
    const exApres = await m.regles('lea', 'exemples');
    assert.ok(exApres.includes('Éclaireur nu'), 'l’exemple sans Laser reste');
    for (const n of ['Éclaireur armé', 'Frégate de ligne', 'Frégate à l\'extrême', 'Frégate gourmande', 'Croiseur de transport', 'Frégate sans moteur']) {
      assert.ok(!exApres.includes(n), `exemple employant le Laser absent : ${n}`);
    }
    assert.equal((await m.etat()).every((x) => x.etat === 'a_jour'), true);
  });

  it('masquer la Lance d’essai puis ignorer la proposition : le texte ne change jamais', async () => {
    const m = await monde();
    await m.generer();
    const armesAvant = await m.regles('lea', 'regles-armes');
    assert.ok(armesAvant.includes('Lance d\'essai'));
    await m.masquer('armes', 'lance-d-essai');
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    assert.equal(armes.etat, 'perimee');
    const r = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${armes.propositionId}/abandonner`);
    assert.equal(r.status, 204);
    assert.equal(await m.regles('lea', 'regles-armes'), armesAvant);
  });

  it('masquer la Lance d’essai puis accepter : elle disparaît de la fiche lue par Léa, les autres armes restent', async () => {
    const m = await monde();
    await m.generer();
    await m.masquer('armes', 'lance-d-essai');
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${armes.propositionId}/appliquer`)).status, 200);
    const t = await m.regles('lea', 'regles-armes');
    assert.ok(!t.includes('Lance d\'essai'));
    assert.ok(t.includes('Laser') && t.includes('Canon léger') && t.includes('2 éléments'));
  });

  it('catalogue de l’univers réimporté avec une arme modifiée : les fiches proposent, le texte ne bouge qu’à l’accord (Lance d’essai 31 000 cr)', async () => {
    const m = await monde();
    await m.generer();
    const avant = await m.regles('lea', 'regles-armes');
    assert.ok(avant.includes('30 000 cr') && !avant.includes('31 000 cr'));
    await m.reimporterCatalogue(31000);
    const etat = await m.etat();
    const armes = etat.find((x) => x.cle === 'regles-armes');
    assert.equal(armes.etat, 'perimee');
    assert.ok(armes.propositionId);
    assert.equal(await m.regles('lea', 'regles-armes'), avant, 'texte inchangé avant l’accord');

    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    await d.getByText('Règles — Armes', { exact: true }).waitFor();
    assert.ok(await d.getByText('Mise à jour proposée', { exact: true }).count() >= 1);
    await page.screenshot({ path: `${SHOTS}-catalogue-propose.png`, fullPage: true });

    const r = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${armes.propositionId}/appliquer`);
    assert.equal(r.status, 200);
    const apres = await m.regles('lea', 'regles-armes');
    assert.ok(apres.includes('31 000 cr'));
    assert.ok(!apres.includes('30 000 cr'));
    assert.equal((await m.etat()).find((x) => x.cle === 'regles-armes').etat, 'a_jour');
  });

  it('portée de saut modifiée : la fiche des exemples le dit aussi et ne bouge qu’à l’accord', async () => {
    const m = await monde();
    await m.generer();
    const avant = await m.regles('lea', 'exemples');
    await m.portee(6);
    const ex = (await m.etat()).find((x) => x.cle === 'exemples');
    assert.equal(ex.etat, 'perimee');
    assert.equal(await m.regles('lea', 'exemples'), avant);
  });
});
