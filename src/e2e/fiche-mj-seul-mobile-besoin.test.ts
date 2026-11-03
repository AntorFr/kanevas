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
let idIllustree = 0;
let idReference = 0;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TITRE_ILL = 'Le Veilleur Illustre Mobile';
const TITRE_REF = 'Le Veilleur Ouvert Mobile';
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
    const ill = await api('POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: TITRE_ILL, charge: { v: 1, pj: false } });
    idIllustree = ill.id;
    const ref = await api('POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: TITRE_REF, charge: { v: 1, pj: false } });
    idReference = ref.id;
    const sec = await api('POST', `/api/univers/${U}/fiches/${idReference}/sections`, { titre: 'Description', contenu: 'Texte.' });
    await api('PATCH', `/api/univers/${U}/fiches/${idReference}/sections/${sec.id}`, { joueursLisent: true });
    for (const id of [idIllustree, idReference]) {
      await api('PATCH', `/api/univers/${U}/fiches/${id}`, { sousType: 'Sous-type assez long' });
      const r = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${id}/illustration`, {
        method: 'PUT',
        multipart: { fichier: { name: 'portrait.png', mimeType: 'image/png', buffer: PNG } },
      });
      assert.ok(r.status() < 300, `PUT illustration -> ${r.status()}`);
    }
    const put = { status: () => 200 };
    assert.ok(put.status() < 300, `PUT illustration -> ${put.status()}`);
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

  for (const schema of ['light', 'dark'] as const) {
    test(`E-9 illustrée (${schema}) : la rangée d'en-tête reste d'une ligne, à côté de l'illustration`, async () => {
      const ctx = await browser.newContext({ storageState: await antor.context().storageState(), colorScheme: schema, baseURL: srv.base, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      try {
        const mesure = async (id: number, titre: string) => {
          await page.goto(`/univers/${U}/fiche/${id}`);
          await page.getByRole('heading', { level: 1, name: titre }).waitFor();
          await page.locator('.entete.illustree .illustration').first().waitFor();
          return {
            pas: await page.locator('.fiche .entete').getByText('MJ seul', { exact: true }).count(),
            ill: await page.locator('.entete.illustree .illustration').first().boundingBox(),
            ligne: await page.locator('.entete.illustree .tete-ligne').boundingBox(),
            type: await page.locator('.entete.illustree .type').first().boundingBox(),
            menu: await page.locator('.entete.illustree .tete-ligne').getByRole('button', { name: /Autres actions sur/ }).boundingBox(),
            h1: await page.getByRole('heading', { level: 1 }).boundingBox(),
          };
        };
        const ref = await mesure(idReference, TITRE_REF);
        const m = await mesure(idIllustree, TITRE_ILL);
        assert.equal(ref.pas, 0);
        assert.equal(m.pas, 1);
        assert.ok(m.type.height <= 26, `type sur plusieurs lignes : ${m.type.height}`);
        assert.ok(m.menu.x + m.menu.width <= 390, `menu « … » hors de l'écran : bord droit ${m.menu.x + m.menu.width} > 390`);
        assert.ok(m.menu.y < m.type.y + m.type.height && m.menu.y + m.menu.height > m.type.y, `menu « … » descendu : menu.y ${m.menu.y} type.y ${m.type.y}`);
        assert.ok(Math.abs(m.ligne.height - ref.ligne.height) <= 2, `rangée plus haute que la référence : ${m.ligne.height} vs ${ref.ligne.height}`);
        assert.ok(Math.abs(m.ligne.y - m.ill.y - (ref.ligne.y - ref.ill.y)) <= 2, `badges décalés par rapport à l'illustration : ${m.ligne.y - m.ill.y} vs ${ref.ligne.y - ref.ill.y}`);
        assert.ok(Math.abs(m.ill.y + m.ill.height - (m.h1.y + m.h1.height) - (ref.ill.y + ref.ill.height - (ref.h1.y + ref.h1.height))) <= 2, 'titre décalé par rapport au pied de l\'illustration');
        const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(deborde, false, 'débordement horizontal');
      } finally {
        await ctx.close();
      }
    });
  }
});
