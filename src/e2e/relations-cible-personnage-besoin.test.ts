// Re-check of kanevas-fiches-liees-natures, B-63: relating a sheet to a CHARACTER (allié de, ennemi de, « Sans nature »)
// must give a line « nature · cible — qualificatif » on the source sheet, with no crash of the screen, in every case below.
// Written from the need (docs/parcours.md B-63, docs/ecrans.md E-9 « Relier »), not from the code. Expected values are literals.
// Real stub server WITH its starting world + real Chromium. Screenshots in /tmp.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-cible-personnage-shots';
const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};
const erreursPage: string[] = [];

async function photo(page: Any, nom: string): Promise<void> {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}
const plat = (s: string) => s.replace(/\s+/g, ' ').trim();

async function ouvrir(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
  await page.getByRole('group', { name: 'Relations' }).first().waitFor();
}
/** Links `source` to the character `cible`; resolves with the POST status once the form has answered. */
async function relier(page: Any, source: string, nature: string, cible: string, qualificatif: string): Promise<number> {
  await ouvrir(page, source);
  const b = page.getByRole('group', { name: 'Relations' }).first();
  await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
  await b.getByLabel('Nature').selectOption({ label: nature });
  await b.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
  if (qualificatif) await b.getByLabel('Qualificatif').fill(qualificatif);
  await b.getByRole('button', { name: new RegExp(`^${cible}`) }).first().click();
  const [rep] = await Promise.all([
    page.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/relations$/.test(r.url())),
    b.getByRole('button', { name: rxExact('Relier') }).click(),
  ]);
  return rep.status();
}
const ligne = (page: Any, cible: string) => page.locator('.relation', { hasText: cible });
async function retirer(page: Any, cible: string): Promise<void> {
  await ligne(page, cible).first().getByRole('button', { name: /^Retirer la relation/ }).click();
  await page.waitForFunction((c: string) => !Array.from(document.querySelectorAll('.relation')).some((e) => e.textContent?.includes(c)), cible);
}

describe('B-63 : relier vers un personnage ne casse pas la fiche source', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    for (const p of [antor, lea]) {
      p.setDefaultTimeout(30000);
      p.on('pageerror', (e: Any) => erreursPage.push(String(e.message ?? e)));
    }
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
    for (const t of ['personnage', 'lieu']) {
      const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=${t}`)).json();
      for (const f of r.fiches) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Fails if the line of a relation whose target is a character throws while rendering (the source sheet disappears).
  test('nominal : Maître Aldric allié de Suie, qualificatif « complice » : ligne lue, fiche vivante, aucune erreur de page', opts, async () => {
    const avant = erreursPage.length;
    assert.equal(await relier(antor, 'Maître Aldric', 'allié de', 'Suie', 'complice'), 201);
    await ligne(antor, 'Suie').first().waitFor();
    assert.equal(plat(await ligne(antor, 'Suie').first().innerText()).includes('allié de · Suie — complice'), true);
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await photo(antor, 'aldric-allie-suie');
    assert.deepEqual(erreursPage.slice(avant), []);
    assert.equal(await antor.getByText(/Cannot read properties/).count(), 0);
  });

  test('ennemi de → Le Prieur masqué (PNJ caché des joueurs) : ligne « ennemi de · Le Prieur masqué — traître »', opts, async () => {
    const avant = erreursPage.length;
    assert.equal(await relier(antor, 'Maître Aldric', 'ennemi de', 'Le Prieur masqué', 'traître'), 201);
    await ligne(antor, 'Le Prieur masqué').first().waitFor();
    assert.equal(plat(await ligne(antor, 'Le Prieur masqué').first().innerText()).includes('ennemi de · Le Prieur masqué — traître'), true);
    assert.deepEqual(erreursPage.slice(avant), []);
  });

  test('bord : « Sans nature » vers un personnage garde le texte libre ; la fiche survit au rechargement', opts, async () => {
    const avant = erreursPage.length;
    assert.equal(await relier(antor, 'Maître Aldric', 'Sans nature', 'Bran Corvalis', 'cousin éloigné'), 201);
    await ligne(antor, 'Bran Corvalis').first().waitFor();
    await antor.reload();
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await ligne(antor, 'Bran Corvalis').first().waitFor();
    const t = plat(await ligne(antor, 'Bran Corvalis').first().innerText());
    assert.equal(t.includes('cousin éloigné'), true);
    assert.equal(t.includes('Bran Corvalis'), true);
    assert.equal(/Sans nature/.test(t), false);
    await photo(antor, 'aldric-sans-nature-bran');
    assert.deepEqual(erreursPage.slice(avant), []);
  });

  test('bord : la source est un lieu (Port-Sel), « Sans nature » vers Suie : ligne lue, fiche vivante', opts, async () => {
    const avant = erreursPage.length;
    assert.equal(await relier(antor, 'Port-Sel', 'Sans nature', 'Suie', 'protégée par'), 201);
    await ligne(antor, 'Suie').first().waitFor();
    assert.equal(plat(await ligne(antor, 'Suie').first().innerText()).includes('protégée par'), true);
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    assert.deepEqual(erreursPage.slice(avant), []);
  });

  test('bord : la cible Léa Brisefer (PJ), allié de : ligne puis retrait, la fiche reste', opts, async () => {
    assert.equal(await relier(antor, 'Dame Ombeline de Val-Fortin', 'allié de', 'Léa Brisefer', ''), 201);
    await ligne(antor, 'Léa Brisefer').first().waitFor();
    assert.equal(plat(await ligne(antor, 'Léa Brisefer').first().innerText()).includes('allié de · Léa Brisefer'), true);
    await retirer(antor, 'Léa Brisefer');
    assert.equal(await ligne(antor, 'Léa Brisefer').count(), 0);
    await antor.getByRole('heading', { level: 1, name: 'Dame Ombeline de Val-Fortin' }).waitFor();
  });

  test('échec : « Sans nature » sans qualificatif vers un personnage : refus affiché, aucune ligne, fiche vivante', opts, async () => {
    await ouvrir(antor, 'Bran Corvalis');
    const b = antor.getByRole('group', { name: 'Relations' }).first();
    await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await b.getByLabel('Nature').selectOption({ label: 'Sans nature' });
    await b.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
    await b.getByRole('button', { name: /^Suie/ }).first().click();
    await b.getByRole('button', { name: rxExact('Relier') }).click();
    await antor.getByText('Le qualificatif est obligatoire sans nature.').first().waitFor();
    assert.equal(await ligne(antor, 'Suie').count(), 0);
    await antor.getByRole('heading', { level: 1, name: 'Bran Corvalis' }).waitFor();
  });

  // Fails if a reader without the right to read the target sees its line, or if the source sheet crashes for her.
  test('exclusion : Léa lit la fiche d\'Aldric : elle voit « Suie » mais jamais la ligne vers Le Prieur masqué (invisible pour elle)', opts, async () => {
    const avant = erreursPage.length;
    await ouvrir(lea, 'Maître Aldric');
    await ligne(lea, 'Suie').first().waitFor();
    assert.equal(plat(await ligne(lea, 'Suie').first().innerText()).includes('allié de · Suie — complice'), true);
    assert.equal(await lea.getByText('Le Prieur masqué').count(), 0);
    await photo(lea, 'lea-aldric');
    assert.deepEqual(erreursPage.slice(avant), []);
  });

  test('la fiche de la cible (Suie) s\'ouvre sans erreur après avoir été reliée', opts, async () => {
    const avant = erreursPage.length;
    await antor.goto(`/univers/${U}/fiche/${ids['Suie']}`);
    await antor.getByRole('heading', { level: 1, name: 'Suie' }).waitFor();
    assert.deepEqual(erreursPage.slice(avant), []);
  });
});
