// Black-box test of kanevas-refonte-visuelle, from docs/ecrans.md « États des composants du cadre »:
//   menu du compte / `/api/moi` en échec -> « l'identifiant manque ; le thème et « Se déconnecter » restent ».
// Named failure: the menu depends on /api/moi to open, or hides the theme / sign-out when it fails.
// Edges: the same menu with /api/moi healthy shows the identifier (control), so the assertion is not vacuous.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Lame d’Ébène');
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

const bouton = (p: Any) => p.getByRole('complementary', { name: 'Barre latérale' }).getByRole('button', { name: /antor|compte/i }).last();

test('témoin : /api/moi sain, le menu du compte dit « antor »', opts, async () => {
  await antor.goto('/univers/1');
  await attendre(antor);
  await bouton(antor).click();
  const menu = antor.getByRole('menu');
  await menu.getByText('antor').first().waitFor();
  assert.equal(await menu.getByRole('menuitemradio').count(), 3);
});

test('/api/moi en échec : pas d’identifiant, mais le thème (3 choix) et « Se déconnecter » restent', opts, async () => {
  await antor.route('**/api/moi', (r: Any) => r.fulfill({ status: 500, body: 'boom' }));
  await antor.goto('/univers/1');
  await attendre(antor);
  const compte = antor.getByRole('complementary', { name: 'Barre latérale' }).getByRole('button', { name: /compte/i }).last();
  await compte.click();
  const menu = antor.getByRole('menu');
  await menu.waitFor();
  assert.equal(await menu.getByText('antor').count(), 0, 'aucun identifiant sans /api/moi');
  assert.equal(await menu.getByRole('menuitemradio').count(), 3);
  await menu.getByRole('menuitemradio', { name: 'Sombre' }).click();
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await menu.getByRole('menuitem', { name: 'Se déconnecter' }).waitFor();
  await antor.unroute('**/api/moi');
});
