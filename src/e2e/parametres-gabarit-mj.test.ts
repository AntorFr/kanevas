// Tests of E-14 Paramètres template, from docs/maquettes/e14-parametres.html: the three panels carry the
// light amber tint and a 2 px rule (not the E-9 hatching, which says a section's secret), the column is
// ~688 px, fields run full width, textareas use the interface font. E-6 (campaign) keeps its hatching.
// Panne visée : hachure/filet épais d'E-9 sur E-14, colonne de 840 px, Nom plafonné, description en serif,
// et la correction qui retirerait la hachure de l'autre écran partageant .panneaux-suivi.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, creerUnivers, launch, rxExact, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let p: Any;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  p = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(p, 'Gabarit E14');
  await p.getByRole('heading', { name: 'Gabarit E14', level: 1 }).waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

const ouvrirParametres = async (schema: 'light' | 'dark') => {
  await p.emulateMedia({ colorScheme: schema });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Paramètres') }).click();
  await p.getByLabel('Nom du système').waitFor();
  await attendre(p);
};

for (const schema of ['dark', 'light'] as const) {
  test(`E-14 ${schema} bureau : teinte légère + filet 2 px sur les trois panneaux, sans hachure`, opts, async () => {
    await ouvrirParametres(schema);
    const panneaux = await p.locator('.panneau.reserve-mj').evaluateAll((els: HTMLElement[]) => els.map((e) => {
      const s = getComputedStyle(e);
      const before = getComputedStyle(e, '::before');
      return { bg: s.backgroundImage, shadow: s.boxShadow, borderLeft: s.borderLeftWidth, before: before.content, ml: s.marginLeft };
    }));
    await p.screenshot({ path: `/tmp/rv-parametres-gabarit-${schema}.png` });
    assert.equal(panneaux.length, 3);
    for (const x of panneaux) {
      assert.ok(!x.bg.includes('repeating-linear-gradient'), `pas de hachure : ${x.bg}`);
      assert.ok(x.bg.includes('linear-gradient'), `teinte en dégradé : ${x.bg}`);
      assert.ok(x.shadow.includes('inset') && /\b2px 0px 0px 0px\b/.test(x.shadow), `filet 2 px : ${x.shadow}`);
      assert.equal(x.borderLeft, '0px', 'pas de filet de 3 px de bordure');
      assert.ok(x.before === 'none' || x.before === 'normal', `pas de filet 3 px en ::before : ${x.before}`);
      assert.equal(x.ml, '0px', 'pas de débordement latéral de 28 px');
    }
  });
}

test('E-14 bureau : colonne ~688 px, champs Nom et description sur toute la colonne', opts, async () => {
  await ouvrirParametres('dark');
  const col = await p.locator('.page-parametres').evaluate((e: HTMLElement) => e.getBoundingClientRect().width);
  assert.ok(col >= 680 && col <= 700, `colonne ${col} px (attendu ~688)`);
  const nom = await p.getByLabel(/^Nom(?! du système)/).evaluate((e: HTMLElement) => e.getBoundingClientRect().width);
  const desc = await p.getByLabel('Description').evaluate((e: HTMLElement) => e.getBoundingClientRect().width);
  const panneau = await p.locator('.panneau.reserve-mj').first().evaluate((e: HTMLElement) => {
    const r = e.getBoundingClientRect();
    return r.width;
  });
  assert.ok(nom > 560, `Nom ${nom} px : plus plafonné à 560`);
  assert.ok(nom >= panneau - 40 - 4, `Nom ${nom} px sur panneau ${panneau} px (pleine largeur)`);
  assert.ok(Math.abs(desc - nom) <= 2, `description ${desc} px = nom ${nom} px`);
});

test('E-14 : les textareas sont en police d’interface (sans-serif), comme le reste', opts, async () => {
  await ouvrirParametres('dark');
  const f = await p.locator('.page-parametres textarea').evaluateAll((els: HTMLElement[]) =>
    els.map((e) => getComputedStyle(e).fontFamily));
  const corps = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  assert.ok(f.length >= 1);
  for (const x of f) {
    assert.equal(x, corps, `textarea ${x} ≠ interface ${corps}`);
    assert.ok(!/serif/.test(x.replace(/sans-serif/g, '')), `pas de serif : ${x}`);
  }
});

test('E-14 à 390 px : pas de débordement horizontal', opts, async () => {
  await ouvrirParametres('dark');
  await p.setViewportSize({ width: 390, height: 800 });
  await attendre(p);
  const deborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await p.screenshot({ path: '/tmp/rv-parametres-gabarit-390.png' });
  await p.setViewportSize({ width: 1440, height: 900 });
  assert.equal(deborde, false);
});

test('E-6 campagne : la hachure d’audience (E-9) reste intacte sur Scénarios', opts, async () => {
  await p.emulateMedia({ colorScheme: 'dark' });
  const idUnivers = new URL(p.url()).pathname.split('/')[2];
  await p.goto(`/univers/${idUnivers}/campagnes`);
  await attendre(p);
  await p.getByLabel(/^Nom/).fill('Camp gabarit');
  await p.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await attendre(p);
  await p.locator('main').getByRole('link', { name: /^Camp gabarit/ }).first().click();
  await p.getByRole('heading', { name: 'Camp gabarit', level: 1 }).waitFor();
  await attendre(p);
  const bg = await p.locator('.panneau.reserve-mj').first().evaluate((e: HTMLElement) => ({
    bg: getComputedStyle(e).backgroundImage, ml: getComputedStyle(e).marginLeft,
    before: getComputedStyle(e, '::before').content,
  }));
  assert.ok(bg.bg.includes('repeating-linear-gradient'), `hachure : ${bg.bg}`);
  assert.equal(bg.ml, '-28px');
  assert.equal(bg.before, '""');
});
