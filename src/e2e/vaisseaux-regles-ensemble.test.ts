// ecrans: fiche, outil
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
    await p9.screenshot({ path: `${SHOTS}-perime-e9.png`, fullPage: true });

    // le geste
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
    await page.getByText(BANDE).waitFor({ state: 'detached' });
    await p9.reload();
    await p9.getByText(/Générée par/).waitFor();
    assert.match(await txt(p9), /18 cases/);
    assert.doesNotMatch(await txt(p9), /anciens réglages/i);
    await page.screenshot({ path: `${SHOTS}-recalcule.png`, fullPage: true });
  });

  it('catalogue de l’univers réimporté avec la Lance d’essai à 31 000 : même état périmé, texte intact ; « Recalculer » → 690 000 cr', async () => {
    const m = await monde();
    await m.reimporterCatalogue(31000);

    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    assert.match(await txt(page), /685 000 cr/);
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
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
    await page.getByText(BANDE).waitFor({ state: 'detached' });
  });

  it('exclusions : un masque seul ne périme rien ; un lecteur voit la bande sans bouton ; le texte ne bouge pas', async () => {
    const m = await monde();
    await m.masquer('armes', 'lance-d-essai');
    await m.portee(6);

    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    await page.getByRole('radio', { name: 'Mode Joueur' }).check();
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Étoile du soir' }).click();
    await page.getByText(BANDE).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).count(), 0, 'le lecteur ne recalcule pas');
    await page.screenshot({ path: `${SHOTS}-lecteur.png`, fullPage: true });
  });

  it('échec : coque retirée de l’univers → « Recalculer » le dit dans la bande, le texte ne bouge pas', async () => {
    const m = await monde();
    await m.portee(6);
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/coques/eclaireur/retrait`, { retire: true })).status, 200);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.etoile}`);
    await page.getByText(BANDE).waitFor();
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Élément retiré de cet univers : Éclaireur. Remplacez-le dans le concepteur.').waitFor();
    assert.equal(await page.getByText('Conception recalculée.').count(), 0);
    await page.screenshot({ path: `${SHOTS}-retrait.png`, fullPage: true });
  });

  it('concepteur désactivé : ni « Recalculer » ni « Générer… » (E-9 dit « Outil désactivé »), les routes refusent', async () => {
    const m = await monde();
    await m.portee(6);
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
    // the list is reloaded after the success phrase is set (Generer.tsx: setSucces then await charger()): wait for it
    await d.getByText('Les fiches sont à jour.').waitFor({ timeout: 60_000 });
    assert.equal(await d.getByText('À jour', { exact: true }).count(), 7);
    assert.equal(await d.getByRole('button', { name: 'Générer', exact: true }).isDisabled(), true);
    await page.screenshot({ path: `${SHOTS}-generees.png`, fullPage: true });

    // E-9 : bannière, pas d'éditeur, tableau
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    await page.goto(`/univers/${m.E}/fiche/${armes.ficheId}`);
    await page.getByText(/Générée par le concepteur de vaisseaux/).waitFor();
    const t = await txt(page);
    assert.match(t, /Lance d.essai/);
    assert.equal(await page.locator('textarea').count(), 0);
    // the GM's key block (« Modifier la clé… », E-9) is not a section editor
    assert.equal(await page.getByRole('button', { name: /Modifier/ }).filter({ hasNotText: /clé/ }).count(), 0);
    assert.ok(await page.locator('table').count() >= 1, 'text version rendered as a table');
    await page.screenshot({ path: `${SHOTS}-e9-armes.png`, fullPage: true });
  });

  it('exclusions : Léa ne génère pas (route fermée, rien créé) ; un MJ en mode Joueur non plus', async () => {
    const m = await monde();
    const { page } = await ouvrir(m, 'Léa', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Générer les fiches de règles/ }).count(), 0);
  });

  it('retirer le Laser de l’univers : le texte de Léa ne change qu’à l’accord d’Antor ; ensuite ni le Laser ni les exemples qui l’emploient', async () => {
    const m = await monde();
    await m.generer();
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/armes/laser/retrait`, { retire: true })).status, 200);

    // le MJ voit la proposition dans la boîte
    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    await d.getByText('Règles — Armes', { exact: true }).waitFor();
    assert.equal(await d.getByText('Mise à jour proposée', { exact: true }).count(), 2);
    assert.equal(await d.getByText('À jour', { exact: true }).count(), 5);
    await page.screenshot({ path: `${SHOTS}-propositions.png`, fullPage: true });
  });

  it('catalogue de l’univers réimporté avec une arme modifiée : les fiches proposent, le texte ne bouge qu’à l’accord (Lance d’essai 31 000 cr)', async () => {
    const m = await monde();
    await m.generer();
    await m.reimporterCatalogue(31000);

    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    await d.getByText('Règles — Armes', { exact: true }).waitFor();
    assert.ok(await d.getByText('Mise à jour proposée', { exact: true }).count() >= 1);
    await page.screenshot({ path: `${SHOTS}-catalogue-propose.png`, fullPage: true });
  });

});
