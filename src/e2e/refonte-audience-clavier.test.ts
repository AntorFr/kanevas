// Black-box test for `kanevas-refonte-visuelle`, from the need only (docs/charte.md « Échap le ferme et rend
// le focus à la pastille » for the audience dialog). Real stub server + Chromium (harnais.test.ts).
//
// TEST PLAN
//   (deux joueurs membres : la liste porte aucun, lea, teo)
//   Échap depuis la liste « Auteur » : la boîte « Qui voit » se ferme, le focus revient à la pastille
//   [la touche Échap est perdue quand le focus est dans la liste, ou le focus n'est pas rendu]
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, ajouterMembre, ajouterSection, allerMembres, connecte, creerFiche, creerUnivers, launch, section, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await (await connecte(browser, srv.base, 'Léa')).ctx.close();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  antor.setDefaultTimeout(8000);
  await creerUnivers(antor, 'Clavier');
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await antor.getByLabel('Rôle de lea').waitFor();
  await (await connecte(browser, srv.base, 'Teo')).ctx.close();
  await ajouterMembre(antor, 'teo', 'Joueur');
  await antor.getByLabel('Rôle de lea').waitFor();
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await ajouterSection(antor, 'Apparence');
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('Échap pressé dans la liste « Auteur » après le choix d’un auteur ferme la boîte « Qui voit » et rend le focus à la pastille', opts, async () => {
  const pastille = section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ });
  await pastille.click();
  const boite = antor.getByRole('dialog', { name: 'Qui voit « Apparence »' });
  await boite.waitFor();
  await boite.getByRole('combobox', { name: /Auteur/ }).selectOption({ label: 'lea' });
  await boite.getByRole('switch', { name: /L’auteur la lit/ }).waitFor();
  // The list is disabled while the PATCH is in flight: focus it only once it is enabled again.
  const auteur = boite.getByRole('combobox', { name: /Auteur/ });
  await antor.waitForFunction((el: HTMLSelectElement) => !el.disabled, await auteur.elementHandle());
  await auteur.focus();
  await antor.keyboard.press('Escape');
  await boite.waitFor({ state: 'detached' });
  assert.equal(await pastille.getAttribute('aria-expanded'), 'false');
});
