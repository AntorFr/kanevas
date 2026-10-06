// Black-box tests of kanevas-rv-lore-suivi, from its exit criterion and docs/ecrans.md § « Partout »:
// every successful action on E-6, E-7, E-8, E-13 gives its toast (gabarit « « <objet> » <participe> »),
// a failure gives none, and the toast never takes the focus. Real server in stub mode + Chromium.
// Panne visée : un toast retiré ou posé avant la réponse du serveur ; un toast perdu par la navigation.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  rxExact,
  skipBrowser,
  startServer,
} from './harnais.test.js';
import { changerStatut, ouvrirNouveauScenario } from './suivi-aide.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let p: Any;

const toastDe = (page: Any, texte: string) => page.locator('.toasts .toast').filter({ hasText: texte });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  p = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(p, 'Toasts suivi');
  await p.getByRole('heading', { name: 'Toasts suivi', level: 1 }).waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-8 : créer une fiche donne « « Brenn » créée »', opts, async () => {
  await creerFiche(p, 'personnage', 'Brenn');
  await toastDe(p, '« Brenn » créée').waitFor();
});

test('E-6/E-7/E-13 : chaque action réussie a son toast, sans prendre le focus', opts, async () => {
  await p.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Campagnes') }).click();
  await p.getByLabel('Nom', { exact: true }).fill('Camp toast');
  await p.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await toastDe(p, '« Camp toast » créée').waitFor();

  await changerStatut(p, 'Active', 'Camp toast');
  await toastDe(p, '« Camp toast » enregistrée').waitFor();

  await p.getByRole('link', { name: 'Camp toast' }).click();
  await p.getByRole('heading', { name: 'Camp toast', level: 1 }).waitFor();
  await ouvrirNouveauScenario(p);
  await p.getByLabel('Titre', { exact: true }).first().fill('Acte toast');
  await p.getByRole('button', { name: rxExact('Créer le scénario') }).click();
  await p.getByRole('heading', { name: 'Acte toast', level: 1 }).waitFor();
  await toastDe(p, '« Acte toast » créé').waitFor(); // survives the navigation to E-7

  await p.getByRole('button', { name: rxExact('Modifier') }).click();
  await p.getByLabel('Contenu').fill('texte');
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await toastDe(p, '« Acte toast » enregistré').waitFor();

  await p.getByRole('link', { name: /← Camp toast/ }).click();
  await p.getByRole('heading', { name: 'Camp toast', level: 1 }).waitFor();
  await p.getByRole('form', { name: 'Nouvelle tâche' }).getByRole('textbox').fill('Plan toast');
  await p.getByRole('button', { name: rxExact('Ajouter') }).click();
  await toastDe(p, '« Plan toast » ajoutée').waitFor();
  const focusAvant = await p.evaluate(() => document.activeElement?.tagName);
  await p.getByRole('checkbox', { name: /Plan toast/ }).click();
  await toastDe(p, '« Plan toast » cochée').waitFor();
  assert.ok(await p.evaluate(() => !document.activeElement?.closest('.toasts')), `focus not in a toast (was ${focusAvant})`);
  await p.getByRole('button', { name: rxExact('Décocher') }).or(p.getByRole('link', { name: rxExact('Décocher') })).click();
  await toastDe(p, '« Plan toast » décochée').waitFor();

  await p.getByRole('button', { name: rxExact('Nouveau compte-rendu') }).click();
  const f = p.getByRole('dialog');
  await f.getByLabel('Titre').fill('Séance toast');
  await f.getByRole('button', { name: rxExact('Publier') }).click();
  await p.getByRole('heading', { name: 'Séance toast', level: 1 }).waitFor();
  await toastDe(p, '« Séance toast » publié').waitFor();
});

test('échec d\'écriture : aucun toast de réussite, message en ligne', opts, async () => {
  await p.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Campagnes') }).click();
  await attendre(p);
  await p.route('**/api/**', (r: Any) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  await p.getByLabel('Nom', { exact: true }).fill('Camp échec');
  await p.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await p.getByText(/n'a pas abouti|n’a pas abouti/).first().waitFor();
  assert.equal(await toastDe(p, 'Camp échec').count(), 0);
  await p.unroute('**/api/**');
});
