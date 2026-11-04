// Revue de kanevas-outils-vaisseaux-regles-ecran : navigateur piloté (serveur bouchon + semis, Chromium), écrit depuis le
// critère de sortie de la fiche et docs/ecrans.md (E-22, « What kanevas-outils-vaisseaux-regles builds »). Sélecteurs : rôles et
// textes visibles ; chaque geste attend ce que l'utilisateur voit, jamais networkidle ni délai fixe.
//
// PLAN
//   périmé        : Antor change la portée de saut → Léa : bande au-dessus des résultats, 685 000 cr, « Résultat enregistré »,
//                   « Recalculer » ; E-9 porte la bannière, texte inchangé ; changer une quantité retire l'étiquette ;
//                   Recalculer avec brouillon → boîte, Annuler ne bouge rien, confirmé → « Conception recalculée. »
//   sans brouillon: « Recalculer » agit aussitôt
//   lecteur       : un joueur non auteur (Antor en mode Joueur) voit la bande sans bouton ; la liste d'Antor : 2 × « Anciens réglages »
//   retrait       : coque retirée → message dans la bande, rien ne bouge
//   conflit       : deux onglets → « Cette conception a changé depuis que vous l'avez ouverte. » + « Recharger »
//   générer       : sept « À créer » → « 7 fiches créées. », sept « À jour », « Générer » désactivé « Les fiches sont à jour. » ;
//                   masquage de « Lance d'essai » → ligne de E-20, deux « Mise à jour proposée » ; Léa lit l'ancien texte
//   rôles         : Léa : « Recalculer » sans « Générer… » ; mode Joueur : ni l'un ni l'autre ; outil désactivé : rien
//   hors ligne    : « Connexion perdue. » et boutons désactivés ; 390 px
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const txt = async (page: Any): Promise<string> => (await texte(page)).replace(/[  ]/g, ' ');
mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-regles-ecran';
const BANDE = 'Calculée avec d’anciens réglages.';

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
  return { E, B, api, portee, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function ouvrir(m: Monde, compte: string, chemin: string, largeur?: number): Promise<{ page: Any; ctx: Any }> {
  const { ctx, page } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  if (largeur) await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${m.E}/outils/swn/vaisseaux${chemin}`);
  return { page, ctx };
}
const caracteristiques = async (m: Monde, compte: string, fiche: number): Promise<string> =>
  (await m.api(compte, 'GET', `/api/univers/${m.E}/fiches/${fiche}`)).json.sections.find((s: Any) => s.titre === 'Caractéristiques').html;

describe('E-22 : conception périmée et « Recalculer »', { skip: skipBrowser, timeout: 240000 }, () => {
  it('Léa : bande au-dessus des résultats, résultat enregistré, E-9 inchangée, brouillon → boîte, Annuler, confirmation', async () => {
    const m = await monde();
    const avant = await caracteristiques(m, 'lea', m.orak);
    await m.portee(6);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    const t = await txt(page);
    assert.match(t, /685 000 cr/);
    assert.match(t, /Résultat enregistré/);
    assert.match(t, /15\s*(cases|\/)/);
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).count(), 1);
    // la bande est au-dessus des résultats
    const yBande = (await page.getByText(BANDE).boundingBox()).y;
    const yRes = (await page.getByText('Résultat enregistré').boundingBox()).y;
    assert.ok(yBande < yRes, 'bande au-dessus des résultats');
    await page.screenshot({ path: `${SHOTS}-perime-lea.png`, fullPage: true });

    // E-9 : bannière du cœur, texte inchangé
    const p9 = await ctxs[ctxs.length - 1].newPage();
    await p9.goto(`/univers/${m.E}/fiche/${m.orak}`);
    await p9.getByText(/Générée par/).waitFor();
    assert.match(await txt(p9), /anciens réglages/i);
    assert.equal(await caracteristiques(m, 'lea', m.orak), avant);
    await p9.close();

    // brouillon : l'étiquette disparaît
    await page.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await page.getByText('Résultat enregistré').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Recalculer' }).click();
    const boite = page.getByRole('alertdialog');
    await boite.getByText('Recalculer cette conception ?').waitFor();
    await boite.getByText('Vos modifications non enregistrées seront abandonnées.').waitFor();
    await page.screenshot({ path: `${SHOTS}-confirmation.png`, fullPage: true });
    await boite.getByRole('button', { name: 'Annuler' }).click();
    await boite.waitFor({ state: 'detached' });
    assert.equal(await page.getByText(BANDE).count(), 1, 'Annuler ne bouge rien');
    assert.equal(await caracteristiques(m, 'lea', m.orak), avant);

    await page.getByRole('button', { name: 'Recalculer' }).click();
    await boite.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
    await page.getByText(BANDE).waitFor({ state: 'detached' });
    await page.screenshot({ path: `${SHOTS}-recalcule.png`, fullPage: true });
    assert.notEqual(await caracteristiques(m, 'lea', m.orak), avant, 'E-9 porte le nouveau calcul');
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, false);
  });

  it('sans brouillon, « Recalculer » agit aussitôt (pas de boîte)', async () => {
    const m = await monde();
    await m.portee(6);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
  });

  it('lecteur non auteur : la bande sans bouton ; liste d’Antor : « Anciens réglages » sur les deux conceptions, « Générer… » pour lui', async () => {
    const m = await monde();
    await m.portee(6);
    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    await page.getByText('Anciens réglages').first().waitFor();
    assert.equal(await page.getByText('Anciens réglages', { exact: true }).count(), 2);
    assert.equal(await page.getByRole('button', { name: /Générer les fiches de règles/ }).count(), 1);
    await page.screenshot({ path: `${SHOTS}-liste-antor.png`, fullPage: true });
    // mode Joueur
    await page.getByRole('radio', { name: 'Mode Joueur' }).check();
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Étoile du soir' }).click();
    await page.getByText(BANDE).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).count(), 0, 'mode Joueur : pas de Recalculer');
    await page.screenshot({ path: `${SHOTS}-joueur.png`, fullPage: true });
  });

  it('coque retirée : « Recalculer » le dit dans la bande, rien ne bouge', async () => {
    const m = await monde();
    await m.portee(6);
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/coques/eclaireur/retrait`, { retire: true })).status, 200);
    const avant = await caracteristiques(m, 'lea', m.etoile);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.etoile}`);
    await page.getByText(BANDE).waitFor();
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Élément retiré de cet univers : Éclaireur. Remplacez-le dans le concepteur.').waitFor();
    assert.equal(await page.getByText(BANDE).count(), 1);
    assert.equal(await page.getByText('Conception recalculée.').count(), 0);
    assert.equal(await caracteristiques(m, 'lea', m.etoile), avant);
    await page.screenshot({ path: `${SHOTS}-retire.png`, fullPage: true });
  });

  it('deux onglets : le recalcul du second dit « Cette conception a changé… » avec « Recharger »', async () => {
    const m = await monde();
    await m.portee(6);
    const a = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await a.page.getByText(BANDE).waitFor();
    const b = await a.ctx.newPage();
    await b.goto(`/univers/${m.E}/outils/swn/vaisseaux?fiche=${m.orak}`);
    await b.getByText(BANDE).waitFor();
    await a.page.getByRole('button', { name: 'Recalculer' }).click();
    await a.page.getByText('Conception recalculée.').waitFor();
    await b.getByRole('button', { name: 'Recalculer' }).click();
    await b.getByText('Cette conception a changé depuis que vous l’avez ouverte.').waitFor();
    await b.getByRole('button', { name: 'Recharger' }).waitFor();
    await b.screenshot({ path: `${SHOTS}-conflit.png`, fullPage: true });
  });

  it('hors ligne : « Connexion perdue. » et « Recalculer » désactivé', async () => {
    const m = await monde();
    await m.portee(6);
    const { page, ctx } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`);
    await page.getByText(BANDE).waitFor();
    await ctx.setOffline(true);
    await page.getByText('Connexion perdue.').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Recalculer' }).isDisabled(), true);
    await page.screenshot({ path: `${SHOTS}-hors-ligne.png`, fullPage: true });
    await ctx.setOffline(false);
  });

  it('390 px : la bande reste au-dessus des résultats, rien ne déborde', async () => {
    const m = await monde();
    await m.portee(6);
    const { page } = await ouvrir(m, 'Léa', `?fiche=${m.orak}`, 390);
    await page.getByText(BANDE).waitFor();
    const yBande = (await page.getByText(BANDE).boundingBox()).y;
    const yRes = (await page.getByText('Résultat enregistré').boundingBox()).y;
    assert.ok(yBande < yRes);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement horizontal');
    await page.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
  });

  it('outil désactivé : ni bande ni bouton ni boîte (Page introuvable)', async () => {
    const m = await monde();
    await m.portee(6);
    assert.equal((await m.api('antor', 'PUT', `/api/univers/${m.E}/outils/swn/vaisseaux/activation`, { active: false })).status, 204);
    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByText('Page introuvable.').waitFor();
    assert.equal(await page.getByRole('button', { name: /Générer|Recalculer/ }).count(), 0);
  });
});

describe('E-22 : « Générer les fiches de règles… »', { skip: skipBrowser, timeout: 240000 }, () => {
  it('sept « À créer », génération, sept « À jour » ; masquage → ligne E-20, proposition, texte de Léa inchangé jusqu’à l’acceptation', async () => {
    const m = await monde();
    const { page } = await ouvrir(m, 'Antor', '');
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    await d.getByText('Règles — Armes').waitFor();
    assert.equal(await d.getByText('À créer', { exact: true }).count(), 7);
    await d.getByText('Les fiches montrent le catalogue tel que les joueurs le voient : les éléments masqués n’y figurent pas.').waitFor();
    await page.screenshot({ path: `${SHOTS}-generer-avant.png`, fullPage: true });
    await d.getByRole('button', { name: 'Générer', exact: true }).click();
    await d.getByText('7 fiches créées.').waitFor();
    await d.getByText('À jour', { exact: true }).nth(6).waitFor();
    assert.equal(await d.getByText('À jour', { exact: true }).count(), 7);
    assert.equal(await d.getByRole('button', { name: 'Générer', exact: true }).isDisabled(), true);
    await d.getByText('Les fiches sont à jour.').waitFor();
    await page.screenshot({ path: `${SHOTS}-generer-apres.png`, fullPage: true });
    await d.getByRole('button', { name: 'Annuler' }).click();

    // Léa lit « Règles — Armes » (avec Lance d'essai)
    const fiches = (await m.api('antor', 'GET', `${m.B}/fiches-regles`)).json as Any[];
    const armes = fiches.find((f) => f.libelle === 'Règles — Armes');
    const lireArmes = async () => JSON.stringify((await m.api('lea', 'GET', `/api/univers/${m.E}/fiches/${armes.ficheId}`)).json.sections.map((s: Any) => s.html));
    const avant = await lireArmes();
    assert.match(avant, /Lance d.essai/);

    // masquage de la lance depuis E-20
    const g = (await m.api('antor', 'GET', `${m.B}/catalogue/gestion?nature=armes`)).json.elements.find((e: Any) => e.cle === 'lance-d-essai');
    await page.goto(`/univers/${m.E}/parametres?onglet=outils`);
    await page.getByRole('region').filter({ hasText: /vaisseaux/i }).getByRole('button', { name: 'Voir les éléments' }).first().click();
    await page.getByRole('region', { name: /^Éléments/ }).getByRole('tab', { name: /Armes/ }).click();
    const lance = page.getByRole('region', { name: /^Éléments/ }).getByRole('listitem').filter({ hasText: /Lance d.essai/  });
    await lance.getByRole('button', { name: 'Masquer aux joueurs' }).click();
    await page.getByText('Les fiches de règles montrent encore cet élément : acceptez la mise à jour proposée.').waitFor();
    await page.screenshot({ path: `${SHOTS}-e20-ligne.png`, fullPage: true });
    assert.equal(await lireArmes(), avant, 'le texte ne change pas avant l’acceptation');

    await page.goto(`/univers/${m.E}/outils/swn/vaisseaux`);
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d2 = page.getByRole('dialog');
    await d2.getByText('Règles — Armes').waitFor();
    assert.equal(await d2.getByText('Mise à jour proposée', { exact: true }).count(), 2);
    assert.equal(await d2.getByText('À jour', { exact: true }).count(), 5);
    await page.screenshot({ path: `${SHOTS}-generer-proposees.png`, fullPage: true });
    await d2.getByRole('button', { name: 'Voir la proposition' }).first().click();
    await page.getByRole('button', { name: /Accepter|Appliquer/ }).first().click();
    await page.getByRole('button', { name: /Accepter|Appliquer/ }).first().waitFor({ state: 'detached' });
    await page.waitForFunction(() => true);
    // texte de Léa : plus de lance d'essai
    const apres = await lireArmes();
    assert.doesNotMatch(apres, /Lance d.essai/);
  });

  it('rôles : Léa voit « Recalculer » (périmée) mais pas « Générer… »', async () => {
    const m = await monde();
    await m.portee(6);
    const { page } = await ouvrir(m, 'Léa', '');
    await page.getByRole('link', { name: "Vent d'Orak" }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Générer les fiches de règles/ }).count(), 0);
    assert.notEqual((await m.api('lea', 'GET', `${m.B}/fiches-regles`)).status, 200, 'la route de génération est fermée à Léa');
    await page.getByRole('link', { name: "Vent d'Orak" }).click();
    await page.getByRole('button', { name: 'Recalculer' }).waitFor();
  });

  it('hors ligne : « Connexion perdue. » et « Générer » désactivé ; 390 px une colonne', async () => {
    const m = await monde();
    const { page, ctx } = await ouvrir(m, 'Antor', '', 390);
    await page.getByRole('button', { name: /Générer les fiches de règles/ }).click();
    const d = page.getByRole('dialog');
    await d.getByText('Règles — Armes').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    const xs = await d.locator('li').evaluateAll((els: Any[]) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    assert.equal(new Set(xs).size, 1, 'une colonne');
    await page.screenshot({ path: `${SHOTS}-generer-390.png`, fullPage: true });
    await ctx.setOffline(true);
    await d.getByText('Connexion perdue.').waitFor();
    assert.equal(await d.getByRole('button', { name: 'Générer', exact: true }).isDisabled(), true);
    await ctx.setOffline(false);
  });
});
