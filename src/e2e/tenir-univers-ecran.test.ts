// Browser test of kanevas-tenir-univers (P-10 step 8, E-14 « Supprimer l'univers »), written from the exit criterion.
// Seeded stub world: « Essai Kanka » (Antor GM, Léa player, the stub token).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, playwright, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

describe('supprimer un univers, par l’écran', { skip: skipBrowser }, () => {
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

  it('le_bouton_ne_s_active_qu_au_nom_exact_puis_E1_ne_liste_plus_l_univers', async () => {
    void playwright;
    const lea = await connecte(browser, srv.base, 'Léa');
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    const liste = (await (await page.request.get('/api/univers')).json()) as Any[];
    const essai = liste.find((u) => u.nom === 'Essai Kanka').id as number;
    await page.goto(`/univers/${essai}/parametres`);
    await attendre(page);
    const panneau = page.getByRole('region', { name: /Supprimer l.univers/ });
    await panneau.getByRole('button', { name: /Supprimer l.univers/ }).click();
    const boite = page.getByRole('alertdialog');
    const bouton = boite.getByRole('button', { name: /^Supprimer l.univers$/ });
    const champ = boite.getByLabel('Tapez le nom de l’univers pour confirmer');
    assert.equal(await bouton.isDisabled(), true, 'vide');
    for (const faux of ['essai kanka', 'Essai Kanka ', 'Essai Kank', 'ESSAI KANKA']) {
      await champ.fill(faux);
      assert.equal(await bouton.isDisabled(), true, `[${faux}]`);
    }
    await page.screenshot({ path: '/tmp/tenir-univers-inactif.png' });
    // the keyboard cannot fire it either
    await champ.fill('Essai Kanka ');
    await champ.press('Enter');
    assert.equal((await (await page.request.get(`/api/univers/${essai}`)).status()), 200);
    await champ.fill('Essai Kanka');
    assert.equal(await bouton.isDisabled(), false);
    await page.screenshot({ path: '/tmp/tenir-univers-actif.png' });
    await bouton.click();
    await page.waitForURL((u: URL) => u.pathname === '/');
    await attendre(page);
    await page.getByText('Univers supprimé.').first().waitFor();
    await page.getByText(/Lame d.Ébène/).first().waitFor();
    const t = await texte(page);
    assert.ok(!t.includes('Essai Kanka'), t);
    assert.match(t, /Lame d'Ébène/);
    await page.screenshot({ path: '/tmp/tenir-univers-e1.png' });
    // Léa: not listed, address answers « Page introuvable. »
    await lea.page.goto('/');
    await attendre(lea.page);
    assert.ok(!(await texte(lea.page)).includes('Essai Kanka'));
    await lea.page.goto(`/univers/${essai}/parametres`);
    await attendre(lea.page);
    assert.match(await texte(lea.page), /Page introuvable\./);
    await lea.page.goto(`/univers/${essai}`);
    await attendre(lea.page);
    assert.match(await texte(lea.page), /Page introuvable\./);
    const jeton = await fetch(`${srv.base}/api/import/v1/univers/${essai}/lots`, {
      method: 'POST',
      headers: { authorization: 'Bearer kvs_bouchon' },
    });
    assert.equal(jeton.status, 401);
    await ctx.close();
    await lea.ctx.close();
  });

  it('une_erreur_du_serveur_reste_dans_la_boite_et_Annuler_la_ferme_sans_rien_supprimer', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    const liste = (await (await page.request.get('/api/univers')).json()) as Any[];
    const id = liste.find((u) => u.nom === 'Les Cendres de Vaëlis').id as number; // Antor is a player there: no panel
    await page.goto(`/univers/${id}/parametres`);
    await attendre(page);
    assert.equal(await page.getByRole('button', { name: /Supprimer l.univers/ }).count(), 0, 'joueur: pas de panneau');
    const lame = liste.find((u) => u.nom === "Lame d'Ébène").id as number;
    await page.goto(`/univers/${lame}/parametres`);
    await attendre(page);
    await page.getByRole('button', { name: /Supprimer l.univers/ }).click();
    const boite = page.getByRole('alertdialog');
    await boite.getByLabel('Tapez le nom de l’univers pour confirmer').fill("Lame d'Ébène");
    // the universe is renamed behind the dialog's back: the server's comparison refuses, inside the box
    await page.request.patch(`/api/univers/${lame}`, { data: { nom: 'Autre nom', description: '' } });
    await boite.getByRole('button', { name: /^Supprimer l.univers$/ }).click();
    await boite.getByRole('alert').waitFor();
    assert.match(await boite.innerText(), /Le nom ne correspond pas\./);
    await page.screenshot({ path: '/tmp/tenir-univers-erreur.png' });
    assert.equal(((await page.request.get(`/api/univers/${lame}`)).status()), 200);
    await boite.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    await ctx.close();
  });
});
