// ecrans: outil-cible
// Review of kanevas-battlemap-editeur-dessin (E-28), written from the exit criterion.
//
// TEST PLAN
//   nominal     : a 30 × 20 map: pick a floor, paint; pick a wall, trace two rooms (shift = outline); undo the second room;
//                 wait for « Enregistré », reload → what the server holds is what the screen shows, the undone walls absent
//   deux onglets: a second tab that wrote makes the first say « Cette carte a changé » + « Recharger »
//   pleine      : the server answering 409 carte_pleine to a batch → « Carte pleine », the gesture is gone after a reload
//   taille      : 201 → « 200 cases au plus. » with no request; 400 limite_depassee → « Des éléments sont hors des nouvelles
//                 limites. »; the map is unchanged on the server both times
//   joueur      : Léa, and the GM in Player mode → « Page introuvable. »
//   mobile      : at 390 px the drawing tools are not on the screen
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (nom: string) => ({ name: nom, mimeType: 'image/png', buffer: pngPlat([40, 140, 60], 16) });

describe('E-28 Éditeur de carte au navigateur', { skip: skipBrowser }, () => {
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
    for (const [categorie, nom] of [['sol', 'herbe.png'], ['mur', 'pierre.png'], ['objet', 'coffre.png']]) {
      const r = await antor.request.post(`${api}/assets`, { multipart: { categorie, fichier: png(nom) } });
      assert.equal(r.status(), 201, `${nom}: ${await r.text()}`);
    }
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const nouvelle = async (titre: string): Promise<number> => {
    const r = await antor.request.post(`${api}/cartes`, { data: { titre, largeur: 30, hauteur: 20 } });
    assert.equal(r.status(), 201);
    return ((await r.json()) as Any).id;
  };
  const lire = async (cid: number): Promise<Any> => (await antor.request.get(`${api}/cartes/${cid}`)).json();
  const ouvrir = async (page: Any, cid: number) => {
    await page.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await page.getByLabel('Carte', { exact: true }).waitFor();
    await attendre(page);
  };
  const glisser = async (page: Any, de: [number, number], a: [number, number], maj = false) => {
    const b = await page.getByLabel('Carte', { exact: true }).boundingBox();
    if (maj) await page.keyboard.down('Shift');
    await page.mouse.move(b.x + de[0], b.y + de[1]);
    await page.mouse.down();
    await page.mouse.move(b.x + (de[0] + a[0]) / 2, b.y + (de[1] + a[1]) / 2, { steps: 4 });
    await page.mouse.move(b.x + a[0], b.y + a[1], { steps: 4 });
    await page.mouse.up();
    if (maj) await page.keyboard.up('Shift');
  };
  const enregistre = (page: Any) => page.getByText('Enregistré', { exact: true }).waitFor();

  it('nominal : sol, deux salles, un mur défait, fermer et rouvrir', async () => {
    const cid = await nouvelle('Donjon');
    await ouvrir(antor, cid);
    await antor.getByRole('radio', { name: 'Sol', exact: true }).click();
    await antor.getByText('herbe', { exact: false }).first().click();
    await glisser(antor, [200, 150], [330, 230]);
    await antor.getByRole('radio', { name: 'Mur', exact: true }).click();
    await antor.getByText('pierre', { exact: false }).first().click();
    await glisser(antor, [200, 150], [330, 230], true);
    await enregistre(antor);
    const salle1 = (await lire(cid)).document.murs.length;
    await glisser(antor, [400, 150], [520, 230], true);
    await antor.getByText('Enregistré', { exact: true }).waitFor({ state: 'hidden' }).catch(() => undefined);
    await enregistre(antor);
    const deux = (await lire(cid)).document.murs.length;
    assert.ok(deux > salle1, 'la seconde salle est tracée');
    await antor.keyboard.press('Control+z');
    await antor.getByText('Enregistré', { exact: true }).waitFor({ state: 'hidden' }).catch(() => undefined);
    await enregistre(antor);
    const apres = await lire(cid);
    assert.equal(apres.document.murs.length, salle1, 'le mur défait est absent');
    assert.ok(apres.document.sols.length > 0, 'le sol est enregistré');
    assert.ok(apres.document.murs.length > 0, 'les murs de la première salle sont là');
    await antor.reload();
    await antor.getByLabel('Carte', { exact: true }).waitFor();
    const rouverte = await lire(cid);
    assert.deepEqual(rouverte.document, apres.document, 'la carte rouverte est celle du serveur');
  });

  it('deux onglets : le second qui écrit donne « Cette carte a changé » au premier', async () => {
    const cid = await nouvelle('Deux onglets');
    await ouvrir(antor, cid);
    const autre = await antor.context().newPage();
    await ouvrir(autre, cid);
    await autre.getByRole('radio', { name: 'Sol', exact: true }).click();
    await autre.getByText('herbe', { exact: false }).first().click();
    await glisser(autre, [200, 150], [260, 200]);
    await enregistre(autre);
    await antor.getByRole('radio', { name: 'Sol', exact: true }).click();
    await antor.getByText('herbe', { exact: false }).first().click();
    await glisser(antor, [300, 250], [360, 300]);
    await antor.getByText('Cette carte a changé.').waitFor();
    await antor.getByRole('button', { name: 'Recharger' }).waitFor();
    await autre.close();
  });

  it('carte pleine : le serveur répond 409 carte_pleine, « Carte pleine » et le geste est annulé', async () => {
    const cid = await nouvelle('Pleine');
    await ouvrir(antor, cid);
    await antor.route(`**${api}/cartes/${cid}/commandes`, (route: Any) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'carte_pleine', erreur: 'pleine' }) }));
    await antor.getByRole('radio', { name: 'Sol', exact: true }).click();
    await antor.getByText('herbe', { exact: false }).first().click();
    await glisser(antor, [200, 150], [330, 230]);
    await antor.getByText(/Carte pleine/).waitFor();
    await antor.unroute(`**${api}/cartes/${cid}/commandes`);
    assert.equal((await lire(cid)).document.sols.length, 0);
  });

  it('taille : « 200 cases au plus. » sans requête, puis le refus du serveur pour les éléments hors limites', async () => {
    const cid = await nouvelle('Taille');
    const pose = await antor.request.get(`${api}/assets`);
    const objet = ((await pose.json()) as Any).assets.find((a: Any) => a.categorie === 'objet');
    const avant = await lire(cid);
    const calqueObjet = avant.document.calques.find((c: Any) => c.type === 'objet').id;
    const r = await antor.request.post(`${api}/cartes/${cid}/commandes`, {
      data: { version: avant.version, commandes: [{ type: 'poser_element', id: 'e1', calque: calqueObjet, asset_id: String(objet.id), x: 28.5, y: 18.5 }] },
    });
    assert.ok(r.status() < 300, await r.text());
    const posee = await lire(cid);
    await ouvrir(antor, cid);
    await antor.getByRole('button', { name: /30 × 20|30×20/ }).click();
    const d = antor.getByRole('dialog', { name: 'Taille de la carte' });
    let requetes = 0;
    antor.on('request', (q: Any) => { if (q.method() === 'PATCH') requetes++; });
    const champs = d.getByRole('textbox');
    await champs.first().fill('201');
    await d.getByRole('button', { name: 'Appliquer' }).click();
    await d.getByText('200 cases au plus.').waitFor();
    assert.equal(requetes, 0);
    await champs.first().fill('10');
    await champs.nth(1).fill('10');
    await d.getByRole('button', { name: 'Appliquer' }).click();
    await d.getByText('Des éléments sont hors des nouvelles limites.').waitFor();
    const fin = await lire(cid);
    assert.deepEqual([fin.largeur, fin.hauteur, fin.version], [30, 20, posee.version]);
  });

  it('joueur : Léa et le MJ en mode Joueur lisent « Page introuvable. »', async () => {
    const cid = await nouvelle('Interdite');
    await lea.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await lea.getByText('Page introuvable.').waitFor();
    await ouvrir(antor, cid);
    await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
    await antor.getByText('Page introuvable.').waitFor();
    await antor.getByRole('radio', { name: 'Mode MJ' }).check();
  });

  it('mobile : à 390 px les outils de dessin sont masqués', async () => {
    const cid = await nouvelle('Mobile');
    await ouvrir(antor, cid);
    for (const nom of ['Sol', 'Mur', 'Porte', 'Gomme']) {
      assert.equal(await antor.getByRole('radio', { name: nom, exact: true }).count(), 1, `${nom} présent à 1440 px`);
    }
    await antor.setViewportSize({ width: 390, height: 800 });
    await ouvrir(antor, cid);
    for (const nom of ['Sol', 'Mur', 'Porte', 'Gomme']) {
      assert.equal(await antor.getByRole('radio', { name: nom, exact: true }).count(), 0, `${nom} masqué`);
    }
    await antor.setViewportSize({ width: 1440, height: 900 });
  });
});
