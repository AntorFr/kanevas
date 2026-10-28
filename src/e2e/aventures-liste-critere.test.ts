// Black-box tests of kanevas-scenarios-type-liste (E-8 « Aventures », E-17 badge), written from the task's
// exit criterion and docs/ecrans.md. Real server in stub mode + real Chromium; expected values are literals.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
const barre = (p: Any) => p.getByRole('complementary', { name: 'Barre latérale' });
async function ouvrirAventures(p: Any): Promise<void> {
  await barre(p).getByRole('link', { name: 'Aventures', exact: true }).click();
  await p.waitForURL(/fiches\/aventures/);
  await attendre(p);
}
async function charge(p: Any): Promise<void> {
  await attendre(p);
  await p.getByText('Chargement des fiches…').waitFor({ state: 'detached' });
}
const SHOTS = '/tmp/kanevas-aventures-liste-shots';
const shot = (p: Any, nom: string) => p.screenshot({ path: `${SHOTS}/${nom}.png` });
const corps = async (p: Any): Promise<string> => ((await p.locator('body').innerText()) as string).replace(/’/g, "'");
const noeud = (p: Any, titre: string) => p.getByRole('tree').getByRole('treeitem').filter({ hasText: titre }).first();

mkdirSync('/tmp/kanevas-aventures-liste-shots', { recursive: true });
describe('kanevas-scenarios-type-liste, E-8 Aventures', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    // The seed carries « La Couronne brisée » and its scenario (AD-126): this suite starts from an empty universe.
    for (const f of (await api(antor, 'GET', `/api/univers/${U}/fiches?type=aventure`)).fiches) {
      await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f.id}`);
    }
    for (const f of (await api(antor, 'GET', `/api/univers/${U}/fiches?type=compte_rendu`)).fiches) {
      await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f.id}`);
    }
    await antor.goto(`/univers/${U}`);
    await lea.goto(`/univers/${U}`);
    await attendre(antor);
    await attendre(lea);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  let idCampagne = 0;

  test('Antor : « Aventures » dans la barre, vide, puis crée la campagne (Visible décoché) et E-9 s’ouvre', async () => {
    await ouvrirAventures(antor);
    await antor.getByText(/Aucune aventure pour l[’']instant\./).first().waitFor();
    await antor.getByRole('button', { name: 'Nouvelle aventure' }).first().click();
    const f = antor.getByRole('dialog');
    assert.equal(await f.getByLabel(/Visible des joueurs/).isChecked(), false, 'décochée par défaut');
    await f.getByLabel('Titre').fill('La Couronne brisée');
    await shot(antor, 'creation');
    await f.getByLabel(/Sous-type/).fill('Campagne');
    const posts: string[] = [];
    antor.on('request', (r: Any) => { if (r.method() !== 'GET') posts.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await f.getByRole('button', { name: "Créer l'aventure" }).click();
    await antor.waitForURL(/\/fiche\/\d+/);
    idCampagne = Number(/fiche\/(\d+)/.exec(antor.url())![1]);
    assert.equal(posts.length, 1, `un seul appel d'écriture : ${posts.join(' | ')}`);
    assert.match(posts[0]!, /^POST /);
    await antor.getByText('Présentation').first().waitFor();
    const fiche = await api(antor, 'GET', `/api/univers/${U}/fiches/${idCampagne}`);
    assert.equal(fiche.charge.statut, 'en_preparation');
    const sec = fiche.sections.find((s: Any) => s.titre === 'Présentation');
    assert.ok(sec, 'section Présentation');
    assert.equal(sec.audience.joueursLisent, false);
  });

  test('Léa : « Aucune aventure à voir pour l’instant. » tant que rien n’est ouvert', async () => {
    await ouvrirAventures(lea);
    await lea.getByText(/Aucune aventure à voir pour l[’']instant\./).first().waitFor();
  });

  test('Antor : crée le scénario « Dans » la campagne ; elle est sous la campagne dans l’arbre', async () => {
    await ouvrirAventures(antor);
    await antor.getByRole('button', { name: 'Nouvelle aventure' }).first().click();
    const f = antor.getByRole('dialog');
    await f.getByLabel('Titre').fill('Acte II — Le sceau brisé');
    await f.getByLabel(/Sous-type/).fill('Scénario');
    await f.getByRole('radio', { name: 'La Couronne brisée' }).check();
    await f.getByRole('button', { name: "Créer l'aventure" }).click();
    await antor.waitForURL((u: URL) => /\/fiche\/\d+$/.test(u.pathname) && !u.pathname.endsWith(`/${idCampagne}`));
    const id = Number(/fiche\/(\d+)/.exec(antor.url())![1]);
    const fiche = await api(antor, 'GET', `/api/univers/${U}/fiches/${id}`);
    assert.equal(fiche.ancetres.at(-1)?.id, idCampagne);
    await ouvrirAventures(antor);
    await antor.getByRole('tree').waitFor();
    await noeud(antor, 'La Couronne brisée').getByRole('button', { name: 'Déplier' }).click();
    await noeud(antor, 'Acte II — Le sceau brisé').waitFor();
  });

  test('statut en place : l’écran attend le serveur avant le nouveau badge (carte puis ligne d’arbre)', async () => {
    await ouvrirAventures(antor);
    // card: switch to grid
    await antor.getByRole('button', { name: 'Grille', exact: true }).click();
    const carte = antor.getByRole('button', { name: /changer le statut de « La Couronne brisée »/ });
    assert.match(await carte.innerText(), /En préparation/);
    let liberer: () => void = () => {};
    const bloque = new Promise<void>((r) => { liberer = r; });
    await antor.route('**/api/univers/*/fiches/*', async (route: Any) => {
      if (route.request().method() === 'PATCH') await bloque;
      await route.continue();
    });
    await carte.click();
    await shot(antor, 'menu-carte');
    await antor.getByRole('menuitem', { name: 'En cours' }).click();
    await antor.waitForTimeout(400);
    await shot(antor, 'carte-en-attente');
    assert.match(await carte.innerText(), /En préparation/, 'ancien badge tant que le serveur n’a pas répondu');
    assert.doesNotMatch(await carte.innerText(), /En cours/);
    liberer();
    await antor.getByRole('button', { name: /changer le statut de « La Couronne brisée »/ }).filter({ hasText: 'En cours' }).waitFor();
    await antor.unroute('**/api/univers/*/fiches/*');
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${idCampagne}`)).charge.statut, 'en_cours');

    // tree line of the scenario
    await antor.getByRole('button', { name: 'Arbre', exact: true }).click();
    await noeud(antor, 'La Couronne brisée').getByRole('button', { name: 'Déplier' }).click();
    const ligne = noeud(antor, 'Acte II — Le sceau brisé');
    await ligne.getByRole('button', { name: /changer le statut de « Acte II/ }).click();
    await antor.getByRole('menuitem', { name: 'Prête' }).click();
    await ligne.getByText('Prête').waitFor();
  });

  test('échec du serveur : message et badge inchangé', async () => {
    await ouvrirAventures(antor);
    await antor.getByRole('button', { name: 'Grille', exact: true }).click();
    const carte = antor.getByRole('button', { name: /changer le statut de « La Couronne brisée »/ });
    await antor.route('**/api/univers/*/fiches/*', (route: Any) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }) : route.continue());
    await carte.click();
    await antor.getByRole('menuitem', { name: 'Terminée' }).click();
    await antor.getByText(/L[’']action n[’']a pas abouti\. Réessayez\./).first().waitFor();
    await shot(antor, 'echec');
    assert.match(await carte.innerText(), /En cours/);
    assert.doesNotMatch(await carte.innerText(), /Terminée/);
    await antor.unroute('**/api/univers/*/fiches/*');
  });

  test('filtre « Statut » ▸ « En cours » : seulement la campagne, grille, adresse ?statut=en_cours', async () => {
    await ouvrirAventures(antor);
    await antor.getByRole('button', { name: 'Arbre', exact: true }).click();
    await antor.getByLabel('Statut').selectOption({ label: 'En cours' });
    await antor.waitForURL(/statut=en_cours/);
    await charge(antor);
    assert.equal(await antor.getByRole('tree').count(), 0, 'la grille remplace l’arbre');
    const t = await antor.getByRole('main').innerText();
    assert.match(t, /La Couronne brisée/);
    assert.doesNotMatch(t, /Acte II/);
    // unknown value ignored
    await antor.goto(`/univers/${U}/fiches/aventures?statut=nimporte`);
    await antor.getByText('La Couronne brisée').first().waitFor();
    assert.match(await corps(antor), /La Couronne brisée/);
    // status alone, empty
    await antor.goto(`/univers/${U}/fiches/aventures?statut=terminee`);
    await charge(antor);
    assert.match(await corps(antor), /Aucune aventure avec ce statut\./);
    await shot(antor, 'statut-vide');
  });

  test('Léa : voit la campagne ouverte « · En cours », jamais « Acte II », aucun menu ; sa recherche porte le badge', async () => {
    const fiche = await api(antor, 'GET', `/api/univers/${U}/fiches/${idCampagne}`);
    const sec = fiche.sections.find((s: Any) => s.titre === 'Présentation');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${idCampagne}/sections/${sec.id}`, { joueursLisent: true });
    await ouvrirAventures(lea);
    await lea.getByRole('button', { name: 'Grille', exact: true }).click();
    await charge(lea);
    const t = await corps(lea);
    assert.match(t, /La Couronne brisée/);
    assert.match(t, /En cours/);
    assert.doesNotMatch(t, /Acte II/);
    assert.equal(await lea.getByRole('button', { name: /changer le statut de/ }).count(), 0);
    await shot(lea, 'lea-grille');
    await lea.getByRole('button', { name: 'Arbre', exact: true }).click();
    await lea.getByRole('tree').waitFor();
    await charge(lea);
    assert.equal(await lea.getByRole('button', { name: /changer le statut de/ }).count(), 0);
    assert.doesNotMatch(await corps(lea), /Acte II/);
    // search (E-17)
    const res = await api(lea, 'GET', `/api/univers/${U}/fiches?type=aventure&q=Couronne`);
    assert.ok(res.fiches.some((f: Any) => f.titre === 'La Couronne brisée' && f.charge.statut === 'en_cours'));
    await lea.goto(`/univers/${U}/recherche?q=Couronne`);
    await lea.getByText('La Couronne brisée').first().waitFor();
    const r = await corps(lea);
    assert.match(r, /La Couronne brisée/);
    assert.match(r, /En cours/);
    assert.equal(await lea.getByRole('button', { name: /changer le statut de/ }).count(), 0);
  });

  test('Antor en mode Joueur : pas de menu de statut ni de « Nouvelle aventure »', async () => {
    await ouvrirAventures(antor);
    await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
    await charge(antor);
    await antor.getByText('La Couronne brisée').first().waitFor();
    await antor.getByRole('button', { name: 'Nouvelle aventure' }).waitFor({ state: 'detached' });
    assert.doesNotMatch(await antor.getByRole('main').innerText(), /Acte II/);
    assert.equal(await antor.getByRole('button', { name: /changer le statut de/ }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: 'Nouvelle aventure' }).count(), 0);
  });
});
