// Browser tests of kanevas-sous-type-dialogue-boite, from its exit criterion: E-9 « Changer le type… » changes
// the sub-type alone while the type stays the current one (PATCH {sousType}); another type keeps the old behaviour.
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
const capture = (page: Any, nom: string) => page.screenshot({ path: `${CAPTURES}/sous-type-boite-${nom}.png`, fullPage: true });
const entete = (page: Any) => page.locator('header').filter({ has: page.locator('.type') }).first();
const bouton = (boite: Any) => boite.getByRole('button', { name: rxExact('Changer le type') });

describe('kanevas-sous-type-dialogue-boite, au navigateur', { skip: skipBrowser }, () => {
  let antor: Any;
  let lame = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lame = ((await api(antor, 'GET', '/api/univers')) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  async function pnj(titre: string, sousType = 'Capitaine'): Promise<number> {
    const f = await api(antor, 'POST', `/api/univers/${lame}/fiches`, { type: 'personnage', titre, sousType, charge: { pj: false } });
    return f.id;
  }
  async function ouvrir(page: Any, id: number): Promise<Any> {
    await page.goto(`/univers/${lame}/fiche/${id}`);
    await attendre(page);
    await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await page.getByRole('menuitem', { name: rx('Changer le type…') }).click();
    return page.getByRole('dialog');
  }
  const lire = (id: number) => api(antor, 'GET', `/api/univers/${lame}/fiches/${id}`);

  test('PNJ « Capitaine » : champ pré-rempli, bouton désactivé, ni PJ / PNJ ni « sera retiré » ; « Amiral » enregistre, reste PNJ', async () => {
    const id = await pnj('Hesk le Marin');
    const boite = await ouvrir(antor, id);
    await boite.getByLabel(/^Sous-type/).waitFor();
    assert.equal(await boite.getByLabel(/^Sous-type/).inputValue(), 'Capitaine');
    assert.equal(await bouton(boite).isDisabled(), true);
    assert.equal(await boite.getByRole('radio', { name: rxExact('PJ') }).count(), 0);
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    await capture(antor, 'ouverture');
    await boite.getByLabel(/^Sous-type/).fill('  Amiral  ');
    assert.equal(await bouton(boite).isEnabled(), true);
    await bouton(boite).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    await boite.waitFor({ state: 'detached' });
    await attendre(antor);
    assert.match(await entete(antor).innerText(), /Amiral/);
    assert.match(await entete(antor).innerText(), /PNJ\s*·\s*Amiral/);
    assert.doesNotMatch(await entete(antor).innerText(), /Capitaine/);
    const v = await lire(id);
    assert.equal(v.sousType, 'Amiral');
    assert.equal(v.type, 'personnage');
    assert.equal(v.charge.pj, false);
    await capture(antor, 'apres-amiral');
  });

  test('espaces seuls autour du sous-type actuel : pas d’écart, bouton désactivé ; autre type puis retour : « Capitaine » rendu', async () => {
    const id = await pnj('Vigie Orrin');
    const boite = await ouvrir(antor, id);
    const champ = boite.getByLabel(/^Sous-type/);
    await champ.fill('  Capitaine ');
    assert.equal(await bouton(boite).isDisabled(), true);
    await boite.getByRole('radio', { name: rxExact('Lieu') }).check();
    assert.equal(await champ.inputValue(), '');
    await boite.getByText('Le sous-type « Capitaine » sera retiré.').waitFor();
    await capture(antor, 'autre-type');
    await champ.fill('Port');
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    await boite.getByRole('radio', { name: rx('Personnage') }).check();
    assert.equal(await champ.inputValue(), 'Capitaine');
    assert.equal(await boite.getByText(/sera retiré/).count(), 0);
    assert.equal(await bouton(boite).isDisabled(), true);
    assert.equal((await lire(id)).sousType, 'Capitaine');
  });

  test('autre type : le POST de changement de type garde son comportement (sous-type retiré)', async () => {
    const id = await pnj('Quartier-maître Dael');
    const boite = await ouvrir(antor, id);
    await boite.getByRole('radio', { name: rxExact('Lieu') }).check();
    await bouton(boite).click();
    await antor.getByText('Type changé : Personnage → Lieu.').waitFor();
    const v = await lire(id);
    assert.equal(v.type, 'lieu');
    assert.ok(!v.sousType, `sous-type ${v.sousType}`);
  });

  test('champ vidé : « Sous-type retiré. », sous-type null, le badge n’a plus de sous-type', async () => {
    const id = await pnj('Matelot Pell');
    const boite = await ouvrir(antor, id);
    await boite.getByLabel(/^Sous-type/).fill('');
    assert.equal(await bouton(boite).isEnabled(), true);
    await bouton(boite).click();
    await antor.getByText('Sous-type retiré.').waitFor();
    await boite.waitFor({ state: 'detached' });
    const v = await lire(id);
    assert.ok(v.sousType === null || v.sousType === undefined);
    assert.equal(v.type, 'personnage');
  });

  test('61 caractères : « Erreur : 60 caractères au plus. », boîte ouverte, rien d’écrit ; 60 passent', async () => {
    const id = await pnj('Pilote Sarn');
    const boite = await ouvrir(antor, id);
    const champ = boite.getByLabel(/^Sous-type/);
    await champ.fill('x'.repeat(61));
    await bouton(boite).click();
    await boite.getByText('Erreur : 60 caractères au plus.').waitFor();
    assert.equal((await boite.innerText()).split('Erreur :').length - 1, 1, 'un seul « Erreur : »');
    assert.equal((await lire(id)).sousType, 'Capitaine');
    await capture(antor, '61-caracteres');
    await champ.fill('y'.repeat(60));
    await bouton(boite).click();
    await antor.getByText('Sous-type enregistré.').waitFor();
    assert.equal((await lire(id)).sousType, 'y'.repeat(60));
  });

  test('échecs du PATCH : 500 « Le sous-type n’a pas changé. Réessayez. », 404 « Introuvable. », 403 ferme la boîte', async () => {
    for (const [statut, attendu] of [[500, 'Le sous-type n’a pas changé. Réessayez.'], [404, 'Introuvable.']] as const) {
      const id = await pnj(`Échec ${statut}`);
      const { page } = await connecte(browser, srv.base, 'Antor');
      await page.route('**/api/univers/*/fiches/*', (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: statut, contentType: 'application/json', body: '{}' }) : r.continue()));
      const boite = await ouvrir(page, id);
      await boite.getByLabel(/^Sous-type/).fill('Autre');
      await bouton(boite).click();
      await boite.getByRole('alert').filter({ hasText: attendu }).waitFor();
      assert.equal(await boite.isVisible(), true);
      assert.equal(await boite.getByLabel(/^Sous-type/).inputValue(), 'Autre');
      assert.equal(await bouton(boite).isEnabled(), true);
      assert.equal((await lire(id)).sousType, 'Capitaine');
      await capture(page, `echec-${statut}`);
    }
    const id = await pnj('Échec 403');
    const { page } = await connecte(browser, srv.base, 'Antor');
    await page.route('**/api/univers/*/fiches/*', (r: Any) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 403, contentType: 'application/json', body: '{}' }) : r.continue()));
    const boite = await ouvrir(page, id);
    await boite.getByLabel(/^Sous-type/).fill('Autre');
    await bouton(boite).click();
    await boite.waitFor({ state: 'detached' });
    assert.equal((await lire(id)).sousType, 'Capitaine');
  });

  test('liste des types pas encore lue : le bouton reste désactivé même si le champ diffère', async () => {
    const id = await pnj('Timonier Ruck');
    const { page } = await connecte(browser, srv.base, 'Antor');
    let liberer: () => void = () => {};
    const attente = new Promise<void>((ok) => (liberer = ok));
    await page.route(/\/api\/univers\/\d+\/types(\?.*)?$/, async (r: Any) => {
      await attente;
      await r.continue();
    });
    await page.goto(`/univers/${lame}/fiche/${id}`);
    await page.getByRole('button', { name: /^Autres actions sur/ }).first().waitFor();
    await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await page.getByRole('menuitem', { name: rx('Changer le type…') }).click();
    const boite = page.getByRole('dialog');
    await boite.getByText('Chargement des types…').waitFor();
    assert.equal(await bouton(boite).isDisabled(), true);
    await capture(page, 'types-en-lecture');
    liberer();
    await boite.getByLabel(/^Sous-type/).fill('Autre');
    await bouton(boite).isEnabled();
    await page.waitForFunction(() => !document.body.innerText.includes('Chargement des types…'));
    assert.equal(await bouton(boite).isEnabled(), true);
  });
});
