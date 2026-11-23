// ecrans: comptes-rendus, fiche, vue-ensemble
// Browser proof of kanevas-scenarios-suivi-blocs (B-60, B-19, E-9 blocks, E-13, E-3 « Derniers comptes-rendus », AD-124):
// the « Préparation » (GM, outside player mode) and « Comptes-rendus » (every member) blocks of an adventure sheet.
// Adventures are made through the routes of the sheets. Real server in stub mode + Chromium; waits are on
// what the user sees, never on `networkidle`.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 240000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = '';
let couronne = 0;
let acte2 = 0;
const errors: string[] = [];

async function connexion(compte: string) {
  const ctx = await browser.newContext({ baseURL: srv.base });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte}$`, 'i') }).click();
  await page.getByRole('heading', { name: 'Mes univers', exact: true }).waitFor();
  return { ctx, page };
}
async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  assert.ok(r.ok(), `${method} ${path}: ${r.status()}`);
  return r.json();
}
const prep = (p: Any) => p.getByRole('region', { name: 'Préparation', exact: true });
const crs = (p: Any) => p.getByRole('region', { name: 'Comptes-rendus', exact: true });
const caseTache = (p: Any, n: string) => prep(p).getByRole('checkbox', { name: n, exact: true });
// kanevas-cr-aventure-liste-bloc (B-cr-aventure-4, P-4, E-9 block, E-13 column, AD-cr-aventure-3): a second campaign with an
// arc and a step, one report each, so the counts below do not depend on the 100-report test.
let marches = 0;
let arc = 0;
let etape = 0;
async function monde(p: Any) {
  if (marches) return;
  const fiche = async (sousType: string, titre: string, parent?: number) => {
    const id = (await api(p, 'POST', `/api/univers/${uid}/fiches`, { type: 'aventure', sousType, titre, sections: [{ titre: 'Intrigue' }] })).id;
    if (parent) await api(p, 'PATCH', `/api/univers/${uid}/fiches/${id}`, { parent });
    return id;
  };
  marches = await fiche('Campagne', 'Les Marches de Sel');
  arc = await fiche('Scénario', 'Arc des Marches', marches);
  etape = await fiche('Scénario', 'Étape du gué', arc);
  for (const [c, t] of [[marches, 'CR campagne'], [arc, 'CR arc'], [etape, 'CR étape']] as const) {
    await api(p, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: c, titre: t });
  }
}
const lignes = (p: Any) => crs(p).locator('li');
const ligne = (p: Any, titre: string) => lignes(p).filter({ hasText: titre });

const KO = { status: 500, contentType: 'application/json', body: '{}' };

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = await connexion('Antor');
  lea = await connexion('Léa');
  uid = String((await api(antor.page, 'POST', '/api/univers', { nom: 'Blocs de suivi' })).id);
  await api(antor.page, 'POST', `/api/univers/${uid}/membres`, { username: 'lea', role: 'joueur' });
  couronne = (await api(antor.page, 'POST', `/api/univers/${uid}/fiches`, {
    type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée', sections: [{ titre: 'Présentation', joueursLisent: true }],
  })).id;
  acte2 = (await api(antor.page, 'POST', `/api/univers/${uid}/fiches`, {
    type: 'aventure', sousType: 'Scénario', titre: 'Acte II', sections: [{ titre: 'Intrigue' }],
  })).id;
  await api(antor.page, 'PATCH', `/api/univers/${uid}/fiches/${acte2}`, { parent: couronne });
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

test('Préparation : vide, ajout en Cartes, coche vers « Cochées (1) » repliée sans recharger, décoche', opts, async () => {
  const p = antor.page;
  await p.goto(`/univers/${uid}/fiche/${couronne}`);
  await prep(p).getByText("Rien à préparer pour l'instant.", { exact: true }).waitFor();
  await crs(p).getByText("Aucun compte-rendu pour l'instant.", { exact: true }).waitFor();
  await prep(p).getByLabel('Nouvelle tâche').fill('Plan de la crypte');
  await prep(p).getByLabel('Catégorie').selectOption({ label: 'Cartes' });
  await prep(p).getByRole('button', { name: 'Ajouter', exact: true }).click();
  await caseTache(p, 'Plan de la crypte').waitFor();
  await prep(p).getByRole('heading', { name: 'Cartes', level: 3 }).waitFor();
  assert.equal(await prep(p).getByLabel('Nouvelle tâche').inputValue(), '');
  let rechargements = 0;
  p.on('framenavigated', () => rechargements++);
  await caseTache(p, 'Plan de la crypte').click();
  await prep(p).locator('summary').filter({ hasText: 'Cochées (1)' }).waitFor();
  assert.equal(await prep(p).locator('details').getAttribute('open'), null);
  assert.equal(await caseTache(p, 'Plan de la crypte').count(), 0);
  assert.equal(rechargements, 0);
  await prep(p).locator('summary').click();
  await prep(p).getByRole('button', { name: 'Décocher Plan de la crypte' }).click();
  await caseTache(p, 'Plan de la crypte').waitFor();
  assert.equal(await prep(p).locator('summary').count(), 0);
});

test('« Acte II » porte le même bloc ; en mode Joueur ou en Léa, aucun bloc Préparation', opts, async () => {
  const p = antor.page;
  await p.goto(`/univers/${uid}/fiche/${acte2}`);
  await prep(p).getByLabel('Nouvelle tâche').waitFor();
  await crs(p).getByText("Aucun compte-rendu pour l'instant.", { exact: true }).waitFor();
  await p.getByRole('radio', { name: /Mode Joueur/ }).click();
  await p.getByText(/Aucune section n.est visible des joueurs/).waitFor();
  assert.equal(await prep(p).count(), 0);
  await p.getByRole('radio', { name: /Mode MJ/ }).click();
  await prep(p).getByLabel('Nouvelle tâche').waitFor();

  await lea.page.goto(`/univers/${uid}/fiche/${couronne}`);
  await crs(lea.page).getByText("Aucun compte-rendu pour l'instant.", { exact: true }).waitFor();
  assert.equal(await prep(lea.page).count(), 0);
  assert.equal(await lea.page.getByText('Plan de la crypte').count(), 0);
});

test('Léa écrit « Séance 12 » : le CR s’ouvre avec sa campagne, en tête du bloc et de « Derniers comptes-rendus »', opts, async () => {
  const p = lea.page;
  await p.goto(`/univers/${uid}/fiche/${couronne}`);
  await crs(p).getByRole('button', { name: 'Nouveau compte-rendu', exact: true }).click();
  const d = p.getByRole('dialog');
  await d.getByRole('button', { name: 'Créer', exact: true }).click();
  await d.getByText('Donnez un titre.').waitFor();
  await d.getByLabel('Titre', { exact: true }).fill('Séance 12');
  await d.getByLabel('Texte').fill('Le sceau est brisé.');
  await d.getByRole('button', { name: 'Créer', exact: true }).click();
  await p.getByRole('heading', { name: 'Séance 12', exact: true, level: 1 }).waitFor();
  await p.getByText('Campagne : La Couronne brisée').waitFor();
  await p.goto(`/univers/${uid}/fiche/${couronne}`);
  await crs(p).getByRole('link', { name: /Séance 12/ }).waitFor();
  assert.match(await crs(p).locator('li').first().innerText(), /Séance 12/);
  await p.goto(`/univers/${uid}`);
  await p.getByRole('heading', { name: 'Derniers comptes-rendus', exact: true }).waitFor();
  await p.getByRole('link', { name: /Séance 12/ }).waitFor();
});

test('un CR de « Acte II » montre « Campagne : Acte II » à Antor et jamais la ligne à Léa', opts, async () => {
  const a = antor.page;
  await a.goto(`/univers/${uid}/fiche/${acte2}`);
  await crs(a).getByRole('button', { name: 'Nouveau compte-rendu', exact: true }).click();
  await a.getByRole('dialog').getByLabel('Titre', { exact: true }).fill('Acte II secret');
  await a.getByRole('dialog').getByRole('button', { name: 'Créer', exact: true }).click();
  await a.getByRole('heading', { name: 'Acte II secret', exact: true, level: 1 }).waitFor();
  await a.getByText('Campagne : Acte II').waitFor();
  const chemin = new URL(a.url()).pathname;
  await lea.page.goto(chemin);
  await lea.page.getByRole('heading', { name: 'Acte II secret', exact: true, level: 1 }).waitFor();
  const corps = await lea.page.locator('body').innerText();
  assert.doesNotMatch(corps, /Campagne :/);
  assert.doesNotMatch(corps, /Acte II(?! secret)/);
});

test('bloc en erreur : « Impossible de charger ce bloc. », fiche lisible, « Réessayer » ; « Ajouter » en échec garde la saisie', opts, async () => {
  const p = antor.page;
  const route = `**/api/univers/*/fiches/${couronne}/taches`;
  await p.route(route, (r: Any) => r.fulfill(KO));
  await p.goto(`/univers/${uid}/fiche/${couronne}`);
  await prep(p).getByText('Impossible de charger ce bloc.').waitFor();
  await p.getByRole('heading', { name: 'Présentation', exact: true }).waitFor();
  await crs(p).getByRole('link', { name: /Séance 12/ }).waitFor();
  await p.unroute(route);
  await prep(p).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await caseTache(p, 'Plan de la crypte').waitFor();

  await p.route(route, (r: Any) => (r.request().method() === 'POST' ? r.fulfill(KO) : r.continue()));
  await prep(p).getByLabel('Nouvelle tâche').fill('Garder cette saisie');
  await prep(p).getByRole('button', { name: 'Ajouter', exact: true }).click();
  await prep(p).getByRole('alert').waitFor();
  assert.equal(await prep(p).getByLabel('Nouvelle tâche').inputValue(), 'Garder cette saisie');
  assert.equal(await prep(p).getByText('Garder cette saisie', { exact: true }).count(), 0);
  await p.unroute(route);

  await p.route('**/api/taches/*', (r: Any) => r.fulfill(KO));
  await caseTache(p, 'Plan de la crypte').click();
  await prep(p).getByRole('alert').waitFor();
  assert.equal(await caseTache(p, 'Plan de la crypte').isChecked(), false);
  await p.unroute('**/api/taches/*');
});

test('bloc Comptes-rendus en erreur : isolé, et « Nouveau compte-rendu » en échec garde titre et texte', opts, async () => {
  const p = antor.page;
  const route = `**/api/univers/*/comptes-rendus*`;
  await p.route(route, (r: Any) => r.fulfill(KO));
  await p.goto(`/univers/${uid}/fiche/${couronne}`);
  await crs(p).getByText('Impossible de charger ce bloc.').waitFor();
  await caseTache(p, 'Plan de la crypte').waitFor();
  await p.unroute(route);
  await crs(p).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await crs(p).getByRole('link', { name: /Séance 12/ }).waitFor();

  await p.route(`**/api/univers/*/comptes-rendus`, (r: Any) => (r.request().method() === 'POST' ? r.fulfill(KO) : r.continue()));
  await crs(p).getByRole('button', { name: 'Nouveau compte-rendu', exact: true }).click();
  const d = p.getByRole('dialog');
  await d.getByLabel('Titre', { exact: true }).fill('Brouillon conservé');
  await d.getByLabel('Texte').fill('Ne pas perdre ce texte.');
  await d.getByRole('button', { name: 'Créer', exact: true }).click();
  await d.getByRole('alert').waitFor();
  assert.equal(await d.getByLabel('Titre', { exact: true }).inputValue(), 'Brouillon conservé');
  assert.equal(await d.getByLabel('Texte').inputValue(), 'Ne pas perdre ce texte.');
  await p.unroute(`**/api/univers/*/comptes-rendus`);
  await d.getByRole('button', { name: 'Annuler', exact: true }).click();
});

test('plus de 100 CR : 100 lignes puis « Charger la suite » ; l’échec de la suite garde les 100, le réessai ajoute sans doublon', opts, async () => {
  const p = antor.page;
  for (let i = 1; i <= 100; i++) {
    await api(p, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: couronne, titre: `Journal ${i}` });
  }
  await p.goto(`/univers/${uid}/fiche/${couronne}`);
  const suite = crs(p).getByRole('button', { name: 'Charger la suite', exact: true });
  await suite.waitFor();
  assert.equal(await crs(p).locator('li').count(), 100);
  await p.route('**/api/univers/*/comptes-rendus?*curseur=*', (r: Any) => r.fulfill(KO));
  await suite.click();
  await crs(p).getByText('Impossible de charger la suite.').waitFor();
  assert.equal(await crs(p).locator('li').count(), 100);
  await p.unroute('**/api/univers/*/comptes-rendus?*curseur=*');
  await suite.click();
  await crs(p).getByRole('link', { name: /Séance 12/ }).waitFor();
  // 101 lines of the campaign + the descending line of the scenario « Acte II » (AD-cr-aventure-3)
  assert.equal(await crs(p).locator('li').count(), 102);
  assert.equal(await suite.count(), 0);
});

test('page de la campagne : trois lignes, arc et étape nomment leur scénario en lien, la campagne sans pastille', opts, async () => {
  const p = antor.page;
  await monde(p);
  await p.goto(`/univers/${uid}/fiche/${marches}`);
  await ligne(p, 'CR étape').waitFor();
  assert.equal(await lignes(p).count(), 3);
  assert.equal(await ligne(p, 'CR campagne').locator('.badge-type').count(), 0);
  const pArc = ligne(p, 'CR arc').locator('a.badge-type');
  const pEtape = ligne(p, 'CR étape').locator('a.badge-type');
  assert.equal((await pArc.textContent())?.trim(), 'Arc des Marches');
  assert.equal((await pEtape.textContent())?.trim(), 'Étape du gué');
  assert.ok((await pEtape.boundingBox()).height >= 24, 'pastille de 24 px au moins');
  assert.match(await pArc.getAttribute('href'), new RegExp(`/fiche/${arc}$`));
  await pEtape.click();
  await p.getByRole('heading', { name: 'Étape du gué', level: 1 }).waitFor();
});

test('page d’un scénario : ses lignes seulement, sans pastille ni décompte ni placeholder', opts, async () => {
  const p = antor.page;
  await monde(p);
  await p.goto(`/univers/${uid}/fiche/${etape}`);
  await ligne(p, 'CR étape').waitFor();
  assert.equal(await lignes(p).count(), 1);
  assert.equal(await crs(p).locator('.badge-type').count(), 0);
  const arcPage = `/univers/${uid}/fiche/${arc}`;
  await p.goto(arcPage);
  await ligne(p, 'CR étape').waitFor();
  assert.equal(await lignes(p).count(), 2, 'l’arc liste le sien et celui de l’étape');
  assert.equal(await ligne(p, 'CR arc').locator('.badge-type').count(), 0);
  assert.equal(await ligne(p, 'CR étape').locator('a.badge-type').count(), 1);
  assert.doesNotMatch((await crs(p).textContent()) ?? '', /masqu|caché|\(\d+\)/i);
});

test('E-13 : chaque ligne nomme l’aventure propre', opts, async () => {
  const p = antor.page;
  await monde(p);
  await p.goto(`/univers/${uid}/comptes-rendus`);
  await p.getByRole('link', { name: 'CR étape' }).waitFor();
  const l = (t: string) => p.locator('li.ligne-compte-rendu').filter({ hasText: t });
  assert.equal((await l('CR campagne').locator('a.badge-type').textContent())?.trim(), 'Les Marches de Sel');
  assert.equal((await l('CR arc').locator('a.badge-type').textContent())?.trim(), 'Arc des Marches');
  assert.equal((await l('CR étape').locator('a.badge-type').textContent())?.trim(), 'Étape du gué');
});

test('aucune exception navigateur sur le parcours', opts, () => {
  assert.deepEqual(errors, []);
});
