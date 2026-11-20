// ecrans: cartes
// Ensemble test of kanevas-battlemap-table, written from the need alone (exit criterion: « Un joueur ouvre depuis E-10 la carte
// qu'il lit sur E-29 »; docs/ecrans.md « E-10 morceau »: for a player the title of a composed map opens E-29, for the GM E-28).
//
// TEST PLAN
//   joueuse : Léa clicks the title of a played, visible map in E-10 -> E-29 (…/jeu): « Suivre le MJ », no tool column, no « Ajouter un pion »
//   MJ      : Antor clicks the same title -> the editor (E-28, no …/jeu), with « Jouer »
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, rxExact, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

describe('E-10 -> E-29 Le titre d’une carte jouée ouvre le jeu pour une joueuse, l’éditeur pour le MJ', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let cid = 0;

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
    const api = `/api/univers/${uid}/outils/battlemap`;
    const r = await antor.request.post(`${api}/cartes`, { data: { titre: 'Salle du trône', largeur: 30, hauteur: 20 } });
    assert.equal(r.status(), 201);
    cid = ((await r.json()) as Any).id;
    assert.equal((await antor.request.patch(`${api}/cartes/${cid}`, { data: { version: 1, visible: true } })).status(), 200);
    // first « Jouer »: the GM opens E-29, which creates the table
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/jeu`);
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).waitFor();
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const liste = async (page: Any) => {
    await page.goto(`/univers/${uid}/cartes`);
    await page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
    await attendre(page);
  };

  it('joueuse : le titre dans E-10 ouvre E-29, vue joueuse sans outil MJ', async () => {
    await liste(lea);
    await lea.getByRole('link', { name: rxExact('Salle du trône') }).click();
    await lea.waitForURL(new RegExp(`/outils/battlemap/cartes/${cid}/jeu$`));
    await lea.getByRole('switch', { name: 'Suivre le MJ' }).waitFor();
    assert.equal(await lea.getByRole('button', { name: rxExact('Ajouter un pion') }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /Réinitialiser/ }).count(), 0);
    assert.equal(await lea.getByText('Page introuvable.').count(), 0);
  });

  it('MJ : le même titre ouvre l’éditeur, pas le jeu', async () => {
    await liste(antor);
    await antor.getByRole('link', { name: rxExact('Salle du trône') }).click();
    await antor.waitForURL(new RegExp(`/outils/battlemap/cartes/${cid}$`));
    await antor.getByRole('button', { name: 'Jouer' }).waitFor();
  });
});
