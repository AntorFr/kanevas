// Phone width (390 px) of the « MJ seul » pill (B-57): the E-17 result keeps its title readable and the
// E-9 header row keeps the type pill on one line without pushing the title block. Real server + Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
let idFaction = 0;
const TITRE_E17 = 'Guilde des Brumes Sansgenre';
const TITRE = 'La Guilde des Brumes Mobile';

async function api(method: string, url: string, data?: unknown): Promise<Any> {
  const r = await antor.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.json();
}

describe('kanevas-fiche-mj-seul-ecran, téléphone', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    await antor.setViewportSize({ width: 390, height: 800 });
    U = (await api('GET', '/api/univers')).find((u: Any) => u.nom === "Lame d'Ébène").id;
    const f = await api('POST', `/api/univers/${U}/fiches`, { type: 'faction', titre: TITRE });
    idFaction = f.id;
    await api('POST', `/api/univers/${U}/fiches`, { type: 'faction', titre: TITRE_E17 });
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('E-17 : le titre d’un résultat MJ seul n’est pas tronqué et la pastille ne le comprime pas', async () => {
    await antor.goto(`/univers/${U}/recherche?q=${encodeURIComponent('Sansgenre')}`);
    const titre = antor.locator('.titre-recherche').filter({ hasText: TITRE_E17 }).first();
    await titre.waitFor();
    const m = await titre.evaluate((e: HTMLElement) => ({ s: e.scrollWidth, c: e.clientWidth }));
    assert.ok(m.s <= m.c + 1, `titre tronqué : scrollWidth ${m.s} > clientWidth ${m.c}`);
    const pas = antor.locator('li.ligne-recherche').filter({ hasText: TITRE_E17 }).getByText('MJ seul', { exact: true });
    assert.equal(await pas.count(), 1);
  });

  test('E-9 : la pastille de type tient sur une ligne et la rangée ne dépasse pas la page', async () => {
    await antor.setViewportSize({ width: 320, height: 700 });
    await antor.goto(`/univers/${U}/fiche/${idFaction}`);
    await antor.getByRole('heading', { level: 1, name: TITRE }).waitFor();
    const type = antor.locator('.fiche .type').first();
    await type.waitFor();
    const hauteur = (await type.boundingBox()).height;
    assert.ok(hauteur <= 26, `pastille de type sur plusieurs lignes : hauteur ${hauteur}`);
    const pas = antor.locator('.fiche .entete').getByText('MJ seul', { exact: true });
    assert.equal(await pas.count(), 1);
    const h1 = (await antor.getByRole('heading', { level: 1 }).boundingBox()).y;
    const ligne = await antor.locator('.tete-ligne').boundingBox();
    assert.ok(ligne.y + ligne.height <= h1 + 1, 'la rangée doit rester au-dessus du titre');
    const deborde = await antor.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(deborde, false, 'débordement horizontal');
  });
});
