// Black-box tests of kanevas-rc-ecran-relations, from docs/ecrans.md "E-9 — le bloc Relations" and
// the task's exit criterion (B-10, B-29, P-3 step 4). Real server in stub mode + real Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, section, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let aldric = 0;
let appId = 0;
let verId = 0;
let grises = 0;
let cendres = 0;

async function api(page: Any, method: string, url: string, data?: unknown, ok = true): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  if (ok) assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function ouvrir(page: Any, id: number, mode = ''): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${id}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  if (mode === 'joueur') await page.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
  await page.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
}
const bloc = (page: Any, titre: string) => section(page, titre).locator('.relations');
async function relier(page: Any, titreSection: string, type: string, typeFiche: string, chercherDans: string, cible: string): Promise<void> {
  const b = bloc(page, titreSection);
  await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
  await b.getByLabel('Type de relation').fill(type);
  await b.getByLabel('Type de fiche').selectOption({ label: typeFiche });
  await b.getByLabel(`Chercher dans ${chercherDans}`).fill(cible);
  await b.getByRole('button', { name: rxExact('Chercher') }).click();
  await page.waitForTimeout(400);
  await attendre(page);
  await b.locator('button.choix-fiche').filter({ hasText: cible }).click();
  await b.getByRole('button', { name: rxExact('Relier') }).click();
}

describe('kanevas-rc-ecran-relations, E-9 bloc Relations', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const f = (t: string, titre: string) => api(antor, 'POST', `/api/univers/${U}/fiches`, { type: t, titre, ...(t === 'personnage' ? { charge: { pj: false } } : {}) });
    aldric = (await f('personnage', 'Maître Aldric')).id;
    grises = (await f('faction', 'Lames Grises')).id;
    cendres = (await f('faction', 'Cercle des Cendres')).id;
    const base = `/api/univers/${U}/fiches/${aldric}/sections`;
    appId = (await api(antor, 'POST', base, { titre: 'Apparence', contenu: 'Grand.' })).id;
    await api(antor, 'PATCH', `${base}/${appId}`, { joueursLisent: true });
    verId = (await api(antor, 'POST', base, { titre: 'Passé', contenu: 'Sombre.' })).id;
    await api(antor, 'PATCH', `${base}/${verId}`, { joueursLisent: true });
    const sg = await api(antor, 'POST', `/api/univers/${U}/fiches/${grises}/sections`, { titre: 'Doctrine', contenu: 'x' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${grises}/sections/${sg.id}`, { joueursLisent: true });
    await api(antor, 'POST', `/api/univers/${U}/fiches/${cendres}/sections`, { titre: 'Secret', contenu: 'x' });
  }, { timeout: 180000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor relie Apparence à Lames Grises puis Cercle des Cendres ; état vide d’abord', async () => {
    await ouvrir(antor, aldric);
    assert.ok((await bloc(antor, 'Apparence').innerText()).replace(/’/g, "'").includes("Aucune relation pour l'instant."));
    await relier(antor, 'Apparence', 'membre de', 'Faction', 'les factions', 'Lames Grises');
    await bloc(antor, 'Apparence').getByRole('link', { name: 'Lames Grises' }).waitFor();
    await relier(antor, 'Apparence', 'membre de', 'Faction', 'les factions', 'Cercle des Cendres');
    await bloc(antor, 'Apparence').getByRole('link', { name: 'Cercle des Cendres' }).waitFor();
    assert.equal(await bloc(antor, 'Apparence').locator('form').count(), 0);
  });

  test('seed par l’API (indépendant du formulaire)', async () => {
    const base = `/api/univers/${U}/fiches/${aldric}/sections/${appId}/relations`;
    await api(antor, 'POST', base, { cibleFicheId: grises, type: 'membre de' }, false);
    await api(antor, 'POST', base, { cibleFicheId: cendres, type: 'membre de' }, false);
  });

  test('Léa lit « membre de → Lames Grises », ni Cercle, ni vide, ni compteur ; pas de bloc ailleurs ; pas de boutons', async () => {
    await ouvrir(lea, aldric);
    const b = bloc(lea, 'Apparence');
    const t = await b.innerText();
    assert.ok(/membre de →\s*Lames Grises/.test(t), t);
    assert.ok(!/Cendres|Aucune relation|cachée|\b2\b/.test(t), t);
    assert.equal(await b.locator('.liste-relations > li').count(), 1);
    assert.equal(await bloc(lea, 'Passé').count(), 0);
    assert.equal(await lea.getByRole('button', { name: rx('Relier') }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: rx('Retirer') }).count(), 0);
  });

  test('Antor en mode Joueur voit comme Léa, sans Relier ni Retirer', async () => {
    await ouvrir(antor, aldric, 'joueur');
    const b = bloc(antor, 'Apparence');
    const t = await b.innerText();
    assert.ok(/membre de →\s*Lames Grises/.test(t), t);
    assert.ok(!/Cendres/.test(t), t);
    assert.equal(await antor.getByRole('button', { name: rx('Relier') }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: rx('Retirer') }).count(), 0);
  });

  test('un clic sur « Lames Grises » ouvre sa fiche', async () => {
    await ouvrir(lea, aldric);
    await bloc(lea, 'Apparence').getByRole('link', { name: 'Lames Grises' }).click();
    await lea.waitForURL(new RegExp(`/fiche/${grises}$`));
  });

  test('refus : auto-relation et doublon, au-dessus du formulaire, saisie conservée', async () => {
    await ouvrir(antor, aldric);
    await relier(antor, 'Apparence', 'ami de', 'Personnage', 'les personnages', 'Maître Aldric');
    const b = bloc(antor, 'Apparence');
    await b.getByText('Une fiche ne se relie pas à elle-même.').waitFor();
    assert.equal(await b.getByLabel('Type de relation').inputValue(), 'ami de');
    assert.equal(await b.locator('.liste-relations > li').count(), 2);
    await b.getByRole('button', { name: rxExact('Annuler') }).click();
    await relier(antor, 'Apparence', 'membre de', 'Faction', 'les factions', 'Lames Grises');
    await bloc(antor, 'Apparence').getByText('Cette relation existe déjà.').waitFor();
    assert.equal(await bloc(antor, 'Apparence').locator('.liste-relations > li').count(), 2);
  });

  test('erreurs de champ : type vide, 81 caractères, aucune fiche choisie (Entrée)', async () => {
    await ouvrir(antor, aldric);
    const b = bloc(antor, 'Passé');
    await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await b.getByLabel('Type de relation').press('Enter');
    const t = await b.innerText();
    assert.ok(t.includes('Erreur : le type de relation est obligatoire.'), t);
    assert.ok(t.includes('Erreur : choisissez une fiche.'), t);
    await b.getByLabel('Type de relation').fill('a'.repeat(81));
    await b.getByLabel('Type de relation').press('Enter');
    assert.ok((await b.innerText()).includes('Erreur : 80 caractères au plus.'));
    assert.equal(await b.getByRole('button', { name: rxExact('Relier') }).isDisabled() || (await b.getByRole('button', { name: rxExact('Relier') }).getAttribute('aria-disabled')) === 'true', true);
    await b.getByRole('button', { name: rxExact('Annuler') }).click();
    assert.equal(await b.locator('form').count(), 0);
  });

  test('limite : 100 relations puis « Cette section porte déjà 100 relations. »', async () => {
    const base = `/api/univers/${U}/fiches/${aldric}/sections/${verId}/relations`;
    for (let i = 0; i < 100; i++) await api(antor, 'POST', base, { cibleFicheId: grises, type: `t${i}` });
    await ouvrir(antor, aldric);
    await relier(antor, 'Passé', 'de trop', 'Faction', 'les factions', 'Lames Grises');
    await bloc(antor, 'Passé').getByText('Cette section porte déjà 100 relations.').waitFor();
    assert.equal(await bloc(antor, 'Passé').locator('.liste-relations > li').count(), 100);
  });

  test('Antor retire sans confirmation ; étiquette accessible ; Léa ne voit plus la relation', async () => {
    await ouvrir(antor, aldric);
    const b = bloc(antor, 'Apparence');
    await b.getByRole('button', { name: 'Retirer la relation membre de → Cercle des Cendres' }).click();
    await b.getByRole('link', { name: 'Cercle des Cendres' }).waitFor({ state: 'detached' });
    assert.equal(await b.locator('.liste-relations > li').count(), 1);
  });

  test('« Lames Grises » sans section lue : la relation disparaît pour Léa sans trace', async () => {
    const r = await api(antor, 'GET', `/api/univers/${U}/fiches/${grises}`);
    const s = (r.sections ?? r.fiche?.sections).find((x: Any) => x.titre === 'Doctrine');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${grises}/sections/${s.id}`, { joueursLisent: false });
    await ouvrir(lea, aldric);
    assert.equal(await bloc(lea, 'Apparence').count(), 0);
    assert.ok(!(await texte(lea)).includes('Lames Grises'));
  });

  test('erreur de chargement : dans le bloc seul, les autres sections intactes ; Réessayer', async () => {
    let panne = true;
    await antor.route(`**/sections/${appId}/relations`, (r: Any) => (panne ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
    await ouvrir(antor, aldric);
    await section(antor, 'Apparence').getByText('Impossible de charger les relations.').waitFor();
    assert.equal(await bloc(antor, 'Passé').locator('.liste-relations > li').count(), 100);
    assert.equal(await antor.getByText('Impossible de charger les relations.').count(), 1);
    panne = false;
    await section(antor, 'Apparence').getByRole('button', { name: rxExact('Réessayer') }).click();
    await bloc(antor, 'Apparence').getByRole('link', { name: 'Lames Grises' }).waitFor();
    await antor.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('chargement : texte dans le bloc, le reste de la fiche affiché', async () => {
    await antor.route(`**/sections/${appId}/relations`, async (r: Any) => {
      await new Promise((ok) => setTimeout(ok, 1500));
      await r.continue();
    });
    await antor.goto(`/univers/${U}/fiche/${aldric}`);
    await section(antor, 'Apparence').getByText('Chargement des relations…').waitFor();
    assert.ok((await texte(antor)).includes('Grand.'));
    await attendre(antor);
    await antor.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('échec d’écriture générique : « L’action n’a pas abouti. Réessayez. », saisie conservée', async () => {
    await ouvrir(antor, aldric);
    await antor.route('**/sections/*/relations', (r: Any) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
    await relier(antor, 'Apparence', 'allié de', 'Faction', 'les factions', 'Cercle des Cendres');
    const b = bloc(antor, 'Apparence');
    await b.getByText(rx('L’action n’a pas abouti. Réessayez.')).waitFor();
    assert.equal(await b.getByLabel('Type de relation').inputValue(), 'allié de');
    await antor.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('connexion perdue : « Relier » et « Retirer » désactivés, liste conservée, lien actif', async () => {
    await ouvrir(antor, aldric);
    const b = bloc(antor, 'Apparence');
    await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await antor.context().setOffline(true);
    await antor.getByText(rx('Connexion perdue.')).first().waitFor();
    const off = async (loc: Any) => (await loc.isDisabled()) || (await loc.getAttribute('aria-disabled')) === 'true';
    assert.ok(await off(b.getByRole('button', { name: rxExact('Relier') })));
    assert.ok(await off(b.getByRole('button', { name: rx('Retirer la relation') }).first()));
    assert.equal(await b.getByRole('link', { name: 'Lames Grises' }).count(), 1);
    await antor.context().setOffline(false);
  });

  test('retirer la section retire ses relations', async () => {
    await ouvrir(antor, aldric);
    const url = `/api/univers/${U}/fiches/${aldric}/sections/${appId}`;
    await api(antor, 'DELETE', url);
    const r = await api(antor, 'GET', `${url}/relations`, undefined, false);
    assert.ok(!JSON.stringify(r).includes('Lames Grises'));
  });
});
