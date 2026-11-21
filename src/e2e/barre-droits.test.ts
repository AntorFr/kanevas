// ecrans: accueil
// Black-box tests of kanevas-premiere-fiche written from the need (docs/parcours.md B-3, B-4,
// B-8, B-9; docs/ecrans.md "Barre latérale", "Rôles × écrans × actions"). Expected values are
// literals taken from the docs. Same harness as the other e2e files: real server in stub mode
// (AD-55) + real Chromium. They complete besoins-ensemble.test.ts: sidebar contents, role per
// universe, and rights a Player must not gain through the real HTTP API.
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
  skipBrowser,
  startServer,
  texte,
  titresSections,
  type Server,
} from './harnais.test.js';

// « Paramètres » (E-14) is built by kanevas-systemes: the MJ sees it, see below.
const NAV_NON_CONSTRUITE = ['Administration'];
const LORE = ['Personnages', 'Lieux', 'Factions', 'Objets', 'Événements', 'Quêtes'];

describe('kanevas-premiere-fiche, barre latérale et droits', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;

  before(async () => {
    srv = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // The sidebar answers the apostrophe of the doc with the typographic one.
  const lien = (page: Any, nom: string) => page.getByRole('link', { name: rx(nom, 'i') }).filter({ hasText: rx(nom) });
  /** Waits for the sidebar of an universe to be drawn before counting its items. */
  async function barrePrete(page: Any) {
    await page.getByRole('link', { name: 'Personnages', exact: true }).waitFor();
    await attendre(page);
  }

  async function compte(nom: string) {
    return connecte(browser, srv.base, nom);
  }
  /** Each given account signs in once, so that the MJ can add it by identifier (B-3). */
  /** Adds `identifiant` and waits until the member list shows it (the write is optimistic). */
  async function ajouter(page: Any, identifiant: string) {
    await ajouterMembre(page, identifiant);
    await page.getByText(identifiant, { exact: true }).first().waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '…'));
  }
  async function sIdentifier(...noms: string[]) {
    for (const n of noms) await (await compte(n)).ctx.close();
  }

  test('barre : le MJ voit Vue d’ensemble, les six types de Lore et Membres ; aucun item d’écran non construit', async () => {
    await sIdentifier('Mira');
    const mira = await compte('Mira');
    await creerUnivers(mira.page, 'Barre MJ');
    await barrePrete(mira.page);
    for (const nom of ['Vue d\'ensemble', 'Comptes-rendus', 'Cartes', ...LORE, 'Membres', 'Paramètres']) {
      assert.equal(await lien(mira.page, nom).count(), 1, `lien « ${nom} » attendu une fois`);
    }
    for (const nom of NAV_NON_CONSTRUITE) {
      assert.equal(await lien(mira.page, nom).count(), 0, `« ${nom} » ne doit pas être affiché`);
    }
    await mira.ctx.close();
  });

  test('barre : un compte du groupe parents (Admin) membre d’un univers voit « Administration » une fois, sous « Instance »', async () => {
    const admin = await compte('Admin');
    await creerUnivers(admin.page, 'Barre Admin');
    await barrePrete(admin.page);
    assert.equal(await lien(admin.page, 'Administration').count(), 1);
    assert.equal(await lien(admin.page, 'Membres').count(), 1);
    await admin.page.goto('/');
    await attendre(admin.page);
    assert.equal(await lien(admin.page, 'Administration').count(), 1);
    await admin.ctx.close();
  });

  test('barre : le Joueur n’a pas « Membres » ; forcer l’adresse répond « Page introuvable. », sans formulaire d’ajout', async () => {
    await sIdentifier('Léa');
    const antor = await compte('Antor');
    await creerUnivers(antor.page, 'Barre Joueur');
    await antor.page.waitForURL(/\/univers\/[^/]+$/);
    const chemin = new URL(antor.page.url()).pathname;
    await allerMembres(antor.page);
    await ajouter(antor.page, 'lea');

    const lea = await compte('Léa');
    await lea.page.goto(chemin);
    await barrePrete(lea.page);
    assert.equal(await lien(lea.page, 'Membres').count(), 0);
    for (const nom of ['Comptes-rendus', 'Cartes', ...LORE]) assert.equal(await lien(lea.page, nom).count(), 1, nom);
    for (const nom of [...NAV_NON_CONSTRUITE, 'Paramètres']) assert.equal(await lien(lea.page, nom).count(), 0, nom);
    await lea.page.goto(chemin + '/membres');
    await attendre(lea.page);
    const t = await texte(lea.page);
    assert.ok(t.includes('Page introuvable.'));
    assert.ok(!t.includes('Identifiant du compte'));
    await antor.ctx.close();
    await lea.ctx.close();
  });

  test('le rôle se porte par univers : Antor MJ de l’un, Joueur de l’autre, et la navigation suit', async () => {
    await sIdentifier('Antor');
    const lea = await compte('Léa');
    await creerUnivers(lea.page, 'Chez Léa');
    await allerMembres(lea.page);
    await ajouter(lea.page, 'antor');

    const antor = await compte('Antor');
    await creerUnivers(antor.page, 'Chez Antor');
    await antor.page.goto('/');
    await attendre(antor.page);
    const chezLea = antor.page.getByRole('link', { name: rx('Chez Léa') }).first();
    const chezAntor = antor.page.getByRole('link', { name: rx('Chez Antor') }).first();
    assert.ok(/Joueur/.test(await chezLea.innerText()), 'Joueur chez Léa');
    assert.ok(/\bMJ\b/.test(await chezAntor.innerText()), 'MJ chez Antor');
    await chezLea.click();
    await barrePrete(antor.page);
    assert.equal(await lien(antor.page, 'Membres').count(), 0, 'pas de Membres en Joueur');
    await antor.ctx.close();
    await lea.ctx.close();
  });
});
