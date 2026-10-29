// Black-box tests of kanevas-scenarios-type-fiche (E-9 « Statut » line, « Contient », « Déplacer sous… » for an
// adventure, B-59), written from the task's exit criterion. Real server in stub mode + real Chromium.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-aventure-fiche-shots';
mkdirSync(SHOTS, { recursive: true });
const PERDU = /Connexion perdue\./;
const ECHEC = /L[’']action n[’']a pas abouti\. Réessayez\./;
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let camp = 0;
let autre = 0;
let scen = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}: ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
const shot = (p: Any, nom: string) => p.screenshot({ path: `${SHOTS}/${nom}.png` });
const ligne = (p: Any) => p.locator('.ligne-statut-aventure');
async function ouvrir(p: Any, id: number, titre: string): Promise<void> {
  await p.goto(`/univers/${U}/fiche/${id}`);
  await p.getByRole('heading', { name: titre, level: 1 }).waitFor();
}
const declencheur = (p: Any, titre: string) => p.getByRole('button', { name: new RegExp(`changer le statut de « ${titre}`) });

describe('kanevas-scenarios-type-fiche, E-9 aventure', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'GET', '/api/univers')).find((u: Any) => u.nom === "Lame d'Ébène").id;
    // The seed now carries its own « La Couronne brisée » (AD-126): this test builds its own, so drop the seeded ones.
    for (const f of (await api(antor, 'GET', `/api/univers/${U}/fiches?type=aventure`)).fiches ?? []) {
      await api(antor, 'DELETE', `/api/univers/${U}/fiches/${f.id}`);
    }
    const mk = async (titre: string, extra: object = {}) =>
      (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'aventure', titre, ...extra })).id as number;
    camp = await mk('La Couronne brisée', { sections: [{ titre: 'Présentation', joueursLisent: false }] });
    autre = await mk('Les Landes noires');
    scen = await mk('Acte II — Le sceau brisé', { parent: camp });
    await antor.goto(`/univers/${U}`);
    await lea.goto(`/univers/${U}`);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor : « Statut : En préparation » sous le titre, le serveur est attendu avant « En cours », sans recharger la fiche', async () => {
    await ouvrir(antor, camp, 'La Couronne brisée');
    await ligne(antor).waitFor();
    assert.match(await ligne(antor).innerText(), /Statut :\s*En préparation/);
    let navigations = 0;
    antor.on('framenavigated', () => navigations++);
    let liberer: () => void = () => {};
    const bloque = new Promise<void>((r) => { liberer = r; });
    await antor.route('**/api/univers/*/fiches/*', async (route: Any) => {
      if (route.request().method() === 'PATCH') await bloque;
      await route.continue();
    });
    await declencheur(antor, 'La Couronne brisée').click();
    await antor.getByRole('menuitem', { name: 'En cours' }).click();
    await antor.waitForTimeout(400);
    assert.match(await ligne(antor).innerText(), /En préparation/, 'ancien statut tant que le serveur n’a pas répondu');
    liberer();
    await ligne(antor).getByText('En cours').waitFor();
    await antor.unroute('**/api/univers/*/fiches/*');
    await shot(antor, 'statut-en-cours');
    assert.equal(navigations, 0, 'la fiche n’est pas rechargée');
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${camp}`)).charge.statut, 'en_cours');
    antor.removeAllListeners('framenavigated');
  });

  test('le statut posé depuis la fiche se lit dans la liste (carte) et dans l’arbre, après retour', async () => {
    await antor.goto(`/univers/${U}/fiches/aventures`);
    await antor.getByRole('button', { name: 'Grille', exact: true }).click();
    await declencheur(antor, 'La Couronne brisée').filter({ hasText: 'En cours' }).waitFor();
    await antor.getByRole('button', { name: 'Arbre', exact: true }).click();
    const n = antor.getByRole('tree').getByRole('treeitem').filter({ hasText: 'La Couronne brisée' }).first();
    await n.getByText('En cours').first().waitFor();
  });

  test('« Contient » liste le scénario ; « Déplacer sous… » depuis le scénario le range sous une autre campagne', async () => {
    await ouvrir(antor, camp, 'La Couronne brisée');
    const main = antor.locator('main');
    await main.getByRole('heading', { name: 'Contient' }).waitFor();
    await main.getByText('Acte II — Le sceau brisé').first().waitFor();
    assert.match(await main.innerText(), /Acte II — Le sceau brisé/);
    await ouvrir(antor, scen, 'Acte II — Le sceau brisé');
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    const d = antor.getByRole('dialog');
    await d.getByLabel('Chercher une fiche').fill('Landes');
    await d.getByLabel(/^Les Landes noires/).first().check();
    await d.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${scen}`)).ancetres.at(-1)?.id, autre);
    await ouvrir(antor, autre, 'Les Landes noires');
    await antor.locator('main').getByText('Acte II — Le sceau brisé').first().waitFor();
    // back under the first campaign for the following tests
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${scen}`, { parent: camp });
  });

  test('titre de 120 caractères : la ligne se replie sous le titre, sans débordement horizontal', async () => {
    const long = 'Z'.repeat(120);
    const id = (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'aventure', titre: long })).id;
    await antor.setViewportSize({ width: 390, height: 800 });
    await ouvrir(antor, id, long);
    await ligne(antor).waitFor();
    const t = await antor.getByRole('heading', { name: long, level: 1 }).boundingBox();
    const l = await ligne(antor).boundingBox();
    assert.ok(l.y >= t.y + t.height - 1, `ligne (${l.y}) sous le titre (${t.y + t.height})`);
    assert.ok(await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'pas de défilement horizontal');
    await shot(antor, 'titre-120-mobile');
    await antor.setViewportSize({ width: 1280, height: 800 });
  });

  test('erreur serveur : message et statut conservé ; connexion perdue : menu désactivé', async () => {
    await ouvrir(antor, camp, 'La Couronne brisée');
    await ligne(antor).getByText('En cours').waitFor();
    await antor.route('**/api/univers/*/fiches/*', (route: Any) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }) : route.continue());
    await declencheur(antor, 'La Couronne brisée').click();
    await antor.getByRole('menuitem', { name: 'Terminée' }).click();
    await antor.getByText(ECHEC).first().waitFor();
    assert.match(await ligne(antor).innerText(), /En cours/);
    assert.doesNotMatch(await ligne(antor).innerText(), /Terminée/);
    await shot(antor, 'echec');
    await antor.unroute('**/api/univers/*/fiches/*');
    await antor.context().setOffline(true);
    try {
      await antor.getByText(PERDU).first().waitFor();
      assert.equal(await declencheur(antor, 'La Couronne brisée').isDisabled(), true);
      await shot(antor, 'hors-ligne');
    } finally {
      await antor.context().setOffline(false);
    }
    await antor.getByText(PERDU).first().waitFor({ state: 'detached', timeout: 40000 });
  });

  test('type désactivé dans E-14 : l’aventure existante garde sa ligne et son menu', async () => {
    await api(antor, 'PUT', `/api/univers/${U}/types/aventure`, { etat: 'desactive' });
    await ouvrir(antor, camp, 'La Couronne brisée');
    await ligne(antor).getByText('En cours').waitFor();
    await declencheur(antor, 'La Couronne brisée').click();
    await antor.getByRole('menuitem', { name: 'Prête' }).click();
    await ligne(antor).getByText('Prête').waitFor();
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${camp}`)).charge.statut, 'prete');
    await shot(antor, 'type-desactive');
    await api(antor, 'PUT', `/api/univers/${U}/types/aventure`, { etat: 'suivre' });
  });

  test('statut posé depuis la fiche : les sections ne sont pas remontées (brouillon en cours conservé)', async () => {
    await ouvrir(antor, camp, 'La Couronne brisée');
    await ligne(antor).getByText('Prête').waitFor();
    await antor.getByRole('button', { name: 'Modifier', exact: true }).first().click();
    const zone = antor.locator('main textarea').first();
    await zone.fill('brouillon en cours');
    await declencheur(antor, 'La Couronne brisée').click();
    await antor.getByRole('menuitem', { name: 'En cours' }).click();
    await ligne(antor).getByText('En cours').waitFor();
    assert.equal(await zone.inputValue(), 'brouillon en cours');
  });

  test('Léa (campagne ouverte, scénario fermé) : « Statut : En cours » sans menu, « Contient » sans le scénario ; mode Joueur d’Antor idem', async () => {
    const f = await api(antor, 'GET', `/api/univers/${U}/fiches/${camp}`);
    const sec = f.sections.find((s: Any) => s.titre === 'Présentation');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${camp}/sections/${sec.id}`, { joueursLisent: true });
    await ouvrir(lea, camp, 'La Couronne brisée');
    await ligne(lea).waitFor();
    assert.match(await ligne(lea).innerText(), /Statut :\s*En cours/);
    assert.equal(await lea.getByRole('button', { name: /changer le statut de/ }).count(), 0);
    assert.doesNotMatch(await lea.locator('main').innerText(), /Acte II/);
    await shot(lea, 'lea');
    await ouvrir(antor, camp, 'La Couronne brisée');
    await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
    await antor.getByRole('button', { name: /changer le statut de/ }).waitFor({ state: 'detached' });
    assert.match(await ligne(antor).innerText(), /En cours/);
    assert.doesNotMatch(await antor.locator('main').innerText(), /Acte II/);
  });
});
