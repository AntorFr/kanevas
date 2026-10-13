// Independent check of P5 (list opened by « [[ » at 390 px), written from the need: Antor writing in « Histoire »
// of « Port-Sel » must see « Enregistrer » and the rows of the open list on the screen at the same time.
//
// TEST PLAN
//   nominal : 390x700, list open, « Enregistrer » brought into view: it is fully inside the viewport AND at least
//             3 options are fully inside both the viewport and the list
//   bords   : same at 390x600 (short phone) with at least 2 options; list never taller than the viewport
//   (failure if the list is unbounded: it pushes « Enregistrer » below the fold, or the rows out of it)
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { comptes } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;
let lame = 0;
let portSel = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  C = await comptes(srv, browser);
  const r = await C.antor.ctx.request.get('/api/univers');
  lame = ((await r.json()) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
  const l = await (await C.antor.ctx.request.get(`/api/univers/${lame}/fiches?q=Port-Sel`)).json();
  portSel = l.fiches.find((f: Any) => f.titre === 'Port-Sel').id;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

for (const [h, min] of [[700, 3], [600, 2]] as const) {
  test(`liste [[ ouverte (390x${h}) : « Enregistrer » et au moins ${min} lignes entières visibles ensemble`, opts, async () => {
    const ctx = await browser.newContext({ storageState: await C.antor.ctx.storageState(), viewport: { width: 390, height: h } });
    const page = await ctx.newPage();
    await page.goto(`${srv.base}/univers/${lame}/fiche/${portSel}`);
    await page.waitForLoadState('networkidle');
    const sec = page.locator('section.sec').filter({ has: page.getByRole('heading', { name: 'Histoire', exact: true }) }).last();
    await sec.getByRole('button', { name: 'Modifier', exact: true }).click();
    const champ = page.getByLabel('Contenu de « Histoire »');
    await champ.press('Control+End');
    await champ.pressSequentially(' [[');
    const liste = page.getByRole('listbox', { name: 'Fiches à lier' });
    await liste.waitFor();
    await liste.getByRole('option').nth(3).waitFor();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const save = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Enregistrer')!.getBoundingClientRect();
      const lb = document.querySelector('[role=listbox]')!.getBoundingClientRect();
      const entieres = [...document.querySelectorAll('[role=listbox] [role=option]')].filter((o) => {
        const r = o.getBoundingClientRect();
        return r.top >= Math.max(0, lb.top) - 1 && r.bottom <= Math.min(innerHeight, lb.bottom) + 1;
      }).length;
      return { saveTop: save.top, saveBottom: save.bottom, vh: innerHeight, entieres, listeH: lb.height };
    });
    await page.screenshot({ path: `/tmp/liens-ecran-liste-et-enregistrer-${h}.png` });
    assert.ok(g.saveTop >= 0 && g.saveBottom <= g.vh, `« Enregistrer » entièrement à l'écran ${JSON.stringify(g)}`);
    assert.ok(g.entieres >= min, `au moins ${min} lignes entières visibles ensemble ${JSON.stringify(g)}`);
    assert.ok(g.listeH < g.vh, `liste plus basse que l'écran ${JSON.stringify(g)}`);
    await ctx.close();
  });
}
