// ecrans: fiche
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

  async function cas(nature: string, cible: string, rx: RegExp) {
    const page = antor;
    await page.goto(`/univers/${U}/fiche/${ids['Dame Ombeline de Val-Fortin']}`);
    await page.getByRole('heading', { level: 1, name: 'Dame Ombeline de Val-Fortin' }).waitFor();
    const b = section(page, 'Apparence').getByRole('group', { name: 'Relations' });
    await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await b.getByLabel('Nature').selectOption({ label: nature });
    await b.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
    // The candidate list loads after the type is chosen: wait for the target, then for its pick to register.
    const candidat = b.getByRole('button', { name: new RegExp(`^${cible}`) }).first();
    await candidat.waitFor();
    await candidat.click();
    await b.getByRole('button', { name: new RegExp(`^${cible}`), pressed: true }).first().waitFor();
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
    const [sup] = await Promise.all([
      page.waitForResponse((r: Any) => r.request().method() === 'DELETE' && /\/relations\/\d+$/.test(r.url())),
      ligne().first().getByRole('button', { name: /^Retirer la relation/ }).click(),
    ]);
    assert.ok(sup.status() < 300, `DELETE ${sup.status()}`);
    await ligne().first().waitFor({ state: 'detached' });
    assert.equal(await ligne().count(), 0);
  }

  test('allié de → Suie : ligne, rechargement, retrait', { timeout: 120000 }, () => cas('allié de', 'Suie', /allié de\s*·\s*Suie/));
  test('ennemi de → Le Prieur masqué : ligne, rechargement, retrait', { timeout: 120000 }, () => cas('ennemi de', 'Le Prieur masqué', /ennemi de\s*·\s*Le Prieur masqué/));
  test('allié de → Léa Brisefer : ligne, rechargement, retrait', { timeout: 120000 }, () => cas('allié de', 'Léa Brisefer', /allié de\s*·\s*Léa Brisefer/));
});
