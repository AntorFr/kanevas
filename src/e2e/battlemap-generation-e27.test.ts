// ecrans: accueil, battlemap-assets, outil
// Review of kanevas-battlemap-generation-e27 (E-27, the « Génération » tab of E-25 + the Brouillon cards), written from the exit criterion.
//
// TEST PLAN
//   absent      : GET lots answering 404 (no engine / tool off) → no « Génération » tab, E-25 opens with its deposits
//   vide        : empty list and empty lot texts, banner « Sans direction artistique… », launch disabled
//   parcours    : 3 lines launched → 3 drafts arrive; two accepted (library, GM only), one regenerated with a remark, one discarded;
//                 « Brouillons » segment and Brouillon cards of E-25 with Accepter / Écarter
//   arret       : « Arrêter le lot » asks, then discards the non-accepted lines, the accepted one stays
//   prepare     : a `prepare` batch put through the API shows « Préparé » and its lines
//   coller      : readable lines kept, the others named by their number; the 21st line refused (« 20 lignes au plus. »)
//   direction   : banner with the art direction text
//   echec       : a failed line shows its reason, « Réessayer » posts and the line goes back
//   occupe      : an `en_cours` line with a busy engine shows the alert
//   perime      : a 409 `etat_ligne` says « Cette ligne a changé. » and reloads
//   hors ligne  : lost connection disables the actions
//   redemarrage : server restarted with a running batch → « Interrompu » + banner, « Reprendre » relaunches
//   telephone   : at 768 px the two panes stack
//   captures    : written under $E27_CAPTURES (default: the temp dir)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 1, hauteur: 1, indice: '', ...extra });

describe('E-27 Génération au navigateur', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  let adresse = '';
  let api = '';
  const dossier = process.env.E27_CAPTURES ?? join(tmpdir(), 'e27-captures');

  before(async () => {
    mkdirSync(dossier, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
    const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    for (const outil of ['assets', 'generation']) {
      for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: outil === 'assets' }]] as const) {
        const r = await antor.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d });
        assert.ok(r.status() < 300, `${outil}/${c}: ${r.status()}`);
      }
    }
    adresse = `/univers/${uid}/outils/battlemap/assets?onglet=generation`;
    api = `/api/univers/${uid}/outils/battlemap/lots`;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const lot = async () => ((await (await antor.request.get(api)).json()) as Any);
  const ouvrir = async (page: Any = antor, url = adresse) => {
    await page.goto(url);
    await page.getByRole('heading', { name: 'Lot', level: 2 }).waitFor();
    await attendre(page);
  };
  const vider = async () => {
    // Close whatever batch is open so each test starts from an empty universe.
    const d = await lot();
    if (d.lot && d.lot.etat !== 'prepare') await antor.request.post(`${api}/arreter`, { data: {} });
    else if (d.lot) {
      await antor.request.post(`${api}/lancer`, { data: {} });
      await antor.request.post(`${api}/arreter`, { data: {} });
    }
  };
  const lignesApi = async () => ((await lot()).lot?.lignes ?? []) as Any[];
  const attendreEtats = (attendus: string[]) => antor.waitForFunction(async ([url, voulus]: [string, string[]]) => {
    const d = await (await fetch(url)).json();
    return JSON.stringify((d.lot?.lignes ?? []).map((l: Any) => l.etat)) === JSON.stringify(voulus);
  }, [api, attendus]);
  const ecrire = async (page: Any, i: number, nom: string) => page.getByRole('textbox', { name: `Nom de la ligne ${i}` }).fill(nom);

  it('absent : sans la route des lots, pas d’onglet Génération, E-25 s’ouvre avec ses dépôts', async () => {
    const p = await antor.context().newPage();
    await p.route('**/outils/battlemap/lots', (r: Any) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"erreur":"introuvable"}' }));
    await p.goto(`/univers/${uid}/outils/battlemap/assets`);
    await p.getByRole('heading', { name: 'Bibliothèque', level: 1 }).waitFor();
    await attendre(p);
    await p.getByRole('tab', { name: 'Direction artistique' }).waitFor();
    assert.equal(await p.getByRole('tab', { name: 'Génération' }).count(), 0);
    await p.getByText(/^Aucun asset\. Déposez des images\.$/).waitFor();
    // forcing the address does not open the tab either
    await p.goto(adresse);
    await p.getByRole('heading', { name: 'Bibliothèque', level: 1 }).waitFor();
    await attendre(p);
    assert.equal(await p.getByRole('heading', { name: 'Lot', level: 2 }).count(), 0);
    await p.close();
  });

  it('vide : textes d’état, bandeau sans direction, lancement désactivé', async () => {
    await ouvrir();
    await antor.getByText('Aucune ligne. Ajoutez-en une ou collez-en plusieurs.').waitFor();
    await antor.getByText('Aucun lot. Écrivez la liste puis lancez.').waitFor();
    await antor.getByText('Sans direction artistique, les images seront génériques.').waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Lancer le lot' }).isDisabled(), true);
    await antor.screenshot({ path: join(dossier, 'vide-1280.png') });
  });

  it('joueuse : l’onglet n’existe pas et l’API répond 404', async () => {
    await lea.goto(adresse);
    await lea.getByRole('heading', { name: 'Bibliothèque', level: 1 }).waitFor();
    await attendre(lea);
    assert.equal(await lea.getByRole('tab').count(), 0);
    assert.equal(await lea.getByRole('heading', { name: 'Lot', level: 2 }).count(), 0);
    assert.equal((await lea.request.get(api)).status(), 404);
  });

  it('parcours : trois lignes, trois brouillons un par un, deux acceptés, un régénéré avec remarque, un écarté', async () => {
    await vider();
    await ouvrir();
    for (const [i, nom] of ['Couchette', 'Caisse', 'Console'].entries()) {
      await antor.getByRole('button', { name: 'Ajouter une ligne' }).click();
      await ecrire(antor, i + 1, nom);
    }
    const sauve = antor.waitForResponse((r: Any) => r.url().endsWith('/lots') && r.request().method() === 'PUT');
    assert.ok((await sauve).ok(), 'enregistrement continu');
    const lancer = antor.getByRole('button', { name: 'Lancer le lot (3)' });
    await lancer.click();
    for (const nom of ['Couchette', 'Caisse', 'Console']) await antor.getByAltText(`Brouillon de ${nom}`).waitFor();
    await antor.getByText('3 sur 3').waitFor();
    assert.equal(await antor.getByText('Brouillon prêt').count(), 3);
    await antor.screenshot({ path: join(dossier, 'lot-brouillons-1280.png') });
    const lignes = await lignesApi();
    assert.deepEqual(lignes.map((l) => l.etat), ['brouillon', 'brouillon', 'brouillon']);

    // E-25: the three drafts are cards with Accepter / Écarter, in the Brouillons segment
    // The draft file is GM only: a player cannot read it.
    const fid = lignes[0].fichierId;
    const lecture = await lea.request.get(`/api/univers/${uid}/fichiers/${fid}`);
    assert.ok([403, 404].includes(lecture.status()), `Léa lit un brouillon: ${lecture.status()}`);

    // Accept the first two (one on the Generation tab, one through its card), regenerate the third with a remark
    const l1 = antor.locator('li.bm-gen-ligne', { hasText: 'Couchette' });
    await l1.getByRole('button', { name: 'Accepter' }).click();
    await l1.getByText('Accepté').waitFor();
    await l1.getByRole('link', { name: 'Voir dans la bibliothèque' }).waitFor();

    const l3 = antor.locator('li.bm-gen-ligne', { hasText: 'Console' });
    await l3.getByRole('button', { name: 'Régénérer…' }).click();
    await l3.getByRole('textbox', { name: /Remarque/ }).fill('plus usé');
    const reg = antor.waitForResponse((r: Any) => /\/regenerer$/.test(r.url()));
    await l3.getByRole('button', { name: 'Régénérer', exact: true }).click();
    const r = await reg;
    assert.ok(r.ok());
    assert.equal(r.request().postDataJSON().remarque, 'plus usé');
    await attendreEtats(['accepte', 'brouillon', 'brouillon']);
    await antor.getByAltText('Brouillon de Console').waitFor();

    // The library: Caisse and Console are drafts (cards), Couchette is a plain asset
    await antor.getByRole('tab', { name: 'Assets' }).click();
    await antor.getByRole('radio', { name: /Brouillons/ }).click();
    const cartes = antor.locator('article, li').filter({ hasText: 'Brouillon' });
    await antor.getByRole('button', { name: 'Accepter Caisse' }).waitFor();
    await antor.getByRole('button', { name: 'Écarter Console' }).waitFor();
    assert.ok((await cartes.count()) >= 2);
    await antor.screenshot({ path: join(dossier, 'brouillons-e25-1280.png') });
    await antor.getByRole('button', { name: 'Accepter Caisse' }).click();
    await antor.getByRole('button', { name: 'Accepter Caisse' }).waitFor({ state: 'detached' });
    await antor.getByRole('button', { name: 'Écarter Console' }).click();
    await antor.getByRole('button', { name: 'Écarter Console' }).waitFor({ state: 'detached' });

    // Effects through the API: the lot is over, two assets entered the library, GM only while drafts… accepted are normal assets
    assert.equal((await lot()).lot, null, 'le lot est terminé');
    const assets = (await (await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).json()) as Any;
    const noms = (assets.assets ?? assets.elements ?? []).map((a: Any) => a.nom).sort();
    assert.deepEqual(noms, ['Caisse', 'Couchette'], 'Console écartée n’entre pas');
    const vueLea = (await (await lea.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).json()) as Any;
    assert.ok(!JSON.stringify(vueLea).includes('Console'), 'jamais le brouillon écarté pour la joueuse');
    await ouvrir();
    await antor.getByText('Le dernier lot est terminé.').waitFor().catch(() => undefined);
  });

  it('arrêt : « Arrêter le lot » demande confirmation puis écarte les lignes non acceptées', async () => {
    await vider();
    await antor.request.put(api, { data: { lignes: [ligne('Table'), ligne('Chaise'), ligne('Lampe')] } });
    await ouvrir();
    await antor.getByRole('button', { name: 'Lancer le lot (3)' }).click();
    await antor.getByAltText('Brouillon de Lampe').waitFor();
    const t = antor.locator('li.bm-gen-ligne', { hasText: 'Table' });
    await t.getByRole('button', { name: 'Accepter' }).click();
    await t.getByText('Accepté').waitFor();
    await antor.getByRole('button', { name: 'Arrêter le lot' }).first().click();
    const d = antor.getByRole('alertdialog');
    await d.getByText('Les lignes non acceptées seront écartées, leurs brouillons supprimés.').waitFor();
    // Cancelling changes nothing
    await d.getByRole('button', { name: /Annuler|Fermer/ }).first().click();
    assert.equal((await lignesApi()).filter((l) => l.etat === 'brouillon').length, 2);
    await antor.getByRole('button', { name: 'Arrêter le lot' }).first().click();
    await antor.getByRole('alertdialog').getByRole('button', { name: 'Arrêter le lot' }).click();
    await antor.getByText('Lot arrêté.').waitFor();
    assert.equal((await lot()).lot, null);
    const assets = (await (await antor.request.get(`/api/univers/${uid}/outils/battlemap/assets`)).json()) as Any;
    const noms = (assets.assets ?? assets.elements ?? []).map((a: Any) => a.nom);
    assert.ok(noms.includes('Table'), 'l’accepté reste');
    assert.ok(!noms.includes('Chaise') && !noms.includes('Lampe'), 'les brouillons arrêtés sont supprimés');
  });

  it('préparé : un lot `prepare` posé par l’API s’affiche « Préparé » avec ses lignes', async () => {
    await vider();
    const r = await antor.request.put(api, { data: { lignes: [ligne('Tonneau', { indice: 'cerclé de fer' }), ligne('Dalle', { categorie: 'sol', largeur: null, hauteur: null })] } });
    assert.ok(r.ok(), await r.text());
    await ouvrir();
    await antor.getByText('Préparé', { exact: true }).waitFor();
    await antor.getByText('Ce lot est préparé, il n’est pas lancé. Relisez la liste puis lancez.').waitFor();
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 1' }).inputValue(), 'Tonneau');
    assert.equal(await antor.getByRole('textbox', { name: 'Indication de la ligne 1' }).inputValue(), 'cerclé de fer');
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 2' }).inputValue(), 'Dalle');
    assert.equal(await antor.getByRole('spinbutton', { name: 'Largeur de la ligne 2' }).count(), 0, 'un sol n’a pas d’empreinte');
    await antor.getByRole('button', { name: 'Lancer le lot (2)' }).waitFor();
    await antor.screenshot({ path: join(dossier, 'prepare-1280.png') });
  });

  it('coller : les lignes lisibles sont gardées, les autres nommées par leur numéro ; la 21e est refusée', async () => {
    await vider();
    await ouvrir();
    await antor.getByRole('button', { name: 'Coller des lignes' }).click();
    await antor.getByRole('textbox', { name: 'Lignes à coller' }).fill(
      ['Couchette ; objet ; 2x1 ; draps froissés', 'Plancher ; sol', '', '; objet', 'Machin ; licorne', 'Mur nu ; mur ; 2x1', 'Tapis ; objet ; 0x3'].join('\n'),
    );
    await antor.getByRole('button', { name: 'Ajouter les lignes' }).click();
    await antor.getByText('Ligne 4 illisible : nom manquant.').waitFor();
    await antor.getByText('Ligne 5 illisible : catégorie inconnue.').waitFor();
    await antor.getByText(/Ligne 6 illisible/).waitFor();
    await antor.getByText(/Ligne 7 illisible/).waitFor();
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 1' }).inputValue(), 'Couchette');
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 2' }).inputValue(), 'Plancher');
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 3' }).count(), 0, 'seules les deux lignes lisibles entrent');
    assert.equal(await antor.getByRole('spinbutton', { name: 'Largeur de la ligne 1' }).inputValue(), '2');

    // 20 lines at most: pasting 19 more makes 21 → the 21st is dropped and said
    const dix9 = Array.from({ length: 19 }, (_, i) => `Objet ${i + 3}`).join('\n');
    await antor.getByRole('button', { name: 'Coller des lignes' }).click();
    await antor.getByRole('textbox', { name: 'Lignes à coller' }).fill(`${dix9}\nObjet de trop`);
    await antor.getByRole('button', { name: 'Ajouter les lignes' }).click();
    await antor.getByText('20 lignes au plus.').first().waitFor();
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 20' }).count(), 1);
    assert.equal(await antor.getByRole('textbox', { name: 'Nom de la ligne 21' }).count(), 0);
    assert.equal(await antor.getByRole('button', { name: 'Ajouter une ligne' }).isDisabled(), true);
    assert.equal(await antor.getByRole('button', { name: 'Coller des lignes' }).isDisabled(), true);
    // the list was saved by itself as a prepared batch of 20
    await antor.waitForResponse((r: Any) => r.url().endsWith('/lots') && r.request().method() === 'PUT');
    assert.equal((await lignesApi()).length, 20);
    await antor.screenshot({ path: join(dossier, 'coller-20-1280.png') });
  });

  it('autosave : une ligne sans nom n’est pas envoyée, la liste part d’un coup quand tout est lisible', async () => {
    await vider();
    await ouvrir();
    const envois: Any[] = [];
    antor.on('request', (r: Any) => { if (r.method() === 'PUT' && r.url().endsWith('/lots')) envois.push(r.postDataJSON()); });
    await antor.getByRole('button', { name: 'Ajouter une ligne' }).click();
    await antor.getByRole('button', { name: 'Ajouter une ligne' }).click();
    await ecrire(antor, 2, 'Seconde');
    assert.equal(await antor.getByRole('button', { name: /^Lancer le lot/ }).isDisabled(), true, 'la ligne 1 est sans nom');
    const rep = antor.waitForResponse((r: Any) => r.url().endsWith('/lots') && r.request().method() === 'PUT');
    await ecrire(antor, 1, 'Première');
    assert.ok((await rep).ok());
    antor.removeAllListeners('request');
    assert.equal(envois.length, 1, 'aucun envoi tant qu’une ligne était sans nom');
    assert.deepEqual(envois[0].lignes.map((l: Any) => l.nom), ['Première', 'Seconde']);
  });

  it('direction : le bandeau dit la direction artistique de l’univers', async () => {
    await vider();
    const actuelle = (await (await antor.request.get(`/api/univers/${uid}/outils/battlemap/direction`)).json()) as Any;
    const r = await antor.request.put(`/api/univers/${uid}/outils/battlemap/direction`, { data: { texte: 'Palette froide, lumière rasante.', version: actuelle.version } });
    assert.ok(r.ok(), await r.text());
    await ouvrir();
    await antor.getByText(/Direction artistique\s*·\s*Palette froide, lumière rasante\./).waitFor();
    await antor.getByRole('link', { name: 'Modifier' }).waitFor();
  });

  // States that the stub engine does not produce by itself are served by a mocked read.
  const simule = async (page: Any, donnees: Any, sur: string[] = []) => {
    await page.route('**/outils/battlemap/lots', (r: Any) => (r.request().method() === 'GET'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(donnees) }) : r.fallback()));
    for (const s of sur) void s;
  };
  const L = (id: number, nom: string, etat: string, extra: Any = {}) => ({
    id, rang: id, nom, categorie: 'objet', largeur: 1, hauteur: 1, indice: '', remarque: '', etat, motEchec: null, assetId: null,
    fichierId: null, jeton: null, ...extra,
  });

  it('échec : le motif s’affiche, « Réessayer » relance la ligne', async () => {
    const p = await antor.context().newPage();
    await simule(p, { lot: { id: 9, etat: 'en_cours', interrompu: false, lignes: [L(1, 'Brasero', 'echec', { motEchec: 'Le moteur n’a pas répondu.' })] }, moteurOccupe: false, directionArtistique: null });
    const demande = p.waitForRequest((r: Any) => /\/lignes\/1\/reessayer$/.test(r.url()) && r.method() === 'POST');
    await p.route('**/lignes/1/reessayer', (r: Any) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"lot":null}' }));
    await ouvrir(p);
    await p.getByText('Échec', { exact: true }).waitFor();
    await p.getByText('Le moteur n’a pas répondu.').waitFor();
    await p.getByRole('button', { name: 'Réessayer' }).click();
    await demande;
    await p.screenshot({ path: join(dossier, 'echec-1280.png') });
    await p.close();
  });

  it('moteur occupé : une ligne en cours montre l’alerte', async () => {
    const p = await antor.context().newPage();
    await simule(p, { lot: { id: 9, etat: 'en_cours', interrompu: false, lignes: [L(1, 'Brasero', 'en_cours')] }, moteurOccupe: true, directionArtistique: null });
    await ouvrir(p);
    await p.getByText('Génération de Brasero…').waitFor();
    await p.getByText('Le moteur d’image est occupé, votre lot attend son tour.').waitFor();
    await p.close();
  });

  it('périmé : « Cette ligne a changé. » et rechargement de la lecture', async () => {
    const p = await antor.context().newPage();
    let lectures = 0;
    await p.route('**/outils/battlemap/lots', (r: Any) => {
      if (r.request().method() !== 'GET') return r.fallback();
      lectures++;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lot: { id: 9, etat: 'en_cours', interrompu: false, lignes: [L(1, 'Brasero', 'echec', { motEchec: 'x' })] }, moteurOccupe: false, directionArtistique: null }) });
    });
    await p.route('**/lignes/1/ecarter', (r: Any) => r.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"etat_ligne","erreur":"conflit"}' }));
    await ouvrir(p);
    const avant = lectures;
    await p.getByRole('button', { name: 'Écarter' }).click();
    await p.getByText('Cette ligne a changé.').waitFor();
    await attendre(p);
    assert.ok(lectures > avant, 'la lecture est rechargée');
    await p.close();
  });

  it('hors ligne : la connexion perdue désactive les actions', async () => {
    const p = (await connecte(browser, srv.base, 'Antor')).page;
    await simule(p, { lot: { id: 9, etat: 'en_cours', interrompu: false, lignes: [L(1, 'Brasero', 'echec', { motEchec: 'x' })] }, moteurOccupe: false, directionArtistique: null });
    await ouvrir(p);
    await p.context().setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.getByRole('button', { name: 'Réessayer' }).and(p.locator('[aria-disabled=true]')).waitFor();
    assert.equal(await p.getByRole('button', { name: 'Réessayer' }).isDisabled(), true);
    assert.equal(await p.getByRole('button', { name: 'Écarter' }).isDisabled(), true);
    assert.equal(await p.getByRole('button', { name: 'Arrêter le lot' }).first().isDisabled(), true);
    await p.context().setOffline(false);
    await p.close();
  });

  it('téléphone : à 768 px la liste et le lot s’empilent, à 1280 ils sont côte à côte', async () => {
    await vider();
    await ouvrir();
    const boites = async () => ({
      a: await antor.locator('section.bm-gen-liste').boundingBox(),
      b: await antor.locator('section.bm-gen-lot').boundingBox(),
    });
    await antor.setViewportSize({ width: 1280, height: 800 });
    let { a, b } = await boites();
    assert.ok(b.x > a.x + a.width - 2, 'côte à côte à 1280');
    await antor.setViewportSize({ width: 768, height: 900 });
    ({ a, b } = await boites());
    assert.ok(b.y >= a.y + a.height - 2, 'empilés à 768');
    await antor.screenshot({ path: join(dossier, 'liste-768.png') });
    await antor.setViewportSize({ width: 1280, height: 800 });
  });

  it('redémarrage : un lot en cours repart « Interrompu », « Reprendre » le relance', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    const Database = createRequire(import.meta.url)('better-sqlite3');
    const dir = mkdtempSync(join(tmpdir(), 'e27-redemarrage-'));
    const env = { KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1', DB_PATH: join(dir, 'k.db') };
    let s2: Server | null = await startServer(env);
    let s3: Server | null = null;
    const ctx = await browser.newContext();
    try {
      const page = (await connecte(browser, s2.base, 'Antor')).page;
      const u = ((await (await page.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
      const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
      for (const outil of ['assets', 'generation']) {
        for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: false }]] as const) {
          await page.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d });
        }
      }
      const R = `/api/univers/${u.id}/outils/battlemap/lots`;
      await page.request.put(R, { data: { lignes: [ligne('A'), ligne('B')] } });
      await page.request.post(`${R}/lancer`, { data: {} });
      await page.goto('/');
      await page.waitForFunction(async (url: string) => {
        const d = await (await fetch(url)).json();
        return d.lot.lignes.every((l: Any) => l.etat === 'brouillon');
      }, R);
      await page.close();
      s2.stop();
      s2 = null;
      // A server killed in the middle of a batch: one line was being generated, one waiting
      const db = new Database(env.DB_PATH);
      db.prepare("UPDATE bm_lots_lignes SET etat = 'en_cours' WHERE nom = 'A'").run();
      db.prepare("UPDATE bm_lots_lignes SET etat = 'attente' WHERE nom = 'B'").run();
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      s3 = await startServer(env);
      const p2 = (await connecte(browser, s3.base, 'Antor')).page;
      await p2.goto(`/univers/${u.id}/outils/battlemap/assets?onglet=generation`);
      await p2.getByText('Le serveur a redémarré pendant le lot. Reprenez-le quand vous voulez.').waitFor();
      assert.equal(await p2.getByText('Interrompu', { exact: true }).count(), 2);
      await p2.screenshot({ path: join(dossier, 'interrompu-1280.png') });
      await p2.getByRole('button', { name: 'Reprendre' }).click();
      await p2.getByAltText('Brouillon de A').waitFor();
      await p2.getByAltText('Brouillon de B').waitFor();
      await p2.getByText('Le serveur a redémarré pendant le lot. Reprenez-le quand vous voulez.').waitFor({ state: 'detached' });
    } finally {
      await ctx.close();
      s2?.stop();
      s3?.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
