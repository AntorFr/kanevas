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
//   plein      : the player's received token is drawn full (no diagonal bar)
//   390 px     : « Suivre le MJ » and the zoom do not overlap on a phone
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

  it('onglet Calques : une ligne par calque sans puce, un interrupteur nommé par calque, le geste persiste', async () => {
    const c = await nouvelle('Calques du revueur');
    assert.ok((await antor.request.post(`${api}/cartes/${c}/table`)).status() < 300);
    await jeu(antor, c);
    await antor.getByRole('tab', { name: 'Calques' }).click();
    const lignes = antor.locator('.jeu-calques li');
    await lignes.first().waitFor();
    const n = await lignes.count();
    assert.ok(n >= 2, `un calque par ligne (${n})`);
    assert.equal(await antor.locator('.jeu-calques ul').evaluate((e: Element) => getComputedStyle(e).listStyleType), 'none');
    const commutateurs = antor.locator('.jeu-calques').getByRole('switch');
    const k = await commutateurs.count();
    assert.equal(k, n - await antor.locator('.jeu-calques li.mj').count(), 'un interrupteur par calque, sauf MJ seul');
    const premier = commutateurs.first();
    const nom = (await premier.getAttribute('aria-label')) ?? (await premier.textContent()) ?? '';
    assert.match(nom, /^Visible des joueurs : .+/);
    assert.ok(((await premier.boundingBox()) as Any).height >= 44, 'cible de 44 px');
    const etiquettes = await antor.locator('.jeu-calques .interrupteur-libelle').evaluateAll((es: Element[]) => es.map((e) => e.getBoundingClientRect().width));
    assert.ok(etiquettes.every((w: number) => w <= 1), 'étiquette lue, non affichée');
    const nomBox = (await antor.locator('.jeu-calques .editeur-calque-nom').first().boundingBox()) as Any;
    const swBox = (await premier.boundingBox()) as Any;
    assert.ok(swBox.x >= nomBox.x + nomBox.width - 1, `interrupteur à droite du nom (nom x=${nomBox.x} l=${nomBox.width}, interrupteur x=${swBox.x})`);
    assert.ok(Math.abs((swBox.y + swBox.height / 2) - (nomBox.y + nomBox.height / 2)) < 24, 'interrupteur sur la ligne du nom');
    assert.equal(await premier.isChecked(), true);
    await premier.click();
    await jusque(antor, c, 't.etat.calques_masques.length === 1');
    await antor.reload();
    await antor.getByRole('tab', { name: 'Calques' }).click();
    assert.equal(await antor.locator('.jeu-calques').getByRole('switch').first().isChecked(), false);
  });
  it('joueuse : un pion reçu est dessiné plein, sans barre ni estompage', async () => {
    const c = await nouvelle('Pion plein du revueur');
    assert.ok((await antor.request.post(`${api}/cartes/${c}/table`)).status() < 300);
    await jeu(antor, c);
    await ajouterDisque('Ogre');
    await jusque(antor, c, 't.etat.pions.length === 1');
    // Under the fog the player sees black: reveal the whole map (30 × 20) so the disc is drawn.
    const rev = await antor.request.post(`${api}/cartes/${c}/table/commandes`, {
      data: { version: (await table(antor, c)).version, commandes: [{ type: 'reveler_rect', x: 0, y: 0, l: 30, h: 20 }] },
    });
    assert.equal(rev.status(), 200);
    await jeu(lea, c);
    await lea.locator('canvas').first().waitFor();
    // The disc is the only thing of the accent colour: its bounding box gives its centre, which a diagonal bar would cross.
    const lire = () => lea.evaluate(() => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
      const el = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
      el.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      el.fillRect(0, 0, 1, 1);
      const [r, g, b] = el.getImageData(0, 0, 1, 1).data;
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      const egal = (x: number, y: number) => { const k = (y * cv.width + x) * 4; return d.data[k] === r && d.data[k + 1] === g && d.data[k + 2] === b && d.data[k + 3] === 255; };
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (egal(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 < 0) return { trouve: false, plein: false };
      const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
      const q = Math.max(2, Math.round((x1 - x0) / 8));
      const plein = [[0, 0], [q, -q], [-q, q], [2 * q, -2 * q], [-2 * q, 2 * q]].every(([dx, dy]) => egal(cx + dx!, cy + dy!));
      return { trouve: true, plein };
    });
    let v = await lire();
    for (let i = 0; i < 30 && !v.trouve; i++) { await lea.waitForTimeout(100); v = await lire(); }
    assert.equal(v.trouve, true, 'le disque est dessiné pour la joueuse');
    assert.equal(v.plein, true, 'aucune barre diagonale sur un pion visible');
  });

  it('joueuse à 390 px : « Suivre le MJ » et le zoom ne se recouvrent pas et restent atteignables', async () => {
    const c = await nouvelle('Téléphone du revueur');
    assert.ok((await antor.request.post(`${api}/cartes/${c}/table`)).status() < 300);
    await lea.setViewportSize({ width: 390, height: 800 });
    try {
      await jeu(lea, c);
      const suivre = lea.getByRole('switch', { name: 'Suivre le MJ' });
      await suivre.waitFor();
      const zoom = lea.locator('.jeu .canevas-zoom');
      await zoom.waitFor();
      const a = (await lea.locator('.jeu-suivre').boundingBox()) as Any;
      const z = (await zoom.boundingBox()) as Any;
      const separes = a.y + a.height <= z.y + 1 || z.y + z.height <= a.y + 1 || a.x + a.width <= z.x + 1 || z.x + z.width <= a.x + 1;
      assert.ok(separes, `recouvrement : suivre ${JSON.stringify(a)}, zoom ${JSON.stringify(z)}`);
      const libre = async (loc: Any, nom: string) => {
        const bb = (await loc.boundingBox()) as Any;
        assert.ok(bb, `${nom} visible`);
        const ok = await loc.evaluate((e: Element, p: number[]) => e.contains(document.elementFromPoint(p[0]!, p[1]!)), [bb.x + bb.width / 2, bb.y + bb.height / 2]);
        assert.equal(ok, true, `rien ne couvre ${nom}`);
      };
      await libre(zoom.getByRole('button', { name: 'Zoom arrière' }), 'Zoom arrière');
      await libre(zoom.getByRole('button', { name: 'Zoom avant' }), 'Zoom avant');
      await libre(zoom.locator('.canevas-zoom-valeur'), 'le pourcentage');
      await libre(suivre, 'Suivre le MJ');
    } finally {
      await lea.setViewportSize({ width: 1280, height: 720 });
    }
  });
});
