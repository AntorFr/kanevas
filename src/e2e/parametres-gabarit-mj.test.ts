// Tests of E-14 Paramètres template: the three GM panels are the closed hatched block of E-6/E-9 (arbitrated
// 13/10, replaces the open tint + 2 px rule), the column is ~688 px, fields run full width, textareas use the
// interface font. E-6 (campaign) keeps its hatching.
// Panne visée : cadre ouvert (dégradé, filet 2 px) sur E-14, colonne de 840 px, Nom plafonné, description en serif,
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
  test(`E-14 ${schema} bureau : bloc fermé hachuré de E-6/E-9 sur les cinq panneaux`, opts, async () => {
    await ouvrirParametres(schema);
    const panneaux = await p.locator('.panneau.reserve-mj').evaluateAll((els: HTMLElement[]) => els.map((e) => {
      const s = getComputedStyle(e);
      const before = getComputedStyle(e, '::before');
      return { bg: s.backgroundImage, shadow: s.boxShadow, borderLeft: s.borderLeftWidth, before: before.content, ml: s.marginLeft };
    }));
    await p.screenshot({ path: `/tmp/rv-parametres-gabarit-${schema}.png` });
    assert.equal(panneaux.length, 5); // Identité, Système de jeu, Créer un système, Types de fiche, Supprimer l’univers
    for (const x of panneaux) {
      assert.ok(x.bg.includes('repeating-linear-gradient'), `hachure : ${x.bg}`);
      assert.ok(/0px 0px 0px 1px inset/.test(x.shadow), `filet complet de 1 px : ${x.shadow}`);
      assert.ok(!/(?<![\d.])2px 0px 0px 0px/.test(x.shadow), `pas de filet gauche de 2 px : ${x.shadow}`);
      assert.equal(x.borderLeft, '0px');
      assert.equal(x.before, '""', 'barre de 3 px en ::before');
      assert.equal(x.ml, '-28px', 'même marge que E-6/E-9');
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
  assert.ok(nom >= panneau - 56 - 4, `Nom ${nom} px sur panneau ${panneau} px (pleine largeur)`);
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
