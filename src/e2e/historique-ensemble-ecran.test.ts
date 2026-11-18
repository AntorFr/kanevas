// ecrans: historique, fiche
// kanevas-synchro-historique, E-24 « Historique de l'univers » et E-9 menu ⋯ « Historique » : ce que le MJ voit, écrit du
// critère de sortie, de docs/parcours.md (B-102, B-103, B-96, P-26) et de docs/ecrans.md (E-24), sans lire le code.
// Les effets (lignes, droits, codes, versions) sont prouvés par src/routes/historique-ensemble-besoin.test.ts ; ici l'écran.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

import { type Any, attendre, connecte, launch, playwright, startServer, type Server } from './harnais.test.js';

const SHOTS = process.env.CAPTURES_DIR ?? '/tmp/kanevas-historique-ensemble-shots';
const DOSSIER = mkdtempSync(join(tmpdir(), 'kanevas-hist-ens-'));
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let UCLE = '';

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
const fiche = async (titre: string): Promise<number> => (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre })).id;
const section = async (f: number, titre: string, contenu: string): Promise<Any> =>
  api(antor, 'POST', `/api/univers/${U}/fiches/${f}/sections`, { titre, contenu });
const reecrire = async (f: number, s: number, contenu: string): Promise<void> => {
  const v = (await api(antor, 'GET', `/api/univers/${U}/fiches/${f}/sections/${s}`)).version;
  await api(antor, 'PUT', `/api/univers/${U}/fiches/${f}/sections/${s}/contenu`, { contenu, version: v });
};
const allerHistorique = async (page: Any, requete = ''): Promise<void> => {
  await page.goto(`/univers/${UCLE}/historique${requete}`);
  await page.getByRole('heading', { level: 1, name: 'Historique' }).waitFor();
};
/** The lines of the list: the list items that carry a date. */
const lignes = (page: Any) => page.getByRole('main').getByRole('listitem').filter({ has: page.locator('time') });
const ligneDe = (page: Any, texte: string | RegExp) => lignes(page).filter({ hasText: texte });
const ouvrir = (page: Any, libelle: string | RegExp) => ligneDe(page, libelle).first().getByRole('link', { name: libelle }).click();
const RESTAURER = 'Restaurer cette version';
const boite = (page: Any) => page.locator('[role=dialog], [role=alertdialog]');

describe('kanevas-synchro-historique, E-24 Historique de l’univers', () => {
  before(async () => {
    srv = await startServer({ DB_PATH: join(DOSSIER, 'k.db') });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" });
    U = u.id;
    UCLE = u.cle;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    await srv?.stop();
    rmSync(DOSSIER, { recursive: true, force: true });
  });

  test('E-24 vide : « Aucune modification dans cette période. » pour un univers sans écriture', async () => {
    const vide = await api(antor, 'POST', '/api/univers', { nom: 'Monde sans histoire' });
    await antor.goto(`/univers/${vide.cle}/historique`);
    await antor.getByRole('heading', { level: 1, name: 'Historique' }).waitFor();
    await antor.getByText('Aucune modification dans cette période.').waitFor();
    assert.equal(await lignes(antor).count(), 0);
  });

  test('critère : le MJ modifie une section au clavier de l’écran, déplace la fiche, retire une relation → E-24 montre les trois lignes (date, compte, origine écran)', async () => {
    const port = await fiche('Port-Sel');
    const cote = await fiche('Côte des Brumes');
    const cap = await fiche('Cap Brume');
    const s = await section(port, 'Aperçu', 'Un petit port.');
    const rel = await api(antor, 'POST', `/api/univers/${U}/fiches/${port}/sections/${s.id}/relations`, { cibleFicheId: cap, qualificatif: 'voisin' });
    const avant = Date.now() - 2000;
    // 1. the section is rewritten on the sheet's screen
    await antor.goto(`/univers/${UCLE}/fiche/${port}`);
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await attendre(antor);
    const sec = antor.locator('main section.sec').filter({ hasText: 'Aperçu' });
    await sec.getByRole('button', { name: 'Modifier', exact: true }).click();
    await sec.getByRole('textbox').fill('Un grand port, ses quais et ses phares.');
    const ecrit = antor.waitForResponse((r: Any) => r.request().method() === 'PUT' && /\/contenu$/.test(r.url()));
    await sec.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    assert.equal((await ecrit).status(), 200);
    // 2. moved under a parent, 3. relation removed
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${port}`, { parent: cote });
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`);

    await allerHistorique(antor, `?fiche=${port}`);
    await lignes(antor).first().waitFor();
    // the three gestures, whatever the wording of the label (the wording has its own tests below)
    const reecrite = ligneDe(antor, /Section « aper[cç]u » réécrite/i).first();
    const deplacee = ligneDe(antor, /Fiche déplacée|En-tête modifié/).first();
    const retiree = ligneDe(antor, /Relation .*retirée/).first();
    for (const l of [reecrite, deplacee, retiree]) {
      await l.waitFor();
      const txt = await l.innerText();
      assert.match(txt, /antor/);
      assert.match(txt, /écran/i);
      const iso = await l.locator('time').first().getAttribute('datetime');
      assert.ok(iso && Date.parse(iso) >= avant && Date.parse(iso) <= Date.now() + 2000, `date ${iso}`);
    }
    // newest first: the removal, then the move, then the rewrite
    const textes: string[] = await lignes(antor).allInnerTexts();
    const rang = (re: RegExp) => textes.findIndex((t) => re.test(t));
    assert.ok(rang(/Relation .*retirée/) < rang(/Fiche déplacée|En-tête modifié/));
    assert.ok(rang(/Fiche déplacée|En-tête modifié/) < rang(/Section « aper[cç]u » réécrite/i));
    await antor.screenshot({ path: `${SHOTS}/e24-trois-lignes.png`, fullPage: true });
  });

  test('ce que dit une ligne (docs/ecrans.md E-24) : titre de la section, « Fiche déplacée », « Titre changé », « Relation vers <clé> retirée », alias et étiquettes', async () => {
    const f = await fiche('Libellés');
    const p = await fiche('Parent des libellés');
    const cible = await fiche('Cible des libellés');
    const s = await section(f, 'Aperçu', 'v1');
    await reecrire(f, s.id, 'v2');
    const rel = await api(antor, 'POST', `/api/univers/${U}/fiches/${f}/sections/${s.id}/relations`, { cibleFicheId: cible, qualificatif: 'voisin' });
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`);
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f}`, { parent: p });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f}`, { titre: 'Libellés bis' });
    await api(antor, 'PUT', `/api/univers/${U}/fiches/${f}/etiquetage`, { alias: ['Surnom'], etiquettes: ['marqueur'] });
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    const tous: string = (await lignes(antor).allInnerTexts()).join('\n');
    await antor.screenshot({ path: `${SHOTS}/e24-libelles.png`, fullPage: true });
    const manque: string[] = [];
    for (const [nom, re] of [
      ['Section « Aperçu » réécrite (titre de la section, pas sa clé)', /Section « Aperçu » réécrite/],
      ['Section « Aperçu » créée', /Section « Aperçu » créée/],
      ['Fiche déplacée', /Fiche déplacée/],
      ['Titre changé', /Titre changé/],
      ['Relation vers lieu:cible-des-libelles ajoutée', /Relation vers lieu:cible-des-libelles ajoutée/],
      ['Relation vers lieu:cible-des-libelles retirée', /Relation vers lieu:cible-des-libelles retirée/],
      ['Alias ajouté', /Alias ajouté/],
      ['Étiquette ajoutée', /Étiquette ajoutée/],
      ['Fiche créée', /Fiche créée/],
    ] as const) if (!re.test(tous)) manque.push(nom);
    assert.deepEqual(manque, [], `lignes affichées :\n${tous}`);
  });

  test('« Restaurer cette version » : comparaison, confirmation (focus sur Annuler), toast, nouvelle ligne en tête, ancien texte rendu', async () => {
    const f = await fiche('Restauration');
    const s = await section(f, 'Histoire', 'Texte d’origine.');
    await reecrire(f, s.id, 'Texte gâché.');
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    const avant = await lignes(antor).count();
    await ouvrir(antor, /Section « histoire » réécrite/i);
    await antor.getByRole('button', { name: RESTAURER }).waitFor();
    const prec = antor.getByRole('region', { name: /Valeur précédente/ });
    const cour = antor.getByRole('region', { name: /Valeur actuelle/ });
    assert.match(await prec.innerText(), /Texte d’origine\./);
    assert.match(await cour.innerText(), /Texte gâché\./);
    await antor.screenshot({ path: `${SHOTS}/e24-detail.png`, fullPage: true });
    await antor.getByRole('button', { name: RESTAURER }).click();
    await boite(antor).waitFor();
    assert.equal(await antor.evaluate(() => document.activeElement?.textContent?.trim()), 'Annuler');
    const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/restaurer$/.test(r.url()));
    await boite(antor).getByRole('button', { name: RESTAURER }).click();
    assert.equal((await reponse).status(), 200);
    await antor.getByText('Version restaurée').waitFor();
    await lignes(antor).first().waitFor();
    await antor.getByText(/Retour à la liste/).waitFor({ state: 'detached' }).catch(() => undefined);
    assert.equal(await lignes(antor).count(), avant + 1);
    assert.match(await lignes(antor).first().innerText(), /Section « histoire » réécrite/i);
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${f}/sections/${s.id}`)).contenu, 'Texte d’origine.');
    await antor.screenshot({ path: `${SHOTS}/e24-restauree.png`, fullPage: true });
  });

  test('« Annuler » dans la confirmation : rien n’est restauré', async () => {
    const f = await fiche('Annulation');
    const s = await section(f, 'Histoire', 'avant');
    await reecrire(f, s.id, 'après');
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    await ouvrir(antor, /Section « histoire » réécrite/i);
    await antor.getByRole('button', { name: RESTAURER }).click();
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
    await boite(antor).waitFor({ state: 'detached' });
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${f}/sections/${s.id}`)).contenu, 'après');
  });

  test('refus historique_perime : « La fiche a changé depuis l’affichage. » avec « Recharger », les filtres restent', async () => {
    const f = await fiche('Périmé');
    const s = await section(f, 'Histoire', 'v1');
    await reecrire(f, s.id, 'v2');
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    await ouvrir(antor, /Section « histoire » réécrite/i);
    await antor.getByRole('button', { name: RESTAURER }).waitFor();
    await reecrire(f, s.id, 'v3 derrière l’écran');
    await antor.getByRole('button', { name: RESTAURER }).click();
    const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/restaurer$/.test(r.url()));
    await boite(antor).getByRole('button', { name: RESTAURER }).click();
    assert.equal((await reponse).status(), 409);
    await antor.getByText(/La fiche a changé depuis l.affichage\./).waitFor();
    await antor.getByRole('button', { name: 'Recharger' }).waitFor();
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${f}/sections/${s.id}`)).contenu, 'v3 derrière l’écran');
    await antor.screenshot({ path: `${SHOTS}/e24-refus-perime.png`, fullPage: true });
    await antor.getByRole('button', { name: 'Recharger' }).click();
    await antor.getByText(/La fiche a changé depuis l.affichage\./).waitFor({ state: 'detached' });
  });

  test('refus cle_prise : « Une autre section porte maintenant cette clé. »', async () => {
    const f = await fiche('Clé prise');
    const s = await section(f, 'Histoire', 'ancienne');
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f}/sections/${s.id}`);
    await section(f, 'Histoire', 'nouvelle');
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    await ouvrir(antor, /Section « histoire » supprimée/i);
    await antor.getByRole('button', { name: RESTAURER }).click();
    await boite(antor).getByRole('button', { name: RESTAURER }).click();
    await antor.getByText('Une autre section porte maintenant cette clé.').waitFor();
    await antor.screenshot({ path: `${SHOTS}/e24-refus-cle-prise.png`, fullPage: true });
  });

  test('plus de 30 jours : le détail dit « Valeur précédente non conservée (plus de 30 jours). », sans bouton', async () => {
    const f = await fiche('Ancienne');
    const s = await section(f, 'Histoire', 'avant');
    await reecrire(f, s.id, 'après');
    const bd = new Database(join(DOSSIER, 'k.db'));
    try {
      bd.prepare("UPDATE historique SET cree_le = ? WHERE fiche_id = ? AND objet = 'section' AND action = 'modifiee'")
        .run(new Date(Date.now() - 31 * 86400_000).toISOString(), f);
    } finally { bd.close(); }
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    await ouvrir(antor, /Section « histoire » réécrite/i);
    await antor.getByText('Valeur précédente non conservée (plus de 30 jours).').waitFor();
    assert.equal(await antor.getByRole('button', { name: RESTAURER }).count(), 0);
    await antor.screenshot({ path: `${SHOTS}/e24-plus-de-30-jours.png`, fullPage: true });
  });

  test('sans bouton : une relation, une « section créée », une fiche supprimée (ses sections en lecture seule)', async () => {
    const f = await fiche('Sans bouton');
    const cible = await fiche('Cible');
    const s = await section(f, 'Notes', 'Texte **source** à garder.');
    const rel = await api(antor, 'POST', `/api/univers/${U}/fiches/${f}/sections/${s.id}/relations`, { cibleFicheId: cible, qualificatif: 'voisin' });
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`);
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    await ouvrir(antor, /Relation .*retirée/);
    await antor.getByText(/Retour à la liste/).waitFor();
    assert.equal(await antor.getByRole('button', { name: RESTAURER }).count(), 0);
    await antor.getByText(/Retour à la liste/).click();
    await ouvrir(antor, /Section « notes » créée/i);
    await antor.getByText(/Retour à la liste/).waitFor();
    assert.equal(await antor.getByRole('button', { name: RESTAURER }).count(), 0);

    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f}`);
    await allerHistorique(antor);
    await ligneDe(antor, /Fiche supprimée/).first().waitFor();
    const l = ligneDe(antor, /Fiche supprimée/).first(); // the newest one is this test's
    assert.match(await l.innerText(), /supprimée/);
    await l.getByRole('link', { name: /Fiche supprimée/ }).click();
    await antor.getByText('Texte **source** à garder.').waitFor();
    assert.equal(await antor.getByRole('button', { name: RESTAURER }).count(), 0);
    assert.equal(await antor.getByRole('main').locator('textarea, input[type=text]').count(), 0, 'rien à écrire');
    await antor.screenshot({ path: `${SHOTS}/e24-fiche-supprimee.png`, fullPage: true });
  });

  test('une ligne de fiche supprimée nomme la fiche, en texte simple, avec la pastille « supprimée » (E-24, ligne d’historique)', async () => {
    const f = await fiche('Le Fort');
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f}`);
    await allerHistorique(antor);
    const l = ligneDe(antor, /Fiche supprimée/).first();
    await l.waitFor();
    const txt = await l.innerText();
    await antor.screenshot({ path: `${SHOTS}/e24-ligne-fiche-supprimee.png`, fullPage: true });
    assert.match(txt, /Le Fort/, `la ligne affichée : ${txt.replace(/\n/g, ' | ')}`);
    assert.match(txt, /supprimée/);
    assert.equal(await l.getByRole('link', { name: 'Le Fort' }).count(), 0, 'pas de lien vers une fiche qui n’existe plus');
  });

  test('un jeton qui écrit : la ligne dit « via <nom du jeton> » et son compte ; le filtre par contributeur la retrouve', async () => {
    const jeton = await api(antor, 'POST', '/api/compte/jetons',
      { nom: 'Agent Éneria', dureeJours: 30, acces: { tous: false, univers: [{ universId: U, niveau: 'ecriture' }] } });
    const ctx = await playwright.request.newContext({ baseURL: srv.base, extraHTTPHeaders: { authorization: `Bearer ${jeton.valeur}` } });
    try {
      const r = await ctx.put(`/api/v1/univers/${UCLE}/fiches/lieu:ecrit-par-agent`,
        { data: { type: 'lieu', titre: 'Écrit par agent', sections: [{ cle: 's:h', titre: 'Histoire', contenu: 'Par le jeton.' }] } });
      assert.equal(r.status(), 200, await r.text());
    } finally { await ctx.dispose(); }
    await allerHistorique(antor);
    const l = ligneDe(antor, /via Agent Éneria/).first();
    await l.waitFor();
    assert.match(await l.innerText(), /antor/);
    await antor.screenshot({ path: `${SHOTS}/e24-jeton.png`, fullPage: true });
    // the screen's own filter by contributor: the token is offered by name
    const total = await lignes(antor).count();
    await antor.getByLabel('Contributeur').selectOption({ label: 'Jeton « Agent Éneria »' });
    await antor.waitForFunction((n: number) => { const c = document.querySelectorAll('main li time').length; return c > 0 && c < n; }, total);
    await lignes(antor).first().waitFor();
    for (const t of await lignes(antor).allInnerTexts()) assert.match(t, /via Agent Éneria/);
  });

  test('« Charger la suite » : cent lignes d’abord, puis la suite', async () => {
    const f = await fiche('Pagination');
    const s = await section(f, 'Journal', 'v0');
    for (let i = 1; i <= 104; i++) await reecrire(f, s.id, `v${i}`);
    await allerHistorique(antor, `?fiche=${f}`);
    await lignes(antor).first().waitFor();
    assert.equal(await lignes(antor).count(), 100);
    const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'GET' && /historique\?.*apres=/.test(r.url()));
    await antor.getByRole('button', { name: 'Charger la suite' }).click();
    await reponse;
    await antor.waitForFunction(() => document.querySelectorAll('main li time').length === 106);
    assert.equal(await antor.getByRole('button', { name: 'Charger la suite' }).count(), 0);
  });

  test('erreur de chargement : « Impossible de charger l’historique. » puis « Réessayer »', async () => {
    await fiche('Pour la panne');
    const motif = /\/api\/univers\/[^/]+\/historique(\?.*)?$/;
    const panne = (r: Any) => r.fulfill({ status: 500, body: '{"message":"boom"}', contentType: 'application/json' });
    await antor.route(motif, panne);
    await antor.goto(`/univers/${UCLE}/historique`);
    await antor.getByText(/Impossible de charger l.historique\./).waitFor();
    await antor.screenshot({ path: `${SHOTS}/e24-erreur.png`, fullPage: true });
    await antor.unroute(motif, panne);
    await antor.getByRole('button', { name: 'Réessayer' }).click();
    await lignes(antor).first().waitFor();
    assert.equal(await antor.getByText(/Impossible de charger l.historique\./).count(), 0);
  });

  test('E-9 : le menu ⋯ d’une fiche porte « Historique » et ouvre E-24 filtré sur la fiche, « Toutes les fiches » le lève', async () => {
    const f = await fiche('Fiche à part');
    const autre = await fiche('Voisine bruyante');
    await section(autre, 'Bruit', 'x');
    await antor.goto(`/univers/${UCLE}/fiche/${f}`);
    await antor.getByRole('heading', { level: 1, name: 'Fiche à part' }).waitFor();
    await attendre(antor);
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Historique' }).click();
    await antor.getByRole('heading', { level: 1, name: 'Historique' }).waitFor();
    assert.match(antor.url(), new RegExp(`fiche=${f}`));
    await lignes(antor).first().waitFor();
    for (const t of await lignes(antor).allInnerTexts()) assert.doesNotMatch(t, /Bruit|Voisine bruyante/);
    await antor.getByRole('button', { name: 'Toutes les fiches' }).click();
    await ligneDe(antor, /Voisine bruyante|Bruit/).first().waitFor();
    assert.doesNotMatch(antor.url(), /fiche=/);
  });

  test('exclusions : la joueuse n’a ni l’entrée « Historique » de la barre ni celle du menu ⋯ ; l’adresse forcée dit « Page introuvable. »', async () => {
    const f = await fiche('Vue par la joueuse');
    const sp = await section(f, 'Public', 'Visible de tous.');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f}/sections/${sp.id}`, { joueursLisent: true });
    await lea.goto(`/univers/${UCLE}/fiche/${f}`);
    await lea.getByRole('heading', { level: 1, name: 'Vue par la joueuse' }).waitFor();
    await attendre(lea);
    assert.equal(await lea.getByRole('link', { name: 'Historique' }).count(), 0);
    const menu = lea.getByRole('button', { name: /^Autres actions sur/ });
    if ((await menu.count()) > 0) {
      await menu.first().click();
      assert.equal(await lea.getByRole('menuitem', { name: 'Historique' }).count(), 0);
      await lea.keyboard.press('Escape');
    }
    await lea.goto(`/univers/${UCLE}/historique`);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lignes(lea).count(), 0);
    await lea.screenshot({ path: `${SHOTS}/e24-joueuse.png`, fullPage: true });
  });

  test('exclusion : le MJ en mode joueur n’a plus l’entrée « Historique » de la barre', async () => {
    const f = await fiche('Pour la bascule');
    await antor.goto(`/univers/${UCLE}/fiche/${f}`);
    await antor.getByRole('heading', { level: 1, name: 'Pour la bascule' }).waitFor();
    await attendre(antor);
    assert.ok((await antor.getByRole('link', { name: 'Historique' }).count()) > 0, 'en mode MJ, l’entrée est là');
    await antor.getByRole('radiogroup', { name: /Mode d.affichage/ }).getByRole('radio', { name: 'Joueur' }).check({ force: true });
    await antor.getByText(/Mode Joueur : vous voyez ce que voit un joueur\./).waitFor();
    await antor.screenshot({ path: `${SHOTS}/e24-mode-joueur-barre.png`, fullPage: true });
    try {
      assert.equal(await antor.getByRole('link', { name: 'Historique' }).count(), 0);
    } finally {
      await antor.getByRole('radiogroup', { name: /Mode d.affichage/ }).getByRole('radio', { name: 'MJ' }).check({ force: true });
    }
  });

  test('exclusion : le MJ en mode joueur reçoit « Page introuvable. » à l’adresse de E-24', async () => {
    const f = await fiche('Pour la bascule 2');
    await antor.goto(`/univers/${UCLE}/fiche/${f}`);
    await antor.getByRole('heading', { level: 1, name: 'Pour la bascule 2' }).waitFor();
    await attendre(antor);
    await antor.getByRole('radiogroup', { name: /Mode d.affichage/ }).getByRole('radio', { name: 'Joueur' }).check({ force: true });
    await antor.getByText(/Mode Joueur : vous voyez ce que voit un joueur\./).waitFor();
    try {
      // client-side navigation (the barre's entry is still there, see the previous test), so the mode is kept
      await antor.getByRole('link', { name: 'Historique' }).first().click();
      await antor.getByText('Page introuvable.').waitFor();
      assert.equal(await lignes(antor).count(), 0);
      await antor.screenshot({ path: `${SHOTS}/e24-mode-joueur-adresse.png`, fullPage: true });
    } finally {
      await antor.goto(`/univers/${UCLE}/fiche/${f}`);
      await antor.getByRole('radiogroup', { name: /Mode d.affichage/ }).getByRole('radio', { name: 'MJ' }).check({ force: true });
    }
  });
});
