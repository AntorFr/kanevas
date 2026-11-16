// ecrans: cartes
// Ensemble tests of kanevas-battlemap-editeur written from the need (exit criterion, P-27 steps 1, 2, 4, E-28, E-10, E-25):
// what the user sees. The effects (document content, rights, versions, limits) are proved through their door in
// src/outils/battlemap/editeur-ensemble-besoin.test.ts.
//
// TEST PLAN
//   E-10 -> E-28 : « Nouvelle carte » ▸ « Carte composée » 30 × 20 « Créer » opens E-28: the three layers « Sol »
//                  « Murs » « Objets » top-down reversed (Objets first), the three tabs, the hint of the empty map,
//                  « Jouer » present and disabled, « Annuler » disabled, size shown « 30 × 20 »
//   premier geste: a first element placed makes the hint vanish and « Enregistré » appear; Ctrl+Z empties the map
//                  again (the hint is back, server holds no element)
//   deux onglets : the tab that writes second reads « Cette carte a changé » and « Recharger »; « Recharger » shows the
//                  first tab's element
//   retrait      : an asset on three maps says « Utilisé sur 3 cartes » in E-25's removal dialog; once removed the
//                  editor shows « Asset retiré » for the GM
//   joueuse      : Léa opens the editor address and reads « Page introuvable. »
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, rxExact, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (nom: string) => ({ name: nom, mimeType: 'image/png', buffer: pngPlat([200, 120, 40], 16) });

describe('E-28 Éditeur de carte : ce que voit Antor', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let api = '';
  const assets: Record<string, number> = {};

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
    const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    for (const outil of ['assets', 'cartes']) {
      for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: true }]] as const) {
        const r = await antor.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d });
        assert.ok(r.status() < 300, `${outil} ${c}: ${r.status()}`);
      }
    }
    api = `/api/univers/${uid}/outils/battlemap`;
    for (const nom of ['console', 'lanterne']) {
      const r = await antor.request.post(`${api}/assets`, { multipart: { categorie: 'objet', fichier: png(`${nom}.png`) } });
      assert.equal(r.status(), 201, `${nom}: ${await r.text()}`);
    }
    const liste = ((await (await antor.request.get(`${api}/assets`)).json()) as Any).assets as Any[];
    for (const a of liste) assets[String(a.nom).replace(/\.png$/, '')] = a.id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const lire = async (cid: number): Promise<Any> => (await antor.request.get(`${api}/cartes/${cid}`)).json();
  const nouvelle = async (titre: string): Promise<number> => {
    const r = await antor.request.post(`${api}/cartes`, { data: { titre, largeur: 30, hauteur: 20 } });
    assert.equal(r.status(), 201);
    return ((await r.json()) as Any).id;
  };
  const ouvrir = async (page: Any, cid: number) => {
    await page.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await page.getByLabel('Carte', { exact: true }).waitFor();
    await attendre(page);
  };
  const poser = async (page: Any, nom: string, x: number, y: number) => {
    await page.getByRole('tab', { name: 'Bibliothèque' }).click();
    await page.getByText(nom, { exact: false }).first().click();
    const b = await page.getByLabel('Carte', { exact: true }).boundingBox();
    await page.mouse.click(b.x + x, b.y + y);
  };

  it('E-10 puis E-28 : « Créer » ouvre l’éditeur — calques, onglets, indication de carte vide, « Jouer » désactivé', async () => {
    await antor.goto(`/univers/${uid}/cartes`);
    await antor.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
    await attendre(antor);
    await antor.getByRole('button', { name: rxExact('Carte composée') }).click();
    const d = antor.getByRole('dialog');
    await d.getByLabel(/Nom/).fill('Station Orak');
    assert.equal(await d.getByLabel(/Largeur/).inputValue(), '30');
    assert.equal(await d.getByLabel(/Hauteur/).inputValue(), '20');
    const rep = antor.waitForResponse((x: Any) => x.request().method() === 'POST' && /outils\/battlemap\/cartes$/.test(x.url()));
    await d.getByRole('button', { name: rxExact('Créer') }).click();
    const id = ((await (await rep).json()) as Any).id;
    await antor.waitForURL(new RegExp(`/univers/${uid}/outils/battlemap/cartes/${id}$`));
    await antor.getByLabel('Carte', { exact: true }).waitFor();
    await antor.getByText('Choisissez un outil à gauche, puis cliquez sur la grille.').waitFor();
    for (const t of ['Bibliothèque', 'Calques', 'Propriétés']) await antor.getByRole('tab', { name: t }).waitFor();
    await antor.getByRole('tab', { name: 'Calques' }).click();
    for (const c of ['Sol', 'Murs', 'Objets']) await antor.getByText(c, { exact: true }).first().waitFor();
    await antor.getByText('30 × 20').first().waitFor();
    const jouer = antor.getByRole('button', { name: 'Jouer' });
    assert.equal(await jouer.isDisabled(), true);
    assert.equal(await antor.getByRole('button', { name: 'Annuler', exact: true }).isDisabled(), true);
  });

  it('premier geste : l’indication disparaît et « Enregistré » s’affiche ; Ctrl+Z la fait revenir', async () => {
    const cid = await nouvelle('Premier geste');
    await ouvrir(antor, cid);
    const indication = antor.getByText('Choisissez un outil à gauche, puis cliquez sur la grille.');
    await indication.waitFor();
    await poser(antor, 'console', 250, 200);
    await indication.waitFor({ state: 'hidden' });
    await antor.getByText('Enregistré', { exact: true }).waitFor();
    assert.equal((await lire(cid)).document.elements.length, 1);
    assert.equal(await antor.getByRole('button', { name: 'Annuler', exact: true }).isDisabled(), false);
    await antor.keyboard.press('Control+z');
    await indication.waitFor();
    await antor.getByText('Enregistré', { exact: true }).waitFor();
    assert.equal((await lire(cid)).document.elements.length, 0);
  });

  it('deux onglets : le second qui écrit lit « Cette carte a changé » et « Recharger » montre l’élément du premier', async () => {
    const cid = await nouvelle('Deux onglets ensemble');
    await ouvrir(antor, cid);
    const autre = await antor.context().newPage();
    await ouvrir(autre, cid);
    await poser(autre, 'console', 250, 200);
    await autre.getByText('Enregistré', { exact: true }).waitFor();
    await poser(antor, 'lanterne', 400, 300);
    await antor.getByText('Cette carte a changé.').waitFor();
    await antor.getByRole('button', { name: 'Recharger' }).click();
    await antor.getByText('Cette carte a changé.').waitFor({ state: 'hidden' });
    const doc = (await lire(cid)).document;
    assert.deepEqual(doc.elements.map((e: Any) => e.asset_id), [String(assets.console)], 'seul l’élément du premier onglet est écrit');
    await autre.close();
  });

  const poserSurCarte = async (titre: string, assetId: number, id: string) => {
    const cid = await nouvelle(titre);
    const doc = (await lire(cid)).document;
    const r = await antor.request.post(`${api}/cartes/${cid}/commandes`, {
      data: { version: 1, commandes: [{ type: 'poser_element', id, calque: doc.calques.find((c: Any) => c.type === 'objet').id, asset_id: String(assetId), x: 5.5, y: 5.5 }] },
    });
    assert.ok(r.ok(), await r.text());
    return cid;
  };

  it('E-25 : retirer un asset posé sur 3 cartes dit « Utilisé sur 3 cartes », puis l’asset disparaît de la bibliothèque', async () => {
    for (const t of ['A', 'B', 'C']) await poserSurCarte(`Utilisation ${t}`, assets.lanterne!, `u${t}`);
    await antor.goto(`/univers/${uid}/outils/battlemap/assets`);
    await attendre(antor);
    await antor.getByText('lanterne', { exact: false }).first().click();
    await antor.getByRole('button', { name: /Retirer/ }).first().click();
    const dlg = antor.getByRole('alertdialog').or(antor.getByRole('dialog'));
    await dlg.getByText(/Utilisé sur 3 cartes/).waitFor();
    const rep = antor.waitForResponse((x: Any) => x.request().method() === 'DELETE' && /assets/.test(x.url()));
    await dlg.getByRole('button', { name: /Retirer/ }).last().click();
    assert.ok((await rep).status() < 300);
    await antor.getByText('lanterne', { exact: true }).waitFor({ state: 'hidden' });
  });

  it('E-28 : un asset retiré est remplacé, pour le MJ, par un repère qui porte « Asset retiré » sans avoir à le sélectionner', async () => {
    const cid = await poserSurCarte('Repère retiré', assets.console!, 'r1');
    const del = await antor.request.delete(`${api}/assets`, { data: { ids: [assets.console] } });
    assert.ok(del.ok(), await del.text());
    await ouvrir(antor, cid);
    // le repère est dessiné sur le canevas : son libellé est un texte lu à l'écran, pas seulement dans le panneau Propriétés
    await antor.getByText('Asset retiré', { exact: true }).first().waitFor({ timeout: 5000 });
  });

  it('joueuse : l’adresse de l’éditeur donne « Page introuvable. »', async () => {
    const cid = await nouvelle('Interdite');
    await lea.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByLabel('Carte', { exact: true }).count(), 0);
  });
});
