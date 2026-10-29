// Review tests of kanevas-arbre-fiche, second pass: the « Déplacer sous… » dot (mock-up e09 draws a dot, not the
// browser's radio) and the trail at 390 px (an ancestor ellipsizes, the current title stays readable).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

describe('kanevas-arbre-fiche, puce et fil à 390 px', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    for (const q of ['Port-Sel', 'Sphères', 'Portrait']) {
      const r = await (await antor.request.fetch(srv.base + `/api/univers/${U}/fiches?q=${encodeURIComponent(q)}`)).json();
      for (const f of r.fiches) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  for (const th of ['light', 'dark'] as const) {
    test(`boîte « Déplacer sous… » (${th}) : puce vide si non choisie, pleine si choisie, radio natif invisible et au clavier`, async () => {
      const ctx = await browser.newContext({ storageState: await antor.context().storageState(), colorScheme: th, baseURL: srv.base });
      await ctx.addInitScript('window.__name = (f) => f;');
      const page = await ctx.newPage();
      await page.goto(`/univers/${U}/fiche/${ids['Les Sphères']}`);
      await page.getByRole('heading', { level: 1, name: 'Les Sphères', exact: true }).waitFor();
      await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
      await page.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
      const d = page.getByRole('dialog');
      await d.getByRole('button', { name: 'Recherche' }).click();
      await d.getByLabel('Chercher une fiche').fill('Port-Sel');
      const ligne = d.locator('label', { has: page.getByRole('radio', { name: /^Port-Sel/ }) }).first();
      await ligne.waitFor();
      const info = async (l: Any) => l.evaluate((el: Any) => {
        const p = el.querySelector('.puce');
        const r = el.querySelector('input');
        return { puce: !!p, shadow: p && getComputedStyle(p).boxShadow, op: getComputedStyle(r).opacity, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
      });
      const vide = await info(ligne);
      assert.ok(vide.puce, 'puce absente');
      assert.equal(vide.op, '0', 'radio natif visible');
      assert.ok(!/ 4px/.test(vide.shadow) && /1\.5px/.test(vide.shadow), `non choisie doit être vide: ${vide.shadow}`);
      const aucun = d.locator('label', { has: page.getByRole('radio', { name: 'Aucun parent' }) });
      assert.ok((await info(aucun)).puce, 'puce « Aucun parent » absente');
      await page.getByRole('radio', { name: /^Port-Sel/ }).first().focus();
      await page.keyboard.press('Space');
      assert.equal(await page.getByRole('radio', { name: /^Port-Sel/ }).first().isChecked(), true);
      const plein = await info(ligne);
      assert.ok(/4px/.test(plein.shadow), `choisie doit être pleine: ${plein.shadow}`);
      await page.screenshot({ path: `/tmp/arbre-fiche-puce-${th}.png` });
      await ctx.close();
    });

    test(`fil à 390 px (${th}) : « Les Sphères › Port-Sel » sans chevauchement, titre courant lisible`, async () => {
      const ctx = await browser.newContext({ storageState: await antor.context().storageState(), colorScheme: th, baseURL: srv.base, viewport: { width: 390, height: 844 } });
      await ctx.addInitScript('window.__name = (f) => f;');
      const page = await ctx.newPage();
      // Sphères sous Portrait de l'échec (écart rapporté), puis Port-Sel sous Sphères
      const patch = async (id: number, parent: number) => {
        const r = await page.request.fetch(srv.base + `/api/univers/${U}/fiches/${id}`, { method: 'PATCH', data: { parent } });
        assert.ok(r.status() < 300, `PATCH ${r.status()}`);
      };
      const portrait = Object.entries(ids).find(([t]) => t.includes('Portrait'))?.[1];
      assert.ok(portrait, 'fiche Portrait absente du semis');
      await patch(ids['Les Sphères']!, portrait);
      await patch(ids['Port-Sel']!, ids['Les Sphères']!);
      await page.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
      await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
      await attendre(page);
      const nav = page.getByRole('navigation', { name: /Fil d.Ariane/i }).first();
      const m = await nav.evaluate((n: Any) => {
        const box = (e: Any) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, sw: e.scrollWidth, cw: e.clientWidth }; };
        const courant = n.querySelector('.courant .tronque') as Any;
        const liens = [...n.querySelectorAll('a')].map((a: Any) => ({ t: a.textContent, ...box(a) }));
        return { nav: box(n), courant: courant && { t: courant.textContent, ...box(courant), nat: (() => { const c = document.createElement('span'); c.textContent = courant.textContent; c.style.cssText = 'position:fixed;white-space:nowrap;visibility:hidden;font:' + getComputedStyle(courant).font; document.body.appendChild(c); const w = c.getBoundingClientRect().width; c.remove(); return w; })() }, liens };
      });
      assert.ok(m.courant, 'titre courant absent');
      assert.ok(m.courant.nat <= m.courant.w + 0.01, `titre courant tronqué: ${JSON.stringify(m.courant)}`);
      const ordre = [...m.liens, m.courant].sort((a, b) => a.l - b.l);
      for (let i = 1; i < ordre.length; i++) assert.ok(ordre[i - 1]!.r <= ordre[i]!.l + 0.5, `chevauchement: ${JSON.stringify(ordre)}`);
      assert.ok(m.courant.r <= m.nav.r + 1, 'déborde du fil');
      assert.ok((await page.locator('html').evaluate((h: Any) => h.scrollWidth <= h.clientWidth)), 'défilement horizontal');
      await nav.screenshot({ path: `/tmp/arbre-fiche-fil390-${th}.png` });
      await ctx.close();
    });
  }
});
