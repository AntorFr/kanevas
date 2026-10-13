// Black-box test of the exit criterion of `kanevas-refonte-visuelle`: « Le thème se règle depuis le menu
// de l'avatar et nulle part ailleurs » (docs/ecrans.md « Détail de kanevas-refonte-visuelle », criteria).
//
// TEST PLAN
//   Screens E-1, E-2, E-3, E-4, E-6 list, E-8, E-9, E-10, E-13, E-14, E-16, at desktop and phone size, as the GM:
//     - outside the avatar menu: no control (button, radio, switch, option) named Clair / Sombre / Système / Thème
//     - the avatar menu, opened on each, offers the three choices and « Se déconnecter »
//   Player (Léa) on the sheet: the same menu, the same absence elsewhere.
// Breaks if a screen grows its own theme switch (or the sidebar takes it back).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, ajouterMembre, allerMembres, attendre, connecte, creerFiche, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor.setDefaultTimeout(8000);
  lea.setDefaultTimeout(8000);
  await creerUnivers(antor, 'Lame d’Ébène');
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const ECRANS_MJ = [
  '/',
  '/nouvel-univers',
  '/univers/1',
  '/univers/1/membres',
  '/univers/1/campagnes',
  '/univers/1/fiches/personnages',
  '/univers/1/fiche/1',
  '/univers/1/cartes',
  '/univers/1/comptes-rendus',
  '/univers/1/parametres',
  '/systemes',
];
const THEME = /^(Clair|Sombre|Système|Thème)$/;

async function controlesDeTheme(p: Any): Promise<number> {
  let n = 0;
  for (const role of ['button', 'radio', 'menuitemradio', 'switch', 'option', 'combobox', 'tab']) {
    n += await p.getByRole(role, { name: THEME }).count();
  }
  return n;
}

async function verifier(p: Any, url: string, compte: RegExp) {
  await p.goto(url);
  await attendre(p);
  assert.equal(await controlesDeTheme(p), 0, `${url} : un réglage de thème hors du menu de l’avatar`);
  await p.getByRole('button', { name: compte }).first().click();
  const menu = p.getByRole('menu');
  await menu.waitFor();
  for (const t of ['Clair', 'Sombre', 'Système']) await menu.getByRole('menuitemradio', { name: t }).waitFor();
  await menu.getByRole('menuitem', { name: 'Se déconnecter' }).waitFor();
  await p.keyboard.press('Escape');
}

for (const [nom, vue] of [['bureau', { width: 1280, height: 900 }], ['téléphone', { width: 390, height: 844 }]] as const) {
  test(`le thème n’est réglable que depuis le menu de l’avatar, sur tous les écrans du MJ (${nom})`, opts, async () => {
    await antor.setViewportSize(vue);
    for (const url of ECRANS_MJ) {
      if (nom === 'téléphone') {
        await antor.goto(url);
        await attendre(antor);
        assert.equal(await controlesDeTheme(antor), 0, `${url} : un réglage de thème hors du menu de l’avatar`);
        const menu = antor.getByRole('button', { name: /^Menu$/ });
        if (await menu.count()) await menu.click();
        await antor.getByRole('button', { name: /antor/i }).first().click();
        await antor.getByRole('menuitemradio', { name: 'Sombre' }).waitFor();
        await antor.keyboard.press('Escape');
      } else {
        await verifier(antor, url, /antor/i);
      }
    }
  });
}

test('un Joueur règle le thème au même endroit et nulle part ailleurs', opts, async () => {
  await lea.setViewportSize({ width: 1280, height: 900 });
  for (const url of ['/', '/univers/1', '/univers/1/fiche/1', '/univers/1/fiches/personnages']) {
    await verifier(lea, url, /l[ée]a/i);
  }
});

test('choisir Sombre depuis le menu de l’avatar d’un écran s’applique à un autre écran', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 900 });
  await antor.goto('/univers/1/parametres');
  await attendre(antor);
  await antor.getByRole('button', { name: /antor/i }).first().click();
  await antor.getByRole('menuitemradio', { name: 'Clair' }).click();
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'light');
  await antor.goto('/univers/1/membres');
  await attendre(antor);
  assert.equal(await antor.evaluate(() => document.documentElement.dataset.theme), 'light');
});
