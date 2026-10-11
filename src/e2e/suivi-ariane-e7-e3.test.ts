// Black-box test: E-7 breadcrumb « Campagnes › <campagne> › <scénario> » with the Campagnes item current,
// and E-3 « Préparation » block (GM only) box at 390 px (4–386 px, like E-6/E-9, not 0–390).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
let uid = '';
let cid = 0;
let sid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(page, 'Ariane');
  await page.getByRole('heading', { name: 'Ariane', level: 1 }).waitFor();
  uid = new URL(page.url()).pathname.split('/').pop()!;
  cid = (await (await page.request.post(`/api/univers/${uid}/campagnes`, { data: { nom: 'Camp ar' } })).json()).id;
  sid = (await (await page.request.post(`/api/campagnes/${cid}/scenarios`, { data: { titre: 'Scén ar' } })).json()).id;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-7 : fil « Campagnes › campagne › scénario », item Campagnes courant', opts, async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/univers/${uid}/scenarios/${sid}`);
  await page.getByRole('heading', { name: 'Scén ar', level: 1 }).waitFor();
  const fil = page.getByRole('navigation', { name: 'Fil d’Ariane' });
  await fil.getByText('Scén ar').first().waitFor();
  const texte: string = (await fil.innerText()).replace(/\s+/g, ' ');
  const i = [texte.indexOf('Campagnes'), texte.indexOf('Camp ar'), texte.indexOf('Scén ar')];
  assert.ok(i[0]! >= 0 && i[0]! < i[1]! && i[1]! < i[2]!, `fil: ${texte}`);
  assert.equal(await fil.locator('[aria-current="page"]').innerText().then((t: string) => t.trim()), 'Scén ar');
  const maillonCampagne = fil.getByRole('link', { name: 'Camp ar' });
  assert.equal(await maillonCampagne.count(), 1, 'maillon campagne = lien');
  assert.match((await maillonCampagne.getAttribute('href')) ?? '', new RegExp(`/campagnes/${cid}$`));
  assert.equal(await fil.getByRole('link', { name: 'Scén ar' }).count(), 0, 'dernier maillon non lien');
  const item = page.locator('aside a.item[aria-current="page"], nav a.item[aria-current="page"]');
  assert.deepEqual((await item.allInnerTexts()).map((t: string) => t.trim()), ['Campagnes']);
  // the maillon leads to the campaign
  await maillonCampagne.click();
  await page.getByRole('heading', { name: 'Camp ar', level: 1 }).waitFor();
});

test('E-7 : le fil ne survit pas à la page (E-6 : pas de maillon scénario)', opts, async () => {
  await page.goto(`/univers/${uid}/scenarios/${sid}`);
  await page.getByRole('heading', { name: 'Scén ar', level: 1 }).waitFor();
  await page.getByRole('link', { name: /Camp ar/ }).first().click();
  await page.getByRole('heading', { name: 'Camp ar', level: 1 }).waitFor();
  const fil = page.getByRole('navigation', { name: 'Fil d’Ariane' });
  assert.ok(!(await fil.innerText()).includes('Scén ar'));
});

test('E-3 téléphone : le bloc « Préparation » (MJ seul) tient dans 4–386 px', opts, async () => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/univers/${uid}`);
  const bloc = page.locator('section.bloc-ve.mj-seul').first();
  await bloc.waitFor();
  const b = await bloc.boundingBox();
  assert.ok(b.x >= 3 && b.x <= 5, `x=${b.x}`);
  assert.ok(b.x + b.width >= 385 && b.x + b.width <= 387, `droite=${b.x + b.width}`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= 390, `débordement horizontal ${sw}`);
});
