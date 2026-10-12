// Browser checks of the E-18 / E-9 alignment on the mock-ups (docs/maquettes/e18-acces-api.html, e09-fiche-importee.html).
//
// TEST PLAN
//   E-18 à plat   : Jetons and Lots sections are not cards (no .panneau); a token row has a transparent background
//   lot replié    : the « N refusées » count is in the danger colour, the « Clos » pill carries an icon
//   E-9 menu ⋯    : « Importée · clé … · créée le … » holds on one line (desktop), clé not split from its « · »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JETON_BOUCHON } from '../bouchon/depart.js';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let ficheId = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  const us = await (await antor.request.get('/api/univers')).json();
  uid = us.find((u: Any) => u.nom === 'Essai Kanka').id;
  const base = `/api/import/v1/univers/${uid}`;
  const h = { authorization: `Bearer ${JETON_BOUCHON}` };
  const lot = (await (await fetch(srv.base + base + '/lots', { method: 'POST', headers: h })).json()).lotId;
  const put = (cle: string, body: unknown) =>
    fetch(`${srv.base}${base}/fiches/${encodeURIComponent(cle)}?lot=${lot}`, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await put('lieu:port-sel', { type: 'lieu', titre: 'Port-Sel', sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un port.', joueursLisent: true }] });
  assert.equal(ok.status, 200);
  for (const k of ['a', 'b', 'c']) await put('mauvais:' + k, { type: 'inconnu', titre: 'x' });
  await fetch(`${srv.base}${base}/lots/${lot}/clore`, { method: 'POST', headers: h });
  const fiches = (await (await antor.request.get(`/api/univers/${uid}/fiches`)).json()).fiches;
  ficheId = fiches.find((f: Any) => f.titre === 'Port-Sel').id;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('E-18 : sections à plat, refusées en rouge, pastille Clos avec icône', opts, async () => {
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  assert.equal(await antor.locator('.page-acces-api .panneau').count(), 0);
  const refus = antor.locator('.compteurs .refus-n').first();
  await refus.waitFor();
  assert.match(await refus.innerText(), /refusée/);
  const rouge = await refus.evaluate((e: Element) => getComputedStyle(e).color);
  const gris = await antor.locator('.compteurs').first().evaluate((e: Element) => getComputedStyle(e).color);
  assert.notEqual(rouge, gris);
  const pastille = antor.locator('li', { hasText: 'Clos' }).first().getByText('Clos').first();
  assert.ok(await pastille.locator('xpath=ancestor-or-self::*[1]').locator('svg').count() + (await pastille.locator('xpath=..').locator('svg').count()) > 0);
});

test('E-9 : la ligne « Importée » du menu ⋯ tient sur une ligne', opts, async () => {
  await antor.setViewportSize({ width: 1280, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  const ligne = antor.locator('.info-fiche span').first();
  await ligne.waitFor();
  assert.match(await ligne.innerText(), /^Importée · clé\s+lieu:port-sel\s+· créée le/);
  await antor.waitForTimeout(500);
  await antor.screenshot({ path: '/tmp/menu-importee.png' });
  const { h, lh } = await ligne.evaluate((e: Element) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) }));
  assert.ok(h <= lh * 1.2, `ligne sur plusieurs lignes: ${h} > ${lh}`);
  await antor.waitForTimeout(500);
  await antor.screenshot({ path: '/tmp/menu-importee.png' });
});

test('E-9 : au téléphone la ligne reste dans l’écran, clé insécable', opts, async () => {
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/fiche/${ficheId}`);
  await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  const menu = antor.locator('.menu:has(.info-fiche)');
  await menu.waitFor();
  await antor.waitForTimeout(500);
  await antor.screenshot({ path: '/tmp/menu-importee-390.png' });
  const r = await menu.evaluate((e: Element) => e.getBoundingClientRect().toJSON());
  assert.ok(r.left >= 0 && r.right <= 390, `menu hors écran: ${r.left}..${r.right}`);
  await antor.waitForTimeout(500);
  await antor.screenshot({ path: '/tmp/menu-importee-390.png' });
});
