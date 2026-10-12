// Black-box test of kanevas-refonte-visuelle, from docs/ecrans.md « États des composants du cadre »:
//   menu du compte / connexion perdue -> « il s'ouvre ; le thème change (il est local) ; « Se déconnecter » reste actif ».
// Named failure: the menu (or its theme choices, or its sign-out) is disabled/hidden while the connection is lost.
// Edge: the same menu online (control) has the same three choices and an enabled sign-out.
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

test('témoin : en ligne, le menu du compte a trois thèmes et « Se déconnecter » actif', opts, async () => {
  await antor.goto('/univers/1');
  await attendre(antor);
  await bouton(antor).click();
  const menu = antor.getByRole('menu');
  await menu.waitFor();
  assert.equal(await menu.getByRole('menuitemradio').count(), 3);
  assert.equal(await menu.getByRole('menuitem', { name: 'Se déconnecter' }).isDisabled(), false);
  await antor.keyboard.press('Escape');
});

test('connexion perdue : le menu du compte s’ouvre, le thème change, « Se déconnecter » reste actif', opts, async () => {
  await antor.goto('/univers/1');
  await attendre(antor);
  await antor.context().setOffline(true);
  await antor.getByText('Connexion perdue.', { exact: false }).first().waitFor({ timeout: 20000 });
  await bouton(antor).click();
  const menu = antor.getByRole('menu');
  await menu.waitFor();
  assert.equal(await menu.getByRole('menuitemradio').count(), 3);
  await menu.getByRole('menuitemradio', { name: 'Sombre' }).click();
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await menu.getByRole('menuitemradio', { name: 'Clair' }).click();
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await menu.getByRole('menuitem', { name: 'Se déconnecter' }).isDisabled(), false);
  await antor.context().setOffline(false);
});
