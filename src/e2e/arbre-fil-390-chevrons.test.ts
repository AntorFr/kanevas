// Ensemble tests of kanevas-import-arbre (P-12 step 1, E-9 trail) at 390 px: a very long ancestor title must not spill
// over the chevron that follows it, and the current title stays the readable element (docs/ecrans.md: « le fil garde son dernier maillon entier »).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};
const LONG = 'Les Sphères du Grand Archipel des Mille Brumes Éternelles et Oubliées';

describe('kanevas-import-arbre, fil à 390 px : un ancêtre long ne mord pas le chevron', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    for (const q of ['Port-Sel', 'Sphères']) {
      const r = await (await antor.request.fetch(srv.base + `/api/univers/${U}/fiches?q=${encodeURIComponent(q)}`)).json();
      for (const f of r.fiches) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('« Port-Sel » sous un ancêtre au titre de 70 caractères : aucun maillon ne recouvre un chevron, « Port-Sel » entier', async () => {
    const ctx = await browser.newContext({ storageState: await antor.context().storageState(), baseURL: srv.base, viewport: { width: 390, height: 844 } });
    await ctx.addInitScript('window.__name = (f) => f;');
    const page = await ctx.newPage();
    // Port-Sel under Les Sphères (seed), Les Sphères under a new lieu with a 70-character title
    const c = await page.request.fetch(srv.base + `/api/univers/${U}/fiches`, { method: 'POST', data: { type: 'lieu', titre: LONG } });
    assert.equal(c.status(), 201, 'création de l’ancêtre long');
    const long = (await c.json()).id;
    const r = await page.request.fetch(srv.base + `/api/univers/${U}/fiches/${ids['Les Sphères']}`, { method: 'PATCH', data: { parent: long } });
    assert.ok(r.status() < 300, `PATCH parent ${r.status()}`);
    await page.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
    await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await attendre(page);
    const nav = page.getByRole('navigation', { name: /Fil d.Ariane/i }).first();
    await nav.screenshot({ path: '/tmp/arbre-fil390-long.png' });
    const m = await nav.evaluate((n: Any) => {
      const vis = (e: Any) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; };
      const chevrons = [...n.querySelectorAll('svg')].filter((s: Any) => s.getClientRects().length && s.getBoundingClientRect().width > 0 && !s.closest('a')).map(vis);
      const liens = [...n.querySelectorAll('a')].filter((a: Any) => a.getClientRects().length).map((a: Any) => {
        // the right edge of what is actually painted: the link box when its content is clipped, else its content
        const cs = getComputedStyle(a);
        const clip = cs.overflow !== 'visible' || [...a.children].some((c: Any) => getComputedStyle(c).overflow === 'hidden');
        return { t: a.textContent, ...vis(a), sw: a.scrollWidth, cw: a.clientWidth, clip };
      });
      const courant = n.querySelector('[aria-current]') as Any;
      return { chevrons, liens, courant: courant && { t: courant.textContent, ...vis(courant) }, nav: vis(n) };
    });
    for (const l of m.liens) {
      for (const c of m.chevrons) {
        const recouvre = l.l < c.r - 0.5 && c.l < l.r - 0.5;
        assert.ok(!recouvre, `maillon « ${l.t} » recouvre un chevron: ${JSON.stringify({ l, c })}`);
      }
      assert.ok(l.sw <= l.cw + 1 || l.clip, `maillon « ${l.t} » déborde sans être coupé: ${JSON.stringify(l)}`);
    }
    assert.ok(m.courant && /Port-Sel/.test(m.courant.t), 'maillon courant absent');
    assert.ok(m.courant.r <= m.nav.r + 1, 'le titre courant déborde du fil');
    await nav.screenshot({ path: '/tmp/arbre-fil390-long.png' });
    await ctx.close();
  });
});
