// Tests d'ensemble de `kanevas-scenarios-suivi`, écrits depuis le besoin (fiche de la feature, docs/parcours.md B-60/B-18/B-19,
// docs/ecrans.md E-3, E-9, E-13) et non depuis le code. Vrai serveur en mode bouchon + Chromium piloté (harnais.test.ts).
// Les attendus sont des littéraux tirés du besoin ; les écarts à ce besoin rendent le test rouge, ils ne se corrigent pas ici.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, playwright, rx, type Server, skipBrowser, startServer, texte } from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';

interface Rep {
  status: number;
  body: Any;
  text: string;
}
async function appel(page: Any, methode: string, url: string, data?: unknown): Promise<Rep> {
  const r = await page.request.fetch(url, { method: methode, data, failOnStatusCode: false });
  const text = await r.text();
  let body: Any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* pas du JSON */
  }
  return { status: r.status(), body, text };
}

interface Monde {
  couronne: number;
  acte2: number;
  brumes: number; // campagne « En préparation », rien d'ouvert aux joueurs
  fin: number; // campagne « Terminée », « Présentation » ouverte
}

/** Le monde du critère, écrit par Antor par les routes des fiches (la création par fenêtre est celle de la tranche précédente). */
async function bati(antor: Any): Promise<Monde> {
  const cree = async (titre: string, sousType: string, parent?: number): Promise<number> => {
    const r = await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre, sousType, parent, sections: [{ titre: sousType === 'Campagne' ? 'Présentation' : 'Scénario' }] });
    assert.equal(r.status, 201, r.text);
    return r.body.id;
  };
  const statut = async (id: number, s: string) => assert.equal((await appel(antor, 'PATCH', `/api/univers/1/fiches/${id}`, { statut: s })).status, 200);
  const ouvrir = async (id: number) => {
    const f = await appel(antor, 'GET', `/api/univers/1/fiches/${id}`);
    const r = await appel(antor, 'PATCH', `/api/univers/1/fiches/${id}/sections/${f.body.sections[0].id}`, { joueursLisent: true });
    assert.equal(r.status, 200, r.text);
  };
  const couronne = await cree('La Couronne brisée', 'Campagne');
  await statut(couronne, 'en_cours');
  await ouvrir(couronne);
  const acte2 = await cree('Acte II — Le sceau brisé', 'Scénario', couronne);
  const brumes = await cree('Les Brumes de Vaëlis', 'Campagne');
  const fin = await cree('La Vieille Garde', 'Campagne');
  await statut(fin, 'terminee');
  await ouvrir(fin);
  return { couronne, acte2, brumes, fin };
}

async function tache(antor: Any, fiche: number, categorie: string, libelle: string): Promise<Rep> {
  return appel(antor, 'POST', `/api/univers/1/fiches/${fiche}/taches`, { categorie, libelle });
}

async function nouveauCR(page: Any, titre: string): Promise<void> {
  const avant = page.url();
  await page.getByRole('button', { name: /^Nouveau compte-rendu/ }).first().click();
  const f = page.getByRole('dialog');
  await f.getByLabel('Titre').fill(titre);
  await f.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.waitForURL((u: URL) => u.href !== avant && /\/fiche\/\d+$/.test(u.href));
}

describe('kanevas-scenarios-suivi : fiche aventure, blocs, E-3, E-13', { skip: skipBrowser }, () => {
  let s: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let m: Monde;
  let urlBase: string;

  before(async () => {
    s = await startServer({ KANEVAS_SANS_SEMIS: '' });
    urlBase = s.base;
    browser = await launch();
    antor = (await connecte(browser, s.base, 'antor')).page;
    lea = (await connecte(browser, s.base, 'Léa')).page;
    m = await bati(antor);
  });
  after(async () => {
    await browser?.close();
    s?.stop();
  });

  const fiche = async (page: Any, id: number) => {
    await page.goto(`/univers/1/fiche/${id}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
  };

  // ---------- B-60 : « Préparation » ----------
  test('preparation_antor_ajoute_et_coche_sans_recharger_lea_ne_voit_pas_le_bloc', async () => {
    // Casse si : le bloc n'est pas rendu, la coche recharge la page, ou le bloc est montré à une joueuse.
    await fiche(antor, m.couronne);
    await antor.getByRole('heading', { name: /^Préparation/ }).waitFor();
    assert.match(await texte(antor), /Rien à préparer pour l'instant\./);
    await antor.evaluate(() => ((window as Any).__marque = 'avant'));
    await antor.getByLabel('Nouvelle tâche').fill('Plan de la crypte');
    await antor.getByLabel('Catégorie').selectOption({ label: 'Cartes' });
    await antor.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await antor.getByText('Plan de la crypte', { exact: true }).waitFor();
    await antor.getByRole('checkbox').first().click();
    await antor.getByText(/Cochées \(1\)/).waitFor();
    assert.equal(await antor.evaluate(() => (window as Any).__marque), 'avant', 'la page a été rechargée');
    assert.match(await texte(antor), /Rien à préparer pour l'instant\./);
    await antor.screenshot({ path: '/tmp/suivi-preparation-antor.png', fullPage: true });

    await fiche(lea, m.couronne);
    await lea.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
    const t = await texte(lea);
    assert.ok(!/Préparation/.test(t), 'Léa voit « Préparation »');
    assert.ok(!/Plan de la crypte/.test(t), 'Léa lit une tâche');
    await lea.screenshot({ path: '/tmp/suivi-preparation-lea.png', fullPage: true });
  });

  test('preparation_decocher_remet_la_tache_dans_la_liste', async () => {
    // Casse si : décocher n'est pas offert ou ne remet pas la tâche en liste active.
    const id = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Décoche', sousType: 'Campagne' })).body.id;
    assert.equal((await tache(antor, id, 'pnj', 'Aldric le Gris')).status, 201);
    await fiche(antor, id);
    await antor.getByText('Aldric le Gris').waitFor();
    await antor.getByRole('checkbox').first().click();
    await antor.getByText(/Cochées \(1\)/).waitFor();
    await antor.getByText(/Cochées \(1\)/).click(); // le bloc plié s'ouvre
    await antor.getByRole('button', { name: 'Décocher Aldric le Gris' }).click();
    await antor.getByRole('checkbox').first().waitFor();
    assert.ok(!/Cochées/.test(await texte(antor)), 'la tâche décochée reste sous « Cochées »');
    assert.ok(!/Rien à préparer/.test(await texte(antor)));
    const l = await appel(antor, 'GET', `/api/univers/1/fiches/${id}/taches`);
    assert.equal(l.body.taches.length, 1);
    assert.equal(l.body.taches[0].faite, false);
  });

  test('preparation_existe_aussi_sur_un_scenario', async () => {
    // Casse si : le bloc n'est enregistré que pour les campagnes (« On a scenario as on a campaign »).
    await fiche(antor, m.acte2);
    await antor.getByRole('heading', { name: /^Préparation/ }).waitFor();
    await antor.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
  });

  test('preparation_libelle_200_accepte_201_vide_et_categorie_inconnue_refuses', async () => {
    // Casse si : les bornes 1 à 200 de B-60 / donnees.md ne sont plus tenues.
    const ok = await tache(antor, m.couronne, 'autre', 'x'.repeat(200));
    assert.equal(ok.status, 201, ok.text);
    for (const [cat, lib] of [['autre', 'x'.repeat(201)], ['autre', ''], ['autre', '   '], ['magie', 'Un libellé']] as const) {
      const r = await tache(antor, m.couronne, cat, lib);
      assert.equal(r.status, 400, `${cat}/${lib.length} : ${r.text}`);
    }
    for (const cat of ['monstres', 'pnj', 'cartes', 'deroulements', 'autre']) {
      assert.equal((await tache(antor, m.couronne, cat, `Tâche ${cat}`)).status, 201, cat);
    }
  });

  test('preparation_fermee_aux_joueurs_aux_inconnus_et_aux_fiches_non_aventure', async () => {
    // Casse si : le garde MJ de l'aventure saute (Léa, MJ d'un autre univers, id inconnu, fiche qui n'est pas une aventure).
    const perso = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'lieu', titre: 'Port-Test' })).body.id;
    const mira = (await connecte(browser, urlBase, 'Mira')).page;
    for (const [qui, page, fid] of [['lea', lea, m.couronne], ['mira', mira, m.couronne], ['antor/lieu', antor, perso], ['antor/inconnu', antor, 999999]] as const) {
      const g = await appel(page, 'GET', `/api/univers/1/fiches/${fid}/taches`);
      assert.equal(g.status, 404, `${qui} GET : ${g.text}`);
      assert.ok(!/Plan de la crypte/.test(g.text), `${qui} lit un libellé`);
      const p = await tache(page, fid, 'autre', 'Intrus');
      assert.equal(p.status, 404, `${qui} POST : ${p.text}`);
    }
    const autre = await appel(antor, 'GET', `/api/univers/2/fiches/${m.couronne}/taches`);
    assert.equal(autre.status, 404, 'adresse d\'un autre univers');
    const l = await appel(antor, 'GET', `/api/univers/1/fiches/${m.couronne}/taches`);
    assert.ok(!l.body.taches.some((t: Any) => t.libelle === 'Intrus'));
  });

  test('preparation_cocher_refuse_a_lea', async () => {
    // Casse si : PUT /api/taches/:id ne regarde pas le rôle.
    const t = (await tache(antor, m.couronne, 'autre', 'À ne pas cocher')).body;
    const r = await appel(lea, 'PUT', `/api/taches/${t.id}`, { faite: true });
    assert.equal(r.status, 404, r.text);
    const l = await appel(antor, 'GET', `/api/univers/1/fiches/${m.couronne}/taches`);
    assert.equal(l.body.taches.find((x: Any) => x.id === t.id).faite, false);
  });

  test('preparation_absente_en_mode_joueur', async () => {
    // Casse si : « Préparation » n'est pas caché au MJ en mode Joueur.
    await fiche(antor, m.couronne);
    await antor.getByRole('heading', { name: /^Préparation/ }).waitFor();
    await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
    await antor.getByRole('heading', { name: /^Préparation/ }).waitFor({ state: 'detached' });
    await antor.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
    await antor.getByRole('radio', { name: 'Mode MJ' }).click();
    await antor.getByRole('heading', { name: /^Préparation/ }).waitFor();
  });

  // ---------- B-60 / B-19 : « Comptes-rendus » ----------
  test('cr_lea_ecrit_seance_12_depuis_la_campagne_en_tete_du_bloc_de_e13_et_de_e3', async () => {
    // Casse si : le CR ne nomme pas la campagne, ou n'est pas en tête d'un des trois endroits.
    const ancien = await appel(antor, 'POST', `/api/univers/1/comptes-rendus`, { campagneId: m.couronne, titre: 'Séance 11', texte: 'Avant.' });
    assert.equal(ancien.status, 201, ancien.text);
    await fiche(lea, m.couronne);
    await lea.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
    await nouveauCR(lea, 'Séance 12');
    await lea.getByText('Campagne : La Couronne brisée').waitFor();
    await lea.screenshot({ path: '/tmp/suivi-cr-lea.png', fullPage: true });

    await fiche(lea, m.couronne);
    await lea.getByText('Séance 12').first().waitFor();
    const bloc = await texte(lea);
    assert.ok(bloc.indexOf('Séance 12') < bloc.indexOf('Séance 11'), 'ordre du bloc Comptes-rendus');

    await lea.goto('/univers/1/comptes-rendus');
    await lea.getByText('Séance 12').first().waitFor();
    const e13 = await texte(lea);
    assert.ok(e13.indexOf('Séance 12') < e13.indexOf('Séance 11'), 'ordre de E-13');
    assert.match(e13, /La Couronne brisée/);

    await lea.goto('/univers/1');
    await lea.getByText('Séance 12').first().waitFor();
    const e3 = await texte(lea);
    assert.ok(e3.indexOf('Séance 12') < e3.indexOf('Séance 11'), 'ordre de « Derniers comptes-rendus »');
    assert.ok(e3.indexOf('Derniers comptes-rendus') < e3.indexOf('Séance 12'));
  });

  test('cr_depuis_acte_ii_nomme_acte_ii_a_antor_et_rien_a_lea', async () => {
    // Casse si : le titre d'un scénario fermé aux joueurs fuit par le CR (ligne, E-13, E-3, API).
    await fiche(antor, m.acte2);
    await antor.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
    await nouveauCR(antor, 'Séance Acte II');
    const url = antor.url();
    await antor.getByText('Campagne : Acte II — Le sceau brisé').waitFor();
    // le MJ lit aussi la ligne comme lien vers la fiche de l'aventure
    await antor.getByRole('link', { name: /Acte II — Le sceau brisé/ }).first().waitFor();

    await lea.goto(url.replace(urlBase, ''));
    await lea.getByText('Séance Acte II').first().waitFor();
    assert.ok(!/Campagne :/.test(await texte(lea)), 'Léa voit une ligne « Campagne »');
    assert.ok(!/Acte II — Le sceau/.test(await texte(lea)), 'le titre du scénario fermé fuit sur la fiche du CR');

    await lea.goto('/univers/1/comptes-rendus');
    await lea.getByText('Séance Acte II').first().waitFor();
    assert.ok(!/Acte II — Le sceau/.test(await texte(lea)), 'fuite dans E-13');
    await lea.goto('/univers/1');
    await lea.getByText('Séance Acte II').first().waitFor();
    assert.ok(!/Acte II — Le sceau/.test(await texte(lea)), 'fuite dans E-3');
    const api = await appel(lea, 'GET', '/api/univers/1/comptes-rendus');
    assert.ok(api.text.includes('Séance Acte II'), 'le CR lui-même reste lisible');
    assert.ok(!api.text.includes('Acte II — Le sceau'), 'fuite du titre dans l\'API');
    assert.ok(!api.text.includes(`"campagneId":${m.acte2}`), 'fuite de l\'identifiant dans l\'API');
  });

  test('cr_filtre_par_aventure_lisible_ne_rend_que_ses_cr_et_illisible_repond_404', async () => {
    // Casse si : le filtre `?campagne=` ne filtre plus, ou répond 200 pour une aventure que l'appelant ne lit pas (E-13 : « 404 otherwise, like the sheet »).
    const ok = await appel(lea, 'GET', `/api/univers/1/comptes-rendus?campagne=${m.couronne}`);
    assert.equal(ok.status, 200);
    assert.ok(ok.body.comptesRendus.length >= 1);
    assert.ok(ok.body.comptesRendus.every((c: Any) => c.campagneId === m.couronne), 'un CR d\'une autre aventure dans le filtre');
    assert.ok(!ok.text.includes('Séance Acte II'));
    const ferme = await appel(lea, 'GET', `/api/univers/1/comptes-rendus?campagne=${m.acte2}`);
    assert.equal(ferme.status, 404, `aventure illisible : ${ferme.text}`);
    const brumes = await appel(lea, 'GET', `/api/univers/1/comptes-rendus?campagne=${m.brumes}`);
    assert.equal(brumes.status, 404, `campagne fermée : ${brumes.text}`);
  });

  test('cr_echecs_aventure_fermee_inconnue_non_aventure_titre_vide', async () => {
    // Casse si : Léa peut écrire un CR sur une aventure qu'elle ne lit pas, ou sur une fiche qui n'est pas une aventure.
    const avant = (await appel(antor, 'GET', '/api/univers/1/comptes-rendus')).body.total;
    for (const cible of [m.acte2, m.brumes, 999999]) {
      const r = await appel(lea, 'POST', '/api/univers/1/comptes-rendus', { campagneId: cible, titre: 'Intrus', texte: 'x' });
      assert.ok(r.status === 404 || r.status === 400, `cible ${cible} : ${r.status} ${r.text}`);
    }
    const lieu = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'lieu', titre: 'Port-Cible' })).body.id;
    const r = await appel(antor, 'POST', '/api/univers/1/comptes-rendus', { campagneId: lieu, titre: 'Sur un lieu', texte: 'x' });
    assert.ok(r.status === 404 || r.status === 400, `non aventure : ${r.status}`);
    assert.equal((await appel(antor, 'GET', '/api/univers/1/comptes-rendus')).body.total, avant, 'un CR a été écrit malgré le refus');
    // titre vide dans la fenêtre : « Donnez un titre. », la fenêtre reste ouverte
    await fiche(lea, m.couronne);
    await lea.getByRole('button', { name: /^Nouveau compte-rendu/ }).first().click();
    const f = lea.getByRole('dialog');
    await f.getByLabel('Texte').fill('Un texte sans titre');
    await f.getByRole('button', { name: 'Créer', exact: true }).click();
    await f.getByText('Donnez un titre.').waitFor();
    assert.equal(await f.getByLabel('Texte').inputValue(), 'Un texte sans titre');
  });

  // ---------- E-3 ----------
  test('e3_campagnes_en_cours_ne_liste_que_les_campagnes_en_cours_lues', async () => {
    // Casse si : le bloc liste une campagne en préparation/terminée, un scénario, ou une campagne fermée à Léa.
    await antor.goto('/univers/1');
    await antor.getByText('La Couronne brisée').first().waitFor();
    const a = await texte(antor);
    const bloc = a.slice(a.indexOf('Campagnes en cours'), a.indexOf('Derniers comptes-rendus'));
    assert.match(bloc, /La Couronne brisée/);
    assert.match(bloc, /En cours/);
    for (const hors of ['Les Brumes de Vaëlis', 'La Vieille Garde', 'Acte II']) assert.ok(!bloc.includes(hors), `« ${hors} » dans « Campagnes en cours »`);
    await antor.screenshot({ path: '/tmp/suivi-e3-antor.png', fullPage: true });

    // une campagne « En cours » dont rien n'est ouvert aux joueurs : pour Léa, elle n'existe pas
    const secrete = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Le Complot de Port-Sel', sousType: 'Campagne', sections: [{ titre: 'Présentation' }] })).body.id;
    assert.equal((await appel(antor, 'PATCH', `/api/univers/1/fiches/${secrete}`, { statut: 'en_cours' })).status, 200);
    await lea.goto('/univers/1');
    await lea.getByText('La Couronne brisée').first().waitFor();
    const l = await texte(lea);
    assert.ok(!l.includes('Le Complot de Port-Sel'), 'campagne fermée visible de Léa dans E-3');
    assert.match(l, /Campagnes en cours/);
    assert.match(l, /Derniers comptes-rendus/);
    assert.ok(!/Préparation/.test(l), 'Léa voit « Préparation »');
    await lea.screenshot({ path: '/tmp/suivi-e3-lea.png', fullPage: true });
    await antor.goto('/univers/1');
    await antor.getByText('Le Complot de Port-Sel').first().waitFor();
  });

  test('e3_preparation_liste_les_taches_ouvertes_des_aventures_en_cours_cinq_au_plus', async () => {
    // Casse si : le bloc lit autre chose que les aventures « En cours », compte les cochées, ou dépasse cinq par aventure.
    const id = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Les Cinq Tours', sousType: 'Campagne' })).body.id;
    await appel(antor, 'PATCH', `/api/univers/1/fiches/${id}`, { statut: 'en_cours' });
    const ids: number[] = [];
    for (let i = 1; i <= 6; i++) ids.push((await tache(antor, id, 'monstres', `Tour numéro ${i}`)).body.id);
    assert.equal((await appel(antor, 'PUT', `/api/taches/${ids[0]}`, { faite: true })).status, 200); // la 1 est cochée : elle sort
    await tache(antor, m.brumes, 'autre', 'Tâche de campagne en préparation');
    await antor.goto('/univers/1');
    await antor.getByText('Tour numéro 2').waitFor();
    const t = await texte(antor);
    const prep = t.slice(t.lastIndexOf('Préparation'));
    for (const n of [2, 3, 4, 5, 6]) assert.ok(prep.includes(`Tour numéro ${n}`), `Tour ${n}`);
    assert.ok(!prep.includes('Tour numéro 1'), 'tâche cochée listée');
    assert.ok(!prep.includes('Tâche de campagne en préparation'), 'tâche d\'une aventure pas en cours');
    // cinq premières non cochées, les plus anciennes d'abord : la 7e n'existe pas ici, donc on en ajoute une
    await tache(antor, id, 'monstres', 'Tour numéro 7');
    await antor.goto('/univers/1');
    await antor.getByText('Tour numéro 2').waitFor();
    const t2 = await texte(antor);
    assert.ok(!t2.slice(t2.lastIndexOf('Préparation')).includes('Tour numéro 7'), 'plus de cinq tâches pour une aventure');
    assert.ok(t2.slice(t2.lastIndexOf('Préparation')).includes('Tour numéro 6'));
  });

  test('e3_statut_change_une_aventure_en_cours_quitte_les_campagnes_en_cours', async () => {
    // Casse si : le bloc lit un autre critère que le statut courant.
    const id = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Éphémère', sousType: 'Campagne', sections: [{ titre: 'Présentation' }] })).body.id;
    await appel(antor, 'PATCH', `/api/univers/1/fiches/${id}`, { statut: 'en_cours' });
    await antor.goto('/univers/1');
    await antor.getByText('Éphémère').first().waitFor();
    await appel(antor, 'PATCH', `/api/univers/1/fiches/${id}`, { statut: 'terminee' });
    await antor.goto('/univers/1');
    await antor.getByText('La Couronne brisée').first().waitFor();
    assert.ok(!(await texte(antor)).includes('Éphémère'));
  });

  // ---------- B-18 amendé : ce que Léa voit des aventures ----------
  test('e8_lea_voit_les_campagnes_ouvertes_avec_statut_pas_les_fermees_ni_les_scenarios_fermes', async () => {
    // Casse si : B-18 amendé (le MJ décide ce que les joueurs voient) n'est pas tenu.
    await lea.goto('/univers/1/fiches/aventures');
    await lea.getByText('La Couronne brisée').first().waitFor();
    const t = await texte(lea);
    assert.match(t, /La Vieille Garde/);
    assert.match(t, /Terminée/);
    for (const cache of ['Les Brumes de Vaëlis', 'Acte II']) assert.ok(!t.includes(cache), `Léa voit « ${cache} »`);
    const api = await appel(lea, 'GET', '/api/univers/1/fiches?type=aventure');
    assert.ok(!api.text.includes('Les Brumes de Vaëlis') && !api.text.includes('Acte II'), 'fuite par l\'API');
    assert.equal((await appel(lea, 'GET', `/api/univers/1/fiches/${m.brumes}`)).status, 404);
    assert.equal((await appel(lea, 'GET', `/api/univers/1/fiches/${m.acte2}`)).status, 404);
  });

  // ---------- Retrait de E-6, E-7 et de l'entrée de la barre ----------
  test('retrait_adresses_campagnes_et_scenarios_repondent_page_introuvable_barre_sans_campagnes', async () => {
    // Casse si : un écran, une route ou l'entrée de barre E-6/E-7 subsiste.
    for (const page of [antor, lea]) {
      for (const adresse of ['/univers/1/campagnes', '/univers/1/campagnes/1', '/univers/1/scenarios/1']) {
        await page.goto(adresse);
        await page.getByText('Page introuvable.').waitFor();
      }
      await page.goto('/univers/1');
      await page.getByRole('link', { name: 'Comptes-rendus', exact: true }).waitFor();
      assert.equal(await page.getByRole('link', { name: /^Campagnes$/ }).count(), 0, 'entrée « Campagnes » dans la barre');
    }
    for (const chemin of ['campagnes', 'scenarios']) {
      const r = await appel(antor, 'GET', `/api/univers/1/${chemin}`);
      assert.equal(r.status, 404, `${chemin} : ${r.text}`);
    }
  });

  test('retrait_import_des_campagnes_et_scenarios_repond_404_et_aucun_compteur_dans_les_lots', async () => {
    // Casse si : les routes PUT …/campagnes/:cle ou …/scenarios/:scle répondent encore, ou si un lot compte « campagnes » / « scénarios ».
    const h = { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json' };
    const b = `${s.base}/api/import/v1/univers/4`;
    const put = (u: string, d: unknown) => fetch(u, { method: 'PUT', headers: h, body: JSON.stringify(d) });
    assert.equal((await put(`${b}/campagnes/x`, { nom: 'X' })).status, 404);
    assert.equal((await put(`${b}/campagnes/x`, { nom: 'X', statut: 'active' })).status, 404);
    assert.equal((await put(`${b}/scenarios/y`, { titre: 'Y' })).status, 404);
    assert.equal((await put(`${b}/campagnes/x/scenarios/y`, { titre: 'Y' })).status, 404);
    const lot = (await (await fetch(`${b}/lots`, { method: 'POST', headers: h })).json()) as Any;
    const r = await put(`${b}/fiches/lieu:test-lot?lot=${lot.lotId}`, { type: 'lieu', titre: 'Havre-Test', sections: [] });
    assert.ok(r.status === 200 || r.status === 201, String(r.status));
    await fetch(`${b}/lots/${lot.lotId}/clore`, { method: 'POST', headers: h });
    const rapport = await (await fetch(`${b}/lots/${lot.lotId}`, { headers: h })).text();
    assert.match(rapport, /"fiches"/);
    assert.ok(!/campagnes|scenarios|scénarios/i.test(rapport), `compteur de campagnes/scénarios dans le lot : ${rapport}`);
    // E-18 : la ligne du lot ne parle ni de « Campagnes » ni de « Scénarios »
    await antor.goto('/univers/4/acces-api');
    await antor.getByText(/Fiches : \d+ créée/).first().waitFor();
    const e18 = await texte(antor);
    assert.ok(!/Campagnes :|Scénarios :/.test(e18), 'E-18 montre encore une ligne Campagnes/Scénarios');
    await antor.screenshot({ path: '/tmp/suivi-e18.png', fullPage: true });
  });

  test('retrait_assistant_ne_cree_plus_de_campagne_ni_de_scenario_et_ne_liste_plus_les_campagnes', async () => {
    // Casse si : un outil creer_campagne / creer_scenario / lister_campagnes répond encore.
    const avant = (await appel(antor, 'GET', '/api/univers/1/fiches?type=aventure')).body.fiches.length;
    for (const message of ['Crée une campagne « Les Brumes d\'Azur »', 'Crée un scénario « Acte IX » dans La Couronne brisée', 'Liste les campagnes']) {
      const r = await appel(antor, 'POST', '/api/univers/1/assistant/messages', { message, historique: [] });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(r.body.evenements, [], `événement pour « ${message} »`);
      assert.match(r.body.reponse, /Je ne sais répondre qu'à des demandes de test/, message);
    }
    const apres = (await appel(antor, 'GET', '/api/univers/1/fiches?type=aventure')).body.fiches.length;
    assert.equal(apres, avant, 'l\'assistant a créé une aventure');
  });

  // ---------- Suppression d'une aventure (AD-119 amendé) ----------
  test('suppression_annonce_taches_scenarios_et_cr_puis_acte_ii_a_la_racine_et_cr_dit_aventure_supprimee', async () => {
    // Casse si : le bilan ne compte pas les trois choses, les scénarios ne passent pas à la racine, ou « Aventure supprimée » fuit à Léa.
    const camp = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Campagne à supprimer', sousType: 'Campagne', sections: [{ titre: 'Présentation' }] })).body.id;
    const sc = (await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Scénario orphelin', sousType: 'Scénario', parent: camp, sections: [{ titre: 'Scénario' }] })).body.id;
    await tache(antor, camp, 'pnj', 'Premier PNJ');
    await tache(antor, camp, 'cartes', 'Seconde carte');
    const f = await appel(antor, 'GET', `/api/univers/1/fiches/${camp}`);
    await appel(antor, 'PATCH', `/api/univers/1/fiches/${camp}/sections/${f.body.sections[0].id}`, { joueursLisent: true });
    await appel(antor, 'POST', '/api/univers/1/comptes-rendus', { campagneId: camp, titre: 'CR orphelin MJ', texte: 'a' });
    await appel(lea, 'POST', '/api/univers/1/comptes-rendus', { campagneId: camp, titre: 'CR orphelin Léa', texte: 'b' });

    await fiche(antor, camp);
    await antor.getByRole('button', { name: /^Autres actions/ }).first().click();
    await antor.getByRole('menuitem', { name: /Supprimer la fiche/ }).click();
    const boite = antor.getByRole('alertdialog');
    await boite.waitFor();
    await boite.getByText(/2 tâches de préparation supprimées/).waitFor();
    const t = await boite.innerText();
    assert.match(t, /1 scénarios?[^.]*à la racine/);
    assert.match(t, /2 comptes-rendus[^.]*sans aventure/);
    await antor.screenshot({ path: '/tmp/suivi-bilan.png' });
    await boite.getByRole('button', { name: /^Supprimer/ }).last().click();
    await antor.getByText('Fiche supprimée.').waitFor();

    const racine = await appel(antor, 'GET', `/api/univers/1/fiches/${sc}`);
    assert.equal(racine.status, 200);
    assert.deepEqual(racine.body.ancetres, [], 'Acte II n\'est pas à la racine');
    assert.equal((await appel(antor, 'GET', `/api/univers/1/fiches/${camp}`)).status, 404);

    const liste = (await appel(antor, 'GET', '/api/univers/1/comptes-rendus')).body.comptesRendus.find((c: Any) => c.titre === 'CR orphelin MJ');
    await antor.goto(`/univers/1/fiche/${liste.id}`);
    await antor.getByText('Campagne : Aventure supprimée').waitFor();
    await antor.goto('/univers/1/comptes-rendus');
    await antor.getByText('Aventure supprimée').first().waitFor();

    const cr = await appel(lea, 'GET', '/api/univers/1/comptes-rendus');
    assert.ok(cr.text.includes('CR orphelin Léa'));
    assert.ok(!/supprimée/i.test(cr.text) && !/"campagneSupprimee":true/.test(cr.text), `Léa apprend qu'une aventure est supprimée : ${cr.text}`);
    await lea.goto('/univers/1/comptes-rendus');
    await lea.getByText('CR orphelin Léa').first().waitFor();
    assert.ok(!/Aventure supprimée/.test(await texte(lea)), 'Léa lit « Aventure supprimée »');
  });

  test('suppression_en_mode_joueur_le_mj_ne_lit_pas_aventure_supprimee', async () => {
    // Casse si : « Aventure supprimée » est montré à un MJ en mode Joueur (il lit comme un joueur, E-9 « GM en mode Joueur »).
    const liste = (await appel(antor, 'GET', '/api/univers/1/comptes-rendus')).body.comptesRendus.find((c: Any) => c.titre === 'CR orphelin MJ');
    assert.equal(liste.campagneSupprimee, true, 'le MJ doit lire « Aventure supprimée »');
    const joueur = await appel(antor, 'GET', '/api/univers/1/comptes-rendus?mode=joueur');
    assert.ok(!/"campagneSupprimee":true/.test(joueur.text), `le serveur nomme l'aventure supprimée à un MJ en mode Joueur : ${joueur.text}`);
    await antor.goto(`/univers/1/fiche/${liste.id}`);
    await antor.getByText('Campagne : Aventure supprimée').waitFor();
    await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
    await antor.getByText('Campagne : Aventure supprimée').waitFor({ state: 'detached' });
    await antor.screenshot({ path: '/tmp/suivi-cr-mode-joueur.png', fullPage: true });
  });
});

// ---------- E-3 vide ----------
describe('kanevas-scenarios-suivi : états vides de E-3 et de la fiche', { skip: skipBrowser }, () => {
  let s: Server;
  let browser: Any;
  before(async () => {
    s = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    s?.stop();
  });
  test('e3_vide_dit_aucune_campagne_en_cours_et_rien_a_preparer', async () => {
    // Casse si : l'état vide d'un des blocs a changé de texte ou si le bloc Préparation est montré à une joueuse.
    const { page } = await connecte(browser, s.base, 'antor');
    await page.goto('/univers/1');
    await page.getByText('Aucune campagne en cours.').waitFor();
    await page.getByText(rx("Rien à préparer pour l'instant.")).waitFor();
    await page.getByText(rx("Aucun compte-rendu pour l'instant.")).first().waitFor();
    const { page: l } = await connecte(browser, s.base, 'Léa');
    await l.goto('/univers/1');
    await l.getByText('Aucune campagne en cours.').waitFor();
    assert.ok(!/Préparation/.test(await texte(l)));
  });
  test('e13_vide_joueuse_dit_aucun_compte_rendu_a_lire', async () => {
    const { page } = await connecte(browser, s.base, 'Léa');
    await page.goto('/univers/1/comptes-rendus');
    await page.getByText(rx("Aucun compte-rendu à lire pour l'instant.")).waitFor();
  });
});

// ---------- Type « Aventure » désactivé ----------
describe('kanevas-scenarios-suivi : type Aventure désactivé (AD-122 (5))', { skip: skipBrowser }, () => {
  let s: Server;
  let browser: Any;
  before(async () => {
    s = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    s?.stop();
  });
  test('desactiver_aventure_garde_les_aventures_lisibles_avec_blocs_menu_et_e3_puis_reactiver', async () => {
    // Casse si : la désactivation cache des données (blocs, menu de statut, E-3) ou laisse « Nouvelle aventure ».
    const { page } = await connecte(browser, s.base, 'antor');
    const m = await bati(page);
    await tache(page, m.couronne, 'cartes', 'Plan de la crypte');
    await page.goto('/univers/1/parametres');
    const bascule = page.getByRole('radiogroup', { name: 'Aventure' });
    const reponse = page.waitForResponse((r: Any) => /\/types\/aventure/.test(r.url()) && r.request().method() === 'PUT');
    await bascule.getByRole('radio', { name: 'Désactivé' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Désactiver', exact: true }).click();
    assert.ok((await reponse).ok());
    await page.goto('/univers/1');
    await page.getByText('La Couronne brisée').first().waitFor();
    assert.equal(await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Aventures', exact: true }).count(), 0, 'l\'entrée reste dans la barre');
    await page.goto('/univers/1/fiches/aventures');
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.getByRole('button', { name: /Nouvelle aventure/ }).count(), 0, '« Nouvelle aventure » existe');

    await page.goto(`/univers/1/fiche/${m.couronne}`);
    await page.getByRole('heading', { level: 1, name: 'La Couronne brisée' }).waitFor();
    await page.getByRole('heading', { name: /^Préparation/ }).waitFor();
    await page.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
    await page.getByText('Plan de la crypte').waitFor();
    await page.getByRole('button', { name: /En cours/ }).first().click(); // menu de statut encore là
    await page.getByRole('menu').getByRole('menuitem', { name: 'Terminée' }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: '/tmp/suivi-type-desactive.png', fullPage: true });
    const lea = (await connecte(browser, s.base, 'Léa')).page;
    await lea.goto(`/univers/1/fiche/${m.couronne}`);
    await lea.getByRole('heading', { level: 1, name: 'La Couronne brisée' }).waitFor();
    // création refusée par l'API
    const c = await appel(page, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Interdite', sousType: 'Campagne' });
    assert.ok(c.status >= 400 && c.status < 500, `création d'une aventure type désactivé : ${c.status}`);

    // réactivation
    await page.goto('/univers/1/parametres');
    const rep2 = page.waitForResponse((r: Any) => /\/types\/aventure/.test(r.url()) && r.request().method() === 'PUT');
    await page.getByRole('radiogroup', { name: 'Aventure' }).getByRole('radio', { name: /^Activé$/ }).click();
    assert.ok((await rep2).ok());
    await page.goto('/univers/1');
    await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Aventures', exact: true }).waitFor();
  });
});
void playwright; void rx; void attendre;
