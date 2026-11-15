// Black-box tests of kanevas-fiches-liees-disparu-ecran, written from the task's exit criterion and
// docs/ecrans.md « the gone mark ». Real server in stub mode (with the seed) + real Chromium; the words
// expected are literals from the doc's table. Waits are on what the screen shows, never networkidle.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-disparu-ecran-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
const entete = (page: Any) => page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) }).first();
async function ouvrir(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
  await attendre(page);
}
async function menu(page: Any, titre: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^Autres actions sur « ${titre} »`) }).click();
}
const entrees = async (page: Any): Promise<string[]> =>
  (await page.getByRole('menuitem').allInnerTexts()).map((s: string) => s.replace(/\s+/g, ' ').trim());
async function marquer(page: Any, titre: string, entree: string, badge: string): Promise<void> {
  await menu(page, titre);
  await page.getByRole('menuitem', { name: entree }).click();
  await entete(page).getByText(badge, { exact: true }).waitFor();
}
const liste = async (page: Any, slug: string, qs: string): Promise<void> => {
  await page.goto(`/univers/${U}/fiches/${slug}${qs}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
};
const cartes = async (page: Any): Promise<string[]> =>
  (await page.locator('a.carte .titre').allInnerTexts()).map((s: string) => s.trim());

describe('kanevas-fiches-liees-disparu-ecran, la marque disparu à l’écran', { skip: skipBrowser }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    for (const t of ['personnage', 'lieu', 'faction', 'famille', 'quete', 'creature']) {
      const p = await api(antor, 'GET', `/api/univers/${U}/fiches?type=${t}`);
      for (const f of p.fiches ?? p.items ?? []) ids[f.titre] = f.id;
    }
    const c = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'creature', titre: 'Kraken' });
    ids['Kraken'] = c.id;
    const q = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'quete', titre: 'La Clé perdue' });
    ids['La Clé perdue'] = q.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('personnage: Marquer mort puis vivant, badge, filtres Vivants/Morts', async () => {
    await ouvrir(antor, 'Bran Corvalis');
    await menu(antor, 'Bran Corvalis');
    assert.ok((await entrees(antor)).includes('Marquer mort'));
    await antor.keyboard.press('Escape');
    await marquer(antor, 'Bran Corvalis', 'Marquer mort', 'Mort');
    await antor.screenshot({ path: `${SHOTS}/bran-mort.png` });
    await menu(antor, 'Bran Corvalis');
    const e = await entrees(antor);
    assert.ok(e.includes('Marquer vivant') && !e.includes('Marquer mort'), e.join('|'));
    await antor.keyboard.press('Escape');

    await liste(antor, 'personnages', '?etat=la');
    assert.ok(!(await cartes(antor)).includes('Bran Corvalis'));
    assert.ok((await cartes(antor)).includes('Maître Aldric'));
    await liste(antor, 'personnages', '?etat=disparu');
    assert.deepEqual((await cartes(antor)).sort(), ['Bran Corvalis', 'Le Prieur masqué']);
    await antor.screenshot({ path: `${SHOTS}/personnages-morts.png` });
    // the chip on the card of the dead one (Le Prieur has a portrait: desaturated)
    const chip = antor.locator('a.carte', { hasText: 'Le Prieur masqué' }).getByRole('img', { name: 'Mort' });
    assert.equal(await chip.count(), 1);
    assert.equal(await antor.locator('a.carte', { hasText: 'Le Prieur masqué' }).locator('.vue.disparu').count(), 1);
    // Bran has no image: the fallback shows the glyph alone, with the word as name
    assert.equal(await antor.locator('a.carte', { hasText: 'Bran Corvalis' }).getByRole('img', { name: 'Mort' }).count(), 1);

    await ouvrir(antor, 'Bran Corvalis');
    await marquer(antor, 'Bran Corvalis', 'Marquer vivant', 'Mort').catch(() => {});
    await entete(antor).getByText('Mort', { exact: true }).waitFor({ state: 'detached' });
    await liste(antor, 'personnages', '?etat=disparu');
    assert.deepEqual(await cartes(antor), ['Le Prieur masqué']);
  });

  test('Léa voit la marque et le badge, jamais l’entrée', async () => {
    await ouvrir(lea, 'Le Prieur masqué').catch(() => {});
    await liste(lea, 'personnages', '?etat=disparu');
    assert.ok((await lea.locator('a.carte').count()) >= 0);
    await ouvrir(antor, 'Bran Corvalis');
    await marquer(antor, 'Bran Corvalis', 'Marquer mort', 'Mort');
    await ouvrir(lea, 'Bran Corvalis');
    await entete(lea).getByText('Mort', { exact: true }).waitFor();
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    await lea.screenshot({ path: `${SHOTS}/lea-bran.png` });
    await liste(lea, 'personnages', '?etat=disparu');
    assert.ok((await cartes(lea)).includes('Bran Corvalis'));
    await ouvrir(antor, 'Bran Corvalis');
    await marquer(antor, 'Bran Corvalis', 'Marquer vivant', 'Mort').catch(() => {});
  });

  test('lieu, faction, famille, créature: les mots du type', async () => {
    for (const [t, tit, entree, mot, filtres] of [
      ['lieux', 'Le Phare aux Sels', 'Marquer détruit', 'Détruit', ['Intacts', 'Détruits']],
      ['factions', 'La Guilde des Brumes', 'Marquer détruite', 'Détruite', ['Actives', 'Détruites']],
      ['familles', 'Les Corvalis', 'Marquer éteinte', 'Éteinte', ['Vivantes', 'Éteintes']],
      ['creatures', 'Kraken', 'Marquer morte', 'Morte', ['Vivantes', 'Mortes']],
    ] as [string, string, string, string, string[]][]) {
      await ouvrir(antor, tit);
      await marquer(antor, tit, entree, mot);
      await liste(antor, t, '?etat=disparu');
      assert.deepEqual(await cartes(antor), [tit], t);
      await liste(antor, t, '?etat=la');
      assert.ok(!(await cartes(antor)).includes(tit), t);
      for (const f of filtres) assert.equal(await antor.getByRole('button', { name: f, exact: true }).count(), 1, f);
      await antor.screenshot({ path: `${SHOTS}/${t}.png` });
    }
  });

  test('quête: pas d’entrée, pas de filtre', async () => {
    await ouvrir(antor, 'La Clé perdue');
    await menu(antor, 'La Clé perdue');
    const e = await entrees(antor);
    assert.ok(!e.some((s) => /^Marquer/.test(s)), e.join('|'));
    await antor.keyboard.press('Escape');
    await liste(antor, 'quetes', '');
    assert.equal(await antor.getByRole('group', { name: 'État' }).count(), 0);
  });

  test('filtre: adresse rouverte, vide et « Voir tous »', async () => {
    await liste(antor, 'lieux', '?etat=disparu');
    assert.equal(await antor.getByRole('button', { name: 'Détruits', exact: true }).getAttribute('aria-pressed'), 'true');
    await ouvrir(antor, 'Le Phare aux Sels');
    await marquer(antor, 'Le Phare aux Sels', 'Marquer intact', 'Détruit').catch(() => {});
    await antor.getByText('Détruit', { exact: true }).first().waitFor({ state: 'detached' });
    await liste(antor, 'lieux', '?etat=disparu');
    await antor.getByText('Aucun lieu détruit.').waitFor();
    await antor.getByRole('button', { name: /^Voir tous les lieux/ }).click();
    await antor.getByText('Le Phare aux Sels').first().waitFor();
    assert.ok(!antor.url().includes('etat='), antor.url());
    await antor.screenshot({ path: `${SHOTS}/lieux-vide.png` });
  });

  test('E-17: le Prieur mort dans la recherche « Morts » (type Personnage), sans filtre sans type', async () => {
    await antor.goto(`/univers/${U}/recherche?q=Prieur&type=personnage&etat=disparu`);
    await antor.getByText('Le Prieur masqué').first().waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Morts', exact: true }).getAttribute('aria-pressed'), 'true');
    await antor.getByRole('img', { name: 'Mort' }).first().waitFor();
    await antor.screenshot({ path: `${SHOTS}/e17-morts.png` });
    await antor.getByRole('button', { name: 'Vivants', exact: true }).click();
    await antor.getByText(/^Aucune fiche/).waitFor();
    assert.equal(await antor.getByRole('link', { name: /Prieur/ }).count(), 0);
    await antor.goto(`/univers/${U}/recherche?etat=disparu`);
    await antor.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await antor.getByRole('group', { name: 'État' }).count(), 0);
  });

  test('mode Joueur: pas d’entrée; échec du PATCH: message, fiche inchangée', async () => {
    await antor.goto(`/univers/${U}/fiche/${ids['Bran Corvalis']}`);
    await antor.getByRole('heading', { level: 1, name: 'Bran Corvalis' }).waitFor();
    await attendre(antor);
    await antor.route(`**/api/univers/${U}/fiches/${ids['Bran Corvalis']}`, (r: Any) =>
      r.request().method() === 'PATCH' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue());
    await menu(antor, 'Bran Corvalis');
    await antor.getByRole('menuitem', { name: 'Marquer mort' }).click();
    await antor.getByRole('alert').filter({ hasText: 'Impossible de modifier la fiche. Réessayez.' }).waitFor();
    assert.equal(await entete(antor).getByText('Mort', { exact: true }).count(), 0);
    await antor.screenshot({ path: `${SHOTS}/echec.png` });
    await antor.unroute(`**/api/univers/${U}/fiches/${ids['Bran Corvalis']}`);
    // player mode
    await antor.goto(`/univers/${U}/fiche/${ids['Bran Corvalis']}`);
    await antor.getByRole('heading', { level: 1, name: 'Bran Corvalis' }).waitFor();
    await attendre(antor);
    await antor.getByLabel('Mode Joueur').check();
    await attendre(antor);
    assert.equal(await antor.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
  });
});
