// B-29 on E-4: during an outage of all of /api, « Réessayer » must bring the member list back, even when
// the universe request (not only the members one) was the one that failed.
// Panne visée : « Réessayer » ne relance que /membres ; /api/univers/:id reste en erreur et le message demeure.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-4 · erreur : panne de /api, puis « Réessayer » relance membres ET univers et affiche la liste', opts, async () => {
  const { page } = await connecte(browser, srv.base, 'Antor');
  await creerUnivers(page, 'Panne membres');
  await page.getByRole('heading', { name: 'Panne membres', level: 1 }).waitFor();
  const id = /\/univers\/([^/]+)/.exec(page.url())?.[1];
  assert.ok(id);

  let casse = true;
  await page.route('**/api/**', (r: Any) => (casse ? r.abort() : r.continue()));
  const appels: string[] = [];
  page.on('request', (r: Any) => appels.push(new URL(r.url()).pathname));
  await page.goto(`/univers/${id}/membres`);
  await page.getByText('Impossible de charger les membres.').waitFor();

  casse = false;
  appels.length = 0;
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await page.getByRole('heading', { name: 'Membres', level: 1 }).waitFor();
  await page.getByLabel('Rôle de antor').waitFor();
  await attendre(page);
  assert.equal(await page.getByText('Impossible de charger les membres.').count(), 0);
  assert.ok(appels.includes(`/api/univers/${id}`), `univers relancé : ${appels.join(', ')}`);
  assert.ok(appels.includes(`/api/univers/${id}/membres`), `membres relancé : ${appels.join(', ')}`);
});
