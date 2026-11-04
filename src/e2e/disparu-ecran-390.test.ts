// Layout checks of the gone mark (B-67, docs/ecrans.md « the gone mark »): the chip of E-17 is whole,
// the type badge keeps its word on one line, the chip and the image gestures do not overlap at 390 px.
// Real Chromium + stub server with the seed. Waits are on what the screen shows, never networkidle.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

async function req(method: string, url: string, data?: unknown): Promise<Any> {
  return antor.request.fetch(srv.base + url, { method, data });
}
const boite = async (loc: Any) => (await loc.boundingBox()) as { x: number; y: number; width: number; height: number };
const recoupe = (a: Any, b: Any) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'antor')).page;
  const us = JSON.parse(await (await req('GET', '/api/univers')).text()) as Any[];
  U = us.find((u) => u.nom === "Lame d'Ébène").id;
  const fs = JSON.parse(await (await req('GET', `/api/univers/${U}/fiches`)).text()).fiches as Any[];
  for (const f of fs) ids[f.titre] = f.id;
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('B-67 : mise en page de la marque', { skip: skipBrowser }, () => {
  test('E-17 : la pastille du Prieur n_est pas rognee par la vignette de la ligne', async () => {
    await antor.setViewportSize({ width: 1280, height: 800 });
    await antor.goto(`/univers/${U}/recherche?q=Prieur&type=personnage&etat=disparu`);
    const ligne = antor.locator('.ligne-recherche', { hasText: 'Le Prieur masqué' });
    const chip = ligne.getByRole('img', { name: 'Mort' }).first();
    await chip.waitFor();
    const vignette = await boite(ligne.locator('.vignette-recherche'));
    const p = await boite(chip);
    assert.ok(p.width >= 12 && p.height >= 12, `pastille lisible : ${p.width}x${p.height}`);
    // nothing clips the chip: it is the topmost element at its centre, whole inside the viewport
    const visible = await chip.evaluate((el: Any) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      let clip = false;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflow;
        if (o !== 'visible') clip = true;
      }
      return { top: top === el || el.contains(top), clip };
    });
    assert.ok(visible.top, 'la pastille est visible au-dessus');
    assert.equal(visible.clip, false, 'aucun ancêtre ne rogne la pastille');
    assert.ok(p.x >= vignette.x - 8 && p.y + p.height <= vignette.y + vignette.height + 8);
  });

  test('E-9 à 390 px : le badge de type d_une fiche illustree et marquee reste sur une ligne', async () => {
    await req('PATCH', `/api/univers/${U}/fiches/${ids['Le Prieur masqué']}`, { disparu: true });
    await antor.setViewportSize({ width: 390, height: 844 });
    await antor.goto(`/univers/${U}/fiche/${ids['Le Prieur masqué']}`);
    await antor.getByRole('heading', { level: 1, name: 'Le Prieur masqué' }).waitFor();
    await antor.getByText('Mort', { exact: true }).first().waitFor();
    const badge = antor.locator('.tete-ligne .type').first();
    await badge.waitFor();
    const h = await badge.evaluate((el: Any) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return { lignes: r.getClientRects().length, ws: getComputedStyle(el).whiteSpace };
    });
    assert.equal(h.ws, 'nowrap');
    const b = await boite(badge);
    const lh = await badge.evaluate((el: Any) => parseFloat(getComputedStyle(el).lineHeight) || 20);
    assert.ok(b.height < lh * 2, `badge sur une ligne : hauteur ${b.height}, interligne ${lh}`);
  });

  test('E-9 à 390 px : la pastille de marque ne chevauche pas les gestes de l_illustration', async () => {
    await antor.setViewportSize({ width: 390, height: 844 });
    await antor.goto(`/univers/${U}/fiche/${ids['Le Prieur masqué']}`);
    await antor.getByRole('heading', { level: 1, name: 'Le Prieur masqué' }).waitFor();
    const chip = antor.locator('.boite-ill').getByRole('img', { name: 'Mort' }).first();
    await chip.waitFor();
    const gestes = antor.locator('.gestes-ill');
    await gestes.waitFor();
    const g = await boite(gestes);
    const p = await boite(chip);
    assert.equal(recoupe(g, p), false, `gestes ${JSON.stringify(g)} / pastille ${JSON.stringify(p)}`);
    await req('PATCH', `/api/univers/${U}/fiches/${ids['Le Prieur masqué']}`, { disparu: false });
  });
});
