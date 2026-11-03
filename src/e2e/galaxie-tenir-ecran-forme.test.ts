// Browser test of the E-21 form fidelity reopened by verify (docs/ecrans.md E-21, maquette e21-ecriture.html):
// Taille as three segmented buttons, « Déplacer » on every system form, one-line colour swatches,
// bordered menu triggers, the chosen option of « Document MJ… » in accent. Screenshots in /tmp.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-galaxie-tenir-forme';
const R3 = Math.sqrt(3);

describe('E-21 : fidélité des formulaires à la maquette', { skip: skipBrowser, timeout: 300000 }, () => {
  let srv: Server;
  let browser: Any;
  let adresse = '';
  const systeme = (page: Any, nom: string) => page.locator(`g.gx-systeme[aria-label="${nom}"]`);
  const centre = async (page: Any, nom: string) => {
    const b = await systeme(page, nom).locator('.gx-zone-touche').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const toucher = async (page: Any, q: number, r: number) => {
    const p = await centre(page, 'Port-Sel');
    const v = await centre(page, 'Vael');
    const s = (v.x - p.x) / (7 * R3);
    await page.mouse.click(p.x + s * R3 * (q + r / 2), p.y + s * 1.5 * r);
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(mkdtempSync(join(tmpdir(), 'kanevas-gxf-')), 'k.db') });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    const univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    adresse = cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse;
    await a.ctx.close();
  }, { timeout: 120000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('Nouveau système : Taille en trois boutons (Moyenne par défaut), pastilles sur une ligne, Déplacer garde le brouillon', async () => {
    const c = await connecte(browser, srv.base, 'Antor');
    const page = c.page;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(adresse);
    await systeme(page, 'Vael').waitFor();
    await page.getByRole('button', { name: 'Placer un système' }).click();
    await toucher(page, 1, 0);
    const form = page.getByRole('region', { name: 'Nouveau système' });
    await form.waitFor();

    const taille = form.getByRole('group', { name: 'Taille' });
    const noms = await taille.getByRole('button').allTextContents();
    assert.deepEqual(noms, ['Petite', 'Moyenne', 'Grande']);
    assert.equal(await form.locator('select').count(), 0, 'plus de liste déroulante');
    assert.equal(await taille.getByRole('button', { name: 'Moyenne' }).getAttribute('aria-pressed'), 'true');
    await taille.getByRole('button', { name: 'Grande' }).click();
    assert.equal(await taille.getByRole('button', { name: 'Grande' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await taille.getByRole('button', { name: 'Moyenne' }).getAttribute('aria-pressed'), 'false');

    const tops = await form.locator('.gx-couleurs label').evaluateAll((els: Element[]) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.equal(tops.length, 6);
    assert.equal(new Set(tops).size, 1, 'les six pastilles sur une seule ligne');
    await page.screenshot({ path: `${SHOTS}/forme-nouveau.png`, fullPage: true });

    // « Déplacer » : le brouillon est gardé et le nouvel hexagone pris
    await form.getByLabel('Nom', { exact: true }).fill('Brouillon');
    await form.getByRole('button', { name: 'Déplacer' }).click();
    await page.getByText('Touchez le nouvel hexagone.').waitFor();
    await toucher(page, 2, 0);
    await form.getByText('Hexagone (2, 0)').waitFor();
    assert.equal(await form.getByLabel('Nom', { exact: true }).inputValue(), 'Brouillon');
    assert.equal(await taille.getByRole('button', { name: 'Grande' }).getAttribute('aria-pressed'), 'true');
    await form.getByRole('button', { name: 'Placer', exact: true }).click();
    await systeme(page, 'Brouillon').waitFor();
    await c.ctx.close();
  });

  it('Promouvoir offre « Déplacer » ; les menus ont une bordure ; à 390 px les pastilles tiennent sur une ligne', async () => {
    const c = await connecte(browser, srv.base, 'Antor');
    const page = c.page;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(adresse);
    await systeme(page, 'Vael').waitFor();
    const bord = await page.getByRole('button', { name: 'Galaxie ▾' }).evaluate((e: Element) => getComputedStyle(e).borderTopWidth);
    assert.notEqual(bord, '0px', 'déclencheur bordé');

    await page.getByRole('button', { name: 'Placer un système' }).click();
    await page.getByText('Touchez un hexagone.').waitFor();
    const cible = (await page.evaluate(() => {
      const c = document.querySelector('svg.gx-svg')!.getBoundingClientRect();
      for (const e of document.querySelectorAll('circle.gx-genere')) {
        const r = e.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        if (x > c.left + 40 && x < c.right - 140 && y > c.top + 40 && y < c.bottom - 150) return e.getAttribute('data-genere');
      }
      return null;
    })) as string;
    assert.ok(cible, 'une case générée visible');
    const cb = await page.locator(`circle[data-genere="${cible}"]`).boundingBox();
    await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    const form = page.getByRole('region', { name: 'Promouvoir ce système' });
    await form.getByRole('button', { name: 'Déplacer' }).waitFor();
    await form.getByText(/Hexagone \(/).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    const tops = await form.locator('.gx-couleurs label').evaluateAll((els: Element[]) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, 'une ligne à 390 px');
    const boite = await form.locator('.gx-couleurs').boundingBox();
    const dernier = await form.locator('.gx-couleurs label').last().boundingBox();
    assert.ok(dernier.x + dernier.width <= boite.x + boite.width + 1, 'rien ne déborde');
    await page.screenshot({ path: `${SHOTS}/forme-390.png`, fullPage: true });
    await c.ctx.close();
  });

  it('Document MJ… : le choix en cours est en accent (variante principale)', async () => {
    const c = await connecte(browser, srv.base, 'Antor');
    const page = c.page;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(adresse);
    await systeme(page, 'Vael').waitFor();
    await page.getByRole('button', { name: 'Galaxie ▾' }).click();
    await page.getByRole('menuitem', { name: /Document MJ/ }).click();
    const dlg = page.getByRole('dialog');
    const principal = (n: string) => dlg.getByRole('button', { name: n }).evaluate((e: Element) => e.classList.contains('principal'));
    await dlg.getByRole('button', { name: 'Choisir une fiche' }).click();
    assert.equal(await principal('Choisir une fiche'), true);
    assert.equal(await principal('Créer une fiche de type Savoir'), false);
    await dlg.getByRole('button', { name: 'Créer une fiche de type Savoir' }).click();
    assert.equal(await principal('Créer une fiche de type Savoir'), true);
    assert.equal(await principal('Choisir une fiche'), false);
    await dlg.getByLabel('Titre').waitFor();
    await page.screenshot({ path: `${SHOTS}/forme-document.png` });
    await c.ctx.close();
  });
});
