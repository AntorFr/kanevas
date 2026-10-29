// Review tests of kanevas-arbre-fiche, fourth pass (mock-up e09): the foot of « Déplacer sous… » (right-aligned, side by side
// across the width on a phone, Annuler then Déplacer), the cycle refusal as an .alerte banner, and the trail at 390 px
// with the MJ / Player switch visible (current title whole, no crumb over a chevron).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

describe('kanevas-arbre-fiche, pied, bandeau de cycle et fil avec bascule', { skip: skipBrowser }, () => {
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

  const ouvrir = async (viewport: { width: number; height: number }, th: 'light' | 'dark') => {
    const ctx = await browser.newContext({ storageState: await antor.context().storageState(), colorScheme: th, baseURL: srv.base, viewport });
    await ctx.addInitScript('window.__name = (f) => f;');
    return { ctx, page: await ctx.newPage() };
  };
  const boite = async (page: Any, titre: string) => {
    await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
    await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
    await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await page.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    return page.getByRole('dialog');
  };

  for (const [nom, vp] of [['bureau', { width: 1280, height: 800 }], ['téléphone', { width: 390, height: 844 }]] as const) {
    for (const th of ['light', 'dark'] as const) {
      test(`pied de « Déplacer sous… » (${nom}, ${th}) : Annuler puis Déplacer, ${nom === 'bureau' ? 'à droite' : 'côte à côte sur la largeur'}`, async () => {
        const { ctx, page } = await ouvrir(vp, th);
        const d = await boite(page, 'Les Sphères');
        const m = await d.locator('.actions').evaluate((a: Any) => {
          const r = (e: Any) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, t: e.textContent.trim() }; };
          return { a: r(a), b: [...a.querySelectorAll('button')].map(r) };
        });
        assert.deepEqual(m.b.map((b: Any) => b.t), ['Annuler', 'Déplacer']);
        assert.ok(m.b[0].r <= m.b[1].l + 0.5, 'les deux boutons se recouvrent');
        if (nom === 'bureau') {
          assert.ok(m.a.r - m.b[1].r < 24, `Déplacer pas collé à droite: ${JSON.stringify(m)}`);
          assert.ok(m.b[0].l - m.a.l > 100, `Annuler collé à gauche: ${JSON.stringify(m)}`);
        } else {
          assert.ok(Math.abs(m.b[0].w - m.b[1].w) < 2 && m.b[0].w > 100, `pas de moitiés égales: ${JSON.stringify(m)}`);
          assert.ok(m.b[1].r - m.b[0].l > m.a.w - 4, `ne couvre pas la largeur: ${JSON.stringify(m)}`);
        }
        await page.screenshot({ path: `/tmp/arbre-pied-${nom}-${th}.png` });
        await ctx.close();
      });
    }
  }

  for (const th of ['light', 'dark'] as const) {
    test(`refus de cycle (${th}, téléphone) : bandeau role=alert sous la liste, avant les actions, boîte ouverte`, async () => {
      const { ctx, page } = await ouvrir({ width: 390, height: 844 }, th);
      // Port-Sel is under Les Sphères (seed): moving Les Sphères under Port-Sel is a cycle
      const d = await boite(page, 'Les Sphères');
      // La recherche écarte les descendants (AD-129) : le cycle ne reste atteignable que si la hiérarchie change boîte
      // ouverte. Une fiche libre est choisie, puis rangée sous Port-Sel par ailleurs.
      const reponse = await page.request.fetch(srv.base + `/api/univers/${U}/fiches`, { method: 'POST', data: { type: 'lieu', titre: 'Cible du cycle' } });
      const libre = (await reponse.json()).id;
      await d.getByRole('button', { name: 'Recherche' }).click();
      await d.getByLabel('Chercher une fiche').fill('Cible du cycle');
      await d.getByRole('radio', { name: /^Cible du cycle/ }).check({ force: true });
      const p = await page.request.fetch(srv.base + `/api/univers/${U}/fiches/${libre}`, { method: 'PATCH', data: { parent: ids['Port-Sel'] } });
      assert.ok(p.status() < 300, `PATCH ${p.status()}`);
      await d.getByRole('button', { name: 'Déplacer', exact: true }).click();
      const al = d.getByRole('alert').filter({ hasText: 'Une fiche ne peut pas être rangée sous l’un de ses descendants.' });
      const alerte = (await al.count()) ? al : d.getByRole('alert').filter({ hasText: /descendants/ });
      await alerte.first().waitFor();
      assert.equal(await d.isVisible(), true, 'boîte fermée');
      const m = await d.evaluate((dlg: Any) => {
        const a = [...dlg.querySelectorAll('[role="alert"]')].find((e: Any) => /descendants/.test(e.textContent)) as Any;
        const b = a.closest('.alerte') ?? a.closest('.etat') ?? a;
        const liste = dlg.querySelector('[role="radiogroup"]').getBoundingClientRect();
        const actions = dlg.querySelector('.actions').getBoundingClientRect();
        const r = b.getBoundingClientRect();
        const champ = dlg.querySelector('input:not([type=radio])').closest('label,div').getBoundingClientRect();
        return { cls: b.className, texte: a.textContent, top: r.top, bottom: r.bottom, liste: liste.bottom, actions: actions.top, svg: !!b.querySelector('svg'), h: r.height, fs: getComputedStyle(a).fontSize, champBas: champ.bottom };
      });
      assert.ok(/alerte/.test(m.cls), `pas un bandeau .alerte: ${JSON.stringify(m)}`);
      assert.ok(m.svg, 'icône absente');
      assert.ok(m.top >= m.liste - 0.5, `bandeau pas sous la liste: ${JSON.stringify(m)}`);
      assert.ok(m.bottom <= m.actions + 0.5, `bandeau pas avant les actions: ${JSON.stringify(m)}`);
      await page.screenshot({ path: `/tmp/arbre-cycle-${th}.png` });
      await page.request.fetch(srv.base + `/api/univers/${U}/fiches/${libre}`, { method: 'DELETE' });
      await ctx.close();
    });

    test(`fil à 390 px avec la bascule MJ visible (${th}) : Port-Sel sous Les Sphères, titre entier, ancêtre dans « … »`, async () => {
      const { ctx, page } = await ouvrir({ width: 390, height: 844 }, th);
      const patch = async (id: number, parent: number) => {
        const r = await page.request.fetch(srv.base + `/api/univers/${U}/fiches/${id}`, { method: 'PATCH', data: { parent } });
        assert.ok(r.status() < 300, `PATCH ${r.status()}`);
      };
      await patch(ids['Port-Sel']!, ids['Les Sphères']!);
      await page.goto(`/univers/${U}/fiche/${ids['Port-Sel']}`);
      await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
      await attendre(page);
      assert.ok(await page.getByRole('radiogroup', { name: /Mode d.affichage/ }).isVisible(), 'bascule MJ/Joueur absente');
      const nav = page.getByRole('navigation', { name: /Fil d.Ariane/i }).first();
      const m = await nav.evaluate((n: Any) => {
        const c = n.querySelector('[aria-current]') as Any;
        const t = (c.querySelector('.tronque') ?? c) as Any;
        const probe = document.createElement('span');
        probe.textContent = t.textContent;
        probe.style.cssText = 'position:fixed;white-space:nowrap;visibility:hidden;font:' + getComputedStyle(t).font;
        document.body.appendChild(probe);
        const nat = probe.getBoundingClientRect().width;
        probe.remove();
        const sph = [...n.querySelectorAll('a')].filter((a: Any) => /Sph/.test(a.textContent)).map((a: Any) => a.textContent);
        return { texte: t.textContent, nat, w: t.getBoundingClientRect().width, sw: t.scrollWidth, cw: t.clientWidth, sph, plie: !!n.querySelector('button') };
      });
      assert.equal(m.texte, 'Port-Sel');
      assert.ok(m.nat <= m.w + 0.01 && m.sw <= m.cw + 1, `titre courant tronqué: ${JSON.stringify(m)}`);
      assert.deepEqual(m.sph, [], 'l’ancêtre devrait être dans « … » quand la bascule est visible');
      assert.ok(m.plie, 'menu « … » absent');
      assert.ok((await page.locator('html').evaluate((h: Any) => h.scrollWidth <= h.clientWidth)), 'défilement horizontal');
      await page.screenshot({ path: `/tmp/arbre-bascule-${th}.png` });
      await ctx.close();
    });
  }
});
