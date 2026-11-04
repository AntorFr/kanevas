// Review test of kanevas-fiches-liees-bloc-ecran: the thumbnail of a related-sheet row keeps its image inside its
// 36 px frame (E-9) / 40 px frame (E-17), whatever the illustration's shape, and two rows never touch.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(url: string): Promise<Any> {
  const r = await antor.request.fetch(srv.base + url);
  assert.ok(r.status() < 300, `${url} -> ${r.status()}`);
  return r.json();
}

type Box = { x: number; y: number; w: number; h: number };

// Every thumbnail image of the page must be loaded, inside its frame (1 px tolerance), the frame at its nominal size.
async function verifier(page: Any, taille: number): Promise<number> {
  await page.waitForFunction(
    `(() => { const imgs = [...document.querySelectorAll('.vignette-fiche img')]; return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalHeight > 0); })()`,
  );
  const mesures: { cadre: Box; image: Box | null }[] = await page.evaluate(`[...document.querySelectorAll('.vignette-fiche')].map((v) => {
    const r = v.getBoundingClientRect();
    const i = v.querySelector('img');
    const q = i ? i.getBoundingClientRect() : null;
    return { cadre: { x: r.left, y: r.top, w: r.width, h: r.height }, image: q && { x: q.left, y: q.top, w: q.width, h: q.height } };
  })`);
  let avecImage = 0;
  for (const m of mesures) {
    assert.ok(Math.abs(m.cadre.w - taille) <= 1 && Math.abs(m.cadre.h - taille) <= 1, `cadre ${JSON.stringify(m.cadre)}`);
    if (!m.image) continue;
    avecImage++;
    assert.ok(
      m.image.x >= m.cadre.x - 1 && m.image.y >= m.cadre.y - 1 &&
        m.image.x + m.image.w <= m.cadre.x + m.cadre.w + 1 && m.image.y + m.image.h <= m.cadre.y + m.cadre.h + 1,
      `image ${JSON.stringify(m.image)} hors du cadre ${JSON.stringify(m.cadre)}`,
    );
  }
  return avecImage;
}

describe('kanevas-fiches-liees-bloc-ecran, vignettes dans leur cadre', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await api('/api/univers');
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    for (const t of ['personnage', 'lieu', 'faction']) {
      const p = await api(`/api/univers/${U}/fiches?type=${t}`);
      for (const f of p.fiches ?? p.items ?? []) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('E-9 : Prieur (Port-Sel) et Ombeline (Guilde) restent dans leur cadre de 36 px', async () => {
    for (const titre of ['Port-Sel', 'La Guilde des Brumes']) {
      await antor.goto(`/univers/${U}/fiche/${ids[titre]}`);
      await antor.getByRole('heading', { level: 1, name: titre }).waitFor();
      await antor.getByRole('region', { name: 'Fiches liées', exact: true }).getByText(/Personnages \(\d\)/).waitFor();
      const n = await verifier(antor, 36);
      assert.ok(n >= 1, `${titre} : aucune vignette illustrée vérifiée`);
    }
  });

  test('E-17 : la recherche liée à Port-Sel garde ses images dans le cadre de 40 px', async () => {
    await antor.goto(`/univers/${U}/recherche?lie=${ids['Port-Sel']}&nature=se_situe&descendants=1`);
    await antor.locator('.filtre-lie').getByText('Port-Sel').first().waitFor();
    await antor.locator('.vignette-fiche').first().waitFor();
    assert.ok((await verifier(antor, 40)) >= 1);
  });
});
