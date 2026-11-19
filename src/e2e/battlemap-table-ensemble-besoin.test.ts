// ecrans: cartes
// Ensemble test of kanevas-battlemap-table, ce que voient Antor (E-29, GM) et le compte de table (E-30), written from the need alone
// (exit criterion, P-28, B-105, B-106, B-107, B-109, E-29, E-30). The effects (rights, bytes, versions, limits, persistence) are
// proved through their doors in src/outils/battlemap/table-ensemble-besoin.test.ts and table-ensemble-reprise-besoin.test.ts.
//
// TEST PLAN (two windows: Antor on E-29, Léa, an ordinary member, as the table account on E-30)
//   jouer      : « Jouer » of E-28 opens E-29; E-30, opened by the table account, reads « En attente du MJ »
//   vue        : « Vue partagée » on: E-30 draws the map, the whole map being under the fog it is black
//   trois pions: « Ajouter un pion » ▸ Fiche, ▸ Asset, ▸ Disque; « Propriétaire… » on two: the list reads the three names and
//                « Sans propriétaire » once, the owner twice (E-29 screen)
//   pièce      : « Révéler » ▸ « Pièce », one click in the room: the floor appears on E-30 in under two seconds, no reload,
//                the display still has no button
//   images     : the floor and the asset token are drawn with their images on E-30 (sand and red pixels), still no reload
//   reprise    : Antor closes the page and reopens E-29: the three tokens are listed; the display is unchanged
//   réinit     : « Réinitialiser la table… » says what goes, then « Aucun pion. » and E-30 black again
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, rxExact, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (nom: string, couleur: [number, number, number]) => ({ name: nom, mimeType: 'image/png', buffer: pngPlat(couleur, 16) });

describe('E-29 / E-30 La table à deux fenêtres : Antor joue, l’écran joueurs suit', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let table: Any;
  let uid = 0;
  let api = '';
  let cid = 0;

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    await antor.setViewportSize({ width: 1400, height: 1100 });
    table = (await connecte(browser, srv.base, 'Léa')).page;
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
    const ids: Record<string, string> = {};
    for (const [nom, categorie, couleur] of [['dalle', 'sol', [220, 200, 120]], ['mur', 'mur', [90, 90, 90]], ['console', 'objet', [200, 60, 60]]] as const) {
      const r = await antor.request.post(`${api}/assets`, { multipart: { categorie, fichier: png(`${nom}.png`, [...couleur]) } });
      assert.equal(r.status(), 201, `${nom}: ${await r.text()}`);
    }
    const liste = ((await (await antor.request.get(`${api}/assets`)).json()) as Any).assets as Any[];
    for (const a of liste) ids[String(a.nom).replace(/\.png$/, '')] = String(a.id);
    const c = await antor.request.post(`${api}/cartes`, { data: { titre: 'Station Orak', largeur: 12, hauteur: 8 } });
    assert.equal(c.status(), 201);
    cid = ((await c.json()) as Any).id;
    assert.equal((await antor.request.patch(`${api}/cartes/${cid}`, { data: { version: 1, visible: true } })).status(), 200);
    // une salle de 4 × 3 cases (x 3–6, y 2–4), sol et murs ; un clic dedans révèle ces 12 cases
    const sol = [3, 4, 5, 6].flatMap((x) => [2, 3, 4].map((y) => ({ x, y })));
    const murs = [
      ...[3, 4, 5, 6].flatMap((x) => [{ x, y: 2, cote: 'h' }, { x, y: 5, cote: 'h' }]),
      ...[2, 3, 4].flatMap((y) => [{ x: 3, y, cote: 'v' }, { x: 7, y, cote: 'v' }]),
    ];
    const d = await antor.request.post(`${api}/cartes/${cid}/commandes`, { data: { version: 2, commandes: [
      { type: 'peindre_sol', calque: 'sol', cellules: sol, asset_id: ids.dalle },
      { type: 'tracer_mur', calque: 'murs', segments: murs, asset_id: ids.mur },
    ] } });
    assert.equal(d.status(), 200, await d.text());
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const lire = async (page: Any): Promise<Any> => (await page.request.get(`${api}/cartes/${cid}/table`)).json();
  const affichage = (page: Any) => page.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/affichage`);
  const pret = (page: Any) => page.getByLabel('Carte', { exact: true });
  /** Pixels of the display's canvas that are not pure black: the fog is the black ground. */
  const clairs = (page: Any): Promise<number> => page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 30) n++;
    return n;
  });

  it('jouer : « Jouer » ouvre E-29 ; le compte de table ouvre E-30 qui dit « En attente du MJ »', async () => {
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await antor.getByLabel('Carte', { exact: true }).waitFor();
    await antor.getByRole('button', { name: 'Jouer' }).click();
    await antor.waitForURL(new RegExp(`/cartes/${cid}/jeu$`));
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).waitFor();
    await affichage(table);
    await table.getByText('En attente du MJ').waitFor({ timeout: 6000 });
    assert.equal(await pret(table).count(), 0);
    await antor.screenshot({ path: '/tmp/table-e29-jouer.png' });
    await table.screenshot({ path: '/tmp/table-e30-attente.png' });
  });

  it('vue partagée : E-30 montre la carte, noire tant que rien n’est révélé', async () => {
    await antor.getByText('Écran joueurs connecté').waitFor({ timeout: 6000 });
    await antor.getByRole('switch', { name: 'Vue partagée' }).click();
    await pret(table).waitFor({ timeout: 6000 });
    assert.equal(await clairs(table), 0, 'sous le brouillard, tout est noir');
    assert.equal(await table.getByRole('button').count(), 0);
  });

  it('trois pions : une fiche, un asset, un disque ; deux ont un propriétaire', async () => {
    const dialogue = antor.getByRole('dialog');
    // Fiche
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).click();
    await dialogue.getByRole('radio', { name: /Fiche/ }).click();
    await dialogue.getByRole('button', { name: /Choisir une fiche/ }).click();
    const premiere = dialogue.locator('.editeur-choix-fiche-ligne').first();
    await premiere.waitFor();
    const titre = ((await premiere.textContent()) ?? '').split(' · ')[0]!.trim();
    await premiere.click();
    await dialogue.getByLabel(/Nom du pion/).waitFor();
    assert.equal(await dialogue.getByLabel(/Nom du pion/).inputValue(), titre.slice(0, 40), 'le nom du pion est le titre de la fiche');
    await dialogue.getByLabel(/Propriétaire/).selectOption({ label: 'lea' });
    await dialogue.getByRole('button', { name: rxExact('Ajouter') }).click();
    await dialogue.waitFor({ state: 'detached' });
    // Asset
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).click();
    await dialogue.getByRole('radio', { name: /Asset/ }).click();
    await dialogue.getByText('Aucun asset choisi.').waitFor();
    await dialogue.getByRole('button', { name: /console/ }).first().click();
    await dialogue.getByLabel(/Nom du pion/).fill('Console');
    await dialogue.getByLabel(/Propriétaire/).selectOption({ label: 'antor' });
    await dialogue.getByRole('button', { name: rxExact('Ajouter') }).click();
    await dialogue.waitFor({ state: 'detached' });
    // Disque
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).click();
    await dialogue.getByRole('radio', { name: /Disque/ }).click();
    await dialogue.getByLabel(/Nom du pion/).fill('Garde');
    await dialogue.getByRole('button', { name: rxExact('Ajouter') }).click();
    await dialogue.waitFor({ state: 'detached' });
    const liste = antor.getByRole('region', { name: 'Pions' }).or(antor.locator('.jeu-pions'));
    await liste.getByText('Garde', { exact: true }).first().waitFor();
    await liste.getByText('Console', { exact: true }).first().waitFor();
    await liste.getByText(titre, { exact: true }).first().waitFor();
    assert.equal(await liste.getByText('Sans propriétaire', { exact: true }).count(), 1, 'le disque seul n’a pas de propriétaire');
    assert.equal(await liste.getByText('lea', { exact: true }).count(), 1);
    assert.equal(await liste.getByText('antor', { exact: true }).count(), 1);
    assert.equal((await lire(antor)).etat.pions.length, 3);
    await antor.screenshot({ path: '/tmp/table-e29-pions.png' });
  });

  it('pièce : « Révéler ▸ Pièce », un clic dans la salle, et le sol apparaît sur E-30 en moins de deux secondes, sans recharger', async () => {
    assert.equal(await clairs(table), 0, 'encore sous le brouillard');
    await antor.getByRole('radio', { name: /Révéler/ }).click();
    await antor.getByRole('radio', { name: 'Pièce' }).click();
    const b = await antor.getByLabel('Carte', { exact: true }).boundingBox();
    const cote = Math.min(b.width / 12, b.height / 8);
    const ox = b.x + (b.width - cote * 12) / 2;
    const oy = b.y + (b.height - cote * 8) / 2;
    const reponse = table.waitForResponse((r: Any) => r.url().includes('/table?mode=joueur') && r.request().method() === 'GET', { timeout: 2000 });
    const t0 = Date.now();
    await antor.mouse.click(ox + 4.5 * cote, oy + 3.5 * cote);
    await reponse;
    await table.waitForFunction(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 30) return true;
      return false;
    }, undefined, { timeout: 2000 });
    assert.ok(Date.now() - t0 < 2500, `${Date.now() - t0} ms`);
    assert.ok((await clairs(table)) > 500, 'le sol de la salle est dessiné');
    assert.equal(await table.getByRole('button').count(), 0);
    assert.equal((await lire(antor)).etat.brouillard.length > 0, true);
    await table.screenshot({ path: '/tmp/table-e30-piece.png' });
    await antor.screenshot({ path: '/tmp/table-e29-piece.png' });
  });

  it('images : le sol et le pion d’asset sont dessinés avec leurs images sur E-30, sans recharger', async () => {
    // the floor asset (sand, 220/200/120) and the asset token (red, 200/60/60) are drawn as images, not as grey cells and a disc
    for (const [nom, couleur] of [['le sol de la salle', [220, 200, 120]], ['le pion d’asset', [200, 60, 60]]] as const) {
      await table.waitForFunction(([r, g, b]: number[]) => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - r!) < 12 && Math.abs(d[i + 1]! - g!) < 12 && Math.abs(d[i + 2]! - b!) < 12) n++;
        return n > 300;
      }, [...couleur], { timeout: 5000 }).catch(async () => {
        await table.screenshot({ path: '/tmp/table-e30-sans-image.png' });
        assert.fail(`${nom} n’est pas dessiné sur l’écran joueurs, cinq secondes après la révélation`);
      });
    }
    await table.screenshot({ path: '/tmp/table-e30-images.png' });
  });

  it('reprise : Antor ferme et rouvre E-29, les trois pions y sont ; l’écran joueurs garde la pièce', async () => {
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes`);
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/jeu`);
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).waitFor();
    await antor.getByText('Garde', { exact: true }).first().waitFor();
    await antor.getByText('Console', { exact: true }).first().waitFor();
    assert.equal(await antor.locator('.jeu-pions-liste > li').count(), 3);
    assert.ok((await clairs(table)) > 500);
  });

  it('réinitialiser : la boîte dit ce qui part, puis « Aucun pion. » et l’écran joueurs redevient noir', async () => {
    await antor.getByRole('button', { name: /Réinitialiser la table/ }).click();
    await antor.getByText('Les pions, le brouillard et la vue partagée seront effacés.').waitFor();
    assert.equal((await lire(antor)).etat.pions.length, 3, 'rien n’est effacé avant la confirmation');
    await antor.getByRole('button', { name: rxExact('Réinitialiser') }).click();
    await antor.getByText('Aucun pion.').waitFor();
    await table.waitForFunction(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!c) return true;
      const x = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < x.length; i += 4) if (x[i]! + x[i + 1]! + x[i + 2]! > 30) return false;
      return true;
    }, undefined, { timeout: 4000 });
    const t = await lire(antor);
    assert.deepEqual(t.etat.pions, []);
    assert.equal(t.etat.vue, null);
    await table.getByText('En attente du MJ').waitFor({ timeout: 4000 });
    await antor.screenshot({ path: '/tmp/table-e29-reinit.png' });
    await table.screenshot({ path: '/tmp/table-e30-reinit.png' });
  });
});
