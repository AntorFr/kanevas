// Black-box test of kanevas-rv-accueil, E-1 cards at 1440 px (maquette e01: three cards of ~325 px, the
// game system name is shown whole). Stub server WITH the starting data (« Les Cendres de Vaëlis » on
// « Chroniques Oubliées Fantasy »).
//
// TEST PLAN (panne nommée → test)
//   largeur   : la colonne du cadre (1000 px) écrase la grille → cartes ~299 px          [carte < 320 px]
//   coupe     : le nom du système est tronqué par l'ellipsis                              [scrollWidth > clientWidth]
//   débordement : le meta d'une carte ne déborde pas de la carte (retour à la ligne)       [meta > carte]
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;

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

test('E-1 à 1440 px : cartes de ~325 px et nom du système entier', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Antor');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(page);
  const carte = page.getByRole('link', { name: /Les Cendres de Vaëlis/ });
  await carte.waitFor();
  const largeur = await carte.evaluate((e: HTMLElement) => e.closest('li')!.getBoundingClientRect().width);
  assert.ok(largeur >= 320 && largeur <= 330, `largeur de carte ${largeur}`);
  const t = carte.locator('.sys-u .t');
  assert.equal((await t.innerText()).trim(), 'Chroniques Oubliées Fantasy');
  const m = await t.evaluate((e: HTMLElement) => ({ s: e.scrollWidth, c: e.clientWidth }));
  assert.ok(m.s <= m.c, `nom du système tronqué (${m.s} > ${m.c})`);
  const dehors = await carte.evaluate((e: HTMLElement) => {
    const r = e.getBoundingClientRect();
    return [...e.querySelectorAll('.meta-u > span')].filter((s) => s.getBoundingClientRect().right > r.right + 0.5).length;
  });
  assert.equal(dehors, 0);
  await ctx.close();
});

test('E-1 à 390 px : le nom du système retourne à la ligne sans déborder', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Antor');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByRole('link', { name: /Les Cendres de Vaëlis/ }).waitFor();
  await attendre(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await ctx.close();
});
