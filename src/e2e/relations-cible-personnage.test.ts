// Review non-regression: a relation whose target is a character (PNJ or PJ) must render, survive a reload and be removable
// (the screen once crashed reading `charge.pj` of the shortened target). Real stub server + Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

describe('B-63 : relations vers un personnage', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    antor.setDefaultTimeout(30000);
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
    const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=personnage`)).json();
    for (const f of r.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const cas: Array<[string, string, string, RegExp]> = [
    ['allié de', 'Suie', 'PNJ', /allié de\s*·\s*Suie/],
    ['ennemi de', 'Le Prieur masqué', 'PNJ', /ennemi de\s*·\s*Le Prieur masqué/],
    ['allié de', 'Léa Brisefer', 'PJ', /allié de\s*·\s*Léa Brisefer/],
  ];
  for (const [nature, cible, _k, rx] of cas) {
    test(`${nature} → ${cible} : ligne, rechargement, retrait`, { timeout: 120000 }, async () => {
      const page = antor;
      await page.goto(`/univers/${U}/fiche/${ids['Dame Ombeline de Val-Fortin']}`);
      await page.getByRole('heading', { level: 1, name: 'Dame Ombeline de Val-Fortin' }).waitFor();
      const b = section(page, 'Apparence').getByRole('group', { name: 'Relations' });
      await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await b.getByLabel('Nature').selectOption({ label: nature });
      await b.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
      await b.getByRole('button', { name: new RegExp(`^${cible}`) }).first().click();
      const [rep] = await Promise.all([
        page.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/relations$/.test(r.url())),
        b.getByRole('button', { name: rxExact('Relier') }).click(),
      ]);
      assert.equal(rep.status(), 201);
      const ligne = () => section(page, 'Apparence').locator('.relation', { hasText: cible });
      await ligne().first().waitFor();
      assert.match((await ligne().first().innerText()).replace(/\s+/g, ' '), rx);
      await page.reload();
      await page.getByRole('heading', { level: 1, name: 'Dame Ombeline de Val-Fortin' }).waitFor();
      await ligne().first().waitFor();
      assert.match((await ligne().first().innerText()).replace(/\s+/g, ' '), rx);
      await ligne().first().getByRole('button', { name: /^Retirer la relation/ }).click();
      await page.waitForFunction((c: string) => !Array.from(document.querySelectorAll('.relation')).some((e) => e.textContent?.includes(c)), cible);
      assert.equal(await ligne().count(), 0);
    });
  }
});
