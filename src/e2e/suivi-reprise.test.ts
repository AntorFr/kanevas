// Black-box tests of the V5 rework of kanevas-rv-lore-suivi (E-6 page),
// from docs/ecrans.md § E-6 (« statut, scénarios et « Nouveau scénario » ») .
// Panne visée : statut redevenu un select natif ; formulaire de scénario ouvert d'office ;
// pastille « Campagne » ou ligne « Statut » absentes .
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, ajouterMembre, allerMembres, connecte, creerUnivers, launch, rxExact, skipBrowser, startServer } from './harnais.test.js';
import { declencheurStatut } from './suivi-aide.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = '';
let url = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = await connecte(browser, srv.base, 'Léa');
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Reprise');
  await antor.getByRole('heading', { name: 'Reprise', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
  const r = await antor.request.post(`/api/univers/${uid}/campagnes`, { data: { nom: 'Camp reprise' } });
  url = `/univers/${uid}/campagnes/${(await r.json()).id}`;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-6 page MJ : pastille Campagne, ligne Statut en menu, aucun select natif, formulaires repliés', opts, async () => {
  await antor.goto(url);
  await antor.getByRole('heading', { name: 'Camp reprise', level: 1 }).waitFor();
  const main = antor.locator('main');
  assert.equal(await main.getByText('Campagne', { exact: true }).count(), 1);
  assert.equal(await main.getByText('Statut', { exact: true }).count(), 1);
  assert.equal(await main.locator('select:visible').count(), 1, 'seul « Catégorie » reste une liste');
  assert.equal(await declencheurStatut(antor, 'Camp reprise').getAttribute('aria-haspopup'), 'menu');
  await declencheurStatut(antor, 'Camp reprise').click();
  assert.deepEqual((await antor.getByRole('menuitem').allInnerTexts()).sort(), ['Active', 'En préparation', 'Terminée']);
  await antor.keyboard.press('Escape');
  // « Nouveau scénario » is a button; the form is closed until it is pressed, then Annuler closes it.
  assert.equal(await antor.getByRole('form', { name: 'Nouveau scénario' }).count(), 0);
  await antor.getByRole('button', { name: 'Nouveau scénario', exact: true }).click();
  const f = antor.getByRole('form', { name: 'Nouveau scénario' });
  assert.equal(await f.getByLabel('Titre').getAttribute('placeholder'), '1 à 120 caractères');
  await f.getByRole('button', { name: rxExact('Annuler') }).click();
  assert.equal(await antor.getByRole('form', { name: 'Nouveau scénario' }).count(), 0);
  assert.equal(await antor.getByRole('textbox', { name: 'Nouvelle tâche' }).getAttribute('placeholder'), '1 à 200 caractères');
});

test('E-6 page Joueur : pastille de statut seule, aucun menu', opts, async () => {
  const page = lea.page;
  await page.goto(url);
  await page.getByRole('heading', { name: 'Camp reprise', level: 1 }).waitFor();
  assert.equal(await page.locator('main').getByText('En préparation', { exact: true }).count(), 1);
  assert.equal(await page.locator('main [aria-haspopup="menu"]').count(), 0);
});
