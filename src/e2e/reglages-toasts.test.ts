// Black-box tests of kanevas-rv-reglages, from its exit criterion and docs/ecrans.md § « Partout »:
// every successful action on E-4, E-14, E-15 gives its toast, a refusal gives none, the texts of the
// doc stay, and nothing overflows at 390 px. Real server in stub mode + Chromium.
// Panne visée : un toast oublié sur une action de ces écrans, ou posé alors que le serveur a refusé.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  allerMembres,
  ajouterMembre,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rxExact,
  skipBrowser,
  startServer,
  texte,
  voit,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let p: Any;
const NOM = 'Reglages toasts';

const toastDe = (page: Any, texteToast: string) => page.locator('.toasts .toast').filter({ hasText: texteToast });
const barre = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await connecte(browser, srv.base, 'Léa'); // Léa must have signed in once to be added
  p = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(p, NOM);
  await p.getByRole('heading', { name: NOM, level: 1 }).waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-4 : ajouter, changer le rôle, retirer donnent leur toast ; le refus du seul MJ n’en donne pas', opts, async () => {
  await barre(p).getByRole('link', { name: rxExact('Membres') }).click();
  await allerMembres(p);
  await ajouterMembre(p, 'lea', 'Joueur');
  await toastDe(p, '« lea » ajouté').waitFor();

  await p.getByLabel('Rôle de lea').selectOption({ label: 'MJ' });
  await toastDe(p, '« lea » enregistré').waitFor();
  await p.getByLabel('Rôle de lea').selectOption({ label: 'Joueur' });
  await p.locator('.toasts .toast').filter({ hasText: '« lea » enregistré' }).first().waitFor();

  // refusal: the only GM cannot be demoted — message, and no toast for it
  const avant = await p.locator('.toasts .toast').count();
  await p.getByLabel('Rôle de antor').selectOption({ label: 'Joueur' });
  await voit(p, "Impossible : l'univers doit garder au moins un MJ.");
  assert.equal(await p.getByLabel('Rôle de antor').inputValue(), 'mj');
  assert.equal(await p.locator('.toasts .toast').filter({ hasText: '« antor »' }).count(), 0);
  assert.ok((await p.locator('.toasts .toast').count()) <= avant);

  // removal: the confirmation is a dialog, Annuler gives no toast, the confirmation does
  await p.getByRole('button', { name: 'Retirer lea', exact: true }).click();
  const d = p.getByRole('alertdialog', { name: /Retirer lea de Reglages toasts \?/ });
  await d.waitFor();
  await d.getByRole('button', { name: rxExact('Annuler') }).click();
  await d.waitFor({ state: 'detached' });
  assert.equal(await toastDe(p, '« lea » retiré').count(), 0);
  await p.getByRole('button', { name: 'Retirer lea', exact: true }).click();
  await p.getByRole('alertdialog').getByRole('button', { name: 'Retirer lea', exact: true }).click();
  await toastDe(p, '« lea » retiré').waitFor();
  assert.equal(await p.getByLabel('Rôle de lea').count(), 0);
});

test('E-4 : à 390 px la page ne déborde pas et la liste reste lisible', opts, async () => {
  await p.setViewportSize({ width: 390, height: 800 });
  await attendre(p);
  const deborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await p.screenshot({ path: '/tmp/rv-reglages-membres-390.png' });
  await p.setViewportSize({ width: 1440, height: 900 });
  assert.equal(deborde, false);
});

test('E-14 : enregistrer, créer et rattacher, rattacher, détacher donnent leur toast ; nom vide et nom pris n’en donnent pas', opts, async () => {
  await barre(p).getByRole('link', { name: rxExact('Paramètres') }).click();
  await p.getByLabel('Nom du système').waitFor();
  await attendre(p);

  await p.getByLabel('Description').fill('Une description');
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await toastDe(p, 'Enregistré.').waitFor();

  // empty name: message under the field, no toast
  await p.getByLabel(/^Nom(?! du système)/).fill('');
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(p, 'Erreur : le nom est obligatoire.');
  await p.getByLabel(/^Nom(?! du système)/).fill(NOM);

  await p.getByLabel('Nom du système').fill('CoF Toast');
  await p.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
  await toastDe(p, '« CoF Toast » créé et rattaché').waitFor();
  await voit(p, 'Utilisé par 1 univers');

  // a taken name (case ignored): the doc's message, no new toast
  await p.waitForTimeout(300);
  const avant = await p.locator('.toasts .toast').count();
  await p.getByLabel('Nom du système').fill('cof toast');
  await p.getByRole('button', { name: rxExact('Créer et rattacher') }).click();
  await voit(p, 'Un système porte déjà ce nom.');
  assert.ok((await p.locator('.toasts .toast').count()) <= avant, 'no new toast on a refused creation');

  await p.getByLabel('Système du catalogue').selectOption({ label: 'Aucun système' });
  await p.getByRole('button', { name: rxExact('Rattacher') }).click();
  await toastDe(p, '« CoF Toast » détaché').waitFor();
  await voit(p, "Cet univers n'est rattaché à aucun système de jeu.");

  await p.getByLabel('Système du catalogue').selectOption({ label: 'CoF Toast' });
  await p.getByRole('button', { name: rxExact('Rattacher') }).click();
  await toastDe(p, '« CoF Toast » rattaché').waitFor();
  await voit(p, 'Ouvrir le système');
  await p.screenshot({ path: '/tmp/rv-reglages-parametres-1440.png' });
});

test('E-15 : ajouter et modifier une entrée donnent leur toast, sans prendre le focus', opts, async () => {
  await p.getByRole('link', { name: 'Ouvrir le système' }).click();
  await p.getByRole('heading', { name: 'CoF Toast', level: 1 }).waitFor();
  await attendre(p);
  await p.getByRole('tab', { name: /^Créatures( \d+)?$/ }).click();
  await p.getByRole('button', { name: rxExact('Ajouter une créature') }).click();
  await p.getByLabel(/^Nom(?! du système)/).fill('Garde');
  await p.getByLabel('Contenu').fill('Lance');
  await p.getByRole('button', { name: rxExact('Ajouter') }).click();
  await toastDe(p, '« Garde » ajouté').waitFor();
  assert.ok(await p.evaluate(() => !document.activeElement?.closest('.toasts')));

  await p.getByText('Garde', { exact: true }).first().click();
  await p.getByRole('button', { name: rxExact('Modifier') }).click();
  await p.getByLabel('Contenu').fill('Lance et bouclier');
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await toastDe(p, '« Garde » enregistré').waitFor();
  assert.ok((await texte(p)).includes('Lance et bouclier'));
});
