// Black-box test of E-6 against maquette e06: breadcrumb ends on the campaign name (no duplicate
// "← Campagnes" link), panel-head actions centred on the title row (desktop) and flush with the
// title's left edge (390 px).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
let uid = '';
let cid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(page, 'Maquette');
  await page.getByRole('heading', { name: 'Maquette', level: 1 }).waitFor();
  uid = new URL(page.url()).pathname.split('/').pop()!;
  const c = await (await page.request.post(`/api/univers/${uid}/campagnes`, { data: { nom: 'Camp maq' } })).json();
  cid = c.id;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-6 : fil d’Ariane jusqu’au nom, pas de lien « ← Campagnes »', opts, async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/univers/${uid}/campagnes/${cid}`);
  await page.getByRole('heading', { name: 'Camp maq', level: 1 }).waitFor();
  const cur = page.locator('[aria-current="page"]', { hasText: 'Camp maq' });
  await cur.first().waitFor();
  const inBar = await page.locator('header [aria-current="page"], nav [aria-current="page"]').allTextContents();
  assert.ok(inBar.some((t: string) => t.includes('Camp maq')), `fil: ${JSON.stringify(inBar)}`);
  assert.equal(await page.getByRole('link', { name: '← Campagnes' }).count(), 0);
  assert.ok((await page.getByRole('link', { name: 'Campagnes' }).count()) >= 1, 'maillon Campagnes cliquable');
});

const geo = async (nom: string) => {
  const btn = page.locator('.panneaux-suivi .panneau > .action-sec', { hasText: nom }).first();
  await btn.waitFor();
  const panneau = btn.locator('xpath=..');
  const h2 = panneau.locator('> h2').first();
  const [b, t] = [await btn.boundingBox(), await h2.boundingBox()];
  // left edge of the title's text
  const gauche = await h2.evaluate((e: Element) => {
    const r = document.createRange();
    r.selectNodeContents(e);
    return r.getBoundingClientRect().left;
  });
  const texteBtn = await btn.evaluate((e: Element) => {
    const r = document.createRange();
    r.selectNodeContents(e);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0);
    return Math.min(...rects.map((x) => x.left));
  });
  return { b, t, gauche, texteBtn };
};

for (const nom of ['Nouveau scénario', 'Nouveau compte-rendu']) {
  test(`E-6 bureau : « ${nom} » centré sur la ligne du titre`, opts, async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/univers/${uid}/campagnes/${cid}`);
    const { b, t } = await geo(nom);
    const dy = Math.abs(b.y + b.height / 2 - (t.y + 15)); // title row = first 30 px (min-height)
    const dy2 = Math.abs(b.y + b.height / 2 - (t.y + t.height / 2));
    assert.ok(Math.min(dy, dy2) <= 4, `centre bouton ${b.y + b.height / 2} vs titre ${t.y} h=${t.height}`);
  });

  test(`E-6 téléphone : « ${nom} » aligné sur le bord du titre`, opts, async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/univers/${uid}/campagnes/${cid}`);
    const { b, gauche, texteBtn } = await geo(nom);
    // ghost action: its content starts at the title's left edge; filled button: its box does
    const rempli = nom === 'Nouveau compte-rendu';
    const x = rempli ? b.x : texteBtn;
    assert.ok(Math.abs(x - gauche) <= 2, `bouton ${x} vs titre ${gauche}`);
  });
}

test('E-6 : champ d’ajout de tâche étiqueté « Libellé », « Nouvelle tâche » une seule fois visible', opts, async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/univers/${uid}/campagnes/${cid}`);
  const champ = page.getByRole('textbox', { name: 'Nouvelle tâche' });
  await champ.waitFor();
  // the visible label of the field is "Libellé" (maquette e06), accessible name kept
  const etiquettes = await page.locator('.ajout-tache label, .ajout-tache .lib-champ').evaluateAll((els: Element[]) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).clip !== 'rect(0px, 0px, 0px, 0px)' && e.getBoundingClientRect().width > 1).map((e) => (e.textContent ?? '').trim()),
  );
  assert.ok(etiquettes.some((t: string) => t.startsWith('Libellé')), `étiquettes visibles: ${JSON.stringify(etiquettes)}`);
  assert.ok(!etiquettes.some((t: string) => t.includes('Nouvelle tâche')), `étiquette dupliquée: ${JSON.stringify(etiquettes)}`);
  const visibles = await page.locator('.ajout-tache').evaluate((root: Element) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const el = t.parentElement!;
      if (!(t.textContent ?? '').includes('Nouvelle tâche')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden') n++;
    }
    return n;
  });
  assert.equal(visibles, 1, 'une seule occurrence visible de « Nouvelle tâche »');
});
