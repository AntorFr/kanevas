// Black-box tests of kanevas-suivi written from the need (docs/parcours.md B-15 to B-20, docs/ecrans.md
// E-3 blocks, E-6, E-7, E-13, the feature's exit criterion), not from the code. Expected values are
// literals taken from the docs. Real server in stub mode + real Chromium, like the other e2e files.
// Screenshots go to /tmp (outside the tree).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  type Any,
  allerMembres,
  ajouterMembre,
  attendre as attendreBase,
  connecte,
  creerUnivers,
  launch,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
  texte,
  voit,
  type Server,
} from './harnais.test.js';
import { changerStatut, declencheurStatut, ouvrirNouveauScenario, statutAffiche } from './suivi-aide.js';

const PREUVES = '/tmp/kanevas-preuves';

async function attendre(page: Any): Promise<void> {
  await attendreBase(page);
  await page.waitForTimeout(200);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '…'));
  await attendreBase(page);
}

describe('kanevas-suivi, du besoin', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;

  before(async () => {
    srv = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  async function compte(nom: string) {
    const affiche = nom === 'lea' ? 'Léa' : nom[0]!.toUpperCase() + nom.slice(1);
    return connecte(browser, srv.base, affiche);
  }

  /** Antor creates universe `nom`; the listed accounts are connected once, then added as Joueurs. */
  async function table(nom: string, joueurs: string[] = ['lea']) {
    const antor = await compte('antor');
    for (const j of joueurs) await (await compte(j)).ctx.close();
    await creerUnivers(antor.page, nom);
    await antor.page.waitForURL(/\/univers\/\d+/);
    const idUnivers = /\/univers\/(\d+)/.exec(antor.page.url())![1]!;
    await allerMembres(antor.page);
    for (const j of joueurs) {
      await ajouterMembre(antor.page, j);
      await antor.page.getByRole('button', { name: `Retirer ${j}`, exact: true }).waitFor();
    }
    await antor.page.goto(`/univers/${idUnivers}`);
    await attendre(antor.page);
    return { antor, idUnivers };
  }

  async function allerCampagnes(page: Any, idUnivers: string) {
    await page.goto(`/univers/${idUnivers}/campagnes`);
    await attendre(page);
  }

  async function creerCampagne(page: Any, nom: string) {
    await page.getByLabel(/^Nom/).fill(nom);
    await page.getByRole('button', { name: rxExact('Créer la campagne') }).click();
    await attendre(page);
  }

  async function ouvrirCampagne(page: Any, nom: string) {
    await page.locator('main').getByRole('link', { name: new RegExp('^' + rx(nom).source) }).first().click();
    await page.getByRole('heading', { name: nom, level: 1 }).waitFor();
    await attendre(page);
  }

  async function ajouterTache(page: Any, libelle: string, categorie?: string) {
    await page.getByRole('form', { name: 'Nouvelle tâche' }).getByRole('textbox').fill(libelle);
    if (categorie) await page.getByLabel('Catégorie').selectOption({ label: categorie });
    await page.getByRole('button', { name: rxExact('Ajouter') }).click();
    await attendre(page);
  }

  async function nouveauCR(page: Any, titre: string, corps = '') {
    await page.getByRole('button', { name: rxExact('Nouveau compte-rendu') }).click();
    const f = page.getByRole('dialog');
    await f.getByLabel('Titre').fill(titre);
    if (corps) await f.getByLabel('Texte').fill(corps);
    await f.getByRole('button', { name: rxExact('Publier') }).click();
    await page.getByRole('heading', { name: titre, level: 1 }).waitFor();
    await attendre(page);
  }

  /** Titles of the entries of the list of comptes-rendus (E-13), in display order. */
  async function titresCR(page: Any, titres: string[]): Promise<string[]> {
    const t = await texte(page);
    return titres.filter((x) => t.includes(x)).sort((a, b) => t.indexOf(a) - t.indexOf(b));
  }

  // ---------- Critère de sortie : le parcours entier ----------
  test('B-15 à B-20, critère de sortie : Antor prépare, Léa raconte, Teo lit', async () => {
    const { antor, idUnivers } = await table("Lame d'Ébène", ['lea', 'teo']);
    // Teo is not yet a member: retire him to follow the criterion (connected once, then added by Antor).
    // (He was added above; the "no role" refusal is tested separately.)
    const p = antor.page;

    // Antor creates and activates the campaign.
    await allerCampagnes(p, idUnivers);
    await voit(p, 'Aucune campagne pour l\'instant.');
    await creerCampagne(p, 'La Couronne brisée');
    await voit(p, 'La Couronne brisée');
    await changerStatut(p, 'Active', 'La Couronne brisée');
    await attendre(p);
    await p.reload();
    await attendre(p);
    assert.equal(await statutAffiche(p, 'La Couronne brisée'), 'Active');

    // A scenario, written.
    await ouvrirCampagne(p, 'La Couronne brisée');
    const urlCampagne = p.url();
    await ouvrirNouveauScenario(p);
    await p.getByLabel('Titre').fill('Acte II — Le sceau brisé');
    await p.getByRole('button', { name: rxExact('Créer le scénario') }).click();
    await p.getByRole('heading', { name: 'Acte II — Le sceau brisé', level: 1 }).waitFor();
    await attendre(p);
    await voit(p, 'Rien d\'écrit pour l\'instant.');
    const urlScenario = p.url();
    await p.getByRole('button', { name: rxExact('Modifier') }).click();
    await p.getByLabel('Contenu').fill('Les héros descendent dans la crypte.');
    await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(p);
    await voit(p, 'Les héros descendent dans la crypte.');

    // A task: added, ticked (leaves the active list, stays among the done), unticked.
    await p.goto(urlCampagne);
    await attendre(p);
    await ajouterTache(p, 'Plan de la crypte', 'Cartes');
    await voit(p, 'Plan de la crypte');
    await p.getByRole('checkbox', { name: rx('Plan de la crypte') }).click();
    await attendre(p);
    await voit(p, 'Cochées (1)');
    await voit(p, 'Rien à préparer pour l\'instant.');
    await p.screenshot({ path: `${PREUVES}/suivi-coche.png` });
    await p.getByRole('button', { name: rxExact('Décocher') }).or(p.getByRole('link', { name: rxExact('Décocher') })).first().click();
    await attendre(p);
    assert.ok(!(await texte(p)).includes('Cochées (1)'));
    assert.ok((await texte(p)).includes('Cartes'));
    assert.ok(!(await texte(p)).includes('Rien à préparer pour l\'instant.'));

    // Léa sees the campaign, never the scenario nor the preparation; nothing about them in the answers.
    const lea = await compte('lea');
    const corpsReponses: string[] = [];
    lea.page.on('response', async (r: Any) => {
      if (r.url().includes('/api/')) corpsReponses.push(await r.text().catch(() => ''));
    });
    await lea.page.goto(urlCampagne);
    await attendre(lea.page);
    let t = await texte(lea.page);
    assert.ok(t.includes('La Couronne brisée'));
    assert.ok(t.includes('Active'));
    assert.ok(!t.includes('Scénarios'));
    assert.ok(!t.includes('Préparation'));
    assert.ok(!t.includes('Acte II'));
    assert.ok(!t.includes('Plan de la crypte'));
    assert.ok(!t.includes('Nouveau scénario'));
    for (const c of corpsReponses) {
      assert.ok(!c.includes('Acte II'), 'scenario title leaked in a response');
      assert.ok(!c.includes('Plan de la crypte'), 'task leaked in a response');
      assert.ok(!/scenario|tache/i.test(c), 'scenario or task key leaked in a response: ' + c.slice(0, 200));
    }
    await lea.page.screenshot({ path: `${PREUVES}/suivi-lea-campagne.png` });
    await lea.page.goto(urlScenario);
    await attendre(lea.page);
    t = await texte(lea.page);
    assert.ok(t.includes('Page introuvable.'));
    assert.ok(!t.includes('Acte II'));
    assert.ok(!t.includes('crypte'));

    // Léa writes a compte-rendu; Teo reads it, cannot modify it.
    await lea.page.goto(urlCampagne);
    await attendre(lea.page);
    await voit(lea.page, 'Aucun compte-rendu à lire pour l\'instant.');
    await nouveauCR(lea.page, 'La nuit des sceaux', 'Nous avons ouvert la crypte.');
    await voit(lea.page, 'Campagne : La Couronne brisée');
    await voit(lea.page, 'Nous avons ouvert la crypte.');
    const urlCR = lea.page.url();
    await voit(lea.page, 'Modifier');
    assert.ok(await section(lea.page, 'Compte-rendu').getByRole('button', { name: rxExact('Modifier') }).isVisible());

    const teo = await compte('teo');
    await teo.page.goto(urlCR);
    await attendre(teo.page);
    t = await texte(teo.page);
    assert.ok(t.includes('Nous avons ouvert la crypte.'));
    assert.equal(await teo.page.getByRole('button', { name: rxExact('Modifier') }).count(), 0);
    await teo.page.screenshot({ path: `${PREUVES}/suivi-teo-cr.png` });

    // The campaign link on the CR leads back to E-6.
    await teo.page.getByRole('link', { name: rx('La Couronne brisée') }).click();
    await teo.page.getByRole('heading', { name: 'La Couronne brisée', level: 1 }).waitFor();

    // Order: Antor writes a later one; it comes first; retouching the first does not make it climb.
    await p.goto(urlCampagne);
    await attendre(p);
    await nouveauCR(p, 'Le retour du roi', 'Texte du MJ.');
    await p.getByRole('link', { name: rx('Comptes-rendus') }).first().click();
    await attendre(p);
    assert.deepEqual(await titresCR(p, ['La nuit des sceaux', 'Le retour du roi']), ['Le retour du roi', 'La nuit des sceaux']);
    await lea.page.getByRole('button', { name: rxExact('Modifier') }).click();
    await lea.page.getByRole('textbox').fill('Retouché par Léa.');
    await lea.page.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(lea.page);
    await p.reload();
    await attendre(p);
    assert.deepEqual(await titresCR(p, ['La nuit des sceaux', 'Le retour du roi']), ['Le retour du roi', 'La nuit des sceaux']);
    await p.screenshot({ path: `${PREUVES}/suivi-liste-cr.png` });

    // E-3 of Antor: active campaign, the CRs, the preparation block.
    await p.goto(`/univers/${idUnivers}`);
    await attendre(p);
    t = await texte(p);
    assert.ok(t.includes('Campagnes actives'));
    assert.ok(t.includes('La Couronne brisée'));
    assert.ok(t.includes('Derniers comptes-rendus'));
    assert.ok(t.includes('La nuit des sceaux'));
    assert.ok(t.includes('Préparation'));
    assert.ok(t.includes('Plan de la crypte'));
    assert.ok(t.includes('Tous les comptes-rendus'));
    await p.screenshot({ path: `${PREUVES}/suivi-e3-antor.png` });

    // E-3 of Léa: the two blocks, never Préparation.
    await lea.page.goto(`/univers/${idUnivers}`);
    await attendre(lea.page);
    t = await texte(lea.page);
    assert.ok(t.includes('Campagnes actives'));
    assert.ok(t.includes('Derniers comptes-rendus'));
    assert.ok(!t.includes('Préparation'));
    assert.ok(!t.includes('Plan de la crypte'));
  });

  // ---------- B-15 bords ----------
  test('B-15 bords : nom vide, 81 caractères refusés, 80 acceptés ; naît En préparation ; plusieurs actives', async () => {
    const { antor, idUnivers } = await table('Univers B15');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await p.getByRole('button', { name: rxExact('Créer la campagne') }).click();
    await voit(p, 'Erreur : le nom est obligatoire.');
    await p.getByLabel(/^Nom/).fill('x'.repeat(81));
    await p.getByRole('button', { name: rxExact('Créer la campagne') }).click();
    await voit(p, 'Erreur : 80 caractères au plus.');
    await creerCampagne(p, 'y'.repeat(80));
    await voit(p, 'y'.repeat(80));
    assert.ok(p.url().endsWith('/campagnes'), 'creation stays on the list');
    assert.equal(await statutAffiche(p, 'y'.repeat(80)), 'En préparation');
    // Two campaigns active in the same universe.
    await creerCampagne(p, 'Beta');
    await changerStatut(p, 'Active', 'Beta');
    await attendre(p);
    await changerStatut(p, 'Active', 'y'.repeat(80));
    await attendre(p);
    await p.reload();
    await attendre(p);
    assert.deepEqual([await statutAffiche(p, 'Beta'), await statutAffiche(p, 'y'.repeat(80))], ['Active', 'Active']);
    await p.goto(`/univers/${idUnivers}`);
    await attendre(p);
    const t = await texte(p);
    assert.ok(t.includes('Beta') && t.includes('y'.repeat(80)));
  });

  // ---------- B-15 / B-18 : liste groupée, Joueur ----------
  test('B-18 le Joueur voit nom et statut en badge sans réglage ; actives, en préparation, terminées, par nom', async () => {
    const { antor, idUnivers } = await table('Univers B18');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    for (const nom of ['Zèbre', 'alpha', 'Mouette', 'Bravo']) await creerCampagne(p, nom);
    // Order of creation in the list is by name; set statuses by name.
    async function statut(nom: string, s: string) {
      const ligne = p.getByRole('listitem').filter({ hasText: nom }).first();
      await changerStatut(p, s, nom, ligne);
      await attendre(p);
    }
    await statut('Zèbre', 'Active');
    await statut('Bravo', 'Terminée');
    await statut('Mouette', 'Active');
    // alpha stays En préparation
    const lea = await compte('lea');
    await lea.page.goto(`/univers/${idUnivers}/campagnes`);
    await attendre(lea.page);
    const t = await texte(lea.page);
    const ordre = ['Mouette', 'Zèbre', 'alpha', 'Bravo'];
    const pos = ordre.map((x) => t.indexOf(x));
    assert.ok(pos.every((x) => x >= 0));
    assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'Mouette, Zèbre (actives), alpha (en préparation), Bravo (terminée)');
    assert.equal(await declencheurStatut(lea.page).count(), 0);
    assert.ok(t.includes('Terminée') && t.includes('En préparation'));
    assert.ok(!t.includes('Nouvelle campagne'));
    await lea.page.screenshot({ path: `${PREUVES}/suivi-liste-lea.png` });
  });

  test('B-15 un statut changé par Antor se voit chez Léa au rechargement (Terminée, dernier groupe)', async () => {
    const { antor, idUnivers } = await table('Univers B15b');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'A-campagne');
    await creerCampagne(p, 'B-campagne');
    await changerStatut(p, 'Active', 'A-campagne');
    await attendre(p);
    const lea = await compte('lea');
    await lea.page.goto(`/univers/${idUnivers}/campagnes`);
    await attendre(lea.page);
    await changerStatut(p, 'Terminée', 'A-campagne');
    await attendre(p);
    await lea.page.reload();
    await attendre(lea.page);
    const t = await texte(lea.page);
    assert.ok(t.indexOf('B-campagne') < t.indexOf('A-campagne'));
    assert.ok(/A-campagne[\s\S]*Terminée/.test(t));
  });

  // ---------- B-16, B-17 bords et exclusions ----------
  test('B-16 bords : titre vide, 121 refusés ; contenu de 20 001 refusé ; écriture périmée gardée', async () => {
    const { antor, idUnivers } = await table('Univers B16');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await ouvrirCampagne(p, 'Camp');
    await voit(p, 'Aucun scénario pour l\'instant.');
    await ouvrirNouveauScenario(p);
    await p.getByRole('button', { name: rxExact('Créer le scénario') }).click();
    await voit(p, 'Erreur : le titre est obligatoire.');
    await p.getByLabel('Titre').fill('t'.repeat(121));
    await p.getByRole('button', { name: rxExact('Créer le scénario') }).click();
    await voit(p, 'Erreur : 120 caractères au plus.');
    await p.getByLabel('Titre').fill('t'.repeat(120));
    await p.getByRole('button', { name: rxExact('Créer le scénario') }).click();
    await p.getByRole('heading', { level: 1 }).filter({ hasText: 't'.repeat(120) }).waitFor();
    await attendre(p);
    // 20 001 characters refused.
    await p.getByRole('button', { name: rxExact('Modifier') }).click();
    await p.getByLabel('Contenu').fill('c'.repeat(20001));
    await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(p, 'Erreur : 20 000 caractères au plus.');
    // 20 000 accepted.
    await p.getByLabel('Contenu').fill('c'.repeat(20000));
    await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(p);
    assert.ok((await texte(p)).includes('c'.repeat(20000)));
    // Stale write: a second tab of Antor opened before the first write.
    const urlScenario = p.url();
    const p2 = await antor.ctx.newPage();
    p2.setDefaultTimeout(8000);
    await p2.goto(urlScenario);
    await attendre(p2);
    await p2.getByRole('button', { name: rxExact('Modifier') }).click();
    await p.getByRole('button', { name: rxExact('Modifier') }).click();
    await p.getByLabel('Contenu').fill('Première écriture.');
    await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(p);
    await p2.getByLabel('Contenu').fill('Seconde écriture.');
    await p2.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(p2, 'Ce scénario a changé depuis que vous l\'avez ouvert.');
    assert.ok((await texte(p2)).includes('Recharger le scénario'));
    assert.equal(await p2.getByLabel('Contenu').inputValue(), 'Seconde écriture.');
    await p.reload();
    await attendre(p);
    const t = await texte(p);
    assert.ok(t.includes('Première écriture.') && !t.includes('Seconde écriture.'));
    await p2.screenshot({ path: `${PREUVES}/suivi-scenario-perime.png` });
  });

  test('B-17 bords : libellé vide, 201 refusés ; cinq catégories dans l\'ordre ; cochées de la plus récente', async () => {
    const { antor, idUnivers } = await table('Univers B17');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await ouvrirCampagne(p, 'Camp');
    await voit(p, 'Rien à préparer pour l\'instant.');
    await p.getByRole('button', { name: rxExact('Ajouter') }).click();
    await voit(p, 'Erreur : le libellé est obligatoire.');
    await p.getByRole('form', { name: 'Nouvelle tâche' }).getByRole('textbox').fill('l'.repeat(201));
    await p.getByRole('button', { name: rxExact('Ajouter') }).click();
    await voit(p, 'Erreur : 200 caractères au plus.');
    await p.getByRole('form', { name: 'Nouvelle tâche' }).getByRole('textbox').fill('');
    await ajouterTache(p, 'Tâche autre');
    await ajouterTache(p, 'Tâche déroulement', 'Déroulements');
    await ajouterTache(p, 'Tâche carte', 'Cartes');
    await ajouterTache(p, 'Tâche pnj', 'PNJ');
    await ajouterTache(p, 'Tâche monstre', 'Monstres');
    await ajouterTache(p, 'm'.repeat(200), 'Autre');
    // « Cartes » is also a sidebar item since kanevas-cartes-graphes: measure the order in the page body only.
    const t = await p.locator('main').innerText();
    const ordre = ['Monstres', 'PNJ', 'Cartes', 'Déroulements', 'Autre'].map((c) => t.indexOf(c));
    assert.ok(ordre.every((x) => x >= 0), 'five categories shown when each has a task');
    assert.deepEqual([...ordre].sort((a, b) => a - b), ordre);
    // Tick two: most recently ticked first among the done.
    await p.getByRole('checkbox', { name: rx('Tâche carte') }).click();
    await attendre(p);
    await p.waitForTimeout(1100);
    await p.getByRole('checkbox', { name: rx('Tâche pnj') }).click();
    await attendre(p);
    await voit(p, 'Cochées (2)');
    // Read the order inside the « Cochées » list only: the success toasts ("« Tâche pnj » cochée") sit elsewhere in the page text.
    const t2 = (await texte(p)).split('Cochées (2)')[1]!.replaceAll(/«\s*Tâche (pnj|carte)\s*»\s*cochée/g, '');
    assert.ok(t2.includes('Tâche pnj') && t2.includes('Tâche carte'));
    assert.ok(t2.indexOf('Tâche pnj') < t2.indexOf('Tâche carte'));
    // No deletion.
    assert.equal(await p.getByRole('button', { name: /supprimer|retirer/i }).count(), 0);
    // Empty category not shown: Cartes and PNJ tasks were ticked, so with only Monstres/Déroulements/Autre left...
    await p.getByRole('checkbox', { name: rx('Tâche monstre') }).click();
    await attendre(p);
    const avantCochees = (await p.locator('main').innerText()).split('Cochées')[0]!;
    assert.ok(!avantCochees.includes('Monstres'));
    assert.ok(!avantCochees.includes('Cartes'));
  });

  test('B-16, B-17 exclusions : un MJ d\'un autre univers et un compte sans rôle reçoivent Page introuvable', async () => {
    const { antor, idUnivers } = await table('Univers B16x');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp secrète');
    await ouvrirCampagne(p, 'Camp secrète');
    await ouvrirNouveauScenario(p);
    await p.getByLabel('Titre').fill('Scénario secret');
    await p.getByRole('button', { name: rxExact('Créer le scénario') }).click();
    await p.getByRole('heading', { name: 'Scénario secret', level: 1 }).waitFor();
    const urlScenario = p.url();
    const urlCampagne = urlScenario.replace(/\/scenarios?\/\d+.*$/, '');
    // Mira: MJ of her own universe, no role here.
    const mira = await compte('mira');
    await creerUnivers(mira.page, 'Landes grises');
    for (const url of [urlScenario, urlCampagne]) {
      await mira.page.goto(url);
      await attendre(mira.page);
      const t = await texte(mira.page);
      assert.ok(t.includes('Page introuvable.'), url);
      assert.ok(!t.includes('Scénario secret') && !t.includes('Camp secrète'), url);
    }
    await mira.page.goto(`/univers/${idUnivers}/campagnes`);
    await attendre(mira.page);
    const t = await texte(mira.page);
    assert.ok(t.includes('Page introuvable.'));
    assert.ok(!t.includes('Camp secrète'));
    // An unknown campaign id in her own universe.
    const idMira = /\/univers\/(\d+)/.exec(mira.page.url())![1]!;
    await mira.page.goto(`/univers/${idMira}/campagnes/999999`);
    await attendre(mira.page);
    assert.ok((await texte(mira.page)).includes('Page introuvable.'));
  });

  // ---------- B-19, B-20 : droits d'un compte-rendu ----------
  test('B-19 un CR fermé aux joueurs : absent pour Léa en liste, E-3 et campagne, sans trou ni compteur ; Antor le garde', async () => {
    const { antor, idUnivers } = await table('Univers B19');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await ouvrirCampagne(p, 'Camp');
    const urlCampagne = p.url();
    await nouveauCR(p, 'Session 10', 'Ouvert.');
    await p.goto(urlCampagne);
    await attendre(p);
    await nouveauCR(p, 'Session 11', 'Fermé aux joueurs.');
    const urlFermee = p.url();
    await regler(p, 'Compte-rendu', 'Les joueurs la lisent', false);
    const lea = await compte('lea');
    for (const url of [`/univers/${idUnivers}/comptes-rendus`, urlCampagne, `/univers/${idUnivers}`]) {
      await lea.page.goto(url);
      await attendre(lea.page);
      const t = await texte(lea.page);
      assert.ok(t.includes('Session 10'), url);
      assert.ok(!t.includes('Session 11'), url);
      assert.ok(!t.includes('Fermé aux joueurs.'), url);
      assert.ok(!/\b2 comptes-rendus|\(2\)/.test(t), 'no counter: ' + url);
    }
    await lea.page.goto(urlFermee);
    await attendre(lea.page);
    const t = await texte(lea.page);
    assert.ok(!t.includes('Fermé aux joueurs.'));
    await lea.page.screenshot({ path: `${PREUVES}/suivi-cr-ferme-lea.png` });
    await p.goto(`/univers/${idUnivers}/comptes-rendus`);
    await attendre(p);
    assert.ok((await texte(p)).includes('Session 11'));
  });

  test('B-19 un Joueur ne peut pas modifier le CR d\'un autre Joueur ; l\'auteur et le MJ le peuvent ; CR du MJ sans auteur', async () => {
    const { antor, idUnivers } = await table('Univers B19b', ['lea', 'teo']);
    const lea = await compte('lea');
    await allerCampagnes(lea.page, idUnivers);
    await lea.page.getByRole('link', { name: rx('Aucune') }).count();
    await allerCampagnes(antor.page, idUnivers);
    await creerCampagne(antor.page, 'Camp');
    await ouvrirCampagne(antor.page, 'Camp');
    const urlCampagne = antor.page.url();
    await lea.page.goto(urlCampagne);
    await attendre(lea.page);
    await nouveauCR(lea.page, 'CR de Léa', 'Par Léa.');
    const urlLea = lea.page.url();
    await nouveauCR(antor.page, 'CR du MJ', 'Par Antor.');
    const urlMJ = antor.page.url();
    const teo = await compte('teo');
    for (const url of [urlLea, urlMJ]) {
      await teo.page.goto(url);
      await attendre(teo.page);
      assert.ok((await texte(teo.page)).includes('Par '), 'Teo reads ' + url);
      assert.equal(await teo.page.getByRole('button', { name: rxExact('Modifier') }).count(), 0, url);
    }
    await lea.page.goto(urlMJ);
    await attendre(lea.page);
    assert.ok((await texte(lea.page)).includes('Par Antor.'), 'Léa reads the MJ report');
    assert.equal(await lea.page.getByRole('button', { name: rxExact('Modifier') }).count(), 0);
    await antor.page.goto(urlLea);
    await attendre(antor.page);
    assert.equal(await antor.page.getByRole('button', { name: rxExact('Modifier') }).count(), 1);
    // The list of the campaign: author identifier for Léa's, nothing for the MJ's.
    await teo.page.goto(urlCampagne);
    await attendre(teo.page);
    const ligneLea = await teo.page.getByRole('link', { name: /CR de Léa/ }).first().locator('xpath=ancestor::*[self::li or self::tr or self::article or self::div][1]').innerText();
    const ligneMJ = await teo.page.getByRole('link', { name: /CR du MJ/ }).first().locator('xpath=ancestor::*[self::li or self::tr or self::article or self::div][1]').innerText();
    assert.ok(/\blea\b/.test(ligneLea));
    assert.ok(!/antor/i.test(ligneMJ));
  });

  test('B-19 plusieurs CR pour une même campagne coexistent ; une campagne terminée accepte un CR', async () => {
    const { antor, idUnivers } = await table('Univers B19c');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await changerStatut(p, 'Terminée', 'Camp');
    await attendre(p);
    await ouvrirCampagne(p, 'Camp');
    const url = p.url();
    await nouveauCR(p, 'Même séance A');
    await p.goto(url);
    await attendre(p);
    await nouveauCR(p, 'Même séance B');
    await p.goto(url);
    await attendre(p);
    const t = await texte(p);
    assert.ok(t.includes('Même séance A') && t.includes('Même séance B'));
    assert.ok(t.indexOf('Même séance B') < t.indexOf('Même séance A'));
  });

  test('B-19 bords : titre vide ou 121, texte de 20 001 refusés, fenêtre ouverte et saisie gardée ; Annuler ne crée rien', async () => {
    const { antor, idUnivers } = await table('Univers B19d');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await ouvrirCampagne(p, 'Camp');
    await p.getByRole('button', { name: rxExact('Nouveau compte-rendu') }).click();
    const f = p.getByRole('dialog');
    await f.getByRole('button', { name: rxExact('Publier') }).click();
    await voit(p, 'Erreur : le titre est obligatoire.');
    await f.getByLabel('Titre').fill('t'.repeat(121));
    await f.getByRole('button', { name: rxExact('Publier') }).click();
    await voit(p, 'Erreur : 120 caractères au plus.');
    await f.getByLabel('Titre').fill('Valide');
    await f.getByLabel('Texte').fill('x'.repeat(20001));
    await f.getByRole('button', { name: rxExact('Publier') }).click();
    await voit(p, 'Erreur : 20 000 caractères au plus.');
    assert.equal(await f.getByLabel('Titre').inputValue(), 'Valide');
    await f.getByRole('button', { name: rxExact('Annuler') }).click();
    await attendre(p);
    assert.equal(await p.getByRole('dialog').count(), 0);
    assert.ok(!(await texte(p)).includes('Valide'));
    await p.goto(`/univers/${idUnivers}/comptes-rendus`);
    await attendre(p);
    await voit(p, 'Aucun compte-rendu pour l\'instant.');
    assert.ok(await p.getByRole('link', { name: rx('Voir les campagnes') }).isVisible());
  });

  // ---------- B-20 : pagination ----------
  test('B-20 plus de 100 comptes-rendus : cent d\'abord, « Charger la suite » rend le reste, du plus récent', async () => {
    const { antor, idUnivers } = await table('Univers B20');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await ouvrirCampagne(p, 'Camp');
    const idCampagne = /campagnes\/(\d+)/.exec(p.url())![1]!;
    for (let i = 1; i <= 101; i++) {
      const r = await p.request.post(`/api/univers/${idUnivers}/comptes-rendus`, {
        data: { campagneId: Number(idCampagne), titre: `Séance numéro ${i}` },
      });
      assert.equal(r.status(), 201);
    }
    await p.goto(`/univers/${idUnivers}/comptes-rendus`);
    await attendre(p);
    let liens = await p.getByRole('link', { name: /Séance numéro/ }).count();
    assert.equal(liens, 100);
    assert.ok((await p.getByRole('link', { name: /Séance numéro/ }).first().innerText()).includes('Séance numéro 101'));
    await p.getByRole('button', { name: rxExact('Charger la suite') }).click();
    await attendre(p);
    liens = await p.getByRole('link', { name: /Séance numéro/ }).count();
    assert.equal(liens, 101);
    assert.ok((await p.getByRole('link', { name: /Séance numéro/ }).last().innerText()).includes('Séance numéro 1'));
    assert.equal(await p.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
    // E-3 shows five at most.
    await p.goto(`/univers/${idUnivers}`);
    await attendre(p);
    assert.equal(await p.getByRole('link', { name: /Séance numéro/ }).count(), 5);
  });

  // ---------- États (B-29) ----------
  test('B-29 états : vides par rôle sur E-3, E-6, E-13 ; blocs de E-3 vides', async () => {
    const { antor, idUnivers } = await table('Univers B29');
    const lea = await compte('lea');
    const p = antor.page;
    await p.goto(`/univers/${idUnivers}`);
    await attendre(p);
    let t = await texte(p);
    assert.ok(t.includes('Aucune campagne active.'));
    assert.ok(t.includes('Aucun compte-rendu pour l\'instant.'));
    assert.ok(t.includes('Rien à préparer pour l\'instant.'));
    assert.ok(!t.includes('Rien à afficher pour l\'instant.'));
    await p.goto(`/univers/${idUnivers}/campagnes`);
    await attendre(p);
    assert.ok((await texte(p)).includes('Nouvelle campagne'));
    await lea.page.goto(`/univers/${idUnivers}`);
    await attendre(lea.page);
    t = await texte(lea.page);
    assert.ok(t.includes('Aucune campagne active.'));
    assert.ok(t.includes('Aucun compte-rendu à lire pour l\'instant.'));
    await lea.page.goto(`/univers/${idUnivers}/comptes-rendus`);
    await attendre(lea.page);
    assert.ok((await texte(lea.page)).includes('Aucun compte-rendu à lire pour l\'instant.'));
    await lea.page.screenshot({ path: `${PREUVES}/suivi-vide-lea.png` });
  });

  test('B-29 erreur : E-13 et un bloc de E-3 en échec disent leur texte et « Réessayer », les autres blocs restent', async () => {
    const { antor, idUnivers } = await table('Univers B29e');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await creerCampagne(p, 'Camp');
    await changerStatut(p, 'Active', 'Camp');
    await attendre(p);
    await p.route('**/api/univers/*/comptes-rendus*', (r: Any) => r.fulfill({ status: 500, body: '{}', contentType: 'application/json' }));
    await p.goto(`/univers/${idUnivers}/comptes-rendus`);
    await voit(p, 'Impossible de charger les comptes-rendus.');
    assert.ok(await p.getByRole('button', { name: rxExact('Réessayer') }).isVisible());
    await p.goto(`/univers/${idUnivers}`);
    await voit(p, 'Impossible de charger ce bloc.');
    await attendre(p);
    const t = await texte(p);
    assert.ok(t.includes('Camp'), 'the other blocks stay');
    await p.screenshot({ path: `${PREUVES}/suivi-e3-bloc-erreur.png` });
    await p.unroute('**/api/univers/*/comptes-rendus*');
    await p.getByRole('button', { name: rxExact('Réessayer') }).first().click();
    await attendre(p);
    assert.ok(!(await texte(p)).includes('Impossible de charger ce bloc.'));
  });

  test('B-29 connexion perdue : bandeau, « Créer la campagne » désactivé, saisie conservée', async () => {
    const { antor, idUnivers } = await table('Univers B29o');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    await p.getByLabel(/^Nom/).fill('Hors ligne');
    await antor.ctx.setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await voit(p, 'Connexion perdue.');
    assert.ok(await p.getByRole('button', { name: rxExact('Créer la campagne') }).isDisabled());
    assert.equal(await p.getByLabel(/^Nom/).inputValue(), 'Hors ligne');
    await p.screenshot({ path: `${PREUVES}/suivi-hors-ligne.png` });
    await antor.ctx.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  test('B-29 contenu long : un nom de 80 et un titre de CR de 120 caractères passent à la ligne sans déborder (téléphone)', async () => {
    const { antor, idUnivers } = await table('Univers B29l');
    const p = antor.page;
    await allerCampagnes(p, idUnivers);
    const nom = 'N'.repeat(80);
    await creerCampagne(p, nom);
    await ouvrirCampagne(p, nom);
    await nouveauCR(p, 'T'.repeat(120));
    await p.setViewportSize({ width: 375, height: 800 });
    await p.goto(`/univers/${idUnivers}/comptes-rendus`);
    await attendre(p);
    const largeur = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    assert.ok(largeur.s <= largeur.c, `horizontal overflow ${largeur.s} > ${largeur.c}`);
    await p.screenshot({ path: `${PREUVES}/suivi-long-mobile.png` });
  });
});
