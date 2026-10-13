// Browser tests of kanevas-types-ecrans-lore, from its exit criterion: the bar, the lists, the creation
// and the map window follow the types enabled for the universe (AD-113). Real server in stub mode WITH
// the starting world (Lame d'Ébène, CoF Mini…), real Chromium; settings are laid by the real routes.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Server;
let browser: Any;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json().catch(() => null);
}
const barre = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });
const lienBarre = (page: Any, nom: string) => barre(page).getByRole('link', { name: rxExact(nom) });
const capture = (page: Any, nom: string) => page.screenshot({ path: `${CAPTURES}/types-lore-${nom}.png`, fullPage: true });

describe('kanevas-types-ecrans-lore, au navigateur', { skip: skipBrowser }, () => {
  let antor: Any;
  let lea: Any;
  let lame = 0;
  let landes = 0;
  let cartes = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const mira = (await connecte(browser, srv.base, 'Mira')).page;
    const mine = (await api(antor, 'GET', '/api/univers')) as { id: number; nom: string }[];
    lame = mine.find((u) => u.nom === "Lame d'Ébène")!.id;
    landes = ((await api(mira, 'GET', '/api/univers')) as { id: number; nom: string }[]).find((u) => u.nom === 'Les Landes grises')!.id;
    const systemes = (await api(antor, 'GET', '/api/systemes')) as { id: number; nom: string }[];
    const cof = systemes.find((s) => s.nom === 'CoF Mini')!.id;
    await api(antor, 'PUT', `/api/systemes/${cof}/types/vaisseau`, { active: false });
    await api(antor, 'PUT', `/api/systemes/${cof}/types/note`, { active: false });
    await api(antor, 'PUT', `/api/univers/${lame}/types/vaisseau`, { etat: 'active' });
    cartes = (await api(antor, 'POST', `/api/univers/${lame}/cartes`, { titre: 'La ville de Brume', forme: 'illustree' })).id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('barre : « Vaisseaux » (forcé) y est, « Notes » (désactivé par le système) non, « Comptes-rendus » une seule fois', async () => {
    // Fails if the bar is not built from the response, or lists the compte-rendu type beside its fixed item.
    await antor.goto(`/univers/${lame}`);
    await attendre(antor);
    await lienBarre(antor, 'Vaisseaux').waitFor();
    assert.equal(await lienBarre(antor, 'Notes').count(), 0);
    assert.equal(await lienBarre(antor, 'Comptes-rendus').count(), 1);
    assert.equal(await lienBarre(antor, 'Lieux').count(), 1);
    await capture(antor, 'barre');
  });

  test('un univers qui suit le système (Landes grises) : mêmes types que le système, pas de Vaisseaux ni de Notes', async () => {
    const mira = (await connecte(browser, srv.base, 'Mira')).page;
    await mira.goto(`/univers/${landes}`);
    await attendre(mira);
    await lienBarre(mira, 'Lieux').waitFor();
    assert.equal(await lienBarre(mira, 'Vaisseaux').count(), 0);
    assert.equal(await lienBarre(mira, 'Notes').count(), 0);
  });

  test('création : types activés seulement, champ « Sous-type » avec « Taverne » en tapant « Ta », Savoir · sous-type créé', async () => {
    await antor.goto(`/univers/${lame}/fiches/lieux`);
    await attendre(antor);
    await antor.getByRole('button', { name: rxExact('Nouveau lieu') }).first().click();
    const f = antor.getByRole('dialog');
    const options = (await f.getByLabel('Type', { exact: true }).locator('option').allInnerTexts()) as string[];
    assert.ok(options.includes('Vaisseau'), `Vaisseau absent : ${options}`);
    assert.ok(!options.includes('Note'), 'Note désactivé ne doit pas être proposé');
    await f.getByLabel('Sous-type').fill('Ta');
    const propositions = (await f.locator('datalist option').evaluateAll((os: Any[]) => os.map((o) => o.value))) as string[];
    assert.ok(propositions.includes('Taverne'), `datalist : ${propositions}`);
    await capture(antor, 'creation');
    // Savoir (enabled by default) with a sub-type.
    await f.getByLabel('Type', { exact: true }).selectOption({ label: 'Savoir' });
    await f.getByLabel('Titre').fill('Les Cristaux d’Ombre');
    await f.getByLabel('Sous-type').fill('Ressource');
    await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await attendre(antor);
    await lienBarre(antor, 'Savoirs').waitFor();
    await antor.goto(`/univers/${lame}/fiches/savoirs`);
    await attendre(antor);
    const corps = await antor.locator('body').innerText();
    assert.match(corps, /Les Cristaux d’Ombre/);
    await antor.getByRole('link', { name: rx('Les Cristaux d’Ombre') }).first().waitFor();
    await capture(antor, 'liste-savoirs');
  });

  test('filtre « Sous-type » : Léa choisit Taverne sur Lieux, une seule fiche, « Taverne (1) »', async () => {
    await lea.goto(`/univers/${lame}/fiches/lieux`);
    await attendre(lea);
    const filtre = lea.getByLabel('Sous-type');
    await filtre.waitFor();
    await lea.getByText('Le Pendu Joyeux').first().waitFor();
    await filtre.selectOption({ label: 'Taverne (1)' });
    await lea.getByText('Rue des Cordiers').waitFor({ state: 'detached' });
    await lea.getByText('Le Pendu Joyeux').first().waitFor();
    const corps = await lea.locator('body').innerText();
    assert.match(corps, /Le Pendu Joyeux/);
    assert.doesNotMatch(corps, /Val-Fortin|Rue des Cordiers|La Fresque effacée/);
    await capture(lea, 'filtre');
  });

  for (const [largeur, nom] of [[1440, 'bureau'], [390, 'telephone']] as const) {
    test(`liste « Lieux » à ${largeur} px : champ, filtre « Sous-type » et « Chercher » sont alignés (pas de ligne rompue)`, async () => {
      // Fails if the filter label sits above the select again and pushes the row out of line, or if « Chercher » floats beside the select.
      const page = (await connecte(browser, srv.base, 'Antor')).page;
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto(`/univers/${lame}/fiches/lieux`);
      await attendre(page);
      const filtre = page.getByLabel('Sous-type');
      await filtre.waitFor();
      const champ = page.getByRole('textbox').first();
      const bouton = page.getByRole('button', { name: rxExact('Chercher') });
      const [c, f, b] = await Promise.all([champ.boundingBox(), filtre.boundingBox(), bouton.boundingBox()]);
      const centre = (r: { y: number; height: number }) => r.y + r.height / 2;
      if (largeur >= 1000) {
        assert.ok(Math.abs(centre(c!) - centre(f!)) <= 4, `filtre désaligné du champ: ${centre(c!)} vs ${centre(f!)}`);
        assert.ok(Math.abs(centre(b!) - centre(f!)) <= 4, `« Chercher » désaligné du filtre: ${centre(b!)} vs ${centre(f!)}`);
        assert.ok(f!.height < 60, `filtre trop haut (libellé empilé ?): ${f!.height}`);
      } else {
        assert.ok(f!.y >= c!.y + c!.height - 1, 'à 390 px le filtre prend sa propre ligne sous le champ');
        assert.ok(!(b!.y < f!.y + f!.height && b!.y + b!.height > f!.y), '« Chercher » ne flotte pas à côté du select');
        assert.ok(f!.x + f!.width <= largeur && b!.x + b!.width <= largeur, 'rien ne déborde');
      }
      await capture(page, `alignement-${nom}`);
      await page.close();
    });
  }

  test('carte : « Ajouter une fiche » propose Vaisseau, pas Note ; un compte-rendu reste proposé comme avant', async () => {
    await antor.goto(`/univers/${lame}/cartes/${cartes}`);
    await attendre(antor);
    await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
    const f = antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
    const options = (await f.getByLabel('Type de fiche').locator('option').allInnerTexts()) as string[];
    assert.ok(options.includes('Vaisseau'));
    assert.ok(!options.includes('Note'));
    await capture(antor, 'carte-fenetre');
  });

  test('carte : dans « Ajouter une fiche », la ligne de « Les Cristaux d’Ombre » dit « Savoir » (libellé du type de la liste)', async () => {
    await antor.goto(`/univers/${lame}/cartes/${cartes}`);
    await attendre(antor);
    await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
    const f = antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
    await f.getByLabel('Type de fiche').selectOption({ label: 'Savoir' });
    const ligne = f.getByRole('listitem').filter({ hasText: rx('Les Cristaux d’Ombre') });
    await ligne.waitFor();
    assert.match(await ligne.innerText(), /Savoir/);
  });

  test('adresse d’un type désactivé : « Ce type est désactivé dans cet univers. » sans « Nouvelle note » ; /fiches/monde : « Page introuvable. »', async () => {
    await antor.goto(`/univers/${lame}/fiches/notes`);
    await attendre(antor);
    const corps = await antor.locator('body').innerText();
    assert.match(corps, /Ce type est désactivé dans cet univers\./);
    assert.equal(await antor.getByRole('button', { name: rx('Nouvelle note') }).count(), 0);
    await capture(antor, 'type-desactive');
    await antor.goto(`/univers/${lame}/fiches/monde`);
    await attendre(antor);
    assert.match(await antor.locator('body').innerText(), /Page introuvable\./);
  });

  test('requête des types en erreur : « Impossible de charger les types. » dans la barre, le reste de la barre tient', async () => {
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.route('**/api/univers/*/types', (r: Any) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.goto(`/univers/${lame}`);
    await attendre(page);
    await barre(page).getByText('Impossible de charger les types.').waitFor();
    await lienBarre(page, 'Cartes').waitFor();
    await capture(page, 'erreur-types');
  });
});
