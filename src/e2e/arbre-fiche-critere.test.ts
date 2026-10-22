// Black-box tests of kanevas-arbre-fiche (E-9: ancestor trail, « Contient », « Déplacer sous… »),
// written from the task's exit criterion and docs/ecrans.md. The world is the stub seed ("Lame d'Ébène").
// Real server in stub mode + real Chromium; expected values are literals from the criterion.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-arbre-fiche-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function ouvrir(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
  await attendre(page);
}
const fil = (page: Any) => page.getByRole('navigation', { name: /Fil d.Ariane/i }).first();
async function filTexte(page: Any): Promise<string> {
  return (await fil(page).innerText()).replace(/\s*\n\s*/g, ' › ').replace(/\s+/g, ' ').replace(/^L › /, '').trim();
}
const bloc = (page: Any) => page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Contient' }) }).last();
async function deplacer(page: Any, titre: string, cible: string | null): Promise<void> {
  await ouvrir(page, titre);
  await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  await page.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
  const d = page.getByRole('dialog');
  await d.waitFor();
  if (cible === null) await d.getByLabel('Aucun parent').check();
  else {
    await d.getByLabel('Chercher une fiche').fill(cible);
    await d.getByLabel(new RegExp(`^${cible}`)).first().check();
  }
  await d.getByRole('button', { name: 'Déplacer', exact: true }).click();
}

describe('kanevas-arbre-fiche, E-9 fil, Contient, Déplacer sous…', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    const l = await api(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    for (const f of l.fiches) ids[f.titre] = f.id;
    const racine = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Port-Sel`);
    for (const f of racine.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Léa : fil de Port-Sel sans l’ancêtre caché ; Contient sans le Repaire ; clic sur le fil', async () => {
    await ouvrir(lea, 'Port-Sel');
    assert.equal(await filTexte(lea), "Lame d'Ébène › Lieux › Port-Sel");
    const b = await lea.locator('main').innerText();
    for (const n of ['La Taverne du Kraken', 'Les Docks', 'Le Phare aux Sels', 'Quartier des Cordiers']) assert.ok(b.includes(n), n);
    assert.ok(!b.includes('Repaire'), 'Repaire fuit');
    assert.ok(!b.includes('Les Sphères'), 'Sphères fuit');
    await lea.screenshot({ path: `${SHOTS}/lea-port-sel.png` });
    await fil(lea).getByRole('link', { name: 'Lieux' }).click();
    await lea.waitForURL(/\/lieux|\/lieu/);
  });

  test('Antor voit le Repaire ; Léa n’a pas « Déplacer sous… »', async () => {
    await ouvrir(antor, 'Port-Sel');
    assert.ok((await antor.locator('main').innerText()).includes('Le Repaire des contrebandiers'));
    await ouvrir(lea, 'Port-Sel');
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    assert.ok(!(await lea.locator('body').innerText()).includes('Déplacer sous'));
  });

  test('Antor range Docks sous Taverne, Phare sous Docks : fil replié, menu « … » = Port-Sel', async () => {
    await deplacer(antor, 'La Taverne du Kraken', 'Port-Sel'); // déjà sous Port-Sel
    await antor.getByText('Fiche déplacée.').waitFor();
    await deplacer(antor, 'Les Docks', 'La Taverne du Kraken');
    await antor.getByText('Fiche déplacée.').waitFor();
    await deplacer(antor, 'Le Phare aux Sels', 'Les Docks');
    await antor.getByText('Fiche déplacée.').waitFor();
    await attendre(antor);
    assert.equal(
      await filTexte(antor),
      "Lame d'Ébène › Lieux › Les Sphères › … › La Taverne du Kraken › Les Docks › Le Phare aux Sels",
    );
    await antor.screenshot({ path: `${SHOTS}/phare-fil.png` });
    await fil(antor).getByText('…', { exact: true }).click();
    const items = await antor.getByRole('menuitem').allInnerTexts();
    assert.equal(items.length, 1, items.join('|'));
    assert.ok(items[0].includes('Port-Sel'), items[0]);
  });

  test('cycle refusé, boîte ouverte ; puis Docks sous Sphères : toast et fil changé', async () => {
    await ouvrir(antor, 'Les Sphères');
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    const d = antor.getByRole('dialog');
    await d.getByLabel('Chercher une fiche').fill('Port-Sel');
    await d.getByLabel(/^Port-Sel/).first().check();
    await d.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await d.getByText('Une fiche ne peut pas être rangée sous l’un de ses descendants.').waitFor();
    assert.equal(await d.isVisible(), true);
    await antor.screenshot({ path: `${SHOTS}/cycle.png` });
    // soi-même n'est pas proposé
    await d.getByLabel('Chercher une fiche').fill('Sphères');
    await antor.waitForTimeout(800);
    assert.equal(await d.getByLabel(/^Les Sphères/).count(), 0);
    await d.getByRole('button', { name: 'Annuler' }).click();

    await deplacer(antor, 'Les Docks', 'Les Sphères');
    await antor.getByText('Fiche déplacée.').waitFor();
    await attendre(antor);
    assert.equal(await filTexte(antor), "Lame d'Ébène › Lieux › Les Sphères › Les Docks");
  });

  test('« Aucun parent » met à la racine', async () => {
    await deplacer(antor, 'Les Docks', null);
    await antor.getByText('Fiche déplacée.').waitFor();
    await attendre(antor);
    assert.equal(await filTexte(antor), "Lame d'Ébène › Lieux › Les Docks");
  });
});
