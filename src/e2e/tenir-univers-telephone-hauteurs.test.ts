// E-14 « Supprimer l'univers » box on a phone: the danger button is as tall as « Annuler », its label on one line, nothing overflows.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

describe('boîte « Supprimer l’univers » : boutons de même hauteur au téléphone', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  async function mesurer(largeur: number, hauteur: number) {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    await page.setViewportSize({ width: largeur, height: hauteur });
    const liste = (await (await page.request.get('/api/univers')).json()) as Any[];
    const id = liste.find((u) => u.nom === 'Essai Kanka').id as number;
    await page.goto(`/univers/${id}/parametres`);
    await attendre(page);
    await page.getByRole('button', { name: /Supprimer l.univers/ }).click();
    const boite = page.getByRole('alertdialog');
    await boite.waitFor();
    await page.waitForTimeout(500);
    const danger = await boite.getByRole('button', { name: /^Supprimer l.univers$/ }).boundingBox();
    const annuler = await boite.getByRole('button', { name: 'Annuler' }).boundingBox();
    const cadre = await boite.boundingBox();
    const lignes = await boite.getByRole('button', { name: /^Supprimer l.univers$/ }).evaluate((b: Element) => {
      const tops = new Set<number>();
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const q of Array.from(r.getClientRects())) if (q.width > 0) tops.add(Math.round(q.top));
      }
      return tops.size;
    });
    await page.screenshot({ path: `/tmp/e14-${largeur}.png` });
    await ctx.close();
    return { danger, annuler, cadre, lignes };
  }

  for (const [l, h] of [[390, 844], [360, 740], [320, 568]] as const) {
    it(`telephone_${l}_bouton_danger_aussi_haut_quannuler_libelle_une_ligne`, async () => {
      const { danger, annuler, cadre, lignes } = await mesurer(l, h);
      assert.ok(danger && annuler && cadre);
      assert.ok(Math.abs(danger.height - annuler.height) < 1, `danger ${danger.height} px, Annuler ${annuler.height} px`);
      assert.equal(lignes, 1, 'le libellé du bouton danger tient sur une ligne');
      assert.ok(danger.height < 50, `libellé sur une ligne, hauteur ${danger.height}`);
      assert.ok(danger.x >= cadre.x - 1 && danger.x + danger.width <= cadre.x + cadre.width + 1, 'bouton danger dans la boîte');
      assert.ok(annuler.x >= cadre.x - 1 && annuler.x + annuler.width <= cadre.x + cadre.width + 1, 'Annuler dans la boîte');
    });
  }
});
