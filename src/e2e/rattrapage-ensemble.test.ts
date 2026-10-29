// Tests d'ensemble de kanevas-fiches-liees-rattrapage, écrits depuis le critère de sortie de la tâche de fusion :
// « au bouchon, en Antor, « Port-Sel » ouvre encore sa fiche avec ses relations à nature et son qualificatif, E-17 filtre
// encore par « Lié à », et l'écran d'un scénario et le registre de blocs de fiche sont ceux de `main` »
// (docs/ecrans.md : E-9 fiche d'aventure, E-17 recherche avancée, ses critères). Vrai serveur en mode bouchon avec son monde de
// départ, vrai Chromium. Les attendus sont des littéraux de la doc, pas des valeurs lues dans le code.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer, type Server } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
const U = 1;
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
const ids: Record<string, number> = {};
const norm = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const prep = (p: Any) => p.getByRole('region', { name: 'Préparation', exact: true });
const crs = (p: Any) => p.getByRole('region', { name: 'Comptes-rendus', exact: true });

async function titres(page: Any, type: string): Promise<string[]> {
  const r = await (await page.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=${type}`)).json();
  for (const f of r.fiches) ids[f.titre] = f.id;
  return r.fiches.map((f: Any) => f.titre);
}

/** Open E-17 on an address and wait for its list (or its empty sentence) to settle. */
async function recherche(page: Any, query: string): Promise<void> {
  await page.goto(`/univers/${U}/recherche?${query}`);
  await page.getByRole('heading', { level: 1, name: 'Recherche' }).waitFor();
  await page.waitForFunction(() => !/Chargement/.test(document.body.innerText));
}
const liste = async (page: Any): Promise<string[]> =>
  (await page.locator('main a[href*="/fiche/"]').allInnerTexts()).map((t: string) => norm(t.split('\n')[0]!));

describe('kanevas-fiches-liees-rattrapage, l’epic et main fusionnés, au bouchon', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    for (const t of ['lieu', 'personnage', 'aventure', 'faction']) await titres(antor, t);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Panne visée : la fusion casse l'ouverture de la fiche d'un lieu de l'epic (types, en-tête, sections).
  test('Antor ouvre « Port-Sel » : titre, Description, Histoire et la section MJ seul', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    for (const s of ['Description', 'Histoire', 'Vérité']) await antor.getByRole('region', { name: new RegExp(s) }).first().waitFor();
    await antor.screenshot({ path: '/tmp/rattrapage-port-sel-antor.png' });
  });

  // Exclusion : la section « Vérité » du lieu n'existe pas pour Léa.
  test('Léa ouvre « Port-Sel » : Description et Histoire, pas « Vérité »', opts, async () => {
    await lea.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
    await lea.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await lea.getByRole('region', { name: /Description/ }).first().waitFor();
    assert.equal(await lea.getByRole('region', { name: /Vérité/ }).count(), 0);
  });

  // Panne visée : la fusion perd la nature ou le qualificatif d'une relation vers Port-Sel (service ou écran).
  test('Aldric, Apparence : « se situe à · Port-Sel — habite », « membre de · La Guilde des Brumes — trésorier » et « maître de port » sans nature', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['Maître Aldric']}`);
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    const g = antor.getByRole('region', { name: /Apparence/ }).getByRole('group', { name: 'Relations' });
    await antor.waitForFunction(() => [...document.querySelectorAll('[role=group][aria-label=Relations]')].some((e) => (e as HTMLElement).innerText.includes('trésorier')));
    const t = norm(await g.innerText());
    assert.ok(t.includes('se situe à · Port-Sel — habite'), t);
    assert.ok(t.includes('membre de · La Guilde des Brumes — trésorier'), t);
    assert.ok(t.includes('maître de port'), t);
    await antor.screenshot({ path: '/tmp/rattrapage-aldric-relations.png' });
  });

  // Exclusion : la cible (La Guilde, MJ seul) est fermée à Léa, sa relation et son qualificatif aussi.
  test('Léa lit Aldric : la relation vers la Guilde et « trésorier » sont absents', opts, async () => {
    await lea.goto(`/univers/${U}/fiche/${ids['Maître Aldric']}`);
    await lea.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await lea.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
    const t = norm(await lea.locator('main').innerText());
    assert.ok(t.includes('Port-Sel'), 'Léa lit encore la relation vers Port-Sel');
    assert.ok(!t.includes('trésorier'), t);
    assert.ok(!t.includes('La Guilde des Brumes'), t);
  });

  // E-17, critère : « lié à Port-Sel », « s'y trouvent », sous-lieux compris, type Personnage → Aldric, le Prieur et Suie.
  test('E-17 Antor : lié à Port-Sel, s’y trouvent, sous-lieux compris, Personnage → Aldric, Le Prieur masqué, Suie', opts, async () => {
    await recherche(antor, `type=personnage&lie=${ids['Port-Sel']}&nature=se_situe&descendants=1`);
    await antor.getByText('Port-Sel', { exact: false }).first().waitFor();
    await antor.waitForFunction(() => document.querySelectorAll('main a[href*="/fiche/"]').length >= 3);
    const l = (await liste(antor)).sort();
    assert.deepEqual(l, ['Le Prieur masqué', 'Maître Aldric', 'Suie']);
    assert.equal(await antor.getByRole('button', { name: 'Chercher', exact: true }).count(), 0, 'avec « Lié à », E-17 n’a pas de bouton « Chercher »');
    await antor.screenshot({ path: '/tmp/rattrapage-e17-antor.png' });
  });

  // Bord : le filtre « Vivants » retire le Prieur (mort), garde les deux autres.
  test('E-17 Antor, « Vivants » (etat=la) : le Prieur mort disparaît de la liste', opts, async () => {
    await recherche(antor, `type=personnage&lie=${ids['Port-Sel']}&nature=se_situe&descendants=1&etat=la`);
    await antor.waitForFunction(() => document.querySelectorAll('main a[href*="/fiche/"]').length >= 2);
    assert.deepEqual((await liste(antor)).sort(), ['Maître Aldric', 'Suie']);
  });

  // Exclusion : Léa ne trouve ni le Prieur (fiche fermée) et n'a pas de bascule de mode.
  test('E-17 Léa, même adresse : Aldric et Suie seulement, pas de bascule de mode', opts, async () => {
    await recherche(lea, `type=personnage&lie=${ids['Port-Sel']}&nature=se_situe&descendants=1`);
    await lea.waitForFunction(() => document.querySelectorAll('main a[href*="/fiche/"]').length >= 2);
    assert.deepEqual((await liste(lea)).sort(), ['Maître Aldric', 'Suie']);
    assert.equal(await lea.getByRole('radio', { name: /Mode Joueur/ }).count(), 0);
    await lea.screenshot({ path: '/tmp/rattrapage-e17-lea.png' });
  });

  // Échec : une fiche « Lié à » que personne ne lit → phrase vide du besoin, la recherche tourne quand même.
  test('E-17 : lié à une fiche inexistante → « Fiche introuvable » et « Aucune fiche liée pour ces critères. »', opts, async () => {
    await recherche(antor, 'lie=999999');
    await antor.getByText('Fiche introuvable').first().waitFor();
    await antor.getByText('Aucune fiche liée pour ces critères.').waitFor();
  });

  // Registre de blocs de fiche de main (AD-124) : deux blocs au-dessus des sections, dans l'ordre, pour le MJ ; Léa n'a pas « Préparation ».
  test('La Couronne brisée, Antor : statut, puis « Préparation » avant « Comptes-rendus », avant les sections', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['La Couronne brisée']}`);
    await antor.getByRole('heading', { level: 1, name: 'La Couronne brisée' }).waitFor();
    await prep(antor).waitFor();
    await crs(antor).waitFor();
    await antor.getByText(/Statut\s*:\s*En cours/).first().waitFor();
    const y = async (nom: RegExp) => (await antor.getByRole('region', { name: nom }).first().boundingBox()).y as number;
    const [yPrep, yCr, ySection] = [await y(/^Préparation$/), await y(/^Comptes-rendus$/), await y(/Présentation/)];
    assert.ok(yPrep < yCr, `Préparation (${yPrep}) avant Comptes-rendus (${yCr})`);
    assert.ok(yCr < ySection, `Comptes-rendus (${yCr}) avant la section Présentation (${ySection})`);
    await antor.screenshot({ path: '/tmp/rattrapage-couronne-antor.png' });
  });

  test('La Couronne brisée : Antor ajoute « Plan de la crypte » (Cartes) et le coche → « Cochées (1) » ; Léa ne voit pas « Préparation »', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['La Couronne brisée']}`);
    await prep(antor).waitFor();
    await prep(antor).getByLabel('Nouvelle tâche').fill('Plan de la crypte');
    await prep(antor).getByLabel('Catégorie').selectOption({ label: 'Cartes' });
    await prep(antor).getByRole('button', { name: 'Ajouter', exact: true }).click();
    const case_ = prep(antor).getByRole('checkbox', { name: 'Plan de la crypte', exact: true });
    await case_.waitFor();
    await case_.click();
    await prep(antor).locator('summary').filter({ hasText: 'Cochées (1)' }).waitFor();

    await lea.goto(`/univers/${U}/fiche/${ids['La Couronne brisée']}`);
    await lea.getByRole('heading', { level: 1, name: 'La Couronne brisée' }).waitFor();
    await crs(lea).waitFor();
    assert.equal(await prep(lea).count(), 0);
    assert.ok(!norm(await lea.locator('main').innerText()).includes('Plan de la crypte'));
  });

  // Exclusion : Antor en mode Joueur sur « Acte II » (aucune section lue des joueurs) → pas de « Préparation ».
  test('Acte II, Antor en mode Joueur : « Aucune section n’est visible des joueurs. » et aucun bloc « Préparation »', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['Acte II — Le sceau brisé']}`);
    await antor.getByRole('heading', { level: 1, name: 'Acte II — Le sceau brisé' }).waitFor();
    await prep(antor).waitFor();
    await antor.getByRole('radio', { name: /Mode Joueur/ }).check();
    await antor.getByText(rx("Aucune section n'est visible des joueurs.")).first().waitFor();
    await attendre(antor);
    assert.equal(await prep(antor).count(), 0);
    assert.equal(await antor.getByRole('button', { name: /changer le statut/ }).count(), 0, 'le statut n’est plus qu’une pastille');
    await antor.screenshot({ path: '/tmp/rattrapage-acte2-joueur.png' });
  });
});
