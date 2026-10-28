// Review test: at 390 px the natured relation row of Aldric keeps its type badge and its remove cross
// beside the text (never a lone « Faction » line), the cross aligned on the first text line, no horizontal scroll.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;

describe('E-9 : ligne de relation à 390 px', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Aldric : « membre de · La Guilde des Brumes — trésorier »', { timeout: 120000 }, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    const us = await (await page.request.fetch(srv.base + '/api/univers')).json();
    const U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
    const r = await (await page.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=personnage`)).json();
    const id = r.fiches.find((f: Any) => f.titre === 'Maître Aldric').id;
    await page.goto(`/univers/${U}/fiche/${id}`);
    await page.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    const ligne = page.locator('.relation', { hasText: 'La Guilde des Brumes' }).first();
    await ligne.waitFor();
    assert.match((await ligne.innerText()).replace(/\s+/g, ' '), /membre de\s*·\s*La Guilde des Brumes\s*—\s*trésorier/);
    const m = await ligne.evaluate(new Function('el', `
      var box = function(e) { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      const lignesTexte = Array.from(el.querySelectorAll('.relation-lien, .jeton')).map(box);
      const badge = el.querySelector('.relation-type');
      const croix = el.querySelector('button');
      return {
        ligne: box(el), texte: el.querySelector('.relation-texte') ? box(el.querySelector('.relation-texte')) : null,
        premier: lignesTexte[0], badge: badge ? box(badge) : null, croix: croix ? box(croix) : null,
        scroll: document.documentElement.scrollWidth - window.innerWidth,
      };
    `) as Any);
    await page.screenshot({ path: '/tmp/revue-relation-390.png' });
    console.log(JSON.stringify(m));
    assert.ok(m.scroll <= 0, 'no horizontal scroll');
    assert.ok(m.badge && m.croix && m.texte);
    assert.ok(m.badge.x >= m.texte.r - 1, 'badge to the right of the text');
    assert.ok(m.croix.x >= m.badge.r - 1, 'cross after the badge');
    assert.ok(Math.abs(m.badge.y - m.premier.y) < 12, 'badge on the first line');
    assert.ok(Math.abs((m.croix.y + m.croix.h / 2) - (m.premier.y + m.premier.h / 2)) < 14, 'cross aligned on the first text line');
    assert.ok(m.croix.r <= 390 && m.badge.r <= 390);
  });
});

describe('E-9 : cadre complet de la liste « Relier », bureau et téléphone', { skip: skipBrowser }, () => {
  let s2: Server;
  let b2: Any;
  before(async () => {
    s2 = await startServer({ KANEVAS_SANS_SEMIS: '' });
    b2 = await launch();
  }, { timeout: 120000 });
  after(async () => {
    await b2?.close();
    s2?.stop();
  });

  for (const [nom, w, h] of [['bureau', 1440, 900], ['telephone', 390, 844]] as const) {
    test(`cadre ${nom}`, { timeout: 120000 }, async () => {
      const ctx = await b2.newContext({ baseURL: s2.base, viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const us = await (await page.request.fetch(s2.base + '/api/univers')).json();
      const U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
      const r = await (await page.request.fetch(`${s2.base}/api/univers/${U}/fiches?type=personnage`)).json();
      const id = r.fiches.find((f: Any) => f.titre === 'Dame Ombeline de Val-Fortin').id;
      await page.goto(`/univers/${U}/fiche/${id}`);
      await page.getByRole('heading', { level: 1, name: 'Dame Ombeline de Val-Fortin' }).waitFor();
      const b = page.getByRole('group', { name: 'Relations' }).first();
      await b.getByRole('button', { name: /^Relier à une fiche$/ }).click();
      await b.getByLabel('Nature').selectOption({ label: 'se situe à' });
      const liste = b.locator('.formulaire-relation .liste-fiches');
      await liste.first().waitFor();
      const m = await liste.first().evaluate(new Function('el', `
        var c = getComputedStyle(el); var bx = el.getBoundingClientRect();
        return { t: c.borderTopWidth, r: c.borderRightWidth, b: c.borderBottomWidth, l: c.borderLeftWidth,
          sty: c.borderTopStyle + c.borderBottomStyle, br: c.borderBottomLeftRadius, bs: c.borderBottomRightRadius,
          h: bx.height, x: bx.x, rr: bx.right, y: bx.y, bb: bx.bottom, vw: window.innerWidth, ch: el.clientHeight, sh: el.scrollHeight,
          n: el.querySelectorAll('li').length };`) as Any);
      await liste.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/revue-liste-${nom}.png` });
      console.log(nom, JSON.stringify(m));
      assert.ok(parseFloat(m.t) >= 1 && parseFloat(m.r) >= 1 && parseFloat(m.b) >= 1 && parseFloat(m.l) >= 1, 'four borders');
      assert.ok(parseFloat(m.br) > 0 && parseFloat(m.bs) > 0, 'rounded bottom corners');
      assert.ok(m.x >= 0 && m.rr <= m.vw, 'inside viewport');
      assert.ok(m.h <= 178);
    });
  }
});
