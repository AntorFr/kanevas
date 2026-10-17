// E-14 « Supprimer l'univers » box against the mock-up (#etat-supprimer-univers): title typography and the bin before the label.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

describe('boîte « Supprimer l’univers » conforme à la maquette E-14', { skip: skipBrowser }, () => {
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

  it('titre_en_sans_serif_16px_600_et_corbeille_avant_le_libelle_inactif_comme_actif', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    const liste = (await (await page.request.get('/api/univers')).json()) as Any[];
    const id = liste.find((u) => u.nom === 'Essai Kanka').id as number;
    await page.goto(`/univers/${id}/parametres`);
    await attendre(page);
    await page.getByRole('button', { name: /Supprimer l.univers/ }).click();
    const boite = page.getByRole('alertdialog');
    const titre = boite.getByRole('heading');
    const style = await titre.evaluate((el: Element) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, weight: s.fontWeight, family: s.fontFamily };
    });
    assert.equal(style.size, '16px');
    assert.equal(style.weight, '600');
    assert.ok(!/Fraunces/i.test(style.family), style.family);
    const bouton = boite.getByRole('button', { name: /^Supprimer l.univers$/ });
    for (const nom of ['', 'Essai Kanka']) {
      await boite.getByLabel('Tapez le nom de l’univers pour confirmer').fill(nom);
      assert.equal(await bouton.locator('svg.lucide-trash-2').count(), 1, `[${nom}] corbeille`);
      const avant = await bouton.evaluate((el: Element) => el.firstElementChild?.tagName.toLowerCase());
      assert.equal(avant, 'svg', 'avant le libellé');
    }
    await ctx.close();
  });
});
