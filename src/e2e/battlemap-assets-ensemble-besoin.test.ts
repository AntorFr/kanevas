// Ensemble tests of kanevas-battlemap-assets (B-96, B-97, B-98, B-110; P-26 steps 1, 2 and 5; E-25, E-26), written from the
// feature's exit criterion and the product docs only. Real server in stub mode, real Chromium, real API.
//
// TEST PLAN (one line per case: need -> case -> expected, hard-coded)
//  B-110  desactive    : tool never enabled -> API 404 and the screen « Page introuvable. »
//  B-96   vide         : enabled, nothing dropped -> Antor « Aucun asset. Déposez des images. », Léa « La bibliothèque est vide. »
//  B-97   nominal      : Antor drops couchette / console / baril with « Objets » -> 3 cards, names without extension, 1×1, visible, Objets 3
//  B-97   refus        : txt, svg and a « .png » that is text, plus one real image -> each refused by name, the image is added
//  B-97   nom 80       : a file named with 100 characters -> asset name of 80 characters
//  B-97   empreinte    : select couchette, « Empreinte » 2×1 -> couchette 2×1 (API 2 x 1), the others stay 1×1
//  B-96   sol          : a footprint on a floor -> refused, the floor keeps none
//  B-98   direction    : text saved (version 1) and kept after reload; a media-library image chosen as reference turns GM-only
//                        (Léa read it before: 200, after: 404); a dropped reference is GM-only from the start
//  B-98   limites      : the 9th reference -> « 8 images au plus. »; 5 000 characters accepted, 5 001 refused; stale version -> 409
//  B-96   joueuse      : baril left GM-only -> Léa sees 3 cards, Objets 3, no checkbox / add button / tab / toolbar; its file is a 404 for her
//  B-98   joueuse E-26 : « Page introuvable. », API 404
//  B-96   ecriture     : Léa POST / PATCH / DELETE assets and direction -> 404, nothing changed; GM in Player mode -> 403
//  B-96   univers      : the neighbouring universe sees none of the assets
//  B-96   fichier      : a file backing an asset is not deleted (« Ce fichier est utilisé par la bibliothèque d'assets. »)
//  B-110  suppression  : Léa 404; stale count 409; counts 4 assets then erases them, the media-library files stay (readable, deletable then)
//  B-110  visibilite   : tool hidden from players -> Léa API 404, no « Bibliothèque » entry, screen « Page introuvable. »
//  B-96   non membre   : the instance admin (not a member) -> « Page introuvable. »
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, rx, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (nom: string, n = 1) => ({ name: nom, mimeType: 'image/png', buffer: pngPlat([n * 40, 90, 160], 16) });
const captures = process.env.ENSEMBLE_ASSETS_CAPTURES ?? join(tmpdir(), 'ensemble-assets-captures');

describe('Bibliothèque d’assets et direction artistique : ensemble', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let admin: Any;
  const U = 5; // Éneria d'essai (system 3)
  const VOISIN = 6; // Univers voisin (same system)
  const base = `/api/univers/${U}/outils/battlemap`;
  const adresse = `/univers/${U}/outils/battlemap/assets`;
  const outilSysteme = '/api/systemes/3/outils/battlemap/assets';

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    admin = (await connecte(browser, srv.base, 'admin')).page;
    mkdirSync(captures, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const assets = async (page: Any, u = U) => (await (await page.request.get(`/api/univers/${u}/outils/battlemap/assets`)).json()) as Any;
  const parNom = async (nom: string) => ((await assets(antor)).assets as Any[]).find((a) => a.nom === nom);
  const ouvrir = async (page: Any, suite = '') => {
    await page.goto(adresse + suite);
    await attendre(page);
  };
  const grille = (page: Any) => page.getByRole('list', { name: 'Assets' });
  const deposer = async (fichiers: Any[], categorie = 'Objets') => {
    await ouvrir(antor);
    await antor.locator('input[type=file]').first().setInputFiles(fichiers);
    const d = antor.getByRole('dialog');
    await d.getByRole('radio', { name: new RegExp(categorie) }).check().catch(async () => d.getByText(categorie).first().click());
    await d.getByRole('button', { name: /^Ajouter \d+ fichier/ }).click();
  };
  const lisible = async (page: Any, fichierId: number) => (await page.request.get(`/api/univers/${U}/fichiers/${fichierId}`)).status();

  it('desactive : tant que l’outil n’est pas activé, l’API et l’écran répondent « introuvable »', async () => {
    // Panne attrapée : une route ou un écran qui répond alors que l'outil est éteint (B-110).
    assert.equal((await antor.request.get(`${base}/assets`)).status(), 404);
    assert.equal((await antor.request.get(`${base}/direction`)).status(), 404);
    await ouvrir(antor);
    await antor.getByText('Page introuvable.').waitFor();
    for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: true }]] as const) {
      const r = await antor.request.put(`${outilSysteme}/${c}`, { data: d });
      assert.equal(r.status(), 204, c);
    }
    assert.equal((await antor.request.get(`${base}/assets`)).status(), 200);
  });

  it('vide : chaque rôle lit son texte d’état', async () => {
    await ouvrir(antor);
    await antor.getByText('Aucun asset. Déposez des images.').waitFor();
    await ouvrir(lea);
    await lea.getByText('La bibliothèque est vide.').waitFor();
    assert.equal((await assets(antor)).comptes.total, 0);
  });

  it('nominal : Antor dépose trois images « Objets », nommées d’après leur fichier', async () => {
    // Panne : catégorie du dépôt ignorée, nom gardant l'extension, image perdue.
    await deposer([png('couchette.png', 1), png('console.png', 2), png('baril.png', 3)]);
    for (const n of ['couchette', 'console', 'baril']) await grille(antor).getByRole('button', { name: n }).waitFor();
    assert.equal(await grille(antor).getByRole('listitem').count(), 3);
    await antor.getByText(rx('3 images déposées')).first().waitFor().catch(() => {}); // annonce facultative
    const a = await assets(antor);
    assert.deepEqual(a.assets.map((x: Any) => x.nom).sort(), ['baril', 'console', 'couchette']);
    for (const x of a.assets) {
      assert.equal(x.categorie, 'objet');
      assert.equal(x.largeur, 1);
      assert.equal(x.hauteur, 1);
      assert.equal(x.visible, true);
    }
    assert.equal(a.comptes.objet, 3);
    assert.equal(a.comptes.total, 3);
    await antor.screenshot({ path: join(captures, 'depot-trois-objets.png') });
  });

  it('refus : un fichier qui n’est pas une image est refusé par son nom sans bloquer les autres', async () => {
    // Panne : le premier refus arrête le lot, ou le message ne nomme pas le fichier, ou un faux PNG passe.
    await deposer([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('rien à voir') },
      { name: 'plan.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      { name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci est du texte') },
      png('lampe.png', 4),
    ]);
    await antor.getByText(rx('notes.txt n’est pas une image.')).waitFor();
    await antor.getByText(rx('plan.svg n’est pas une image.')).waitFor();
    await antor.getByText(rx('faux.png n’est pas une image.')).waitFor();
    await grille(antor).getByRole('button', { name: 'lampe' }).waitFor();
    const a = await assets(antor);
    assert.deepEqual(a.assets.map((x: Any) => x.nom).sort(), ['baril', 'console', 'couchette', 'lampe']);
    await antor.screenshot({ path: join(captures, 'depot-refus.png') });
  });

  it('nom 80 : le nom tiré d’un fichier long est coupé à 80 caractères', async () => {
    const long = 'a'.repeat(100);
    const r = await antor.request.post(`${base}/assets`, { multipart: { categorie: 'objet', fichier: png(`${long}.png`, 5) } });
    assert.equal(r.status(), 201);
    assert.equal(((await r.json()) as Any).nom, 'a'.repeat(80));
    await antor.request.delete(`${base}/assets`, { data: { ids: [((await r.json()) as Any).id] } });
    assert.equal((await assets(antor)).comptes.total, 4);
  });

  it('empreinte : « 2×1 » réglée dans une sélection ne touche que la sélection', async () => {
    // Panne : la barre applique l'empreinte à tout, ou ne l'enregistre pas.
    await ouvrir(antor);
    await antor.getByLabel('Sélectionner couchette').check();
    await antor.getByRole('toolbar').getByText('1 sélectionné').waitFor();
    await antor.getByRole('button', { name: 'Empreinte' }).click();
    const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'PATCH' && r.url().includes('/battlemap/assets'));
    await antor.getByRole('menuitem', { name: '2×1' }).click();
    assert.ok((await reponse).ok());
    await grille(antor).getByRole('button', { name: 'couchette' }).getByText('2×1').waitFor();
    const c = await parNom('couchette');
    assert.deepEqual([c.largeur, c.hauteur], [2, 1]);
    for (const n of ['console', 'baril', 'lampe']) {
      const x = await parNom(n);
      assert.deepEqual([x.largeur, x.hauteur], [1, 1], n);
    }
    await ouvrir(antor);
    await grille(antor).getByRole('button', { name: 'couchette' }).getByText('2×1').waitFor();
    await antor.screenshot({ path: join(captures, 'empreinte-2x1.png') });
  });

  it('sol : une empreinte sur un sol est refusée, le sol n’en a pas', async () => {
    const r = await antor.request.post(`${base}/assets`, { multipart: { categorie: 'sol', fichier: png('dalle.png', 6) } });
    assert.equal(r.status(), 201);
    const sol = (await r.json()) as Any;
    assert.equal(sol.largeur ?? null, null);
    assert.equal(sol.hauteur ?? null, null);
    const p = await antor.request.patch(`${base}/assets`, { data: { ids: [sol.id], largeur: 2, hauteur: 1 } });
    assert.ok(p.status() >= 400 && p.status() < 500, `statut ${p.status()}`);
    const apres = ((await assets(antor)).assets as Any[]).find((x) => x.id === sol.id);
    assert.equal(apres.largeur ?? null, null);
    await antor.request.delete(`${base}/assets`, { data: { ids: [sol.id] } });
  });

  it('direction : texte enregistré, image de la médiathèque devenue MJ seul, image déposée MJ seul', async () => {
    // Panne : la référence reste lisible par les joueurs, ou le texte n'est pas gardé.
    const dep = await antor.request.post(`/api/univers/${U}/fichiers`, { multipart: { fichier: png('ref-ciel.png', 7) } });
    assert.equal(dep.status(), 201);
    const ref = (await dep.json()) as Any;
    assert.equal(await lisible(lea, ref.id), 200, 'avant : lisible des joueurs');
    await ouvrir(antor, '?onglet=direction');
    await antor.getByRole('textbox', { name: 'Style' }).fill('Métal usé, palette froide, lumière rasante. Éviter le néon.');
    await antor.getByRole('button', { name: 'Choisir dans la médiathèque' }).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('button', { name: 'Ajouter ref-ciel.png' }).click();
    await antor.getByText(rx('« ref-ciel.png » est devenu MJ seul.')).waitFor();
    await d.getByRole('button', { name: 'Fermer' }).click();
    await antor.locator('input[type=file]').first().setInputFiles([png('ref-coque.png', 8)]);
    await antor.getByRole('textbox', { name: 'Légende de ref-coque.png' }).waitFor();
    const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().endsWith('/battlemap/direction'));
    await antor.getByRole('button', { name: 'Enregistrer' }).click();
    assert.ok((await reponse).ok());
    await antor.getByText('Direction artistique enregistrée.').waitFor();
    await antor.screenshot({ path: join(captures, 'direction-antor.png') });

    assert.equal(await lisible(lea, ref.id), 404, 'après : MJ seul');
    const dir = (await (await antor.request.get(`${base}/direction`)).json()) as Any;
    assert.equal(dir.texte, 'Métal usé, palette froide, lumière rasante. Éviter le néon.');
    assert.equal(dir.version, 1);
    assert.deepEqual(dir.images.map((i: Any) => i.nom).sort(), ['ref-ciel.png', 'ref-coque.png']);
    for (const i of dir.images) assert.equal(await lisible(lea, i.fichierId), 404, i.nom);
    const liste = (await (await antor.request.get(`/api/univers/${U}/fichiers`)).json()) as Any;
    for (const n of ['ref-ciel.png', 'ref-coque.png']) assert.equal(liste.fichiers.find((f: Any) => f.nom === n).visibilite, 'mj', n);

    await ouvrir(antor, '?onglet=direction');
    assert.equal(await antor.getByRole('textbox', { name: 'Style' }).inputValue(), 'Métal usé, palette froide, lumière rasante. Éviter le néon.');
  });

  it('limites : neuvième référence refusée, 5 000 caractères acceptés et 5 001 refusés, version périmée refusée', async () => {
    for (let i = 3; i <= 8; i++) {
      const r = await antor.request.post(`${base}/direction/images`, { multipart: { fichier: png(`ref-${i}.png`, 10 + i) } });
      assert.equal(r.status(), 201, `référence ${i}`);
    }
    const neuf = await antor.request.post(`${base}/direction/images`, { multipart: { fichier: png('ref-9.png', 30) } });
    assert.ok(neuf.status() >= 400 && neuf.status() < 500, `statut ${neuf.status()}`);
    assert.match(String(((await neuf.json()) as Any).message).replace(/’/g, "'"), /8 images au plus\./);
    assert.equal(((await (await antor.request.get(`${base}/direction`)).json()) as Any).images.length, 8);

    let v = ((await (await antor.request.get(`${base}/direction`)).json()) as Any).version;
    const ok = await antor.request.put(`${base}/direction`, { data: { texte: 'x'.repeat(5000), version: v } });
    assert.equal(ok.status(), 200);
    v = ((await ok.json()) as Any).version;
    assert.equal(v, 2);
    const trop = await antor.request.put(`${base}/direction`, { data: { texte: 'x'.repeat(5001), version: v } });
    assert.ok(trop.status() >= 400 && trop.status() < 500, `statut ${trop.status()}`);
    const perime = await antor.request.put(`${base}/direction`, { data: { texte: 'périmé', version: 1 } });
    assert.equal(perime.status(), 409);
    const dir = (await (await antor.request.get(`${base}/direction`)).json()) as Any;
    assert.equal(dir.texte, 'x'.repeat(5000));
    assert.equal(dir.version, 2);
    const remis = await antor.request.put(`${base}/direction`, {
      data: { texte: 'Métal usé, palette froide, lumière rasante. Éviter le néon.', version: 2 },
    });
    assert.equal(remis.status(), 200);
  });

  it('joueuse : Léa voit les assets laissés visibles, sans aucun contrôle d’écriture', async () => {
    // Panne : l'asset MJ fuit dans la liste, les comptes, ou son fichier ; un contrôle d'écriture apparaît pour un joueur.
    const baril = await parNom('baril');
    const p = await antor.request.patch(`${base}/assets`, { data: { ids: [baril.id], visible: false } });
    assert.equal(p.status(), 200);
    await ouvrir(antor);
    await antor.getByText('MJ', { exact: true }).first().waitFor();

    await ouvrir(lea);
    const g = grille(lea);
    for (const n of ['couchette', 'console', 'lampe']) await g.getByText(n, { exact: true }).waitFor();
    assert.equal(await g.getByText('baril').count(), 0, 'asset MJ absent de la grille');
    assert.equal(await g.getByRole('listitem').count(), 3);
    assert.equal(await lea.getByRole('checkbox').count(), 0);
    assert.equal(await lea.getByRole('tab').count(), 0);
    assert.equal(await lea.getByRole('toolbar').count(), 0);
    assert.equal(await lea.getByRole('button', { name: /Ajouter des images|Choisir dans la médiathèque|Retirer/ }).count(), 0);
    assert.equal(await lea.getByText('Direction artistique').count(), 0);
    await lea.screenshot({ path: join(captures, 'bibliotheque-lea.png') });

    const a = await assets(lea);
    assert.deepEqual(a.assets.map((x: Any) => x.nom).sort(), ['console', 'couchette', 'lampe']);
    assert.equal(a.comptes.objet, 3, 'le compte ne trahit pas l’asset MJ');
    assert.equal(a.comptes.total, 3);
    assert.equal(await lisible(lea, (await parNom('couchette')).fichierId), 200);
    assert.equal(await lisible(lea, baril.fichierId), 404, 'le fichier d’un asset MJ seul');
    assert.equal((await assets(antor)).comptes.total, 4);
  });

  it('joueuse E-26 : « Page introuvable. », et l’API de la direction est introuvable', async () => {
    await ouvrir(lea, '?onglet=direction');
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByText('Style').count(), 0);
    assert.equal((await lea.request.get(`${base}/direction`)).status(), 404);
    assert.equal((await lea.request.put(`${base}/direction`, { data: { texte: 'piraté', version: 2 } })).status(), 404);
    assert.equal(((await (await antor.request.get(`${base}/direction`)).json()) as Any).texte.startsWith('Métal'), true);
  });

  it('écriture : un joueur qui écrit un asset reçoit « introuvable », un MJ en mode Joueur « refuse »', async () => {
    const avant = (await assets(antor)).comptes.total;
    const id = (await parNom('console')).id;
    const post = await lea.request.post(`${base}/assets`, { multipart: { categorie: 'objet', fichier: png('intrus.png', 9) } });
    assert.equal(post.status(), 404);
    assert.match(await post.text(), /Page introuvable\./);
    const patch = await lea.request.patch(`${base}/assets`, { data: { ids: [id], nom: 'piraté' } });
    assert.equal(patch.status(), 404);
    const del = await lea.request.delete(`${base}/assets`, { data: { ids: [id] } });
    assert.equal(del.status(), 404);
    const ref = await lea.request.post(`${base}/direction/images`, { multipart: { fichier: png('intrus.png', 9) } });
    assert.equal(ref.status(), 404);
    assert.equal((await assets(antor)).comptes.total, avant);
    assert.equal((await parNom('console')).nom, 'console');

    const mode = await antor.request.patch(`${base}/assets?mode=joueur`, { data: { ids: [id], nom: 'en mode joueur' } });
    assert.equal(mode.status(), 403);
    assert.equal((await parNom('console')).nom, 'console');
  });

  it('univers voisin : la bibliothèque d’un univers n’apparaît pas dans un autre', async () => {
    const voisin = await assets(antor, VOISIN);
    assert.deepEqual(voisin.assets, []);
    assert.equal(voisin.comptes.total, 0);
  });

  it('fichier adossé : un fichier d’asset ne se supprime pas depuis la médiathèque', async () => {
    const fid = (await parNom('couchette')).fichierId;
    const r = await antor.request.delete(`/api/univers/${U}/fichiers/${fid}`);
    assert.ok(r.status() >= 400 && r.status() < 500, `statut ${r.status()}`);
    assert.match(String(((await r.json()) as Any).message).replace(/’/g, "'"), /Ce fichier est utilisé par la bibliothèque d'assets\./);
    assert.equal(await lisible(antor, fid), 200);
    assert.ok(await parNom('couchette'));
  });

  it('suppression des données : compte les assets, les efface, laisse les fichiers de la médiathèque', async () => {
    // Panne : la suppression efface aussi les fichiers, ne compte pas, ou s'ouvre à un joueur.
    const avant = (await assets(antor)).assets as Any[];
    assert.equal(avant.length, 4);
    const fichiers = avant.map((a) => a.fichierId);
    const cible = `${base}/assets/suppression`;

    assert.equal((await lea.request.get(cible)).status(), 404);
    assert.equal((await lea.request.post(cible, { data: { vu: [] } })).status(), 404);
    assert.equal((await assets(antor)).comptes.total, 4);

    const resume = (await (await antor.request.get(cible)).json()) as Any;
    const ligneAssets = resume.efface.find((l: Any) => l.nombre === 4);
    assert.ok(ligneAssets, `une ligne compte 4 assets : ${JSON.stringify(resume.efface)}`);

    const perime = await antor.request.post(cible, { data: { vu: [{ cle: ligneAssets.cle, nombre: 3 }] } });
    assert.equal(perime.status(), 409, 'compte périmé');
    assert.equal((await assets(antor)).comptes.total, 4);

    const vu = resume.efface.map((l: Any) => ({ cle: l.cle, nombre: l.nombre }));
    const ok = await antor.request.post(cible, { data: { vu } });
    assert.equal(ok.status(), 200);
    const corps = (await ok.json()) as Any;
    assert.ok(corps.total >= 4);

    const apres = await assets(antor);
    assert.deepEqual(apres.assets, []);
    assert.equal(apres.comptes.total, 0);
    for (const f of fichiers) assert.equal(await lisible(antor, f), 200, `fichier ${f} intact`);
    const liste = (await (await antor.request.get(`/api/univers/${U}/fichiers`)).json()) as Any;
    for (const n of ['couchette.png', 'console.png', 'baril.png', 'lampe.png']) assert.ok(liste.fichiers.some((f: Any) => f.nom === n), n);

    // plus adossé : le fichier se supprime à nouveau
    assert.equal((await antor.request.delete(`/api/univers/${U}/fichiers/${fichiers[0]}`)).status(), 204);
  });

  it('visibilité : outil caché aux joueurs, Léa n’a ni entrée, ni écran, ni API', async () => {
    await ouvrir(lea);
    await lea.getByRole('link', { name: 'Bibliothèque' }).first().waitFor();
    const r = await antor.request.put(`${outilSysteme}/visibilite`, { data: { mj: true, joueur: false } });
    assert.equal(r.status(), 204);
    assert.equal((await lea.request.get(`${base}/assets`)).status(), 404);
    assert.equal((await antor.request.get(`${base}/assets`)).status(), 200);
    await lea.goto(`/univers/${U}`);
    await attendre(lea);
    assert.equal(await lea.getByRole('link', { name: 'Bibliothèque' }).count(), 0);
    await ouvrir(lea);
    await lea.getByText('Page introuvable.').waitFor();
    await antor.request.put(`${outilSysteme}/visibilite`, { data: { mj: true, joueur: true } });
  });

  it('non membre : l’admin de l’instance reçoit « Page introuvable. »', async () => {
    await ouvrir(admin);
    await admin.getByText('Page introuvable.').waitFor();
    assert.equal((await admin.request.get(`${base}/assets`)).status(), 404);
  });
});
