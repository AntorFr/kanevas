// E-14 « Supprimer l'univers » box on a phone (390×844) and on a desktop: label on one line, buttons aligned/stacked.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

describe('boîte « Supprimer l’univers » au téléphone et au bureau', { skip: skipBrowser }, () => {
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

  async function ouvrir(largeur: number, hauteur: number) {
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
    const confirmer = await boite.getByRole('button', { name: /^Supprimer l.univers$/ }).boundingBox();
    const annuler = await boite.getByRole('button', { name: 'Annuler' }).boundingBox();
    const cadre = await boite.boundingBox();
    await ctx.close();
    return { confirmer, annuler, cadre };
  }

  it('telephone_libelle_sur_une_ligne_boutons_empiles_pleine_largeur_dans_la_boite', async () => {
    const { confirmer, annuler, cadre } = await ouvrir(390, 844);
    assert.ok(confirmer && annuler && cadre);
    assert.ok(confirmer.height < 60, `libellé sur une ligne, hauteur ${confirmer.height}`);
    assert.ok(annuler.y > confirmer.y + confirmer.height - 1 || confirmer.y > annuler.y + annuler.height - 1, 'empilés');
    assert.ok(Math.abs(confirmer.width - annuler.width) < 2, 'même largeur');
    assert.ok(Math.abs(confirmer.x - annuler.x) < 2, 'alignés à gauche');
    assert.ok(confirmer.x >= cadre.x && confirmer.x + confirmer.width <= cadre.x + cadre.width + 1, 'dans la boîte');
    assert.ok(confirmer.x + confirmer.width <= 390 && cadre.x >= 0, 'dans la fenêtre');
  });

  it('bureau_boutons_cote_a_cote_alignes', async () => {
    const { confirmer, annuler } = await ouvrir(1440, 900);
    assert.ok(confirmer && annuler);
    assert.ok(Math.abs(confirmer.y - annuler.y) < 2 && Math.abs(confirmer.height - annuler.height) < 2, 'même ligne et hauteur');
    assert.ok(confirmer.height < 60, 'libellé sur une ligne');
  });
});
