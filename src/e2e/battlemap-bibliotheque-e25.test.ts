// Review of kanevas-battlemap-assets-e25 (E-25, the library screen), written from the exit criterion.
//
// TEST PLAN
//   depot       : the GM drops three images + one PDF with the category « Objets »: the three appear on the grid,
//                 the PDF is refused by its name and does not stop the others
//   empreinte   : selecting an asset and setting « 2×1 » shows « 2×1 » on its card
//   retrait     : « Retirer… » says « Utilisé sur 0 carte », confirming removes the asset
//   joueuse     : Léa sees the visible assets only (counts too), no checkbox, no add button, no tab bar;
//                 a GM-only asset and a draft are in neither list nor counts
//   recherche   : a search without result says « Aucun asset ne correspond. »
//   pleine      : with the API answering `bibliotheque_pleine` the screen says « Bibliothèque pleine (5 000 assets). »
//   mediatheque : « Choisir dans la médiathèque » lists images without asset only, adds one
//   mur         : a footprint on a floor is refused (« Un sol ou un mur n’a pas d’empreinte. »)
//   captures    : MJ and player, both themes, 1440 / 768 / 390 px, written under $E25_CAPTURES when set
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (n: number) => ({ name: `img-${n}.png`, mimeType: 'image/png', buffer: pngPlat([n * 40, 90, 160], 16) });

describe('E-25 Bibliothèque au navigateur', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let sid = 0;
  let adresse = '';

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
    sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    assert.ok(sid, 'système de l’univers');
    const cible = `/api/systemes/${sid}/outils/battlemap/assets`;
    for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: true }]] as const) {
      const r = await antor.request.put(`${cible}/${c}`, { data: d });
      assert.ok(r.status() < 300, `${c}: ${r.status()}`);
    }
    adresse = `/univers/${uid}/outils/battlemap/assets`;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const liste = async (page: Any, mode = '') =>
    (await (await page.request.get(`/api/univers/${uid}/outils/battlemap/assets${mode}`)).json()) as Any;
  const ouvrir = async (page: Any) => {
    await page.goto(adresse);
    await page.getByRole('heading', { name: 'Bibliothèque', level: 1 }).waitFor();
    await attendre(page);
  };

  it('vide : les deux rôles voient leur texte d’état', async () => {
    await ouvrir(antor);
    await antor.getByText('Aucun asset. Déposez des images.').waitFor();
    await ouvrir(lea);
    await lea.getByText('La bibliothèque est vide.').waitFor();
  });

  it('depot : trois images « Objets » arrivent sur la grille, le PDF est refusé par son nom', async () => {
    await ouvrir(antor);
    await antor.locator('input[type=file]').first().setInputFiles([
      png(1), png(2), { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%x') }, png(3),
    ]);
    const d = antor.getByRole('dialog');
    await d.getByText('notes.pdf').waitFor();
    await d.getByRole('radio', { name: /Objets/ }).check().catch(async () => d.getByText('Objets').first().click());
    await d.getByRole('button', { name: /^Ajouter 4 fichiers/ }).click();
    await antor.getByText('notes.pdf n’est pas une image.').waitFor();
    const grille = antor.getByRole('list', { name: 'Assets' });
    for (const n of ['img-1', 'img-2', 'img-3']) await grille.getByRole('button', { name: n }).waitFor();
    assert.equal(await grille.getByRole('listitem').count(), 3);
    const l = await liste(antor);
    assert.equal(l.assets.length, 3);
    assert.ok(l.assets.every((a: Any) => a.categorie === 'objet'));
    assert.equal(l.comptes.objet, 3);
    assert.equal(l.comptes.total, 3);
  });

  it('empreinte : « 2×1 » réglée par la barre de sélection s’affiche sur la carte', async () => {
    await ouvrir(antor);
    await antor.getByLabel('Sélectionner img-1').check();
    await antor.getByRole('toolbar', { name: 'Sélection d’assets' }).getByText('1 sélectionné').waitFor();
    await antor.getByRole('button', { name: 'Empreinte' }).click();
    await antor.getByRole('menuitem', { name: '2×1' }).click();
    await antor.getByRole('list', { name: 'Assets' }).getByText('2×1').waitFor();
    const a = (await liste(antor)).assets.find((x: Any) => x.nom === 'img-1');
    assert.deepEqual([a.largeur, a.hauteur], [2, 1]);
  });

  it('sol : une empreinte sur un sol est refusée', async () => {
    const r = await antor.request.post(`/api/univers/${uid}/outils/battlemap/assets`, {
      multipart: { categorie: 'sol', fichier: png(7) },
    });
    assert.ok(r.ok(), await r.text());
    await ouvrir(antor);
    await antor.getByLabel('Sélectionner img-7').check();
    await antor.getByRole('button', { name: 'Empreinte' }).click();
    await antor.getByRole('menuitem', { name: '2×1' }).click();
    await antor.getByText('Un sol ou un mur n’a pas d’empreinte.').waitFor();
    const a = (await liste(antor)).assets.find((x: Any) => x.nom === 'img-7');
    assert.equal(a.largeur, null);
  });

  it('recherche : sans résultat, « Aucun asset ne correspond. »', async () => {
    await ouvrir(antor);
    await antor.getByRole('searchbox', { name: 'Rechercher un asset' }).fill('zzzzqq');
    await antor.getByText('Aucun asset ne correspond.').waitFor();
    await antor.getByRole('button', { name: 'Effacer les filtres' }).click();
    await antor.getByRole('list', { name: 'Assets' }).waitFor();
  });

  it('joueuse : assets visibles seulement, comptes sans MJ seul ni brouillon, aucun contrôle d’écriture', async () => {
    // img-3 becomes GM-only
    const l = await liste(antor);
    const trois = l.assets.find((x: Any) => x.nom === 'img-3');
    const p = await antor.request.patch(`/api/univers/${uid}/outils/battlemap/assets`, { data: { ids: [trois.id], visible: false } });
    assert.ok(p.ok(), await p.text());
    await ouvrir(lea);
    const grille = lea.getByRole('list', { name: 'Assets' });
    await grille.getByText('img-1').waitFor();
    assert.equal(await grille.getByText('img-3').count(), 0, 'asset MJ absent');
    assert.equal(await lea.getByRole('checkbox').count(), 0, 'aucune case');
    assert.equal(await lea.getByRole('tab').count(), 0, 'aucun onglet');
    assert.equal(await lea.getByText('Direction artistique').count(), 0);
    assert.equal(await lea.getByRole('button', { name: /Choisir dans la médiathèque|Retirer/ }).count(), 0);
    assert.equal(await lea.locator('input[type=file]').count(), 0, 'aucun dépôt');
    assert.equal(await lea.getByRole('toolbar').count(), 0);
    // the carte does not open a panel
    await grille.getByText('img-1').click();
    assert.equal(await lea.getByRole('complementary', { name: 'Asset' }).count(), 0);
    // counts: the segments carry what she sees (Tous = 3 : img-1, img-2, img-7)
    const lj = await liste(lea);
    assert.equal(lj.comptes.total, 3);
    assert.equal(lj.comptes.objet, 2);
    assert.equal(lj.assets.length, 3);
    const seg = lea.getByRole('radiogroup', { name: 'Catégorie' }).or(lea.getByRole('group', { name: 'Catégorie' }));
    assert.match(await seg.first().innerText(), /Tous\s*3/);
    assert.match(await seg.first().innerText(), /Objets\s*2/);
    // forced direction tab: nothing GM
    await lea.goto(`${adresse}?onglet=direction`);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByText('Style').count(), 0);
  });

  it('mode joueur du MJ : lit comme une joueuse, sans onglets ni cases', async () => {
    await ouvrir(antor);
    assert.equal(await antor.getByRole('tab', { name: 'Direction artistique' }).count(), 1);
    await antor.getByRole('tab', { name: 'Direction artistique' }).click();
    await antor.getByRole('button', { name: 'Enregistrer' }).waitFor();
    await antor.getByRole('tab', { name: 'Assets' }).click();
  });

  it('retrait : « Utilisé sur 0 carte », puis l’asset disparaît (le fichier reste)', async () => {
    await ouvrir(antor);
    await antor.getByLabel('Sélectionner img-2').check();
    await antor.getByRole('toolbar', { name: 'Sélection d’assets' }).getByRole('button', { name: /Retirer/ }).click();
    const d = antor.getByRole('alertdialog');
    await d.getByText(/Utilisé sur 0 carte\b(?!s)/).waitFor();
    await d.getByRole('button', { name: 'Retirer 1 asset' }).click();
    await antor.getByRole('list', { name: 'Assets' }).getByText('img-2').waitFor({ state: 'detached' });
    assert.equal((await liste(antor)).assets.some((a: Any) => a.nom === 'img-2'), false);
    const f = (await (await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets/fichiers-disponibles`)).json()) as Any;
    assert.ok(f.fichiers.some((x: Any) => /img-2/.test(x.nom)), 'le fichier reste dans la médiathèque');
  });

  it('médiathèque : ne liste que les images sans asset, en ajoute une', async () => {
    const dep = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { fichier: png(9) } });
    assert.ok(dep.ok(), await dep.text());
    const doc = await antor.request.post(`/api/univers/${uid}/fichiers`, {
      multipart: { fichier: { name: 'sans-asset.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%y') } },
    });
    assert.ok(doc.ok());
    await ouvrir(antor);
    await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).click();
    const d = antor.getByRole('dialog');
    await d.getByText('img-9.png').waitFor();
    assert.equal(await d.getByText('sans-asset.pdf').count(), 0, 'un document n’est pas proposé');
    assert.equal(await d.getByText('img-1.png').count(), 0, 'une image déjà asset n’est pas proposée');
    assert.equal(await d.getByText('img-3.png').count(), 0);
    await d.getByRole('button', { name: 'Ajouter img-9.png' }).click();
    await d.getByText('img-9.png').waitFor({ state: 'detached' });
    await d.getByRole('button', { name: 'Fermer' }).click();
    await antor.getByRole('list', { name: 'Assets' }).getByRole('button', { name: 'img-9' }).waitFor();
  });

  it('pleine : bibliothecque_pleine simulée → message, ajouts désactivés', async () => {
    const ctx = antor.context();
    const page = await ctx.newPage();
    await page.route(`**/api/univers/${uid}/outils/battlemap/assets`, async (route: Any) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'bibliotheque_pleine', erreur: 'Bibliothèque pleine.' }) });
      }
      return route.continue();
    });
    await ouvrir(page);
    await page.locator('input[type=file]').first().setInputFiles([png(20)]);
    await page.getByRole('dialog').getByRole('button', { name: /^Ajouter 1 fichier/ }).click();
    await page.getByText('Bibliothèque pleine (5 000 assets).').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Choisir dans la médiathèque' }).isDisabled(), true);
    await page.close();
  });

  it('pleine : 5 000 assets annoncés par la liste → message dès l’ouverture', async () => {
    const page = await antor.context().newPage();
    await page.route(`**/api/univers/${uid}/outils/battlemap/assets?*`, (route: Any) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ assets: [], comptes: { total: 5000, objet: 5000, vaisseau: 0, decor: 0, sol: 0, mur: 0 } }),
    }));
    await page.route(`**/api/univers/${uid}/outils/battlemap/assets`, (route: Any) => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets: [], comptes: { total: 5000, objet: 5000, vaisseau: 0, decor: 0, sol: 0, mur: 0 } }) })
      : route.continue());
    await ouvrir(page);
    await page.getByText('Bibliothèque pleine (5 000 assets).').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Choisir dans la médiathèque' }).isDisabled(), true);
    await page.close();
  });

  it('erreur : la liste en échec dit « Impossible de charger la bibliothèque. » + Réessayer', async () => {
    const page = await antor.context().newPage();
    let casse = true;
    await page.route(`**/api/univers/${uid}/outils/battlemap/assets`, (route: Any) => (casse && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }) : route.continue()));
    await page.goto(adresse);
    await page.getByText('Impossible de charger la bibliothèque.').waitFor();
    casse = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await page.getByRole('list', { name: 'Assets' }).waitFor();
    await page.close();
  });

  it('chargement : le texte s’affiche tant que la liste n’a pas répondu', async () => {
    const page = await antor.context().newPage();
    let lache: () => void = () => {};
    const porte = new Promise<void>((r) => { lache = r; });
    await page.route(`**/api/univers/${uid}/outils/battlemap/assets`, async (route: Any) => {
      if (route.request().method() === 'GET') await porte;
      return route.continue();
    });
    await page.goto(adresse);
    await page.getByText('Chargement de la bibliothèque…').waitFor();
    lache();
    await page.getByRole('list', { name: 'Assets' }).waitFor();
    await page.close();
  });

  it('refus d’un tiers : un compte hors univers voit « Page introuvable. »', async () => {
    const tiers = (await connecte(browser, srv.base, 'Teo')).page;
    await tiers.goto(adresse);
    await tiers.getByText('Page introuvable.').waitFor();
  });

  const dir = process.env.E25_CAPTURES;
  it('captures : MJ et joueuse, deux thèmes, 1440 / 768 / 390', { skip: dir ? false : 'E25_CAPTURES non posé' }, async () => {
    mkdirSync(dir!, { recursive: true });
    for (const [nom, page] of [['mj', antor], ['joueuse', lea]] as const) {
      for (const theme of ['clair', 'sombre']) {
        for (const [w, h] of [[1440, 900], [768, 1024], [390, 800]]) {
          await page.setViewportSize({ width: w, height: h });
          await page.emulateMedia({ colorScheme: theme === 'sombre' ? 'dark' : 'light' });
          await page.addInitScript(`try{localStorage.setItem('theme','${theme === 'sombre' ? 'sombre' : 'clair'}')}catch(e){}`);
          await ouvrir(page);
          if (nom === 'mj') await page.getByLabel('Sélectionner img-1').check();
          await page.screenshot({ path: `${dir}/e25-${nom}-${theme}-${w}.png` });
        }
      }
    }
  });
});
