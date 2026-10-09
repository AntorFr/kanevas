// Review tests of kanevas-cg-ecran-cartes: the creation form's « Forme » field and the
// background-image label (docs/ecrans.md E-10). Real server in stub mode + real Chromium.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, creerUnivers, launch, rxExact, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Brume');
  await antor.getByRole('heading', { name: 'Brume', level: 1 }).waitFor();
});
after(async () => {
  await browser?.close();
  await srv?.stop();
});

test('Forme est un champ étiqueté (Carte illustrée / Graphe) ; le fond n’existe que pour l’illustrée', opts, async () => {
  await antor.getByRole('link', { name: rxExact('Cartes') }).first().click();
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  const forme = antor.getByLabel('Forme');
  assert.equal(await forme.count(), 1, 'Forme a une étiquette reliée');
  assert.deepEqual(await forme.locator('option').allTextContents(), ['Carte illustrée', 'Graphe']);
  assert.equal(await antor.getByLabel('Image de fond').count(), 1);
  assert.equal(await antor.getByLabel('Image de fond').getAttribute('type'), 'file');
  await forme.selectOption('graphe');
  assert.equal(await antor.getByLabel('Image de fond').count(), 0, 'pas de fond pour un graphe');
  await forme.selectOption('illustree');
  assert.equal(await antor.getByLabel('Image de fond').count(), 1);
});
