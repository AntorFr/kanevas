// Review of kanevas-battlemap-assets-e26 (E-26, the art direction screen), written from the exit criterion.
//
// TEST PLAN
//   vide        : fresh universe → « Aucune direction artistique… », « Aucune image de référence. », counter 0 / 5 000,
//                 « Demander à l'assistant » disabled
//   nominal     : write the text, choose a library image (it becomes GM-only: E-19 API says `mj`, the screen says so), save,
//                 reload → text and reference kept
//   legende     : edit a caption, reload → kept
//   perime      : the text changed from a second tab → « Ce texte a changé depuis que vous l'avez ouvert. » + « Recharger »;
//                 « Recharger » shows the other tab's text
//   limite      : 8 references → the 9th (dropped or chosen) is refused with « 8 images au plus. », still 8 on the server
//   joueuse     : Léa forcing ?onglet=direction → « Page introuvable. », and the API answers 404
//   mode joueur : the GM switching to Player mode on the tab → « Page introuvable. »
//   etats       : error → « Impossible de charger la direction artistique. » + « Réessayer »; loading text
//   captures    : both themes, 1440 / 768 / 390 px, under $E26_CAPTURES when set
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (n: number) => ({ name: `ref-${n}.png`, mimeType: 'image/png', buffer: pngPlat([n * 20, 90, 160], 16) });

describe('E-26 Direction artistique au navigateur', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let adresse = '';
  let api = '';

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
    const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    const cible = `/api/systemes/${sid}/outils/battlemap/assets`;
    for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: true }]] as const) {
      const r = await antor.request.put(`${cible}/${c}`, { data: d });
      assert.ok(r.status() < 300, `${c}: ${r.status()}`);
    }
    adresse = `/univers/${uid}/outils/battlemap/assets?onglet=direction`;
    api = `/api/univers/${uid}/outils/battlemap/direction`;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const ouvrir = async (page: Any) => {
    await page.goto(adresse);
    await page.getByRole('button', { name: 'Enregistrer' }).waitFor();
    await attendre(page);
  };
  const direction = async (page: Any = antor) => (await (await page.request.get(api)).json()) as Any;
  const depose = async (n: number) => {
    const r = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { fichier: png(n) } });
    assert.ok(r.ok(), await r.text());
    return (await r.json()) as Any;
  };

  it('vide : états vides et « Demander à l’assistant » désactivé', async () => {
    await ouvrir(antor);
    await antor.getByText('Aucune direction artistique. La génération et l’assistant travailleront sans style.').waitFor();
    await antor.getByText('Aucune image de référence.').waitFor();
    await antor.getByText(/^0 \/ 5\s?000$/).waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Demander à l’assistant' }).isDisabled(), true);
  });

  it('nominal : texte + image choisie dans la médiathèque (devenue MJ seul), enregistré, retrouvé au rechargement', async () => {
    await depose(1);
    await ouvrir(antor);
    await antor.getByRole('textbox', { name: 'Style' }).fill('Palette froide, lumière rasante.');
    await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).click();
    const d = antor.getByRole('dialog');
    await d.getByText('ref-1.png').waitFor();
    await d.getByRole('button', { name: 'Ajouter ref-1.png' }).click();
    await antor.getByText('« ref-1.png » est devenu MJ seul.').waitFor();
    await d.getByRole('button', { name: 'Fermer' }).click();
    await antor.getByText(/fichier MJ seul/).first().waitFor();
    const rep = antor.waitForResponse((r: Any) => r.url().endsWith('/direction') && r.request().method() === 'PUT');
    await antor.getByRole('button', { name: 'Enregistrer' }).click();
    assert.ok((await rep).ok());
    await antor.getByText('Direction artistique enregistrée.').waitFor();
    const apres = await direction();
    assert.equal(apres.texte, 'Palette froide, lumière rasante.');
    assert.equal(apres.images.length, 1);
    const fichiers = (await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json()) as Any;
    const f = (fichiers.fichiers ?? fichiers).find((x: Any) => x.id === apres.images[0].fichierId);
    assert.match(JSON.stringify(f), /"visibilite":"mj"|"visibilite":"MJ"|"mj":true/i, 'le fichier est MJ seul');
    // a player no longer reads that file
    const lecture = await lea.request.get(`/api/univers/${uid}/fichiers/${apres.images[0].fichierId}`);
    assert.ok([403, 404].includes(lecture.status()), `Léa lit le fichier MJ: ${lecture.status()}`);
    await ouvrir(antor);
    assert.equal(await antor.getByRole('textbox', { name: 'Style' }).inputValue(), 'Palette froide, lumière rasante.');
    await antor.getByRole('textbox', { name: 'Légende de ref-1.png' }).waitFor();
  });

  it('légende : modifiée, elle se retrouve après rechargement', async () => {
    await ouvrir(antor);
    const champ = antor.getByRole('textbox', { name: 'Légende de ref-1.png' });
    const rep = antor.waitForResponse((r: Any) => /\/direction\/images\/\d+$/.test(r.url()) && r.request().method() === 'PATCH');
    await champ.fill('Coursive rouillée');
    await champ.press('Enter');
    assert.ok((await rep).ok());
    assert.equal((await direction()).images[0].legende, 'Coursive rouillée');
    await ouvrir(antor);
    assert.equal(await antor.getByRole('textbox', { name: 'Légende de ref-1.png' }).inputValue(), 'Coursive rouillée');
  });

  it('périmé : une modification faite dans un second onglet donne « Ce texte a changé… » + Recharger', async () => {
    await ouvrir(antor);
    const second = await antor.context().newPage();
    await ouvrir(second);
    await second.getByRole('textbox', { name: 'Style' }).fill('Version du second onglet');
    await second.getByRole('button', { name: 'Enregistrer' }).click();
    await second.getByText('Direction artistique enregistrée.').waitFor();
    await second.close();
    await antor.getByRole('textbox', { name: 'Style' }).fill('Version du premier onglet');
    await antor.getByRole('button', { name: 'Enregistrer' }).click();
    await antor.getByText('Ce texte a changé depuis que vous l’avez ouvert.').waitFor();
    assert.equal((await direction()).texte, 'Version du second onglet', 'rien n’est écrasé');
    await antor.getByRole('button', { name: 'Recharger' }).click();
    await antor.getByText('Ce texte a changé depuis que vous l’avez ouvert.').waitFor({ state: 'detached' });
    assert.equal(await antor.getByRole('textbox', { name: 'Style' }).inputValue(), 'Version du second onglet');
  });

  it('limite : la 9e image est refusée (« 8 images au plus. »), déposée comme choisie', async () => {
    for (let n = 2; n <= 8; n++) {
      const r = await antor.request.post(`${api}/images`, { multipart: { fichier: png(n) } });
      assert.equal(r.status(), 201, await r.text());
    }
    assert.equal((await direction()).images.length, 8);
    await depose(9);
    await ouvrir(antor);
    await antor.getByText('8 images au plus.').first().waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).isDisabled(), true);
    // forced through the API: refused, count unchanged
    const r = await antor.request.post(`${api}/images`, { multipart: { fichier: png(10) } });
    assert.ok(r.status() >= 400 && r.status() < 500, String(r.status()));
    assert.equal((await direction()).images.length, 8);
    const f = (await (await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets/fichiers-disponibles`)).json()) as Any;
    const neuf = f.fichiers.find((x: Any) => x.nom === 'ref-9.png');
    const c = await antor.request.post(`${api}/images/depuis-fichier`, { data: { fichierId: neuf.id } });
    assert.ok(c.status() >= 400 && c.status() < 500, String(c.status()));
    assert.equal((await direction()).images.length, 8);
    // and the file stays visible to players (not turned GM-only by the refused attempt)
    const lecture = await lea.request.get(`/api/univers/${uid}/fichiers/${neuf.id}`);
    assert.equal(lecture.status(), 200, 'le fichier refusé reste lisible par les joueurs');
  });

  it('retirer : une référence retirée disparaît et libère une place', async () => {
    await ouvrir(antor);
    await antor.getByRole('button', { name: /^Retirer la référence/ }).first().click();
    await antor.getByText(/^Référence .* retirée\.$/).waitFor();
    assert.equal((await direction()).images.length, 7);
  });

  it('joueuse : adresse forcée → « Page introuvable. » et l’API répond 404', async () => {
    await lea.goto(adresse);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByText('Style').count(), 0);
    assert.equal((await lea.request.get(api)).status(), 404);
    const w = await lea.request.put(api, { data: { texte: 'x', version: 0 } });
    assert.equal(w.status(), 404);
  });

  it('mode joueur du MJ : « Page introuvable. » sur l’onglet', async () => {
    await ouvrir(antor);
    await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
    await antor.getByText('Page introuvable.').waitFor();
    assert.equal((await antor.request.put(`${api}?mode=joueur`, { data: { texte: 'x', version: 0 } })).status(), 403);
    assert.notEqual((await direction()).texte, 'x');
  });

  it('erreur : lecture en échec → message + Réessayer', async () => {
    const page = await antor.context().newPage();
    let casse = true;
    await page.route(`**${api}`, (route: Any) => (casse && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }) : route.continue()));
    await page.goto(adresse);
    await page.getByText('Impossible de charger la direction artistique.').waitFor();
    casse = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).waitFor();
    await page.close();
  });

  it('chargement : le texte s’affiche tant que la lecture n’a pas répondu', async () => {
    const page = await antor.context().newPage();
    let lache: () => void = () => {};
    const porte = new Promise<void>((r) => { lache = r; });
    await page.route(`**${api}`, async (route: Any) => {
      if (route.request().method() === 'GET') await porte;
      return route.continue();
    });
    await page.goto(adresse);
    await page.getByText('Chargement de la direction artistique…').waitFor();
    lache();
    await page.getByRole('button', { name: 'Enregistrer' }).waitFor();
    await page.close();
  });

  const dir = process.env.E26_CAPTURES;
  it('captures : deux thèmes, 1440 / 768 / 390', { skip: dir ? false : 'E26_CAPTURES non posé' }, async () => {
    mkdirSync(dir!, { recursive: true });
    for (const theme of ['clair', 'sombre']) {
      for (const [w, h] of [[1440, 900], [768, 1024], [390, 800]]) {
        await antor.setViewportSize({ width: w, height: h });
        await antor.emulateMedia({ colorScheme: theme === 'sombre' ? 'dark' : 'light' });
        await antor.addInitScript(`try{localStorage.setItem('theme','${theme}')}catch(e){}`);
        await ouvrir(antor);
        await antor.screenshot({ path: `${dir}/e26-${theme}-${w}.png`, fullPage: true });
      }
    }
  });
});
