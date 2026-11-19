// ecrans: cartes
// Review of kanevas-battlemap-table-e29 (E-29 GM and player, E-28 « Jouer »), written from the exit criterion.
//
// TEST PLAN
//   jouer      : « Jouer » of E-28 opens …/jeu and the table exists (GET …/table commencee)
//   disque     : « Ajouter un pion » ▸ Disque, a name: the token is in the list, in the table, and survives a reload
//   masquer    : the eye hides the token (« Masqué aux joueurs »); the player's table read does not carry it
//   joueuse    : the player sees no tool column and no « Ajouter un pion », has « Suivre le MJ » on by default, and the choice survives a reload
//   sans table : a map never opened with « Jouer » reads « La partie n’a pas commencé. » for the player
//   cachee     : a map hidden from players reads « Page introuvable. » for the player
//   vue        : « Effacer la vue » gives vue: null
//   reinit     : « Réinitialiser la table… » empties the tokens only after the confirmation
//   glisser    : a token dragged 3 cells right and 2 down moves by exactly that and stays after a reload
//   lien       : « Lier une fiche… » sets fiche_id, « Ouvrir la fiche » shows the sheet, « Délier » clears it
//   pleine     : with 200 tokens « Table pleine » shows and the 201st command is refused
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, rxExact, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

describe('E-29 Jeu : la table côté MJ et côté joueuse', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let api = '';

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
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const nouvelle = async (titre: string, visible = true): Promise<number> => {
    const r = await antor.request.post(`${api}/cartes`, { data: { titre, largeur: 30, hauteur: 20 } });
    assert.equal(r.status(), 201);
    const id = ((await r.json()) as Any).id;
    if (visible) assert.equal((await antor.request.patch(`${api}/cartes/${id}`, { data: { version: 1, visible: true } })).status(), 200);
    return id;
  };
  const table = async (page: Any, cid: number): Promise<Any> => (await page.request.get(`${api}/cartes/${cid}/table`)).json();
  // Waits, in the page, until the table read through the API satisfies `expr` (written over `t`): no fixed delay.
  const jusque = (page: Any, c: number, expr: string) =>
    page.waitForFunction(async ([url, e]: string[]) => (new Function('t', `return ${e}`) as (t: unknown) => boolean)(await (await fetch(url!)).json()), [`${api}/cartes/${c}/table`, expr], { polling: 100 });
  const jeu = async (page: Any, cid: number) => {
    await page.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/jeu`);
    await attendre(page);
  };
  const ajouterDisque = async (nom: string) => {
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('radio', { name: /Disque/ }).click();
    await d.getByLabel(/Nom du pion/).fill(nom);
    await d.getByRole('button', { name: rxExact('Ajouter') }).click();
    await d.waitFor({ state: 'detached' });
  };

  let cid = 0;

  it('« Jouer » ouvre l’écran de jeu et crée la table', async () => {
    cid = await nouvelle('Table du revueur');
    assert.equal((await table(antor, cid)).commencee, false);
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await antor.getByLabel('Carte', { exact: true }).waitFor();
    await antor.getByRole('button', { name: 'Jouer' }).click();
    await antor.waitForURL(new RegExp(`/outils/battlemap/cartes/${cid}/jeu$`));
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).waitFor();
    assert.equal((await table(antor, cid)).commencee, true);
  });

  it('avant « Jouer », la joueuse lit « La partie n’a pas commencé. »', async () => {
    const autre = await nouvelle('Jamais jouée');
    await jeu(lea, autre);
    await lea.getByText('La partie n’a pas commencé.').waitFor();
  });

  it('un disque ajouté est dans la liste, dans la table, et au rechargement ; le masquer le retire à la joueuse', async () => {
    await jeu(antor, cid);
    await ajouterDisque('Gobelin');
    await antor.getByText('Gobelin', { exact: true }).first().waitFor();
    let t = await table(antor, cid);
    assert.equal(t.etat.pions.length, 1);
    assert.equal(t.etat.pions[0].nom, 'Gobelin');
    assert.equal(t.etat.pions[0].visible, true);
    await antor.reload();
    await antor.getByText('Gobelin', { exact: true }).first().waitFor();
    await antor.getByRole('button', { name: 'Masquer Gobelin aux joueurs' }).click();
    await antor.getByText('Masqué aux joueurs').waitFor();
    t = await table(antor, cid);
    assert.equal(t.etat.pions[0].visible, false);
    const vue = await table(lea, cid);
    assert.equal(JSON.stringify(vue).includes('Gobelin'), false);
    await antor.reload();
    await antor.getByText('Masqué aux joueurs').waitFor();
  });

  it('joueuse : aucun outil MJ, « Suivre le MJ » actif par défaut et gardé au rechargement', async () => {
    await jeu(lea, cid);
    const suivre = lea.getByRole('switch', { name: 'Suivre le MJ' });
    await suivre.waitFor();
    assert.equal(await suivre.isChecked(), true);
    assert.equal(await lea.getByRole('button', { name: rxExact('Ajouter un pion') }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /Réinitialiser/ }).count(), 0);
    assert.equal(await lea.getByText('Gobelin').count(), 0);
    await suivre.click();
    assert.equal(await suivre.isChecked(), false);
    await lea.reload();
    await lea.getByRole('switch', { name: 'Suivre le MJ' }).waitFor();
    assert.equal(await lea.getByRole('switch', { name: 'Suivre le MJ' }).isChecked(), false);
  });

  it('« Effacer la vue » rend vue: null', async () => {
    const r = await antor.request.post(`${api}/cartes/${cid}/table/commandes`, {
      data: { version: (await table(antor, cid)).version, commandes: [{ type: 'partager_vue', vue: { x: 2, y: 2, l: 5, h: 4 } }] },
    });
    assert.ok(r.status() < 300, await r.text());
    assert.deepEqual((await table(antor, cid)).etat.vue, { x: 2, y: 2, l: 5, h: 4 });
    await jeu(antor, cid);
    await antor.getByRole('button', { name: 'Effacer la vue' }).click();
    await jusque(antor, cid, 't.etat.vue === null');
    assert.equal((await table(antor, cid)).etat.vue, null);
  });

  it('« Réinitialiser la table… » ne vide qu’après confirmation', async () => {
    await jeu(antor, cid);
    await antor.getByRole('button', { name: /Réinitialiser la table/ }).click();
    const d = antor.getByRole('alertdialog');
    await d.getByText('Les pions, le brouillard et la vue partagée seront effacés.').waitFor();
    assert.equal((await table(antor, cid)).etat.pions.length, 1);
    await d.getByRole('button', { name: /Annuler/ }).click();
    assert.equal((await table(antor, cid)).etat.pions.length, 1);
    await antor.getByRole('button', { name: /Réinitialiser la table/ }).click();
    await antor.getByRole('alertdialog').getByRole('button', { name: /Réinitialiser/ }).click();
    await jusque(antor, cid, 't.etat.pions.length === 0');
    assert.equal((await table(antor, cid)).etat.pions.length, 0);
  });

  it('200 pions : « Table pleine », ajout désactivé, le 201e refusé par le serveur', async () => {
    const pleine = await nouvelle('Pleine');
    assert.ok((await antor.request.post(`${api}/cartes/${pleine}/table`)).status() < 300);
    for (let lot = 0; lot < 4; lot++) {
      const v = (await table(antor, pleine)).version;
      const commandes = Array.from({ length: 50 }, (_, i) => ({ type: 'ajouter_pion', id: `q${lot}x${i}`, nom: `P${lot * 50 + i}`, x: i % 30, y: lot * 4 + Math.floor(i / 30) }));
      const r = await antor.request.post(`${api}/cartes/${pleine}/table/commandes`, { data: { version: v, commandes } });
      assert.ok(r.status() < 300, await r.text());
    }
    assert.equal((await table(antor, pleine)).etat.pions.length, 200);
    const r = await antor.request.post(`${api}/cartes/${pleine}/table/commandes`, {
      data: { version: (await table(antor, pleine)).version, commandes: [{ type: 'ajouter_pion', id: 'trop', nom: 'Trop', x: 29, y: 19 }] },
    });
    assert.ok(r.status() >= 400, `201e : ${r.status()}`);
    assert.equal((await table(antor, pleine)).etat.pions.length, 200);
    await jeu(antor, pleine);
    await antor.getByText('Cette table est pleine (200 pions).').waitFor();
    assert.equal(await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).isDisabled(), true);
  });

  it('P-28 étape 3 : un pion glissé sur la carte change de case et reste là au rechargement', async () => {
    const c = await nouvelle('Glisser');
    assert.ok((await antor.request.post(`${api}/cartes/${c}/table`)).status() < 300);
    await jeu(antor, c);
    await ajouterDisque('Mobile');
    await antor.getByText('Mobile', { exact: true }).first().waitFor();
    const avant = (await table(antor, c)).etat.pions[0];
    const b = await antor.getByLabel('Carte', { exact: true }).boundingBox();
    // the map (30 × 20) is fitted and centred in the canvas: cell size = the smaller ratio
    const cote = Math.min(b.width / 30, b.height / 20);
    const ox = b.x + (b.width - cote * 30) / 2;
    const oy = b.y + (b.height - cote * 20) / 2;
    const de = { x: ox + (avant.x + 0.5) * cote, y: oy + (avant.y + 0.5) * cote };
    await antor.mouse.move(de.x, de.y);
    await antor.mouse.down();
    await antor.mouse.move(de.x + cote * 1.5, de.y + cote * 1.5, { steps: 6 });
    await antor.mouse.move(de.x + cote * 3, de.y + cote * 2, { steps: 6 });
    await antor.mouse.up();
    await jusque(antor, c, `t.etat.pions[0].x !== ${avant.x}`);
    const apres = (await table(antor, c)).etat.pions[0];
    assert.deepEqual([apres.x - avant.x, apres.y - avant.y], [3, 2]);
    await antor.reload();
    await antor.getByText('Mobile', { exact: true }).first().waitFor();
    assert.deepEqual([(await table(antor, c)).etat.pions[0].x, (await table(antor, c)).etat.pions[0].y], [apres.x, apres.y]);
  });

  it('« Lier une fiche… » lie le pion à la fiche choisie, « Ouvrir la fiche » l’ouvre ; « Délier » la retire', async () => {
    const c = await nouvelle('Lien');
    assert.ok((await antor.request.post(`${api}/cartes/${c}/table`)).status() < 300);
    await jeu(antor, c);
    await ajouterDisque('Pion lié');
    await antor.getByText('Pion lié', { exact: true }).first().waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Ouvrir la fiche' }).count(), 0);
    await antor.getByRole('button', { name: 'Actions sur Pion lié' }).click();
    await antor.getByRole('menuitem', { name: /Lier une fiche/ }).click();
    const d = antor.getByRole('dialog');
    const premiere = d.locator('.editeur-choix-fiche-ligne').first();
    await premiere.waitFor();
    const titre = ((await premiere.textContent()) ?? '').split(' · ')[0]!.trim();
    await premiere.click();
    await jusque(antor, c, 't.etat.pions[0].fiche_id !== null');
    await antor.getByRole('button', { name: 'Actions sur Pion lié' }).click();
    await antor.getByRole('menuitem', { name: /Ouvrir la fiche/ }).click();
    await antor.getByText(titre, { exact: false }).first().waitFor();
    await antor.keyboard.press('Escape');
    await antor.getByRole('button', { name: 'Actions sur Pion lié' }).click();
    await antor.getByRole('menuitem', { name: /Délier/ }).click();
    await jusque(antor, c, 't.etat.pions[0].fiche_id === null');
  });

  it('carte cachée aux joueurs : « Page introuvable. » pour la joueuse', async () => {
    const c = await nouvelle('Cachée', false);
    assert.ok((await antor.request.post(`${api}/cartes/${c}/table`)).status() < 300);
    await jeu(lea, c);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal((await lea.request.get(`${api}/cartes/${c}/table`)).status(), 404);
  });
});
