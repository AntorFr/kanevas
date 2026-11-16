// ecrans: cartes
// Review of kanevas-battlemap-editeur-liste (E-10 composed map, E-20 tailleCase), written from the exit criterion.
//
// TEST PLAN
//   liste     : the GM sees « Cantine de la station » with « 30 × 20 cases », its title is a link to the editor address
//   largeur   : a width of 201 is refused under the field (« 200 cases au plus. »), nothing is created
//   nom       : an empty name is refused under the field
//   creation  : 30 × 20 default, « Créer » adds the map to the list and opens the editor address
//   case100   : the setting saved at 100 is the cell size of the map created next (read through the API)
//   suppression : « Supprimer… » asks for the name, the button stays disabled until it is typed, then the row goes
//   joueuse   : the player lists the composed map without a link and without a menu
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, rxExact, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

describe('E-10 Liste des cartes : carte composée', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const ouvrir = async (page: Any) => {
    await page.goto(`/univers/${uid}/cartes`);
    await page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
    await attendre(page);
  };
  const ligne = (page: Any, titre: string) => page.locator('li').filter({ hasText: titre });
  const cartes = async (page: Any) =>
    (await (await page.request.get(`/api/univers/${uid}/cartes`)).json()) as Any;

  it('liste : Cantine de la station avec sa taille, titre-lien vers l’éditeur', async () => {
    await ouvrir(antor);
    const l = ligne(antor, 'Cantine de la station');
    await l.getByText('30 × 20 cases').waitFor();
    const href = await l.getByRole('link', { name: rxExact('Cantine de la station') }).getAttribute('href');
    assert.match(href!, new RegExp(`^/univers/${uid}/outils/battlemap/cartes/\\d+$`));
  });

  it('largeur 201 et nom vide refusés sous le champ, rien n’est créé', async () => {
    await ouvrir(antor);
    const avant = JSON.stringify(await cartes(antor));
    await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
    await antor.getByRole('menuitem', { name: rxExact('Carte composée') }).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('button', { name: rxExact('Créer') }).click();
    await d.getByText('le nom est obligatoire.').waitFor();
    await d.getByLabel(/Nom/).fill('Trop large');
    await d.getByLabel(/Largeur/).fill('201');
    await d.getByRole('button', { name: rxExact('Créer') }).click();
    await d.getByText('200 cases au plus.').waitFor();
    assert.match(antor.url(), /\/cartes$/);
    assert.equal(JSON.stringify(await cartes(antor)), avant);
    await d.getByRole('button', { name: rxExact('Annuler') }).click();
    await d.waitFor({ state: 'detached' });
  });

  it('création 30 × 20 : la carte est listée et l’éditeur s’ouvre ; la taille de case réglée à 100 est reprise', async () => {
    const regl = `/api/univers/${uid}/outils/battlemap/cartes/reglages`;
    const lu = await (await antor.request.get(regl)).json().catch(() => null);
    const r = await antor.request.put(regl, { data: { version: lu?.version ?? 0, valeurs: { tailleCase: 100 } } });
    assert.ok(r.status() < 300, `reglage ${r.status()}`);
    await ouvrir(antor);
    await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
    await antor.getByRole('menuitem', { name: rxExact('Carte composée') }).click();
    const d = antor.getByRole('dialog');
    assert.equal(await d.getByLabel(/Largeur/).inputValue(), '30');
    assert.equal(await d.getByLabel(/Hauteur/).inputValue(), '20');
    await d.getByLabel(/Nom/).fill('Taverne');
    const rep = antor.waitForResponse((x: Any) => x.request().method() === 'POST' && /outils\/battlemap\/cartes$/.test(x.url()));
    await d.getByRole('button', { name: rxExact('Créer') }).click();
    const id = ((await (await rep).json()) as Any).id;
    await antor.waitForURL(new RegExp(`/univers/${uid}/outils/battlemap/cartes/${id}$`));
    const c = await (await antor.request.get(`/api/univers/${uid}/outils/battlemap/cartes/${id}`)).json();
    assert.equal(c.largeur, 30);
    assert.equal(c.hauteur, 20);
    assert.equal(c.tailleCase, 100);
    await ouvrir(antor);
    await ligne(antor, 'Taverne').getByText('30 × 20 cases').waitFor();
  });

  it('joueuse : la carte composée est listée sans lien ni menu', async () => {
    await ouvrir(lea);
    const l = ligne(lea, 'Cantine de la station');
    await l.getByText('30 × 20 cases').waitFor();
    assert.equal(await l.getByRole('link').count(), 0);
    assert.equal(await l.getByRole('button').count(), 0);
    assert.equal(await lea.getByRole('button', { name: /Nouvelle carte/ }).count(), 0);
  });

  it('suppression : confirmation par le nom, puis la ligne disparaît', async () => {
    await ouvrir(antor);
    const l = ligne(antor, 'Taverne');
    await l.getByRole('button', { name: /Autres actions sur « Taverne »/ }).click();
    await antor.getByRole('menuitem', { name: /Supprimer…/ }).click();
    const d = antor.getByRole('alertdialog');
    await d.getByText('Cette carte sera supprimée avec ses calques et ses éléments.').waitFor();
    const ok = d.getByRole('button', { name: rxExact('Supprimer la carte') });
    assert.equal(await ok.isDisabled(), true);
    await d.getByLabel(/Saisissez/).fill('Tavern');
    assert.equal(await ok.isDisabled(), true);
    await d.getByLabel(/Saisissez/).fill('Taverne');
    const rep = antor.waitForResponse((x: Any) => x.request().method() === 'DELETE');
    await ok.click();
    assert.ok((await rep).status() < 300);
    await ligne(antor, 'Taverne').waitFor({ state: 'detached' });
    assert.equal(JSON.stringify(await cartes(antor)).includes('Taverne'), false);
    await ligne(antor, 'Cantine de la station').waitFor();
  });
});
