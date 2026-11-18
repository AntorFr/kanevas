// ecrans: demo-composants
// kanevas-carte-spatiale-reglages-charte, in a real Chromium on /demo-composants (stub mode): the five shared
// components of E-24 (docs/charte.md § 4 « Onglets », « Curseur », « Champ couleur », « Liste de choix à
// vignettes », « Barre d'application »). Expected values are literals from the fiche and the charte.
//
// TEST PLAN
//   Onglets      : un seul arrêt de tabulation (l'actif) ; ← → sélectionnent et déplacent le focus, bouclent ; Home/End ; aria-selected
//   Curseur      : étiquette liée, valeur affichée, flèches +0,05 et bornes, erreur « Erreur : » reliée, désactivé inerte
//   Champ couleur: « Couleur invalide : #rrggbb. », pastille vide quand invalide, pastille remplie quand valide
//   Liste choix  : un seul arrêt, ↑ ↓ Home End, Entrée/clic choisit, pastille « modifié »
//   Barre d'appl.: « Rien à appliquer. » + bouton aria-disabled ; décompte en aria-live polite ; Entrée applique et rend le focus
//   Rendu        : les cinq dans les deux thèmes à 1280 et 390 px, sans débordement horizontal, cible ≥ 24 px (CAPTURES_DIR)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, startServer } from './harnais.test.js';

let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
const CAPTURES = process.env['CAPTURES_DIR'];

before(async () => {
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'antor')).page;
  await page.goto('/demo-composants');
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Composants partagés', level: 1 }).waitFor();
}, { timeout: 120000 });
after(async () => {
  await browser?.close();
  srv?.stop();
});

const actif = (p: Any) => p.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '');

test('onglets : un seul arrêt de tabulation, l’actif ; les autres sont hors de l’ordre de tabulation', async () => {
  const tabs = page.getByRole('tablist', { name: 'Réglages de la galaxie' }).getByRole('tab');
  assert.deepEqual(await tabs.allTextContents(), ['Générateur', 'Aspects', 'Carte']);
  assert.deepEqual(await tabs.evaluateAll((l: HTMLElement[]) => l.map((e) => e.tabIndex)), [0, -1, -1]);
  assert.deepEqual(await tabs.evaluateAll((l: HTMLElement[]) => l.map((e) => e.getAttribute('aria-selected'))), ['true', 'false', 'false']);
  await tabs.nth(0).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="tablist"]')), false, 'Tab sort de la liste d’onglets');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await actif(page), 'Générateur', 'Shift+Tab y revient par l’onglet actif');
});

test('onglets : → et ← sélectionnent l’onglet et y portent le focus, ils bouclent ; Home et End aux extrémités', async () => {
  const tabs = page.getByRole('tablist', { name: 'Réglages de la galaxie' }).getByRole('tab');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await actif(page), 'Aspects');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'false');
  await page.getByText('Panneau : aspects').waitFor();
  assert.deepEqual(await tabs.evaluateAll((l: HTMLElement[]) => l.map((e) => e.tabIndex)), [-1, 0, -1]);
  await page.keyboard.press('ArrowRight');
  assert.equal(await actif(page), 'Carte');
  await page.keyboard.press('ArrowRight');
  assert.equal(await actif(page), 'Générateur', '→ boucle');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await actif(page), 'Carte', '← boucle');
  await page.keyboard.press('Home');
  assert.equal(await actif(page), 'Générateur');
  await page.keyboard.press('End');
  assert.equal(await actif(page), 'Carte');
  await page.getByText('Panneau : carte').waitFor();
  const panneau = page.getByRole('tabpanel');
  assert.equal(await panneau.getAttribute('aria-labelledby'), await tabs.nth(2).getAttribute('id'));
  assert.equal(await tabs.nth(2).getAttribute('aria-controls'), await panneau.getAttribute('id'));
  await tabs.nth(0).click();
  await page.getByText('Panneau : generateur').waitFor();
});

test('curseur : étiquette liée, valeur affichée, flèches de 0,05 bornées à 0 et 1', async () => {
  const c = page.getByRole('slider', { name: /Densité des étoiles/ });
  assert.equal(await c.inputValue(), '0.5');
  await c.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await c.inputValue(), '0.55');
  await page.getByText('0.55').first().waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await c.inputValue(), '0.45');
  await page.keyboard.press('Home');
  assert.equal(await c.inputValue(), '0');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await c.inputValue(), '0', 'borne basse');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  assert.equal(await c.inputValue(), '1', 'borne haute');
  await page.keyboard.press('Home');
  await page.keyboard.press('PageUp');
  assert.ok(Number(await c.inputValue()) > 0.05, 'Page haut avance de plus d’un pas');
});

test('curseur : l’erreur est préfixée « Erreur : » et reliée par aria-describedby ; désactivé est inerte', async () => {
  const c = page.getByRole('slider', { name: /Rayon/ });
  assert.equal(await c.getAttribute('aria-invalid'), 'true');
  const id = await c.getAttribute('aria-describedby');
  assert.ok(id);
  assert.equal((await page.locator(`[id="${id}"]`).innerText()).trim(), 'Erreur : Hors des bornes.');
  const off = page.getByRole('slider', { name: /Bruit/ });
  assert.equal(await off.isDisabled(), true);
  assert.equal(await off.getAttribute('aria-describedby'), null);
});

test('champ couleur : « Couleur invalide : #rrggbb. » pour une saisie fausse, rien pour vide, pastille pleine seulement si valide', async () => {
  const bon = page.getByLabel('Couleur de la faction');
  const mauvais = page.getByLabel('Couleur du secteur');
  const vide = page.getByLabel('Couleur libre');
  assert.equal(await bon.inputValue(), '#3a4cc0');
  assert.equal(await page.getByText('Couleur invalide : #rrggbb.').count(), 1, 'seul « #12 » est refusé, « vide » ne crie pas');
  const id = await mauvais.getAttribute('aria-describedby');
  assert.ok(id);
  assert.match(await page.locator(`[id="${id}"]`).innerText(), /Couleur invalide : #rrggbb\./);
  assert.equal(await vide.getAttribute('aria-describedby'), null);
  const pastille = (champ: Any) => champ.evaluate((e: HTMLElement) => e.closest('.champ-couleur')!.querySelector('.pastille-couleur')!.className);
  assert.doesNotMatch(await pastille(bon), /vide/);
  assert.match(await pastille(mauvais), /vide/);
  assert.match(await pastille(vide), /vide/);
  const fond = await bon.evaluate((e: HTMLElement) => getComputedStyle(e.closest('.champ-couleur')!.querySelector('.pastille-couleur')!).backgroundColor);
  assert.equal(fond, 'rgb(58, 76, 192)');
  await bon.fill('#ff0000');
  await page.waitForFunction(() => (document.querySelectorAll('.pastille-couleur')[0] as HTMLElement).style.background !== '' && getComputedStyle(document.querySelectorAll('.pastille-couleur')[0]!).backgroundColor === 'rgb(255, 0, 0)');
  await bon.fill('#ff00');
  await page.getByText('Couleur invalide : #rrggbb.').nth(1).waitFor();
  assert.match(await pastille(bon), /vide/, 'invalide : pastille vide');
  await bon.fill('#3a4cc0');
});

test('liste de choix : un seul arrêt (la sélection), ↑ ↓ Home End déplacent le focus, Entrée choisit', async () => {
  const liste = page.getByRole('listbox', { name: 'Catalogue d’aspects' });
  const lignes = liste.getByRole('option');
  assert.deepEqual(await lignes.evaluateAll((l: HTMLElement[]) => l.map((e) => e.tabIndex)), [-1, 0, -1]);
  assert.deepEqual(await lignes.evaluateAll((l: HTMLElement[]) => l.map((e) => e.getAttribute('aria-selected'))), ['false', 'true', 'false']);
  assert.match(await lignes.nth(1).innerText(), /modifié/);
  await lignes.nth(1).focus();
  await page.keyboard.press('ArrowDown');
  assert.match(await actif(page), /Nébuleuse/);
  await page.keyboard.press('ArrowDown');
  assert.match(await actif(page), /Nébuleuse/, '↓ s’arrête à la fin');
  await page.keyboard.press('Home');
  assert.match(await actif(page), /Géante rouge/);
  await page.keyboard.press('ArrowUp');
  assert.match(await actif(page), /Géante rouge/, '↑ s’arrête au début');
  await page.keyboard.press('Enter');
  assert.equal(await lignes.nth(0).getAttribute('aria-selected'), 'true');
  assert.equal(await lignes.nth(1).getAttribute('aria-selected'), 'false');
  assert.deepEqual(await lignes.evaluateAll((l: HTMLElement[]) => l.map((e) => e.tabIndex)), [0, -1, -1]);
  await page.keyboard.press('End');
  assert.match(await actif(page), /Nébuleuse/);
  await lignes.nth(1).click();
  assert.equal(await lignes.nth(1).getAttribute('aria-selected'), 'true');
  assert.deepEqual(await liste.getByRole('group').evaluateAll((l: HTMLElement[]) => l.map((e) => e.getAttribute('aria-labelledby') !== null)), [true, true]);
});

test('barre d’application : « Rien à appliquer. », action désactivée mais focusable ; un décompte l’arme ; le focus lui revient', async () => {
  const barre = page.locator('.barre-application');
  const appliquer = barre.getByRole('button', { name: 'Appliquer' });
  assert.equal((await barre.locator('.phrase-barre').innerText()).trim(), 'Rien à appliquer.');
  assert.equal(await barre.locator('.phrase-barre').getAttribute('aria-live'), 'polite');
  assert.equal(await appliquer.getAttribute('aria-disabled'), 'true');
  await appliquer.click({ force: true });
  await page.getByText('Appliqué : 0').waitFor();
  await page.getByRole('button', { name: 'Basculer le décompte' }).click();
  await page.getByText('12 systèmes déplacés').waitFor();
  assert.match(await barre.locator('.phrase-barre').innerText(), /dont 2 ancrés/);
  assert.notEqual(await appliquer.getAttribute('aria-disabled'), 'true');
  await page.getByRole('button', { name: 'Basculer le décompte' }).focus();
  await appliquer.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Appliqué : 1').waitFor();
  assert.equal(await actif(page), 'Appliquer');
  await page.getByRole('button', { name: 'Basculer le décompte' }).click();
  await page.getByText('Rien à appliquer.').waitFor();
});

test('rendu : les cinq composants, clair et sombre, 1280 et 390 px, sans débordement, cibles du curseur ≥ 24 px', async () => {
  for (const [vp, w, h] of [['bureau', 1280, 900], ['telephone', 390, 844]] as const) {
    for (const theme of ['sombre', 'clair'] as const) {
      const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      await p.addInitScript((c: string) => localStorage.setItem('kanevas-theme', c), theme);
      await p.goto('/connexion-bouchon');
      await p.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
      await p.goto('/demo-composants');
      await p.waitForLoadState('networkidle');
      await p.getByRole('heading', { name: 'Onglets', level: 2 }).waitFor();
      assert.equal(await p.evaluate(() => document.documentElement.getAttribute('data-theme')), theme === 'clair' ? 'light' : 'dark', `thème ${theme}`);
      for (const g of ['Onglets', 'Curseur', 'Champ couleur', 'Liste de choix', 'Barre d’application'])
        assert.ok(await p.getByRole('heading', { name: g, level: 2 }).isVisible(), `${g} ${vp}/${theme}`);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${vp}/${theme} : pas de défilement horizontal`);
      const hauteur = await p.getByRole('slider', { name: /Densité/ }).evaluate((e: HTMLElement) => e.getBoundingClientRect().height);
      assert.ok(hauteur >= 24, `curseur ${hauteur}px`);
      const tab = await p.getByRole('tab', { name: 'Générateur' }).evaluate((e: HTMLElement) => e.getBoundingClientRect().height);
      assert.ok(tab >= (w < 760 ? 44 : 36) - 0.5, `onglet ${tab}px à ${w}`);
      if (CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        await p.screenshot({ path: `${CAPTURES}/charte-e24-${vp}-${theme}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
});
