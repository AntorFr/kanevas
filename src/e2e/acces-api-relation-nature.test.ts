// E-18 « Accès API »: the relation reference names `nature` and `qualificatif` and the deprecation of `type` (AD-134).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  const us = await (await antor.request.get('/api/univers')).json();
  uid = us.find((u: Any) => u.nom === 'Essai Kanka').id;
});
after(async () => {
  await browser?.close();
  await srv?.stop();
});

test('l’exemple de relation lit nature et qualificatif, et la page dit que type est déprécié', { skip: skipBrowser }, async () => {
  await antor.goto(`/univers/${uid}/acces-api`);
  const exemple = antor.getByLabel('Exemple de relation');
  await exemple.waitFor();
  const texte = await exemple.textContent();
  assert.match(texte, /"nature": "se_situe"/);
  assert.match(texte, /"qualificatif": "habite"/);
  assert.doesNotMatch(texte, /"type"/);
  await antor.getByText(/« type » est déprécié/).waitFor();
  if (process.env.CAPTURES_DIR) await antor.screenshot({ path: `${process.env.CAPTURES_DIR}/acces-api-relation.png`, fullPage: true });
});
