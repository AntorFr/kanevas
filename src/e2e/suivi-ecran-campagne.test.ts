// Black-box tests of kanevas-suivi-ecran-campagne, written from its exit criterion and
// docs/ecrans.md « E-6 Campagne » / « E-7 Scénario ». Real server in stub mode + real Chromium.
// Expected texts are literals from the doc.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';
import { changerStatut, declencheurStatut, ouvrirNouveauScenario, statutAffiche } from './suivi-aide.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = '';
let urlScenario = '';
let urlCampagne = '';

const NOM = 'La Couronne brisée';
const PERIME =
  "Ce scénario a changé depuis que vous l'avez ouvert. Rechargez-le pour voir la nouvelle version ; votre texte reste ci-dessous.";

/** Position of `a` before `b` in the page text. */
const avant = (t: string, a: string, b: string) => t.indexOf(a) >= 0 && t.indexOf(a) < t.indexOf(b);

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = await connecte(browser, srv.base, 'Léa');
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Suivi');
  await antor.getByRole('heading', { name: 'Suivi', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('MJ : crée la campagne, la passe Active en place, la page, le scénario, la tâche cochée/décochée', opts, async () => {
  await antor.getByRole('link', { name: rxExact('Campagnes') }).click();
  await antor.getByText(rx('Aucune campagne pour l\'instant.')).waitFor();
  await antor.getByLabel('Nom', { exact: true }).fill(NOM);
  await antor.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await antor.getByRole('link', { name: rx(NOM) }).waitFor();
  assert.match(await texte(antor), /En préparation/);
  await antor.screenshot({ path: '/tmp/e6-liste.png' });

  await changerStatut(antor, 'Active', NOM);
  await attendre(antor);
  await antor.reload();
  await antor.getByRole('link', { name: rx(NOM) }).waitFor();
  assert.equal(await statutAffiche(antor, NOM), 'Active');

  await antor.getByRole('link', { name: rx(NOM) }).click();
  await antor.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  urlCampagne = new URL(antor.url()).pathname;
  assert.match(urlCampagne, new RegExp(`/univers/${uid}/campagnes/\\d+$`));
  const t0 = await texte(antor);
  for (const s of ['Scénarios', 'Préparation', 'Comptes-rendus', 'Aucun scénario pour l\'instant.', 'Rien à préparer pour l\'instant.', 'Aucun compte-rendu pour l\'instant.'])
    assert.ok(t0.includes(s), `« ${s} » attendu`);
  await antor.screenshot({ path: '/tmp/e6-page-vide.png' });

  // scenario
  await ouvrirNouveauScenario(antor);
  await antor.getByLabel('Titre', { exact: true }).first().fill('Acte II — Le sceau brisé');
  await antor.getByRole('button', { name: rxExact('Créer le scénario') }).click();
  await antor.getByRole('heading', { name: 'Acte II — Le sceau brisé', level: 1 }).waitFor();
  urlScenario = new URL(antor.url()).pathname;
  assert.match(urlScenario, new RegExp(`/univers/${uid}/scenarios/\\d+$`));
  await antor.getByText(rx('Rien d\'écrit pour l\'instant.')).waitFor();
  assert.ok(await antor.getByRole('link', { name: rx(`← ${NOM}`) }).count());
  await antor.getByRole('button', { name: rxExact('Modifier') }).click();
  await antor.getByLabel('Contenu').fill('<b>gras</b> & suite');
  await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await antor.getByText('<b>gras</b> & suite').waitFor(); // plain text (AD-58)
  assert.equal(await antor.locator('main b').count(), 0);
  // wait for the edit to be left (PUT answered, draft removed) before cutting the page
  await antor.getByRole('button', { name: rxExact('Modifier') }).waitFor();
  await antor.reload();
  await antor.getByText('<b>gras</b> & suite').waitFor();
  await antor.screenshot({ path: '/tmp/e7-ecrit.png' });

  // task
  await antor.getByRole('link', { name: rx(`← ${NOM}`) }).click();
  await antor.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  await antor.getByRole('textbox', { name: 'Nouvelle tâche' }).fill('Plan de la crypte');
  await antor.getByLabel('Catégorie').selectOption({ label: 'Cartes' });
  await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
  const case_ = antor.getByRole('checkbox', { name: rx('Plan de la crypte') });
  await case_.waitFor();
  let t = await texte(antor);
  assert.ok(avant(t, 'Cartes', 'Plan de la crypte'));
  assert.ok(!t.includes('Cochées'));
  await case_.click();
  await antor.getByText('Cochées (1)').waitFor();
  t = await texte(antor);
  assert.ok(t.includes('Rien à préparer pour l\'instant.'));
  assert.ok(t.includes('Décocher'));
  await antor.screenshot({ path: '/tmp/e6-cochee.png' });
  await antor.getByRole('button', { name: rxExact('Décocher') }).or(antor.getByRole('link', { name: rxExact('Décocher') })).click();
  await antor.getByRole('checkbox', { name: rx('Plan de la crypte') }).waitFor();
  t = await texte(antor);
  assert.ok(!t.includes('Cochées'));
  assert.ok(!t.includes('Rien à préparer'));
  assert.ok(avant(t, 'Cartes', 'Plan de la crypte'));
});

test('Joueuse : voit nom et statut, ni Scénarios ni Préparation ; adresse du scénario introuvable', opts, async () => {
  const page = lea.page;
  await page.goto(urlCampagne);
  await page.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  await attendre(page);
  const t = await texte(page);
  assert.ok(t.includes('Active'));
  assert.ok(t.includes('Comptes-rendus'));
  for (const s of ['Scénarios', 'Préparation', 'Acte II', 'Plan de la crypte', 'Cochées', 'Nouveau scénario'])
    assert.ok(!t.includes(s), `« ${s} » ne doit pas être visible d'un joueur`);
  assert.equal(await declencheurStatut(page).count(), 0);
  await page.screenshot({ path: '/tmp/e6-joueur.png' });
  await page.goto(urlScenario);
  await page.getByText('Page introuvable.').waitFor();
  assert.ok(!(await texte(page)).includes('Acte II'));
  await page.screenshot({ path: '/tmp/e7-joueur.png' });
  // an unknown campaign
  await page.goto(`/univers/${uid}/campagnes/99999`);
  await page.getByText('Page introuvable.').waitFor();
  // the sidebar item exists for a player
  await page.goto(`/univers/${uid}`);
  await page.getByRole('link', { name: rxExact('Campagnes') }).waitFor();
});

test('statut Terminée : le badge de la liste de Léa le dit, dernier groupe', opts, async () => {
  const c2 = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: 'Aaa Préparation' });
  assert.equal(c2.status, 201);
  const c3 = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: 'Zzz Active' });
  await api(antor, 'PATCH', `/api/campagnes/${c3.body.id}`, { statut: 'active' });
  const page = lea.page;
  await page.goto(`/univers/${uid}/campagnes`);
  await page.getByRole('link', { name: rx(NOM) }).waitFor();
  assert.equal(await declencheurStatut(page).count(), 0);
  let t = await texte(page);
  assert.ok(avant(t, NOM, 'Zzz Active'), 'actives par nom');
  assert.ok(avant(t, 'Zzz Active', 'Aaa Préparation'), 'actives avant préparation');
  await page.screenshot({ path: '/tmp/e6-liste-joueur.png' });

  await antor.goto(`/univers/${uid}/campagnes`);
  await antor.getByRole('link', { name: rx(NOM) }).waitFor();
  const ligne = antor.getByRole('listitem').filter({ hasText: NOM });
  await changerStatut(antor, 'Terminée', NOM, ligne);
  await attendre(antor);
  await page.reload();
  await page.getByRole('link', { name: rx(NOM) }).waitFor();
  t = await texte(page);
  assert.ok(avant(t, 'Aaa Préparation', NOM), 'terminée en dernier groupe');
  assert.ok(avant(t, 'Zzz Active', 'Aaa Préparation'));
  assert.match(await page.getByRole('listitem').filter({ hasText: NOM }).innerText(), /Terminée/);
  // a finished campaign keeps its panels and takes reports (doc)
  await antor.goto(urlCampagne);
  await antor.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  assert.ok((await texte(antor)).includes('Scénarios'));
});

test('écriture de scénario périmée : message, texte conservé, rechargement', opts, async () => {
  const onglet2 = await antor.context().newPage();
  await antor.goto(urlScenario);
  await onglet2.goto(urlScenario);
  await antor.getByRole('button', { name: rxExact('Modifier') }).click();
  await onglet2.getByRole('button', { name: rxExact('Modifier') }).click();
  await antor.getByLabel('Contenu').fill('version A');
  await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await antor.getByText('version A').waitFor();
  await onglet2.getByLabel('Contenu').fill('version B périmée');
  await onglet2.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await onglet2.getByText(rx(PERIME)).waitFor();
  assert.equal(await onglet2.getByLabel('Contenu').inputValue(), 'version B périmée');
  await onglet2.screenshot({ path: '/tmp/e7-perime.png' });
  await onglet2.getByRole('button', { name: rxExact('Recharger le scénario') }).click();
  await attendre(onglet2);
  assert.ok(!(await texte(onglet2)).includes(PERIME));
  await onglet2.close();
});

test('compte-rendu : Léa publie et arrive sur E-9 ; la liste le montre, bornes de saisie', opts, async () => {
  const page = lea.page;
  await page.goto(urlCampagne);
  await page.getByText(rx('Aucun compte-rendu à lire pour l\'instant.')).waitFor();
  await page.getByRole('button', { name: rxExact('Nouveau compte-rendu') }).click();
  const f = page.getByRole('dialog');
  await f.getByLabel('Titre').fill('');
  await f.getByRole('button', { name: rxExact('Publier') }).click();
  await f.getByText('Erreur : le titre est obligatoire.').waitFor();
  await f.getByLabel('Titre').fill('x'.repeat(121));
  await f.getByRole('button', { name: rxExact('Publier') }).click();
  await f.getByText('Erreur : 120 caractères au plus.').waitFor();
  await f.getByLabel('Titre').fill('La crypte');
  await f.getByLabel('Texte').fill('Ils descendent.');
  await page.screenshot({ path: '/tmp/e6-cr-fenetre.png' });
  await f.getByRole('button', { name: rxExact('Publier') }).click();
  await page.getByRole('heading', { name: 'La crypte', level: 1 }).waitFor();
  assert.match(new URL(page.url()).pathname, new RegExp(`^/univers/${uid}/fiche/`));
  await page.goto(urlCampagne);
  await page.getByRole('link', { name: rx('La crypte') }).waitFor();
  assert.ok((await texte(page)).includes('lea'));
});

test('contenu long : 101 campagnes, 101 comptes-rendus avec « Charger la suite »', opts, async () => {
  const camp = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: 'Pleine' });
  for (let i = 0; i < 100; i++) {
    const r = await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: camp.body.id, titre: `CR ${String(i).padStart(3, '0')}` });
    assert.equal(r.status, 201);
  }
  const r = await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: camp.body.id, titre: 'CR 100 ' + 'long '.repeat(22) });
  assert.equal(r.status, 201);
  await antor.goto(`/univers/${uid}/campagnes/${camp.body.id}`);
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).waitFor();
  assert.equal(await antor.getByRole('link', { name: rx('CR ') }).count(), 100);
  await antor.screenshot({ path: '/tmp/e6-cr-100.png' });
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
  await antor.getByRole('link', { name: rx('CR 000') }).waitFor();
  await antor.waitForFunction(() => document.querySelectorAll('main a').length > 100);
  assert.equal(await antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);

  for (let i = 0; i < 100; i++) {
    const c = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: `Camp ${String(i).padStart(3, '0')}` });
    assert.equal(c.status, 201);
  }
  await lea.page.goto(`/univers/${uid}/campagnes`);
  await lea.page.getByRole('link', { name: rx('Camp 099') }).waitFor();
  assert.equal(await lea.page.getByRole('link', { name: rx('Camp 000') }).count(), 1);
  await lea.page.screenshot({ path: '/tmp/e6-100.png' });
});

test('saisie : bornes du nom de campagne, de la tâche', opts, async () => {
  await antor.goto(`/univers/${uid}/campagnes`);
  await antor.getByRole('textbox', { name: /^Nom/ }).waitFor({ timeout: 20000 });
  await antor.getByRole('textbox', { name: /^Nom/ }).fill('');
  await antor.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await antor.getByText('Erreur : le nom est obligatoire.').waitFor();
  await antor.getByRole('textbox', { name: /^Nom/ }).fill('n'.repeat(81));
  await antor.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await antor.getByText('Erreur : 80 caractères au plus.').waitFor();
  await antor.goto(urlCampagne);
  await antor.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
  await antor.getByText('Erreur : le libellé est obligatoire.').waitFor();
  await antor.getByRole('textbox', { name: 'Nouvelle tâche' }).fill('l'.repeat(201));
  await antor.getByRole('button', { name: rxExact('Ajouter') }).click();
  await antor.getByText('Erreur : 200 caractères au plus.').waitFor();
});

test('états : chargement, erreur avec Réessayer, panneau en échec isolé, connexion perdue', opts, async () => {
  const page = antor;
  // loading: the list API is slow
  await page.route(`**/api/univers/${uid}/campagnes`, async (r: Any) => {
    await new Promise((ok) => setTimeout(ok, 1500));
    await r.continue();
  });
  await page.goto(`/univers/${uid}/campagnes`);
  await page.getByText('Chargement des campagnes…').waitFor();
  await page.screenshot({ path: '/tmp/e6-chargement.png' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await attendre(page);

  // error: the list fails, then comes back on « Réessayer »
  let casse = true;
  await page.route(`**/api/univers/${uid}/campagnes`, (r: Any) => (casse ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
  await page.goto(`/univers/${uid}/campagnes`);
  await page.getByText('Impossible de charger les campagnes.').waitFor();
  await page.screenshot({ path: '/tmp/e6-erreur.png' });
  casse = false;
  await page.getByRole('button', { name: rxExact('Réessayer') }).click();
  await page.getByRole('link', { name: rx(NOM) }).waitFor();
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // one panel only fails: the rest of the page stays
  await page.route('**/api/campagnes/*/taches', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await page.goto(urlCampagne);
  await page.getByText('Impossible de charger ce panneau.').waitFor();
  const t = await texte(page);
  assert.ok(t.includes(NOM) && t.includes('Scénarios') && t.includes('Comptes-rendus'));
  await page.screenshot({ path: '/tmp/e6-panneau-erreur.png' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // whole campaign unreadable
  await page.route(`**/api/univers/${uid}/campagnes/*`, (r: Any) => (r.request().url().includes('comptes-rendus') ? r.continue() : r.fulfill({ status: 500, body: '{}' })));
  await page.goto(urlCampagne);
  await page.getByText('Impossible de charger cette campagne.').waitFor();
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // connection lost: banner, writing controls disabled
  await page.goto(urlCampagne);
  await page.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  await attendre(page);
  await page.context().setOffline(true);
  await page.getByText(/Connexion perdue/).waitFor({ timeout: 30000 });
  assert.ok(await page.getByRole('button', { name: rxExact('Ajouter') }).isDisabled());
  assert.ok(await page.getByRole('button', { name: 'Nouveau scénario', exact: true }).isDisabled());
  await declencheurStatut(page).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Terminée', exact: true }).getAttribute('aria-disabled'), 'true');
  await page.screenshot({ path: '/tmp/e6-hors-ligne.png' });
  await page.context().setOffline(false);
});
