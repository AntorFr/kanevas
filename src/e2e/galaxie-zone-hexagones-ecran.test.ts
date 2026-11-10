// Browser test of kanevas-outils-format-zones-ecran, written from the exit criterion (B-84, E-21, Z-6), not from the code.
// Stub world with the seed (« Éneria d'essai »). Screenshots go to /tmp/cap-galaxie-zone-hexagones (never into the workspace).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-zone-hexagones';

// 40 × 22 parallelogram minus an inner island block (48) and an edge notch (32) = 800 hexagons.
function zone800(): [number, number][] {
  const h: [number, number][] = [];
  for (let r = 0; r < 22; r++) for (let q = 0; q < 40; q++) {
    if (q >= 15 && q <= 22 && r >= 8 && r <= 13) continue;
    if (q <= 3 && r <= 7) continue;
    h.push([q, r]);
  }
  return h;
}
const bloc5000 = (): [number, number][] => Array.from({ length: 5000 }, (_, i) => [i % 100, Math.floor(i / 100)] as [number, number]);
function carre64(): [number, number][] {
  const p: [number, number][] = [];
  for (let i = 0; i < 16; i++) p.push([-16 + i, 4]);
  for (let i = 0; i < 16; i++) p.push([0, 4 + i]);
  for (let i = 0; i < 16; i++) p.push([-i, 20]);
  for (let i = 0; i < 16; i++) p.push([-16, 20 - i]);
  return p;
}

describe('E-21 dessine une zone d\'hexagones d\'un bloc', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let adresse = '';
  let base = '';
  let cle800 = '';
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const api = async (compte: string, method: string, path: string, data?: Any) => {
    const c = await connecte(browser, srv.base, compte);
    const r = await c.page.request.fetch(path, { method, data });
    const corps = await r.json().catch(() => null);
    await c.ctx.close();
    return { status: r.status(), corps };
  };
  const ouvre = async (compte: string, w = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: w, height: h });
    return c;
  };
  const zoneEl = (page: Any, cle: string) => page.locator(`g[data-zone="${cle}"]`);
  // A point of the page that hits the fill of the zone: scan the bounding box of its fill.
  const pointSurPlein = async (page: Any, cle: string) => page.evaluate((k: string) => {
    const el = document.querySelector(`g[data-zone="${k}"] path.gx-zone-plein`)!;
    const b = el.getBoundingClientRect();
    const svg = document.querySelector('svg.gx-svg')!.getBoundingClientRect();
    for (let y = Math.max(b.y, svg.y + 5); y < Math.min(b.bottom, svg.bottom - 5); y += 6) {
      for (let x = Math.max(b.x, svg.x + 5); x < Math.min(b.right, svg.right - 5); x += 6) {
        // well inside the fill (3 px from its edge) : a click on a hexagon border would pick the neighbour hexagon
        if ([[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3], [3, -3], [-3, 3]].every(([dx, dy]) => document.elementFromPoint(x + dx!, y + dy!) === el)) return { x, y };
      }
    }
    return null;
  }, cle);

  before(async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-gzh-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    base = `/api/univers/${univers}/outils/swn/galaxie/galaxies/${adresse.split('/').pop()}`;
    await a.ctx.close();
    const z = await api('Antor', 'POST', `${base}/zones`, { nom: 'Anneau', contour: { hexagones: zone800() }, secret: false });
    assert.equal(z.status, 201, JSON.stringify(z.corps));
    cle800 = z.corps.cle;
    assert.equal(z.corps.hexagones, 800);
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  for (const [w, h] of [[1280, 900], [390, 844]] as const) {
    it(`${w} px : la zone de 800 est pleine, deux tracés, un bord sur 2 boucles (extérieur+île), sélection « Hexagones » « 800 », Modifier sans « Corriger le contour »`, async () => {
      const { page, ctx } = await ouvre('Antor', w, h);
      await page.goto(adresse);
      await zoneEl(page, cle800).waitFor();
      assert.equal(await zoneEl(page, cle800).locator('path').count(), 2, 'deux <path> par zone');
      assert.equal(await zoneEl(page, cle800).locator('polygon').count(), 0, 'aucun polygone par hexagone');
      const d = await zoneEl(page, cle800).locator('path.gx-zone-trait').getAttribute('d');
      assert.equal((d!.match(/M/g) ?? []).length, 2, 'bord : contour extérieur (avec encoche) + île, rien entre les hexagones');
      assert.equal(await zoneEl(page, cle800).locator('path.gx-zone-plein').evaluate((e: Any) => getComputedStyle(e).fill !== 'none'), true, 'remplie');
      await hors(page, `01-zone-800-${w}`);
      const p = await pointSurPlein(page, cle800);
      assert.ok(p, 'un point du remplissage est cliquable');
      await page.mouse.click(p.x, p.y);
      const panneau = page.getByRole('region', { name: 'Zone sélectionnée' });
      await panneau.waitFor();
      await panneau.getByText('Hexagones', { exact: true }).waitFor();
      await panneau.getByText('800', { exact: true }).waitFor();
      assert.equal(await panneau.getByText('Sommets').count(), 0);
      await hors(page, `02-selection-${w}`);
      await panneau.getByRole('button', { name: 'Modifier' }).click();
      await page.getByRole('button', { name: 'Enregistrer' }).or(page.getByRole('button', { name: /Modifier$/ })).first().waitFor();
      assert.equal(await page.getByRole('button', { name: 'Corriger le contour' }).count(), 0);
      await hors(page, `03-modifier-${w}`);
      await ctx.close();
    });
  }

  it('un déplacement de la carte ne recalcule pas la zone (data-calculs reste 1) et elle suit', async () => {
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await zoneEl(page, cle800).waitFor();
    const avant = await zoneEl(page, cle800).locator('path.gx-zone-plein').boundingBox();
    assert.equal(await zoneEl(page, cle800).getAttribute('data-calculs'), '1');
    const svg = await page.locator('svg.gx-svg').boundingBox();
    const x0 = svg.x + svg.width / 2, y0 = svg.y + svg.height - 30;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 - 60, y0 - 25, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(([x, k]: [number, string]) => Math.abs(document.querySelector(`g[data-zone="${k}"] path.gx-zone-plein`)!.getBoundingClientRect().x - x) > 20, [avant.x, cle800]);
    assert.equal(await zoneEl(page, cle800).getAttribute('data-calculs'), '1', 'aucun recalcul après déplacement');
    await ctx.close();
  });

  it('5 000 hexagones : dessinés en moins de 2 s', async () => {
    const z = await api('Antor', 'POST', `${base}/zones`, { nom: 'Vaste', contour: { hexagones: bloc5000() } });
    assert.equal(z.status, 201, JSON.stringify(z.corps));
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await zoneEl(page, cle800).waitFor();
    const ms = await page.evaluate(async (k: string) => {
      const t0 = performance.now();
      await new Promise<void>((ok) => {
        const o = new MutationObserver(() => { if (document.querySelector(`g[data-zone="${k}"] path.gx-zone-trait`)) { o.disconnect(); ok(); } });
        if (document.querySelector(`g[data-zone="${k}"] path.gx-zone-trait`)) ok(); else o.observe(document.body, { childList: true, subtree: true });
      });
      return performance.now() - t0;
    }, z.corps.cle);
    assert.ok(ms < 2000, `${ms} ms`);
    assert.equal(await zoneEl(page, z.corps.cle).locator('path').count(), 2);
    await hors(page, '04-zone-5000');
    await ctx.close();
    await api('Antor', 'DELETE', `${base}/zones/${z.corps.cle}?version=${z.corps.version}`);
  });

  it('zone privée d\'ensemble : ni forme, ni étiquette, ni hachure pour Léa ni pour Antor en Mode Joueur ; Antor MJ la voit hachurée', async () => {
    const z = await api('Antor', 'POST', `${base}/zones`, { nom: 'Cicatrice', contour: { hexagones: Array.from({ length: 60 }, (_, i) => [-14 + (i % 12), 6 + Math.floor(i / 12)] as [number, number]) }, secret: true });
    assert.equal(z.status, 201, JSON.stringify(z.corps));
    const secrete = z.corps.cle;
    const l = await api('Léa', 'GET', base + '/blocs?bx=0&by=0');
    assert.ok(!JSON.stringify(l.corps).includes('Cicatrice'), 'la lecture de Léa ne porte pas la zone');
    const lea = await ouvre('Léa');
    await lea.page.goto(adresse);
    // a player's zone carries no key (data-zone) : it is found by its class
    await lea.page.locator('g.gx-ens').first().waitFor();
    assert.equal(await lea.page.locator('g.gx-ens').count(), 1, 'Léa ne voit que la zone publique');
    assert.equal(await lea.page.locator('g.gx-ens.secrete').count(), 0);
    assert.ok(!(await lea.page.locator('g.gx-ens').allTextContents()).join('').includes('Secret'), 'aucune étiquette secrète');
    assert.ok(!(await lea.page.content()).includes('Cicatrice'));
    await hors(lea.page, '05-lea');
    await lea.ctx.close();

    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    await zoneEl(page, secrete).waitFor();
    assert.equal(await zoneEl(page, secrete).evaluate((e: Any) => e.classList.contains('secrete')), true);
    assert.notEqual(await zoneEl(page, secrete).locator('path.gx-zone-trait').evaluate((e: Any) => getComputedStyle(e).strokeDasharray), 'none', 'bord en tirets');
    await hors(page, '06-antor-mj-secrete');
    await page.getByRole('radio', { name: /Joueur/ }).click();
    await page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await page.waitForFunction((k: string) => document.querySelector(`g[data-zone="${k}"]`) === null, secrete);
    assert.equal(await page.locator(`g[data-zone="${secrete}"]`).count(), 0);
    assert.ok(!(await page.content()).includes('Cicatrice'));
    assert.equal(await page.locator('.gx-zone.secrete').count(), 0, 'aucune hachure');
    await page.locator('g.gx-ens').first().waitFor({ timeout: 10000 });
    assert.equal(await page.locator('g.gx-ens').count(), 1, 'la zone publique reste');
    await hors(page, '07-antor-mode-joueur');
    await ctx.close();
  });

  it('une zone à 64 sommets (polygone) s\'affiche en <polygon> et se panneaute avec « Sommets » « 64 »', async () => {
    const z = await api('Antor', 'POST', `${base}/zones`, { nom: 'Contour', contour: carre64() });
    assert.equal(z.status, 201, JSON.stringify(z.corps));
    const { page, ctx } = await ouvre('Antor');
    await page.goto(adresse);
    const g = zoneEl(page, z.corps.cle);
    await g.waitFor();
    assert.equal(await g.locator('polygon:not(.gx-zone-bord)').count(), 1);
    assert.equal(await g.locator('path').count(), 0);
    await g.locator('polygon.gx-zone-bord').first().dispatchEvent('click').catch(() => {});
    const panneau = page.getByRole('region', { name: 'Zone sélectionnée' });
    await panneau.waitFor();
    await panneau.getByText('Sommets', { exact: true }).waitFor();
    await panneau.getByText('64', { exact: true }).waitFor();
    assert.equal(await panneau.getByText('Hexagones').count(), 0);
    await hors(page, '08-polygone-64');
    await ctx.close();
  });
});
