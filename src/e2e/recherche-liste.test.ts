// Black-box tests of kanevas-rc-ecran-recherche, written from docs/ecrans.md "E-8 — la recherche
// dans un type" and the task's exit criterion (B-11, B-29, P-6 step 2). Real server in stub mode
// (AD-55) + real Chromium; expected values are literals from the doc. Screenshots go to /tmp.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-recherche-shots';
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

async function liste(page: Any, nav: string, q?: string): Promise<void> {
  await page.goto(`/univers/${U}/fiches/${nav}${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
}
const champ = (page: Any, dans: string) => page.getByLabel(`Chercher dans ${dans}`);
async function chercher(page: Any, dans: string, saisie: string): Promise<void> {
  await champ(page, dans).fill(saisie);
  await page.getByRole('button', { name: rxExact('Chercher') }).click();
  await fini(page);
}
/** The search is drawn: give React a tick to start it, then wait for the loading text to go. */
async function fini(page: Any): Promise<void> {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !/Recherche…|Chargement des fiches…/.test(document.body.innerText));
  await attendre(page);
}
async function titres(page: Any): Promise<string[]> {
  return page.locator('ul.liste-fiches li .titre-fiche').allInnerTexts();
}
async function photo(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}

describe('kanevas-rc-ecran-recherche, E-8 recherche', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } });
    const base = `/api/univers/${U}/fiches/${f.id}/sections`;
    const app = await api(antor, 'POST', base, { titre: 'Apparence', contenu: 'Grand, cicatrice.' });
    await api(antor, 'PATCH', `${base}/${app.id}`, { joueursLisent: true });
    await api(antor, 'POST', base, { titre: 'Vérité — MJ seul', contenu: 'Il trahit le roi.' });
    for (let i = 1; i <= 105; i++) {
      await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: `Halle ${String(i).padStart(3, '0')}` });
    }
  }, { timeout: 180000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Léa cherche « Vérité » : le texte du vide, sans trahir la fiche cachée', async () => {
    await liste(lea, 'personnages');
    await chercher(lea, 'les personnages', 'Vérité');
    assert.ok((await texte(lea)).includes('Aucun résultat pour « Vérité » dans les personnages.'));
    assert.deepEqual(await titres(lea), []);
    await photo(lea, 'vide');
    await chercher(lea, 'les personnages', 'zzzz');
    assert.ok((await texte(lea)).includes('Aucun résultat pour « zzzz » dans les personnages.'));
  });

  test('Antor cherche « Vérité » : Maître Aldric ; sans accent aussi', async () => {
    await liste(antor, 'personnages');
    await chercher(antor, 'les personnages', 'Vérité');
    assert.deepEqual(await titres(antor), ['Maître Aldric']);
    await chercher(antor, 'les personnages', 'verite');
    assert.deepEqual(await titres(antor), ['Maître Aldric']);
  });

  test('Léa trouve « aldric » et « apparence » ; l’adresse porte ?q= ; ouvrir puis revenir ramène la recherche', async () => {
    await liste(lea, 'personnages');
    await chercher(lea, 'les personnages', 'aldric');
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
    assert.ok(lea.url().endsWith('/fiches/personnages?q=aldric'), lea.url());
    await photo(lea, 'resultats');
    await lea.getByRole('link', { name: rx('Maître Aldric') }).first().click();
    await attendre(lea);
    assert.ok(/\/fiche\/\d+/.test(lea.url()));
    await lea.goBack();
    await attendre(lea);
    assert.ok(lea.url().endsWith('/fiches/personnages?q=aldric'));
    assert.equal(await champ(lea, 'les personnages').inputValue(), 'aldric');
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
    await chercher(lea, 'les personnages', 'apparence');
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
  });

  test('Entrée lance la recherche, sans retour à la ligne', async () => {
    await liste(lea, 'personnages');
    await champ(lea, 'les personnages').fill('aldric');
    await champ(lea, 'les personnages').press('Enter');
    await attendre(lea);
    assert.ok(lea.url().endsWith('?q=aldric'));
    assert.equal(await champ(lea, 'les personnages').inputValue(), 'aldric');
  });

  test('« Effacer la recherche » et une saisie blanche rendent la liste entière', async () => {
    await liste(lea, 'personnages', 'zzzz');
    await lea.getByRole('button', { name: rxExact('Effacer la recherche') }).first().click();
    await fini(lea);
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
    assert.ok(!lea.url().includes('q='));
    await chercher(lea, 'les personnages', 'zzzz');
    await chercher(lea, 'les personnages', '   ');
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
    assert.ok(!lea.url().includes('q='));
  });

  test('plus de 100 caractères : « Erreur : 100 caractères au plus. », rien d’envoyé', async () => {
    await liste(lea, 'personnages');
    const envoyes: string[] = [];
    lea.on('request', (r: Any) => r.url().includes('q=') && envoyes.push(r.url()));
    await champ(lea, 'les personnages').fill('a'.repeat(101));
    await lea.getByRole('button', { name: rxExact('Chercher') }).click();
    await lea.getByText('Erreur : 100 caractères au plus.').waitFor();
    await photo(lea, 'trop-long');
    await attendre(lea);
    assert.deepEqual(envoyes, []);
    assert.ok(!lea.url().includes('q='));
    // exactly 100 is accepted
    await chercher(lea, 'les personnages', 'a'.repeat(100));
    assert.ok(lea.url().includes('q=' + 'a'.repeat(100)));
    assert.equal(await lea.getByText('Erreur : 100 caractères au plus.').count(), 0);
    lea.removeAllListeners('request');
  });

  test('plus de 100 résultats : « Charger la suite » rend le reste', async () => {
    await liste(antor, 'lieux');
    await chercher(antor, 'les lieux', 'halle');
    assert.equal((await titres(antor)).length, 100);
    await photo(antor, 'cent-resultats');
    await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
    await antor.waitForFunction(() => document.querySelectorAll('ul.liste-fiches li').length === 105);
    assert.equal(await antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
    const t = await titres(antor);
    assert.equal(t[0], 'Halle 001');
    assert.equal(t[104], 'Halle 105');
  });

  test('« Nouveau personnage » reste au MJ pendant une recherche, et pas à la joueuse', async () => {
    await liste(antor, 'personnages', 'zzzz');
    assert.equal(await antor.getByRole('button', { name: rxExact('Nouveau personnage') }).count(), 1);
    await liste(antor, 'personnages', 'aldric');
    assert.equal(await antor.getByRole('button', { name: rxExact('Nouveau personnage') }).count(), 1);
    await liste(lea, 'personnages', 'aldric');
    assert.equal(await lea.getByRole('button', { name: rxExact('Nouveau personnage') }).count(), 0);
  });

  test('erreur : « Impossible de lancer la recherche. », le champ garde sa saisie, « Réessayer » relance', async () => {
    await liste(lea, 'personnages');
    let panne = true;
    await lea.route('**/fiches?*q=*', (r: Any) => (panne ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
    await chercher(lea, 'les personnages', 'aldric');
    await lea.getByText('Impossible de lancer la recherche.').waitFor();
    assert.equal(await champ(lea, 'les personnages').inputValue(), 'aldric');
    await photo(lea, 'erreur');
    panne = false;
    await lea.getByRole('button', { name: rxExact('Réessayer') }).click();
    await fini(lea);
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
    await lea.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('chargement : « Recherche… » et l’ancienne liste n’est pas montrée', async () => {
    await liste(lea, 'personnages');
    await lea.route('**/fiches?*q=*', async (r: Any) => {
      await new Promise((ok) => setTimeout(ok, 1500));
      await r.continue();
    });
    await champ(lea, 'les personnages').fill('aldric');
    await lea.getByRole('button', { name: rxExact('Chercher') }).click();
    await lea.getByRole('status').filter({ hasText: 'Recherche…' }).waitFor();
    assert.deepEqual(await titres(lea), []);
    await photo(lea, 'chargement');
    await attendre(lea);
    await lea.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('connexion perdue : « Chercher » désactivé, résultats déjà affichés conservés', async () => {
    await liste(lea, 'personnages', 'aldric');
    await lea.context().setOffline(true);
    await lea.getByText(rx('Connexion perdue.')).first().waitFor();
    await photo(lea, 'hors-ligne');
    await lea.waitForFunction(() => document.querySelector('form[role=search] button[type=submit]')?.getAttribute('aria-disabled') === 'true');
    assert.deepEqual(await titres(lea), ['Maître Aldric']);
    await photo(lea, 'hors-ligne');
    await lea.context().setOffline(false);
  });

  test('un signe sans lettre ni chiffre se comporte comme une recherche sans résultat', async () => {
    await liste(antor, 'personnages');
    await chercher(antor, 'les personnages', '"*-');
    assert.ok((await texte(antor)).includes('Aucun résultat pour'));
    assert.deepEqual(await titres(antor), []);
  });
});
