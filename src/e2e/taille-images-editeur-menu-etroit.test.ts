// kanevas-taille-images-editeur — E-9 (the narrow screen is a case): the « Image » menu of the editor
// stays whole inside the window at phone widths, in both themes, and keeps its right alignment on a desktop.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes, json } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  C = await comptes(srv, browser);
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

async function monde(): Promise<{ url: string }> {
  const post = async (u: string, data: unknown) => json(await C.antor.ctx.request.post(`${srv.base}${u}`, { data }));
  const u = await post('/api/univers', { nom: 'Menu étroit' });
  const b = `/api/univers/${u.id}`;
  const f = await post(`${b}/fiches`, { type: 'lieu', titre: 'Port-Sel', charge: { v: 1 } });
  const s = await post(`${b}/fiches/${f.id}/sections`, { titre: 'Histoire', contenu: 'x' });
  const r = await C.antor.ctx.request.post(`${srv.base}${b}/fichiers`, {
    multipart: { section: String(s.id), maniere: 'texte', fichier: { name: 'p.png', mimeType: 'image/png', buffer: PNG } },
  });
  const img = (await json(r)).id as number;
  const cur = await json(await C.antor.ctx.request.get(`${srv.base}${b}/fiches/${f.id}/sections/${s.id}`));
  await C.antor.ctx.request.put(`${srv.base}${b}/fiches/${f.id}/sections/${s.id}/contenu`, {
    data: { contenu: `Avant\n\n![le port](fichier:${img})\n\nFin.`, version: cur.version },
  });
  return { url: `${srv.base}/univers/${u.id}/fiche/${f.id}` };
}

for (const schema of ['light', 'dark']) {
  for (const [largeur, hauteur] of [[375, 700], [1280, 900]] as const) {
    test(`E-9 : le menu Image tient dans la fenêtre (${largeur} px, thème ${schema})`, opts, async () => {
      const m = await monde();
      const ctx = await browser.newContext({ storageState: await C.antor.ctx.storageState(), colorScheme: schema, viewport: { width: largeur, height: hauteur } });
      const page = await ctx.newPage();
      await page.goto(m.url);
      await attendre(page);
      const r = page.getByRole('region', { name: /Histoire/ });
      await r.getByRole('button', { name: 'Modifier', exact: true }).click();
      const champ = r.getByRole('textbox');
      await champ.waitFor();
      await champ.evaluate((el: HTMLTextAreaElement) => {
        const i = el.value.indexOf('![') + 4;
        el.focus();
        el.setSelectionRange(i, i);
      });
      await champ.press('ArrowRight');
      await champ.press('ArrowLeft');
      await page.getByRole('button', { name: 'Image', exact: true }).click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      const boite = await menu.evaluate((e: HTMLElement) => {
        const q = e.getBoundingClientRect();
        return { g: q.left, d: q.right, t: q.top, b: q.bottom, vw: document.documentElement.clientWidth };
      });
      assert.ok(boite.g >= 0, `left edge ${boite.g} inside the window`);
      assert.ok(boite.d <= boite.vw + 0.5, `right edge ${boite.d} inside ${boite.vw}`);
      for (const nom of ['Taille', 'Placement', 'Sans réglage']) {
        const el = menu.getByText(nom, { exact: true }).first();
        await el.waitFor();
        const q = await el.boundingBox();
        assert.ok(q && q.x >= 0 && q.x + q.width <= boite.vw, `${nom} readable inside the window`);
      }
      // still usable by touch: a choice writes the title
      await menu.getByRole('menuitemradio', { name: 'Moyen', exact: true }).click();
      assert.match(await champ.inputValue(), /"moyen-centre"/);
      await ctx.close();
    });
  }
}
