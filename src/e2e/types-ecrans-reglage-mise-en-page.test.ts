// Layout of the « Types de fiche » panels (E-14, E-15): no bullets, aligned with the panel, tab label on one line at 390 px.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Server;
let browser: Any;

describe('types de fiche : mise en page', { skip: skipBrowser }, () => {
  let antor: Any;
  let lame = 0;
  let cof = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const get = async (u: string) => (await antor.request.fetch(srv.base + u)).json();
    lame = (await get('/api/univers')).find((u: Any) => u.nom === "Lame d'Ébène").id;
    cof = (await get('/api/systemes')).find((s: Any) => s.nom === 'CoF Mini').id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('listes sans puce ni retrait (E-14 et E-15)', async () => {
    await antor.setViewportSize({ width: 1280, height: 800 });
    await antor.goto(`/systemes/${cof}`);
    await attendre(antor);
    await antor.getByRole('tab', { name: rxExact('Types de fiche') }).click();
    await antor.getByRole('switch').first().waitFor();
    const s = await antor.locator('ul.types-sys').evaluate((e: Any) => ({ ls: getComputedStyle(e).listStyleType, pl: getComputedStyle(e).paddingLeft }));
    assert.equal(s.ls, 'none');
    assert.equal(s.pl, '0px');
    await antor.screenshot({ path: `${CAPTURES}/mep-e15.png`, fullPage: true });
    await antor.goto(`/univers/${lame}/parametres`);
    await attendre(antor);
    await antor.locator('ul.types').waitFor();
    const u = await antor.locator('ul.types').evaluate((e: Any) => ({ ls: getComputedStyle(e).listStyleType, pl: getComputedStyle(e).paddingLeft }));
    assert.equal(u.ls, 'none');
    assert.equal(u.pl, '0px');
    await antor.screenshot({ path: `${CAPTURES}/mep-e14.png`, fullPage: true });
  });

  test('390 px : l’onglet « Types de fiche » tient sur une ligne et la bascule E-14 ne déborde pas', async () => {
    await antor.setViewportSize({ width: 390, height: 800 });
    await antor.goto(`/systemes/${cof}`);
    await attendre(antor);
    const tab = antor.getByRole('tab', { name: rxExact('Types de fiche') });
    await tab.waitFor();
    const h = await tab.evaluate((e: Any) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 20 }));
    assert.ok(h.h < h.lh * 2.2, `onglet sur plusieurs lignes: ${h.h}`);
    await tab.click();
    await antor.getByRole('switch').first().waitFor();
    await antor.screenshot({ path: `${CAPTURES}/mep-e15-390.png`, fullPage: true });
    assert.ok(await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'défilement horizontal de la page (E-15)');
    await antor.goto(`/univers/${lame}/parametres`);
    await attendre(antor);
    await antor.locator('ul.types').waitFor();
    await antor.screenshot({ path: `${CAPTURES}/mep-e14-390.png`, fullPage: true });
    assert.ok(await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'défilement horizontal de la page (E-14)');
  });
});
