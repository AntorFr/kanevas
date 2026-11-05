// Review tests of the E-11 stroke geometry (docs/ecrans.md « Stroke geometry »), on « Carte de la côte »:
// every stroke runs from the edge of a disc to the edge of another disc, passes under no node pill,
// and every node keeps a tap zone of at least 44 px; at 1440, 768 and 390 px, light and dark.
// The numbers are the doc's (disc radius 15 px, arrowhead touches the target disc).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let U = 0;
let carteId = 0;

interface Boite { x: number; y: number; w: number; h: number }
interface Geo {
  traits: { x1: number; y1: number; x2: number; y2: number }[];
  ronds: { cx: number; cy: number }[];
  pilules: Boite[];
  jetons: Boite[];
}

async function geo(page: Any): Promise<Geo> {
  await page.locator('.graphe-trait').first().waitFor({ state: 'attached' });
  await page.locator('.graphe .carte-token span').first().waitFor();
  // wait until the layout has settled (pills placed above/below, labels slid): same reading twice in a row
  const lire = (): Promise<Geo> => page.evaluate(`(() => {
    var svg = document.querySelector('.graphe-liens');
    function pt(el, x, y) { var p = svg.createSVGPoint(); p.x = x; p.y = y; var q = p.matrixTransform(el.getScreenCTM()); return { x: q.x, y: q.y }; }
    function rect(e) { var r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }
    var toks = Array.from(document.querySelectorAll('.graphe .carte-token'));
    return {
      traits: Array.from(document.querySelectorAll('.graphe-trait')).map(function (g) {
        var a = pt(g, g.x1.baseVal.value, g.y1.baseVal.value); var b = pt(g, g.x2.baseVal.value, g.y2.baseVal.value);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }),
      ronds: toks.map(function (t) { var r = rect(t.querySelector('i')); return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 }; }),
      pilules: toks.map(function (t) { return rect(t.querySelector('span')); }),
      jetons: toks.map(rect)
    };
  })()`);
  let prec = JSON.stringify(await lire());
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const g = await lire();
    const s = JSON.stringify(g);
    if (s === prec) return g;
    prec = s;
  }
  return JSON.parse(prec);
}

/** True when the segment crosses (or lies in) the box. */
function traverse(b: Boite, t: Geo['traits'][number]): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(t.x2 - t.x1, t.y2 - t.y1)));
  for (let i = 0; i <= n; i++) {
    const x = t.x1 + ((t.x2 - t.x1) * i) / n;
    const y = t.y1 + ((t.y2 - t.y1) * i) / n;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

async function session(largeur: number, hauteur: number, sombre: boolean): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: largeur, height: hauteur } });
  if (sombre) await ctx.addInitScript(() => window.localStorage.setItem('kanevas-theme', 'sombre'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  return { ctx, page };
}

describe('E-11 : géométrie des traits du graphe (Carte de la côte)', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    const antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
    const cs = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes`)).json();
    carteId = (cs.cartes ?? cs).find((c: Any) => c.titre === 'Carte de la côte').id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  for (const [nom, l, h, sombre] of [
    ['1440 clair', 1440, 900, false],
    ['1440 sombre', 1440, 900, true],
    ['768 clair', 768, 1024, false],
    ['390 clair', 390, 844, false],
    ['390 sombre', 390, 844, true],
  ] as [string, number, number, boolean][]) {
    test(`${nom} : traits de bord de rond à bord de rond, sous aucune pastille, nœuds ≥ 44 px`, opts, async () => {
      const { ctx, page } = await session(l, h, sombre);
      await page.goto(`/univers/${U}/cartes/${carteId}`);
      const g = await geo(page);
      assert.ok(g.traits.length >= 2, 'au moins les deux liens Aldric–Port-Sel : ' + g.traits.length);
      const proche = (x: number, y: number) => g.ronds.map((r) => Math.hypot(x - r.cx, y - r.cy)).sort((a, b) => a - b)[0];
      g.traits.forEach((t, i) => {
        // start: on the edge of the source disc (radius 15, 30 px disc), a pixel of tolerance
        const d1 = proche(t.x1, t.y1);
        assert.ok(Math.abs(d1 - 15) <= 1.5, `trait ${i} : départ à ${d1.toFixed(1)} px du rond le plus proche (attendu 15) ${JSON.stringify(t)}`);
        // end: the arrowhead touches the target disc without covering it (15 to ~17.5 px from its centre)
        const d2 = proche(t.x2, t.y2);
        assert.ok(d2 >= 14.5 && d2 <= 18, `trait ${i} : pointe à ${d2.toFixed(1)} px du rond le plus proche (attendu 15–18) ${JSON.stringify(t)}`);
        // the two ends belong to two different nodes
        const idx = (x: number, y: number) => g.ronds.map((r, k) => ({ k, d: Math.hypot(x - r.cx, y - r.cy) })).sort((a, b) => a.d - b.d)[0].k;
        assert.notEqual(idx(t.x1, t.y1), idx(t.x2, t.y2), `trait ${i} relie un nœud à lui-même`);
        // passes under no pill
        g.pilules.forEach((p, k) => assert.equal(traverse(p, t), false, `trait ${i} passe sous la pastille ${k} ${JSON.stringify([p, t])}`));
      });
      // two links of the same pair are two distinct strokes (not the same line)
      for (let a = 0; a < g.traits.length; a++) for (let b = a + 1; b < g.traits.length; b++) {
        const A = g.traits[a], B = g.traits[b];
        const m = Math.hypot((A.x1 + A.x2 - B.x1 - B.x2) / 2, (A.y1 + A.y2 - B.y1 - B.y2) / 2);
        const meme = (A.x1 === B.x1 && A.y1 === B.y1 && A.x2 === B.x2 && A.y2 === B.y2);
        assert.equal(meme, false, `traits ${a} et ${b} identiques`);
        void m;
      }
      // tap zone of a node: at least 44 px each way
      g.jetons.forEach((j, k) => assert.ok(j.w >= 43.5 && j.h >= 43.5, `nœud ${k} : zone ${j.w.toFixed(0)}×${j.h.toFixed(0)} px < 44`));
      await ctx.close();
    });
  }
});
