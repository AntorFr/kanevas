// Whole-feature tests of kanevas-fiches-liees-rattrapage, written from the merge task's exit criterion:
// "in the stub, in Antor, « Port-Sel » still opens its sheet with its relations carrying nature and qualifier, E-17 still
// filters by « Lié à », and a scenario's screen and the sheet block registry are `main`'s"
// (docs/ecrans.md: E-9 adventure sheet, E-17 advanced search, their criteria). Real server in stub mode with its starting world,
// real Chromium. The expected values are literals of the docs, not values read from the code.
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

  // Failure aimed at: the merge breaks the opening of an epic place's sheet (types, header, sections).
  test('Antor ouvre « Port-Sel » : titre, Description, Histoire et la section MJ seul', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    for (const s of ['Description', 'Histoire', 'Vérité']) await antor.getByRole('region', { name: new RegExp(s) }).first().waitFor();
    await antor.screenshot({ path: '/tmp/rattrapage-port-sel-antor.png' });
  });

  // Exclusion: the place's « Vérité » section does not exist for Léa.
  test('Léa ouvre « Port-Sel » : Description et Histoire, pas « Vérité »', opts, async () => {
    await lea.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
    await lea.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await lea.getByRole('region', { name: /Description/ }).first().waitFor();
    assert.equal(await lea.getByRole('region', { name: /Vérité/ }).count(), 0);
  });

  // Failure aimed at: the merge loses the nature or qualifier of a relation to Port-Sel (service or screen).
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

  // Exclusion: the target (La Guilde, GM only) is closed to Léa, so are its relation and qualifier.
  test('Léa lit Aldric : la relation vers la Guilde et « trésorier » sont absents', opts, async () => {
    await lea.goto(`/univers/${U}/fiche/${ids['Maître Aldric']}`);
    await lea.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await lea.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
    const t = norm(await lea.locator('main').innerText());
    assert.ok(t.includes('Port-Sel'), 'Léa lit encore la relation vers Port-Sel');
    assert.ok(!t.includes('trésorier'), t);
    assert.ok(!t.includes('La Guilde des Brumes'), t);
  });

  // E-17, criterion: "linked to Port-Sel", "located there", sub-places included, type Personnage → Aldric, le Prieur and Suie.
  test('E-17 Antor : lié à Port-Sel, s’y trouvent, sous-lieux compris, Personnage → Aldric, Le Prieur masqué, Suie', opts, async () => {
    await recherche(antor, `type=personnage&lie=${ids['Port-Sel']}&nature=se_situe&descendants=1`);
    await antor.getByText('Port-Sel', { exact: false }).first().waitFor();
    await antor.waitForFunction(() => document.querySelectorAll('main a[href*="/fiche/"]').length >= 3);
    const l = (await liste(antor)).sort();
    assert.deepEqual(l, ['Le Prieur masqué', 'Maître Aldric', 'Suie']);
    assert.equal(await antor.getByRole('button', { name: 'Chercher', exact: true }).count(), 0, 'avec « Lié à », E-17 n’a pas de bouton « Chercher »');
    await antor.screenshot({ path: '/tmp/rattrapage-e17-antor.png' });
  });

  // Edge: the « Vivants » filter removes le Prieur (dead), keeps the other two.
  test('E-17 Antor, « Vivants » (etat=la) : le Prieur mort disparaît de la liste', opts, async () => {
    await recherche(antor, `type=personnage&lie=${ids['Port-Sel']}&nature=se_situe&descendants=1&etat=la`);
    await antor.waitForFunction(() => document.querySelectorAll('main a[href*="/fiche/"]').length >= 2);
    assert.deepEqual((await liste(antor)).sort(), ['Maître Aldric', 'Suie']);
  });

  // Exclusion: Léa finds neither le Prieur (closed sheet) nor a mode switch.
  test('E-17 Léa, même adresse : Aldric et Suie seulement, pas de bascule de mode', opts, async () => {
    await recherche(lea, `type=personnage&lie=${ids['Port-Sel']}&nature=se_situe&descendants=1`);
    await lea.waitForFunction(() => document.querySelectorAll('main a[href*="/fiche/"]').length >= 2);
    assert.deepEqual((await liste(lea)).sort(), ['Maître Aldric', 'Suie']);
    assert.equal(await lea.getByRole('radio', { name: /Mode Joueur/ }).count(), 0);
    await lea.screenshot({ path: '/tmp/rattrapage-e17-lea.png' });
  });

  // Failure: a « Lié à » sheet nobody reads → the need's empty sentence, the search still runs.
  test('E-17 : lié à une fiche inexistante → « Fiche introuvable » et « Aucune fiche liée pour ces critères. »', opts, async () => {
    await recherche(antor, 'lie=999999');
    await antor.getByText('Fiche introuvable').first().waitFor();
    await antor.getByText('Aucune fiche liée pour ces critères.').waitFor();
  });

  // Sheet block registry from main (AD-124): two blocks above the sections, in order, for the GM; Léa has no « Préparation ».
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

  // Exclusion: Antor in Player mode on « Acte II » (no section read by players) → no « Préparation ».
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
