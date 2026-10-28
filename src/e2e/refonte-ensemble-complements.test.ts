// Black-box complements for `kanevas-refonte-visuelle`, written from the need only (fiche « Livre » and
// « Critère de sortie », docs/ecrans.md « Détail de `kanevas-refonte-visuelle` », B-29, docs/charte.md).
// Real server in stub mode + real Chromium (harnais.test.ts). Expected values are literals of the docs.
//
// TEST PLAN (besoin -> panne nommée)
//   cadre sur tous les écrans : la barre ne porte ni thème ni déconnexion hors du menu de l'avatar
//                               [le thème ou la déconnexion réapparaît dans la barre]
//   thème partagé             : choisi sur un écran, il vaut sur les autres [thème propre à un écran]
//   téléphone, tous écrans    : aucun débordement horizontal, clair et sombre [écran non refait pour le mobile]
//   mode Joueur               : bandeau puis retour du MJ : la pastille revient
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
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
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
const UNIVERS = "Lame d'Ébène";

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let urlUnivers = '';
let urlAldric = '';

const attendre = (page: Any) => page.waitForLoadState('networkidle');
const barre = (page: Any) => page.getByRole('complementary', { name: 'Barre latérale' });
async function shot(page: Any, nom: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, UNIVERS, 'Une table de jeu.');
  await antor.getByRole('heading', { name: UNIVERS, level: 1 }).waitFor();
  urlUnivers = new URL(antor.url()).pathname;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await ajouterSection(antor, 'Apparence');
  await ajouterSection(antor, 'Vérité — MJ seul');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  urlAldric = new URL(antor.url()).pathname;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

const ECRANS_MJ: [string, string][] = [
  ['vue d’ensemble', ''],
  ['membres', '/membres'],
  ['comptes-rendus', '/comptes-rendus'],
  ['paramètres', '/parametres'],
  ['liste des personnages', '/personnages'],
];

describe('le cadre : thème et déconnexion derrière l’avatar seulement', () => {
  test('la barre latérale fermée ne montre ni « Se déconnecter » ni choix de thème, sur chaque écran', opts, async () => {
    const urls = ECRANS_MJ.map(([, u]) => urlUnivers + u).concat([urlAldric]);
    for (const u of urls) {
      await antor.goto(u);
      await attendre(antor);
      const t = await barre(antor).innerText();
      assert.doesNotMatch(t, /Se déconnecter/, u);
      for (const mot of ['Clair', 'Sombre', 'Système']) assert.doesNotMatch(t, new RegExp(`\\b${mot}\\b`), `${u} : ${mot}`);
    }
  });

  test('le thème choisi depuis l’avatar vaut sur les autres écrans', opts, async () => {
    await antor.emulateMedia({ colorScheme: 'dark' });
    await antor.goto(urlAldric);
    await attendre(antor);
    await antor.getByRole('button', { name: /Menu du compte|antor/i }).last().click();
    const menu = antor.getByRole('menu', { name: 'Compte' });
    await menu.waitFor();
    const n = { name: rx('Clair') };
    await menu.getByRole('radio', n).or(menu.getByRole('menuitemradio', n)).or(menu.getByRole('button', n)).or(menu.getByRole('menuitem', n)).first().click();
    for (const [, u] of ECRANS_MJ) {
      await antor.goto(urlUnivers + u);
      await attendre(antor);
      const fond = await antor.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fond').trim().toLowerCase());
      assert.equal(fond, '#fcfcfd', `thème clair sur ${u || 'vue d’ensemble'}`);
    }
    await shot(antor, 'complement-clair-parametres');
  });
});

describe('téléphone : aucun écran ne déborde, en clair et en sombre', () => {
  for (const schema of ['light', 'dark'] as const) {
    test(`écrans d’un univers en ${schema}, 375 px`, opts, async () => {
      const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 375, height: 800 }, colorScheme: schema, hasTouch: true });
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
      await attendre(page);
      const adresses = ['/'].concat(ECRANS_MJ.map(([, u]) => urlUnivers + u), [urlAldric]);
      for (const u of adresses) {
        await page.goto(u);
        await attendre(page);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(debord <= 0, `${u} en ${schema} : débordement de ${debord}px`);
      }
      await shot(page, `complement-telephone-${schema}`);
      await ctx.close();
    });
  }
});

describe('mode Joueur', () => {
  test('en revenant au mode MJ, la pastille d’audience revient et le bandeau part', opts, async () => {
    await antor.goto(urlAldric);
    await attendre(antor);
    await antor.getByRole('radio', { name: /Mode Joueur|^Joueur/ }).first().click();
    await antor.getByText(rx('Mode Joueur : vous voyez ce que voit un joueur.')).waitFor();
    assert.equal(await section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ }).count(), 0);
    await antor.getByRole('radio', { name: /Mode MJ|^MJ/ }).first().click();
    await section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ }).waitFor();
    assert.equal(await antor.getByText(rx('Mode Joueur : vous voyez ce que voit un joueur.')).count(), 0);
  });
});
