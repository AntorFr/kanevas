// Browser test of kanevas-tenir-fiche-ecran (P-14 steps 2-3, E-9 title and deletion), written from the exit criterion.
// Seeded stub world: « Lame d'Ébène » (Antor GM, Léa player), where Port-Sel is seeded.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

describe('renommer et supprimer une fiche depuis son en-tête', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  beforeEach(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  afterEach(async () => {
    await browser?.close();
    srv?.stop();
  });

  async function essai(page: Any): Promise<{ univers: number; port: number }> {
    const liste = (await (await page.request.get('/api/univers')).json()) as Any[];
    const univers = liste.find((u) => u.nom === "Lame d'Ébène").id as number;
    const r = (await (await page.request.get(`/api/univers/${univers}/fiches?type=lieu`)).json()) as Any;
    const port = (r.fiches as Any[]).find((f) => f.titre === 'Port-Sel').id as number;
    return { univers, port };
  }

  it('renommer_au_clic_garde_les_liens_vide_reste_en_place_et_Lea_ne_peut_rien', async () => {
    const lea = await connecte(browser, srv.base, 'Léa');
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    const { univers, port } = await essai(page);
    await page.goto(`/univers/${univers}/fiche/${port}`);
    await attendre(page);
    await page.getByRole('button', { name: 'Renommer « Port-Sel »' }).click();
    const champ = page.getByLabel('Titre de la fiche');
    // empty title: the exact error, the field stays
    await champ.fill('');
    await champ.press('Enter');
    await page.getByText('Erreur : le titre est obligatoire.').first().waitFor();
    assert.ok(await champ.isVisible(), 'field stays');
    assert.equal((await (await page.request.get(`/api/univers/${univers}/fiches/${port}`)).json() as Any).fiche?.titre ?? 'Port-Sel', 'Port-Sel');
    await champ.fill('Port-Sel-sur-Brume');
    await champ.press('Enter');
    await page.getByText('Fiche renommée.').first().waitFor();
    await page.getByRole('heading', { name: 'Port-Sel-sur-Brume' }).first().waitFor();
    // Aldric's link keeps its text and still opens the renamed sheet
    const liste = (await (await page.request.get(`/api/univers/${univers}/fiches?type=personnage`)).json()) as Any;
    const aldric = (liste.fiches as Any[]).find((f) => /Aldric/.test(f.titre)).id as number;
    await page.goto(`/univers/${univers}/fiche/${aldric}`);
    await attendre(page);
    const lien = page.locator(`main a[href*="/fiche/${port}"]`).first();
    await lien.waitFor();
    assert.equal((await lien.innerText()).trim(), 'Port-Sel', 'link text unchanged');
    await lien.click();
    await page.getByRole('heading', { name: 'Port-Sel-sur-Brume' }).first().waitFor();
    // Léa: no editable title, no « ⋯ »
    await lea.page.goto(`/univers/${univers}/fiche/${port}`);
    await attendre(lea.page);
    await lea.page.getByRole('heading', { name: 'Port-Sel-sur-Brume' }).first().click({ force: true });
    assert.equal(await lea.page.getByLabel('Titre de la fiche').count(), 0);
    assert.equal(await lea.page.getByRole('button', { name: /Autres actions/ }).count(), 0);
    await ctx.close();
    await lea.ctx.close();
  });

  it('la_boite_compte_ce_qui_part_Annuler_ne_change_rien_Supprimer_ramene_a_la_liste', async () => {
    const lea = await connecte(browser, srv.base, 'Léa');
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    const { univers, port } = await essai(page);
    await page.goto(`/univers/${univers}/fiche/${port}`);
    await attendre(page);
    await page.getByRole('button', { name: /^Autres actions sur « (Port-Sel|La Fresque effacée) »$/ }).click();
    await page.getByRole('menuitem', { name: /Supprimer la fiche…/ }).click();
    const boite = page.getByRole('alertdialog');
    await boite.getByText(/3 sections/).waitFor();
    const t = (await boite.innerText()).replace(/\s+/g, ' ');
    assert.match(t, /3 sections ; 3 relations qui la visent ; 1 place sur une carte\./);
    assert.match(t, /Ses 2 fichiers restent dans la médiathèque\./);
    assert.match(t, /Ses 5 enfants remonteront sous « Les Sphères »\./);
    assert.match(t, /Les liens qui la visent deviendront des liens cassés\./);
    await boite.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal((await page.request.get(`/api/univers/${univers}/fiches/${port}`)).status(), 200);
    await page.getByRole('button', { name: /^Autres actions sur « (Port-Sel|La Fresque effacée) »$/ }).click();
    await page.getByRole('menuitem', { name: /Supprimer la fiche…/ }).click();
    await boite.getByText(/3 sections/).waitFor();
    await boite.getByRole('button', { name: /^Supprimer la fiche$/ }).click();
    await page.getByText('Fiche supprimée.').first().waitFor();
    assert.match(new URL(page.url()).pathname, /^\/univers\/\d+\/fiches\/lieux$/);
    assert.equal((await page.request.get(`/api/univers/${univers}/fiches/${port}`)).status(), 404);
    await page.goto(`/univers/${univers}/fiche/${port}`);
    await attendre(page);
    assert.match(await texte(page), /Page introuvable\./);
    // Léa: the old link is plain text
    const liste = (await (await page.request.get(`/api/univers/${univers}/fiches?type=personnage`)).json()) as Any;
    const aldric = (liste.fiches as Any[]).find((f) => /Aldric/.test(f.titre)).id as number;
    await lea.page.goto(`/univers/${univers}/fiche/${aldric}`);
    await attendre(lea.page);
    assert.equal(await lea.page.locator(`main a[href*="/fiche/${port}"]`).count(), 0);
    await ctx.close();
    await lea.ctx.close();
  });

  it('un_bilan_qui_echoue_montre_Reessayer_et_le_bouton_reste_inactif', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    page.setDefaultTimeout(20000);
    const { univers } = await essai(page);
    const r = (await (await page.request.get(`/api/univers/${univers}/fiches?type=lieu`)).json()) as Any;
    const autre = (r.fiches as Any[])[0].id as number;
    await page.goto(`/univers/${univers}/fiche/${autre}`);
    await attendre(page);
    await page.route('**/suppression', (route: Any) => route.abort());
    await page.getByRole('button', { name: /^Autres actions sur « (Port-Sel|La Fresque effacée) »$/ }).click();
    await page.getByRole('menuitem', { name: /Supprimer la fiche…/ }).click();
    const boite = page.getByRole('alertdialog');
    await boite.getByText('Impossible de charger le détail.').waitFor();
    assert.equal(await boite.getByRole('button', { name: /^Supprimer la fiche$/ }).isDisabled(), true);
    await boite.getByRole('button', { name: 'Réessayer' }).waitFor();
    await ctx.close();
  });
});
