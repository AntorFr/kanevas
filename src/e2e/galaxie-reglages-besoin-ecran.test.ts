// ecrans: cartes
// Browser test of kanevas-carte-spatiale-reglages, E-24 « Générateur », written from docs/ecrans.md (« Apply bar », « Appliquer » dialogue)
// and the exit criterion — not from the code: the count and its two sentences are read BEFORE the confirmation, word for word.
// The effect (every drawn system gets a comet, the defined ones are identical) has its door: src/outils/swn/reglages-ensemble-besoin.test.ts.
// Screenshots go to /tmp/cap-reglages-besoin (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-reglages-besoin';

describe('E-24 besoin : la phrase du décompte et la confirmation, mot pour mot', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: join(mkdtempSync(join(tmpdir(), 'kanevas-reglages-besoin-')), 'k.db') });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('comète à 1 : « N systèmes tirés changent d’intérieur. 4 systèmes définis ne bougent pas. » avant toute confirmation, la boîte la répète et promet des étoiles immobiles', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}/reglages`);
    await page.getByRole('heading', { name: 'Réglages du générateur' }).waitFor();
    await page.getByRole('textbox', { name: 'Comètes' }).first().fill('1');
    const phrase = page.getByText(/systèmes tirés changent d.intérieur\. 4 systèmes définis ne bougent pas\./);
    await phrase.waitFor();
    assert.match(await phrase.innerText(), /^[1-9]\d* systèmes tirés changent d.intérieur\. 4 systèmes définis ne bougent pas\.$/);
    assert.equal(await page.getByRole('alertdialog').count(), 0, 'aucune confirmation avant d’avoir lu le décompte');
    await page.screenshot({ path: `${SHOTS}/1-decompte.png` });
    await page.getByRole('button', { name: 'Appliquer' }).click();
    const boite = page.getByRole('alertdialog');
    await boite.waitFor();
    assert.match(await boite.innerText(), /systèmes tirés changent d.intérieur\. 4 systèmes définis ne bougent pas\./);
    assert.match(await boite.innerText(), /Les étoiles de la galaxie ne bougent pas\./);
    assert.match(await boite.innerText(), /Appliquer ces réglages \?/);
    await page.screenshot({ path: `${SHOTS}/2-confirmation.png`, fullPage: true });
    await boite.getByRole('button', { name: 'Appliquer' }).click();
    await boite.waitFor({ state: 'detached' });
    await page.getByText('Rien à appliquer.').waitFor();
    await ctx.close();
  });

  it('la barre « Appliquer » reste lisible : le bouton flottant « Demander à Kanevas » ne recouvre ni « Appliquer » ni « Annuler les changements » (1280 × 900 et 390 × 844)', async () => {
    const { page, ctx } = await connecte(browser, srv.base, 'Antor');
    for (const [largeur, hauteur] of [[1280, 900], [390, 844]]) {
      await page.setViewportSize({ width: largeur, height: hauteur });
      await page.goto(`/univers/${univers}/outils/swn/galaxie/${gid}/reglages`);
      await page.getByRole('heading', { name: 'Réglages du générateur' }).waitFor();
      await page.getByRole('textbox', { name: 'Comètes' }).first().fill('0,5');
      await page.getByText(/changent? d.intérieur\./).waitFor();
      const flottant = page.getByRole('button', { name: /Demander à Kanevas/ });
      await flottant.waitFor();
      await page.screenshot({ path: `${SHOTS}/3-barre-${largeur}.png` });
      const fb = await flottant.boundingBox();
      for (const nom of ['Appliquer', 'Annuler les changements']) {
        const b = await page.getByRole('button', { name: nom }).boundingBox();
        assert.ok(b && fb, nom);
        const recouvre = b.x < fb.x + fb.width && fb.x < b.x + b.width && b.y < fb.y + fb.height && fb.y < b.y + b.height;
        assert.equal(recouvre, false, `${largeur} px : « Demander à Kanevas » recouvre « ${nom} » (${JSON.stringify(b)} / ${JSON.stringify(fb)})`);
      }
    }
    await ctx.close();
  });
});
