// ecrans: cartes
// Review of kanevas-battlemap-distance-ecran (E-29 player side, E-20 « Jeu à distance »), written from the exit criterion.
// The effects (right, refusal codes, versions) are proved through their door in src/outils/battlemap/distance-routes-revue.test.ts.
//
// TEST PLAN (Antor GM, Léa player owning « Mira », « Garde » owned by nobody, the whole 30 × 20 map revealed)
//   glisser   : Léa drags her token 3 right, 2 down: one POST answers 200, the table holds the new cell, Antor's screen follows
//   refus     : Léa drags the guard: the 403 pion_non_proprietaire, the guard stays, « Ce pion n’est pas à vous. » shows then leaves
//   clavier   : Tab to « Mira, votre pion », Enter, two arrows, Enter: moved by exactly two cells; Escape instead leaves it where it was
//   pastille  : the stream refused: « Reconnexion… » shows for her; the stream let through again: it goes away alone
//   coupe     : Antor switches « Jeu à distance » off (E-20, a switch): Léa's next drag moves nothing and says nothing;
//               after the refetch the line « Seul le MJ déplace les pions. » shows
//   interrupteur : the E-20 card draws « Jeu à distance » as a switch, on by default, visible at once, saved by the flip (no button), kept after a reload
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

describe('E-29 joueuse : jouer à distance, E-20 : Jeu à distance', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let api = '';
  let cid = 0;

  const table = async (page: Any): Promise<Any> => (await page.request.get(`${api}/cartes/${cid}/table`)).json();
  const pion = async (id: string): Promise<Any> => ((await table(antor)).etat.pions as Any[]).find((p) => p.id === id);
  const commande = async (commandes: Any[]) => {
    const r = await antor.request.post(`${api}/cartes/${cid}/table/commandes`, { data: { version: (await table(antor)).version, commandes } });
    assert.equal(r.status(), 200, await r.text());
  };
  const jeu = async () => {
    await lea.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/jeu`);
    await attendre(lea);
    await lea.locator('canvas').first().waitFor();
    await lea.locator('.pion-table').first().waitFor({ state: 'attached' }).catch(() => undefined);
  };
  // Screen position of a cell centre, read from the two token handles (the guard stays at 20,10 as seeded): the handles are centred
  // on their token, so their distance gives the cell size whatever the margin the canvas keeps around the map.
  const centre = async (x: number, y: number) => {
    const c = async (nom: string) => { const b = await lea.getByRole('button', { name: nom }).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const mira = await pion('mira');
    const m = await c('Mira, votre pion');
    const g = await c('Garde');
    const cote = (g.x - m.x) / (20 - mira.x);
    return { cote, x: m.x + (x - mira.x) * cote, y: m.y + (y - mira.y) * cote };
  };
  const glisser = async (de: [number, number], dx: number, dy: number) => {
    const p = await centre(de[0], de[1]);
    await lea.mouse.move(p.x, p.y);
    await lea.mouse.down();
    await lea.mouse.move(p.x + p.cote * dx / 2, p.y + p.cote * dy / 2, { steps: 6 });
    await lea.mouse.move(p.x + p.cote * dx, p.y + p.cote * dy, { steps: 6 });
    await lea.mouse.up();
  };

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
        assert.ok((await antor.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d })).status() < 300);
      }
    }
    api = `/api/univers/${uid}/outils/battlemap`;
    const c = await antor.request.post(`${api}/cartes`, { data: { titre: 'À distance', largeur: 30, hauteur: 20 } });
    assert.equal(c.status(), 201);
    cid = ((await c.json()) as Any).id;
    assert.equal((await antor.request.patch(`${api}/cartes/${cid}`, { data: { version: 1, visible: true } })).status(), 200);
    assert.ok((await antor.request.post(`${api}/cartes/${cid}/table`)).status() < 300);
    await commande([
      { type: 'ajouter_pion', id: 'mira', nom: 'Mira', x: 3, y: 3 },
      { type: 'ajouter_pion', id: 'garde', nom: 'Garde', x: 20, y: 10 },
      { type: 'reveler_rect', x: 0, y: 0, l: 30, h: 20 },
    ]);
    const m = ((await (await antor.request.get(`/api/univers/${uid}/membres`)).json()) as Any);
    const liste: Any[] = Array.isArray(m) ? m : m.membres;
    const id = liste.find((x) => /^l[ée]a$/i.test(x.username ?? x.nom))?.compteId;
    assert.ok(id, 'compte de Léa');
    assert.equal((await antor.request.put(`${api}/cartes/${cid}/table/pions/mira/proprietaire`, { data: { compte_id: id } })).status(), 200);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('Léa glisse son pion de 3 cases à droite et 2 en bas : 200, la table le tient, Antor le voit', async () => {
    await jeu();
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}/jeu`);
    await attendre(antor);
    const rep = lea.waitForResponse((r: Any) => r.request().method() === 'POST' && /table\/commandes/.test(r.url()));
    await glisser([3, 3], 3, 2);
    assert.equal((await rep).status(), 200);
    const p = await pion('mira');
    assert.deepEqual([p.x, p.y], [6, 5]);
    await antor.waitForFunction(async (u: string) => {
      const t = await (await fetch(u)).json();
      return t.etat.pions.find((q: Any) => q.id === 'mira').x === 6;
    }, `${api}/cartes/${cid}/table`, { polling: 100 });
  });

  it('Léa glisse le pion de la garde : il reste, « Ce pion n’est pas à vous. » s’affiche puis s’efface', async () => {
    await jeu();
    const avant = await table(antor);
    const rep = lea.waitForResponse((r: Any) => r.request().method() === 'POST' && /table\/commandes/.test(r.url()));
    await glisser([20, 10], 2, 2);
    const r = await rep;
    assert.equal(r.status(), 403);
    assert.equal(((await r.json()) as Any).code, 'pion_non_proprietaire');
    await lea.getByText('Ce pion n’est pas à vous.').waitFor();
    const g = await pion('garde');
    assert.deepEqual([g.x, g.y], [20, 10]);
    assert.equal((await table(antor)).version, avant.version, 'rien d’écrit');
    await lea.getByText('Ce pion n’est pas à vous.').waitFor({ state: 'detached', timeout: 8000 });
  });

  it('clavier : Entrée saisit, deux flèches, Entrée dépose : 2 cases ; Échap laisse le pion', async () => {
    await jeu();
    const avant = await pion('mira');
    const poignee = lea.getByRole('button', { name: 'Mira, votre pion' });
    await poignee.focus();
    await lea.keyboard.press('Enter');
    await lea.keyboard.press('ArrowRight');
    await lea.keyboard.press('Escape');
    assert.equal((await pion('mira')).x, avant.x, 'Échap : rien envoyé');
    await poignee.focus();
    await lea.keyboard.press('Enter');
    await lea.keyboard.press('ArrowRight');
    await lea.keyboard.press('ArrowRight');
    const rep = lea.waitForResponse((r: Any) => r.request().method() === 'POST' && /table\/commandes/.test(r.url()));
    await lea.keyboard.press('Enter');
    assert.equal((await rep).status(), 200);
    const p = await pion('mira');
    assert.deepEqual([p.x - avant.x, p.y - avant.y], [2, 0]);
  });

  it('réseau coupé : « Reconnexion… » s’affiche chez Léa à la prochaine mise à jour, part seule au retour et la table est l’état courant', async () => {
    await jeu();
    assert.equal(await lea.getByText('Reconnexion…').count(), 0);
    const motif = /cartes\/\d+\/table$/;
    await lea.route(motif, (r: Any) => r.abort());
    try {
      await commande([{ type: 'deplacer_pion', id: 'garde', x: 21, y: 10 }]);
      await lea.getByText('Reconnexion…').waitFor({ timeout: 30000 });
      await lea.screenshot({ path: '/tmp/cap/pastille.png' });
    } finally {
      await lea.unroute(motif);
    }
    await commande([{ type: 'deplacer_pion', id: 'garde', x: 22, y: 10 }]);
    await lea.getByText('Reconnexion…').waitFor({ state: 'detached', timeout: 30000 });
    await lea.waitForFunction(async (u: string) => (await (await fetch(u)).json()).pions.find((q: Any) => q.id === 'garde').x === 22, `${api}/cartes/${cid}/table`, { polling: 100 });
    const garde = await lea.getByRole('button', { name: 'Garde' }).boundingBox();
    const mira = await lea.getByRole('button', { name: 'Mira, votre pion' }).boundingBox();
    const m = await pion('mira');
    const cote = (garde.x - mira.x) / (22 - m.x);
    assert.ok(cote > 5, `la table affichée est celle du serveur (garde en 22 : ${cote})`);
    await commande([{ type: 'deplacer_pion', id: 'garde', x: 20, y: 10 }]);
  });

  const versionReglages = async (): Promise<number> => {
    const v = (await (await antor.request.get(`/api/univers/${uid}/outils`)).json()) as Any;
    const ligne = (v.outils as Any[]).find((o) => o.cle === 'battlemap/cartes');
    return ligne.univers.versionReglages;
  };

  it('E-20 : « Jeu à distance » est un interrupteur, coché par défaut', async () => {
    await antor.goto(`/univers/${uid}/parametres`);
    await attendre(antor);
    await antor.getByRole('tab', { name: 'Outils', exact: true }).click();
    await antor.getByText('Jeu à distance').first().waitFor();
    const sw = antor.getByRole('switch', { name: /Jeu à distance/ });
    await sw.waitFor();
    assert.equal(await sw.count(), 1, 'one switch, one label');
    assert.equal(await sw.isChecked(), true);
    // no « Remplacer » step and no Enregistrer button for this setting: the flip itself saves
    const put = () => antor.waitForResponse((x: Any) => x.request().method() === 'PUT' && /cartes\/reglages/.test(x.url()));
    let rep = put();
    await sw.click();
    assert.ok((await rep).status() < 300);
    await antor.getByText('Enregistré.').first().waitFor();
    assert.equal(await sw.isChecked(), false);
    await antor.reload();
    await attendre(antor);
    await antor.getByRole('tab', { name: 'Outils', exact: true }).click();
    const apres = antor.getByRole('switch', { name: /Jeu à distance/ });
    await apres.waitFor();
    assert.equal(await apres.isChecked(), false, 'still off after a reload');
    rep = put();
    await apres.click();
    assert.ok((await rep).status() < 300);
    await antor.getByText('Enregistré.').first().waitFor();
    assert.equal(await apres.isChecked(), true);
  });

  it('réglage coupé en cours de partie : la tentative suivante de Léa ne bouge rien et ne dit rien, puis la ligne « Seul le MJ déplace les pions. » paraît ; au rechargement, plus de prise', async () => {
    await jeu();
    const avant = await pion('mira');
    const r = await antor.request.put(`/api/univers/${uid}/outils/battlemap/cartes/reglages`, { data: { version: await versionReglages(), valeurs: { jeu_a_distance: false } } });
    assert.ok(r.status() < 300, `reglage ${r.status()} ${await r.text()}`);
    const rep = lea.waitForResponse((x: Any) => x.request().method() === 'POST' && /table\/commandes/.test(x.url()));
    await glisser([avant.x, avant.y], 3, 0);
    const refus = await rep;
    assert.equal(refus.status(), 403);
    assert.equal(((await refus.json()) as Any).code, 'jeu_a_distance_coupe');
    await lea.getByText('Seul le MJ déplace les pions.').waitFor();
    assert.equal((await pion('mira')).x, avant.x);
    assert.equal(await lea.getByText('L’action n’a pas abouti.').count(), 0);
    assert.equal(await lea.getByText('Ce pion n’est pas à vous.').count(), 0);
    await jeu();
    await lea.getByText('Seul le MJ déplace les pions.').waitFor();
    assert.equal(await lea.locator('.pion-table').count(), 0);
  });
});
