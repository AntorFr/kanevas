// Black-box test of kanevas-rv-accueil, E-2: the seal preview does not exist while the name is empty
// (no empty dashed tile), and shows up with the first initial.
//
// TEST PLAN (panne nommée → test)
//   carré vide : nom vide → un .sceau pointillé sans contenu au-dessus du titre   [.sceau présent à vide]
//   aperçu     : nom saisi → .sceau avec l'initiale ; nom vidé → disparaît          [absent après saisie / reste après vidage]
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { attendre, connecte, ouvrirFormulaireUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Awaited<ReturnType<typeof launch>>;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('E-2 : aucun sceau tant que le nom est vide, puis l’initiale dès la saisie', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Antor');
  await ouvrirFormulaireUnivers(page);
  await page.getByRole('heading', { name: 'Créer un univers', level: 1 }).waitFor();
  await attendre(page);
  const sceau = page.locator('.entete-form .sceau');
  assert.equal(await sceau.count(), 0);
  await page.getByLabel('Nom', { exact: true }).fill('Zéphyr');
  await sceau.waitFor();
  assert.equal(await sceau.getAttribute('data-initiale'), 'Z');
  await page.getByLabel('Nom', { exact: true }).fill('   ');
  assert.equal(await sceau.count(), 0);
  await ctx.close();
});
