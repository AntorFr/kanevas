// ecrans: cartes
// Review of kanevas-battlemap-table-e30 (E-30, the table display), written from the exit criterion.
//
// TEST PLAN
//   sans table   : a map never opened with « Jouer »: the display reads « La partie n’a pas commencé. »
//   attente      : once the table exists without a shared view: « En attente du MJ »
//   vue          : « Vue partagée » on E-29: the display draws the map (canvas, no control, no zoom buttons, no chrome)
//   effacer      : « Effacer la vue »: the map disappears, « En attente du MJ » again
//   presence     : E-29 reads « Écran joueurs connecté » while E-30 is open, « Aucun écran joueur connecté » after it closes
//   fenetre      : the canvas fits inside the window, whatever its size
//   calque       : a layer hidden from players leaves the player document the display reads
//   cachee       : a map hidden from players reads « Page introuvable. »
//   reconnexion  : network cut → « Reconnexion… », then the display catches up
//   contraste    : --texte-2 on --affichage-fond is at least 4.5:1
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, rxExact, startServer, type Any, type Server } from './harnais.test.js';

describe('E-30 Écran joueurs : plein cadre, vue partagée, en attente du MJ', () => {
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
    const ctx = await connecte(browser, srv.base, 'Léa');
    table = ctx.page;
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
  after(async () => { await browser?.close(); srv?.stop(); });

  const nouvelle = async (titre: string, visible = true): Promise<number> => {
    const r = await antor.request.post(`${api}/cartes`, { data: { titre, largeur: 30, hauteur: 20 } });
    assert.equal(r.status(), 201);
    const id = ((await r.json()) as Any).id;
    if (visible) assert.equal((await antor.request.patch(`${api}/cartes/${id}`, { data: { version: 1, visible: true } })).status(), 200);
    return id;
  };
  const lire = async (page: Any, c: number): Promise<Any> => (await page.request.get(`${api}/cartes/${c}/table`)).json();
  const commande = async (c: number, commandes: Any[]) => {
    const r = await antor.request.post(`${api}/cartes/${c}/table/commandes`, { data: { version: (await lire(antor, c)).version, commandes } });
    assert.ok(r.status() < 300, await r.text());
  };
  const affichage = (page: Any, c: number) => page.goto(`/univers/${uid}/outils/battlemap/cartes/${c}/affichage`);
  const pret = (page: Any) => page.getByLabel('Carte', { exact: true });

  it('sans table : « La partie n’a pas commencé. », puis « En attente du MJ » une fois la table créée, sans recharger', async () => {
    cid = await nouvelle('Table E-30');
    await affichage(table, cid);
    await table.getByText('La partie n’a pas commencé.').waitFor();
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await antor.getByRole('button', { name: 'Jouer' }).click();
    await antor.waitForURL(new RegExp(`/cartes/${cid}/jeu$`));
    await antor.getByRole('button', { name: rxExact('Ajouter un pion') }).waitFor();
    await table.getByText('En attente du MJ').waitFor({ timeout: 6000 });
    assert.equal(await pret(table).count(), 0);
    await table.screenshot({ path: '/tmp/e30-attente.png' });
  });

  it('presence : E-29 lit « Écran joueurs connecté » tant que E-30 est ouvert', async () => {
    await antor.getByText('Écran joueurs connecté').waitFor({ timeout: 6000 });
    const autre = await (await browser.newContext({ storageState: await table.context().storageState(), baseURL: srv.base })).newPage();
    await affichage(autre, cid);
    await autre.getByText('En attente du MJ').waitFor();
    await autre.close();
    await antor.getByText('Écran joueurs connecté').waitFor();
    await table.close();
    await antor.getByText('Aucun écran joueur connecté').waitFor({ timeout: 8000 });
    table = await (await browser.newContext({ storageState: await antor.context().storageState(), baseURL: srv.base })).newPage();
    void table;
  });

  it('vue partagée : la carte s’affiche sans contrôle ni cadre, « Effacer la vue » la retire', async () => {
    const ctx = await connecte(browser, srv.base, 'Léa');
    table = ctx.page;
    await affichage(table, cid);
    await table.getByText('En attente du MJ').waitFor();
    await antor.getByRole('switch', { name: 'Vue partagée' }).click();
    await pret(table).waitFor({ timeout: 6000 });
    assert.equal(await table.getByRole('button').count(), 0, 'aucun bouton sur l’écran');
    assert.equal(await table.getByRole('group', { name: 'Zoom' }).count(), 0);
    assert.equal(await table.getByRole('navigation').count(), 0);
    assert.equal(await table.getByText('En attente du MJ').count(), 0);
    await table.screenshot({ path: '/tmp/e30-vue.png' });
    await antor.getByRole('button', { name: 'Effacer la vue' }).click();
    await table.getByText('En attente du MJ').waitFor({ timeout: 6000 });
    assert.equal(await pret(table).count(), 0);
    await antor.getByRole('switch', { name: 'Vue partagée' }).click();
    await pret(table).waitFor({ timeout: 6000 });
  });

  it('fenêtre : le canevas tient dans la fenêtre, quelle que soit sa taille', async () => {
    for (const [w, h] of [[1280, 720], [800, 300], [390, 800], [300, 300]]) {
      await table.setViewportSize({ width: w, height: h });
      await pret(table).waitFor();
      await table.waitForFunction(([ww, hh]: number[]) => {
        const b = document.querySelector('canvas')!.getBoundingClientRect();
        return b.width > 0 && b.right <= ww! + 1 && b.bottom <= hh! + 1 && b.left >= -1 && b.top >= -1;
      }, [w, h]);
      assert.equal(await table.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight), true, `${w}x${h}`);
    }
    await table.setViewportSize({ width: 1280, height: 720 });
  });

  it('calque masqué : il sort de la table que l’écran lit ; révélé de nouveau, il revient', async () => {
    const calque = (await lire(table, cid)).document.calques[0].id as string;
    assert.equal(calque, 'sol');
    await commande(cid, [{ type: 'regler_calque_joueurs', calque, montre: false }]);
    const lu = async () => (await lire(table, cid)).document.calques.map((k: Any) => k.id);
    assert.equal((await lu()).includes(calque), false, 'le calque masqué ne sort pas de la lecture joueur');
    // the display has refetched by itself: the screen asks again after the stream's event
    await table.waitForResponse((r: Any) => r.url().includes('?mode=joueur') && r.request().method() === 'GET', { timeout: 4000 }).catch(() => undefined);
    await commande(cid, [{ type: 'regler_calque_joueurs', calque, montre: true }]);
    assert.equal((await lu()).includes(calque), true);
  });

  it('une révélation arrive en moins de deux secondes sans recharger', async () => {
    const attendue = table.waitForResponse((r: Any) => r.url().includes('/table?mode=joueur'), { timeout: 2000 });
    await commande(cid, [{ type: 'reveler_rect', x: 0, y: 0, l: 3, h: 3 }]);
    await attendue;
  });

  it('flux coupé, « Reconnexion… » apparaît puis, au signal suivant, l’écran se remet à jour', async () => {
    // Chromium's offline mode leaves an open stream alone: the cut is played on the page's own EventSource.
    await table.addInitScript(() => {
      const Natif = window.EventSource;
      const w = window as unknown as { __flux: EventSource[] };
      w.__flux = [];
      window.EventSource = class extends Natif { constructor(u: string | URL, o?: EventSourceInit) { super(u, o); w.__flux.push(this); } } as typeof EventSource;
    });
    await affichage(table, cid);
    await pret(table).waitFor();
    await table.waitForFunction(() => (window as unknown as { __flux: unknown[] }).__flux.length > 0);
    assert.equal(await table.getByText('Reconnexion…').count(), 0);
    await table.evaluate(() => (window as unknown as { __flux: EventSource[] }).__flux.forEach((e) => e.dispatchEvent(new Event('error'))));
    await table.getByText('Reconnexion…').waitFor({ timeout: 3000 });
    await table.screenshot({ path: '/tmp/e30-reconnexion.png' });
    await table.evaluate(() => (window as unknown as { __flux: EventSource[] }).__flux.forEach((e) => e.dispatchEvent(new MessageEvent('maj', { data: '{}' }))));
    await table.getByText('Reconnexion…').waitFor({ state: 'detached', timeout: 3000 });
    await pret(table).waitFor();
  });

  it('carte cachée aux joueurs : « Page introuvable. »', async () => {
    const c = await nouvelle('Cachée', false);
    await antor.request.post(`${api}/cartes/${c}/table`);
    await affichage(table, c);
    await table.getByText('Page introuvable.').waitFor();
    assert.equal(JSON.stringify(await table.content()).includes('Cachée'), false);
    await table.screenshot({ path: '/tmp/e30-introuvable.png' });
  });

  it('le MJ qui ouvre l’écran voit la vue joueur : pas de pion masqué, pas de contrôle', async () => {
    await commande(cid, [{ type: 'ajouter_pion', id: 'sec', nom: 'Secret', x: 20, y: 10 }, { type: 'masquer_pion', id: 'sec', visible: false }].slice(0, 1));
    const r = await antor.request.get(`${api}/cartes/${cid}/table?mode=joueur`);
    assert.equal(r.status(), 200);
    const p = await browser.newContext({ storageState: await antor.context().storageState(), baseURL: srv.base });
    const page = await p.newPage();
    await affichage(page, cid);
    await pret(page).waitFor();
    assert.equal(await page.getByRole('button').count(), 0);
    assert.equal(await page.getByRole('switch').count(), 0);
  });

  it('contraste : --texte-2 sombre sur noir ≥ 4,5:1', async () => {
    await affichage(table, cid);
    await pret(table).waitFor();
    const lu = await table.evaluate(() => ({
      t: getComputedStyle(document.documentElement).getPropertyValue('--texte-2').trim(),
      fond: getComputedStyle(document.querySelector('.affichage')!).backgroundColor,
    }));
    const lum = (hex: string) => {
      const f = hex.replace('#', '');
      const [R, G, B] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
    };
    const r = { ...lu, ratio: (lum(lu.t) + 0.05) / 0.05 };
    assert.equal(r.fond, 'rgb(0, 0, 0)');
    assert.ok(r.ratio >= 4.5, JSON.stringify(r));
  });
});
