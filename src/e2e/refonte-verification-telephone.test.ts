// Black-box complements for `kanevas-refonte-visuelle`, written from the need only (fiche « Critère de
// sortie », docs/ecrans.md « Détail de `kanevas-refonte-visuelle` » : critères, E-9 édition, § Barre latérale).
// Real server in stub mode + real Chromium (harnais.test.ts). Expected values are literals of the docs.
//
// TEST PLAN (besoin -> panne nommée)
//   critère de sortie au téléphone, clair et sombre : coupe la lecture des joueurs d'« Apparence » -> « MJ seul »,
//                    toast « Audience de « Apparence » enregistrée », section hachurée, pas de débordement
//                    [le geste ne marche qu'au bureau / la hachure manque en clair ou en sombre]
//   ⌘+Entrée        : fait ce que fait « Enregistrer » (docs/ecrans.md : « Ctrl+Entrée (⌘+Entrée sur Mac) »)
//                    [seul Ctrl est écouté]
//   menu du compte au téléphone : dans le tiroir, l'avatar ouvre thème (3 choix) et « Se déconnecter », entièrement dans l'écran
//                    [le menu sort de l'écran ou manque derrière le tiroir]
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let tel: Any;
let urlAldric = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Lame d’Ébène');
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await ajouterSection(antor, 'Apparence');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  urlAldric = new URL(antor.url()).pathname;
  // the phone: 390 px, touch, no hover
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  tel = await ctx.newPage();
  tel.setDefaultTimeout(8000);
  await tel.goto('/connexion-bouchon');
  await tel.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
  await attendre(tel);
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('critère de sortie au téléphone', { skip: skipBrowser }, () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} : couper la lecture des joueurs d'« Apparence » dit « MJ seul », hachure la section et donne le toast`, opts, async () => {
      await tel.emulateMedia({ colorScheme: theme });
      await tel.goto(urlAldric);
      await attendre(tel);
      const s = section(tel, 'Apparence');
      assert.equal(await s.getByRole('button', { name: /^Lue des joueurs — régler/ }).count(), 1);
      const avant = await s.evaluate((e: Any) => getComputedStyle(e).backgroundImage);
      assert.equal(avant, 'none', 'section lue des joueurs : pas de hachure');
      await regler(tel, 'Apparence', 'Les joueurs la lisent', false);
      await s.getByRole('button', { name: /^MJ seul — régler/ }).waitFor();
      await tel.getByText('Audience de « Apparence » enregistrée').waitFor();
      const apres = await s.evaluate((e: Any) => getComputedStyle(e).backgroundImage);
      assert.match(apres, /gradient/, 'section MJ seul : trame hachurée');
      const toast = await tel.getByText('Audience de « Apparence » enregistrée').boundingBox();
      assert.ok(toast && toast.x >= 0 && toast.x + toast.width <= 390, 'le toast tient dans les 390 px');
      assert.equal(await tel.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'aucun débordement horizontal');
      await regler(tel, 'Apparence', 'Les joueurs la lisent', true);
      await s.getByRole('button', { name: /^Lue des joueurs — régler/ }).waitFor();
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} : le toast d'audience ne recouvre ni la dernière ligne du réglage ni son aide (charte 2.4.11)`, opts, async () => {
      // a short phone screen (390 x 300, a phone in landscape): the setting is as tall as the space left
      // above the zone where toasts stand, so a toast at the bottom would sit on its last rows
      await tel.setViewportSize({ width: 390, height: 300 });
      await tel.emulateMedia({ colorScheme: theme });
      await tel.goto(urlAldric);
      await attendre(tel);
      const s = section(tel, 'Apparence');
      await s.getByRole('button', { name: /régler l['’]audience de/ }).click();
      const boite = tel.getByRole('dialog', { name: /^Qui voit/ });
      await boite.waitFor();
      const interrupteur = boite.getByRole('switch', { name: rx('Les joueurs l’écrivent') });
      await interrupteur.click();
      const toast = tel.getByText('Audience de « Apparence » enregistrée');
      await toast.waitFor();
      const t = await toast.boundingBox();
      const derniere = await boite.getByRole('switch', { name: rx('L’auteur l’écrit') }).boundingBox();
      const aide = await boite.getByText('Chaque changement est enregistré aussitôt.').boundingBox();
      assert.ok(t && derniere && aide, 'toast, dernière ligne et aide sont affichés');
      const chevauche = (a: Any, b: Any) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(chevauche(t, derniere), false, 'le toast ne recouvre pas « L’auteur l’écrit »');
      assert.equal(chevauche(t, aide), false, 'le toast ne recouvre pas l’aide');
      await tel.keyboard.press('Escape');
      await boite.waitFor({ state: 'detached' });
      await tel.setViewportSize({ width: 390, height: 844 });
    });
  }

  test('le thème se règle depuis l’avatar du tiroir : trois choix et « Se déconnecter » tiennent dans l’écran', opts, async () => {
    await tel.goto(urlAldric);
    await attendre(tel);
    await tel.getByRole('button', { name: rxExact('Menu') }).click();
    const barre = tel.getByRole('complementary', { name: 'Barre latérale' });
    await barre.getByRole('button', { name: /antor/i }).click();
    const choix = tel.getByRole('menuitemradio');
    assert.equal(await choix.count(), 3);
    for (const nom of ['Clair', 'Sombre', 'Système']) {
      const b = await tel.getByRole('menuitemradio', { name: rx(nom) }).boundingBox();
      assert.ok(b && b.x >= 0 && b.x + b.width <= 390 && b.y >= 0 && b.y + b.height <= 844, `${nom} dans l'écran`);
    }
    const sortie = await tel.getByRole('menuitem', { name: rx('Se déconnecter') }).boundingBox();
    assert.ok(sortie && sortie.x >= 0 && sortie.x + sortie.width <= 390 && sortie.y + sortie.height <= 844, '« Se déconnecter » dans l’écran');
  });
});

describe('raccourci d’édition de la fiche', { skip: skipBrowser }, () => {
  test('⌘+Entrée enregistre la section comme « Enregistrer », avec son toast', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    const s = section(antor, 'Apparence');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill('Grand, voûté, cape grise.');
    await antor.keyboard.press('Meta+Enter');
    await antor.getByText('« Apparence » enregistrée').waitFor();
    assert.ok((await s.innerText()).includes('Grand, voûté, cape grise.'));
    assert.equal(await s.getByRole('textbox').count(), 0, 'le champ est refermé');
  });
});
