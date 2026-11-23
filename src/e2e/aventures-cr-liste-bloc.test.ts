// ecrans: comptes-rendus, fiche
// Browser proof of kanevas-cr-aventure-liste-bloc (B-cr-aventure-4, P-4, E-9 block, E-13 column, AD-cr-aventure-3):
// the « Comptes-rendus » block of a campaign lists the reports of its scenarios, each descending line naming its scenario
// (a link to its sheet), the campaign's own line without a pill; the scenario's page lists its own only, no placeholder,
// no count of what is hidden; E-13 names each line's own adventure. The effect is proved by its door
// (`?campagne=` route); the screen keeps what the user sees. Real server in stub mode + Chromium.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 240000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = '';
let campagne = 0;
let arc = 0;
let etape = 0;
const errors: string[] = [];

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  assert.ok(r.ok(), `${method} ${path}: ${r.status()}`);
  return r.json();
}
const crs = (p: Any) => p.getByRole('region', { name: 'Comptes-rendus', exact: true });
const lignes = (p: Any) => crs(p).locator('li');
const ligne = (p: Any, titre: string) => lignes(p).filter({ hasText: titre });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  const ctx = await browser.newContext({ baseURL: srv.base });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
  await page.getByRole('heading', { name: 'Mes univers', exact: true }).waitFor();
  antor = { page };
  const p = page;
  uid = String((await api(p, 'POST', '/api/univers', { nom: 'Liste descendante' })).id);
  const fiche = async (sousType: string, titre: string, parent?: number) => {
    const id = (await api(p, 'POST', `/api/univers/${uid}/fiches`, { type: 'aventure', sousType, titre, sections: [{ titre: 'Intrigue' }] })).id;
    if (parent) await api(p, 'PATCH', `/api/univers/${uid}/fiches/${id}`, { parent });
    return id;
  };
  campagne = await fiche('Campagne', 'La Couronne brisée');
  arc = await fiche('Scénario', 'Arc des Marches', campagne);
  etape = await fiche('Scénario', 'Étape du gué', arc);
  await api(p, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: campagne, titre: 'CR campagne' });
  await api(p, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: arc, titre: 'CR arc' });
  await api(p, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: etape, titre: 'CR étape' });
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

test('page de la campagne : trois lignes, arc et étape nomment leur scénario en lien, la campagne sans pastille', opts, async () => {
  const p = antor.page;
  await p.goto(`/univers/${uid}/fiche/${campagne}`);
  await ligne(p, 'CR étape').waitFor();
  assert.equal(await lignes(p).count(), 3);
  assert.equal(await ligne(p, 'CR campagne').locator('.badge-type').count(), 0);
  const pArc = ligne(p, 'CR arc').locator('a.badge-type');
  const pEtape = ligne(p, 'CR étape').locator('a.badge-type');
  assert.equal((await pArc.textContent())?.trim(), 'Arc des Marches');
  assert.equal((await pEtape.textContent())?.trim(), 'Étape du gué');
  assert.ok((await pEtape.boundingBox()).height >= 24, 'pastille de 24 px au moins');
  assert.match(await pArc.getAttribute('href'), new RegExp(`/fiche/${arc}$`));
  await pEtape.click();
  await p.getByRole('heading', { name: 'Étape du gué', level: 1 }).waitFor();
});

test('page d’un scénario : ses lignes seulement, sans pastille ni décompte ni placeholder', opts, async () => {
  const p = antor.page;
  await p.goto(`/univers/${uid}/fiche/${etape}`);
  await ligne(p, 'CR étape').waitFor();
  assert.equal(await lignes(p).count(), 1);
  assert.equal(await crs(p).locator('.badge-type').count(), 0);
  const arcPage = `/univers/${uid}/fiche/${arc}`;
  await p.goto(arcPage);
  await ligne(p, 'CR étape').waitFor();
  assert.equal(await lignes(p).count(), 2, 'l’arc liste le sien et celui de l’étape');
  assert.equal(await ligne(p, 'CR arc').locator('.badge-type').count(), 0);
  assert.equal(await ligne(p, 'CR étape').locator('a.badge-type').count(), 1);
  assert.doesNotMatch((await crs(p).textContent()) ?? '', /masqu|caché|\(\d+\)/i);
});

test('E-13 : chaque ligne nomme l’aventure propre', opts, async () => {
  const p = antor.page;
  await p.goto(`/univers/${uid}/comptes-rendus`);
  await p.getByRole('link', { name: 'CR étape' }).waitFor();
  const l = (t: string) => p.locator('li.ligne-compte-rendu').filter({ hasText: t });
  assert.equal((await l('CR campagne').locator('a.badge-type').textContent())?.trim(), 'La Couronne brisée');
  assert.equal((await l('CR arc').locator('a.badge-type').textContent())?.trim(), 'Arc des Marches');
  assert.equal((await l('CR étape').locator('a.badge-type').textContent())?.trim(), 'Étape du gué');
});

test('aucune exception navigateur sur le parcours', opts, () => {
  assert.deepEqual(errors, []);
});
