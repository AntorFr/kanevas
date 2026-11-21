// ecrans: cartes
// Ensemble screen tests of kanevas-battlemap-distance (E-29 player, E-20 « Jeu à distance »), written from the need alone
// (fiche « Livre » + exit criterion, P-29, B-108). The effects (rights, codes, versions) are proved through their door in
// src/outils/battlemap/distance-ensemble-besoin.test.ts and distance-lecture-ensemble-besoin.test.ts: here only what the three
// screens show, with the other screens of the same table open at once.
//
// TEST PLAN (Antor GM, Léa owns « Mira », Teo (second player, standing for Roxane: the stub has no login for her) owns « Vox », « Garde » is nobody's; the left half of a 30 × 20 map revealed)
//   vue des autres : Léa drags Mira: Teo's screen and Antor's screen show Mira on its new cell (the handle moves on Teo's screen)
//   couloir        : Antor reveals a corridor in the fogged half: Léa's and Teo's canvas change without a reload
//   sans pion      : Vox hidden by the GM: Teo has no « votre pion », no handle to grab, no line (remote play on); with it off the line shows (the need: « like everyone else »)
//   à distance coupé: Léa sees the GM's moves (the canvas changes) while no token of hers is grabbable and the line is shown
//   carte cachée   : Antor hides the map: Léa's open screen turns into « Page introuvable. » at the next event; so does a reload
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

describe('E-29 à distance : trois écrans sur la même table', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let second: Any;
  let uid = 0;
  let api = '';
  let cid = 0;

  const table = async (page: Any): Promise<Any> => (await page.request.get(`${api}/cartes/${cid}/table`)).json();
  const commande = async (commandes: Any[]) => {
    const r = await antor.request.post(`${api}/cartes/${cid}/table/commandes`, { data: { version: (await table(antor)).version, commandes } });
    assert.equal(r.status(), 200, await r.text());
  };
  const reglage = async (valeur: boolean) => {
    const v = (await (await antor.request.get(`/api/univers/${uid}/outils`)).json()) as Any;
    const version = (v.outils as Any[]).find((o) => o.cle === 'battlemap/cartes').univers.versionReglages;
    const r = await antor.request.put(`${api}/cartes/reglages`, { data: { version, valeurs: { jeu_a_distance: valeur } } });
    assert.ok(r.status() < 300, await r.text());
  };
  const ouvrir = async (page: Any) => {
    await page.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/jeu`);
    await attendre(page);
    await page.locator('canvas').first().waitFor();
  };
  const image = async (page: Any): Promise<string> => ((await page.locator('canvas').first().screenshot()) as Buffer).toString('base64');
  const centreBouton = async (page: Any, nom: string) => {
    const b = await page.getByRole('button', { name: nom, exact: true }).boundingBox();
    return b.x + b.width / 2;
  };

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    second = (await connecte(browser, srv.base, 'Teo')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
    const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    for (const outil of ['assets', 'cartes']) {
      for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: true }]] as const) {
        assert.ok((await antor.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d })).status() < 300);
      }
    }
    api = `/api/univers/${uid}/outils/battlemap`;
    const c = await antor.request.post(`${api}/cartes`, { data: { titre: 'Trois écrans', largeur: 30, hauteur: 20 } });
    assert.equal(c.status(), 201);
    cid = ((await c.json()) as Any).id;
    assert.equal((await antor.request.patch(`${api}/cartes/${cid}`, { data: { version: 1, visible: true } })).status(), 200);
    assert.ok((await antor.request.post(`${api}/cartes/${cid}/table`)).status() < 300);
    await commande([
      { type: 'ajouter_pion', id: 'mira', nom: 'Mira', x: 3, y: 3 },
      { type: 'ajouter_pion', id: 'vox', nom: 'Vox', x: 5, y: 8 },
      { type: 'ajouter_pion', id: 'garde', nom: 'Garde', x: 10, y: 10 },
      { type: 'reveler_rect', x: 0, y: 0, l: 15, h: 20 },
    ]);
    assert.ok((await antor.request.post(`/api/univers/${uid}/membres`, { data: { username: 'teo', role: 'joueur' } })).status() < 300);
    const m = ((await (await antor.request.get(`/api/univers/${uid}/membres`)).json()) as Any);
    const liste: Any[] = Array.isArray(m) ? m : m.membres;
    for (const [pion, re] of [['mira', /^l[ée]a$/i], ['vox', /^teo$/i]] as const) {
      const id = liste.find((x) => re.test(x.username ?? x.nom))?.compteId;
      assert.ok(id, `compte de ${pion}`);
      assert.equal((await antor.request.put(`${api}/cartes/${cid}/table/pions/${pion}/proprietaire`, { data: { compte_id: id } })).status(), 200);
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('E-29 : Léa glisse Mira de 2 cases à droite, l’écran de Teo montre Mira plus à droite sans rechargement', async () => {
    await ouvrir(lea);
    await ouvrir(second);
    await ouvrir(antor);
    const avantRox = await centreBouton(second, 'Mira');
    const garde = await centreBouton(lea, 'Garde');
    const mira = await centreBouton(lea, 'Mira, votre pion');
    const cote = (garde - mira) / 7; // Mira en 3, Garde en 10 : sept cases
    const b = await lea.getByRole('button', { name: 'Mira, votre pion' }).boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    const rep = lea.waitForResponse((r: Any) => r.request().method() === 'POST' && /table\/commandes/.test(r.url()));
    await lea.mouse.move(x, y);
    await lea.mouse.down();
    await lea.mouse.move(x + cote, y, { steps: 6 });
    await lea.mouse.move(x + 2 * cote, y, { steps: 6 });
    await lea.mouse.up();
    assert.equal((await rep).status(), 200);
    await second.waitForFunction(async ([av, c]: [number, number]) => {
      const el = Array.from(document.querySelectorAll('button')).find((e) => e.getAttribute('aria-label') === 'Mira');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return Math.abs(r.x + r.width / 2 - av - 2 * c) < c / 2;
    }, [avantRox, cote] as [number, number], { timeout: 20000, polling: 200 });
    await second.screenshot({ path: '/tmp/cap/second-voit-mira.png' });
    const t = (await table(antor)).etat.pions.find((p: Any) => p.id === 'mira');
    assert.deepEqual([t.x, t.y], [5, 3]);
  });

  it('E-29 : Antor révèle un couloir dans la moitié cachée, les canevas de Léa et de Teo changent sans rechargement', async () => {
    await ouvrir(lea);
    await ouvrir(second);
    const [l0, r0] = [await image(lea), await image(second)];
    await commande([{ type: 'reveler_rect', x: 15, y: 5, l: 10, h: 2 }]);
    await lea.waitForFunction(async (av: string) => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      return c.toDataURL().length > 0 && av.length > 0;
    }, l0).catch(() => undefined);
    const deadline = Date.now() + 20000;
    let l1 = l0;
    let r1 = r0;
    while (Date.now() < deadline && (l1 === l0 || r1 === r0)) {
      l1 = await image(lea);
      r1 = await image(second);
    }
    await lea.screenshot({ path: '/tmp/cap/lea-couloir.png' });
    assert.notEqual(l1, l0, 'le canevas de Léa a découvert le couloir');
    assert.notEqual(r1, r0, 'le canevas de Teo a découvert le couloir');
  });

  it('E-29 : Teo dont le seul pion est caché n’a ni « votre pion », ni prise, ni ligne, le jeu à distance étant actif', async () => {
    await commande([{ type: 'regler_pion', id: 'vox', visible: false }]);
    try {
      await ouvrir(second);
      assert.equal(await second.getByRole('button', { name: /votre pion/ }).count(), 0);
      assert.equal(await second.getByText('Seul le MJ déplace les pions.').count(), 0);
      assert.equal(await second.getByText('Ce pion n’est pas à vous.').count(), 0);
    } finally {
      await commande([{ type: 'regler_pion', id: 'vox', visible: true }]);
    }
  });

  it('E-29 : Teo sans pion visible, jeu à distance coupé, lit la ligne « Seul le MJ déplace les pions. » comme tout le monde', async () => {
    await commande([{ type: 'regler_pion', id: 'vox', visible: false }]);
    await reglage(false);
    try {
      await ouvrir(second);
      await second.screenshot({ path: '/tmp/cap/second-ligne.png' });
      await second.getByText('Seul le MJ déplace les pions.').waitFor({ timeout: 10000 });
      assert.equal(await second.getByRole('button', { name: /votre pion/ }).count(), 0);
    } finally {
      await reglage(true);
      await commande([{ type: 'regler_pion', id: 'vox', visible: true }]);
    }
  });

  it('E-29 : réglage coupé, Léa voit encore bouger les pions du MJ mais n’a plus de pion à saisir, avec la ligne', async () => {
    await ouvrir(lea);
    assert.equal(await lea.getByRole('button', { name: 'Mira, votre pion' }).count(), 1, 'avant : sa prise');
    await reglage(false);
    try {
      const avant = await image(lea);
      await commande([{ type: 'deplacer_pion', id: 'garde', x: 12, y: 12 }]);
      await commande([{ type: 'deplacer_pion', id: 'vox', x: 6, y: 9 }]);
      const deadline = Date.now() + 20000;
      let apres = avant;
      while (Date.now() < deadline && apres === avant) {
        apres = await image(lea);
      }
      assert.notEqual(apres, avant, 'les pions bougent chez Léa');
      await lea.getByText('Seul le MJ déplace les pions.').waitFor({ timeout: 20000 });
      assert.equal(await lea.getByRole('button', { name: /votre pion/ }).count(), 0, 'plus de prise');
      await lea.screenshot({ path: '/tmp/cap/lea-lecture-seule.png' });
    } finally {
      await reglage(true);
    }
  });

  it('E-29 : le MJ cache la carte, l’écran ouvert de Léa devient « Page introuvable. » au prochain événement, et au rechargement', async () => {
    await ouvrir(lea);
    const carte = ((await (await antor.request.get(`${api}/cartes/${cid}`)).json()) as Any);
    const p = await antor.request.patch(`${api}/cartes/${cid}`, { data: { version: carte.version ?? carte.carte?.version, visible: false } });
    assert.equal(p.status(), 200, await p.text());
    // a stream event: the GM's own read still works, he moves a token
    await commande([{ type: 'deplacer_pion', id: 'garde', x: 11, y: 12 }]);
    await lea.getByText('Page introuvable.').waitFor({ timeout: 30000 });
    await lea.screenshot({ path: '/tmp/cap/lea-introuvable.png' });
    await lea.reload();
    await attendre(lea);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByRole('button', { name: /votre pion/ }).count(), 0);
  });
});
