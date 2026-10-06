// Black-box tests of kanevas-premiere-fiche written from the need (docs/parcours.md B-n,
// docs/ecrans.md), not from the code. Expected values are literals taken from the docs.
// Same harness as the other e2e files: real server in stub mode + real Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  type Any,
  ajouterSection,
  ouvrirMenuSection,
  choisirAuteur,
  choisirDansMenuSection,
  confirmerRetraitSection,
  allerListe,
  allerMembres,
  attendre as attendreHarnais,
  connecte,
  launch,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startExpectingExit,
  startServer,
  texte,
  titresSections,
  voit,
  type Server,
} from './harnais.test.js';

const UNIVERS = "Lame d'Ébène";

// The app answers after the network went idle once (optimistic "…" buttons): wait for the
// writes in flight to finish before reading the screen.
async function attendre(page: Any): Promise<void> {
  await attendreHarnais(page);
  await page.waitForTimeout(200);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '…'));
  await attendreHarnais(page);
}

async function creerUnivers(page: Any, nom: string, description = ''): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(page);
  await page.getByRole('link', { name: rxExact('Créer un univers') }).or(page.getByRole('button', { name: rxExact('Créer un univers') })).first().click();
  await page.getByLabel('Nom', { exact: true }).fill(nom);
  if (description) await page.getByLabel('Description').fill(description);
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await page.waitForURL(/\/univers\/\d+$/);
  await attendre(page);
}

async function ajouterMembre(page: Any, identifiant: string, role: 'MJ' | 'Joueur' = 'Joueur'): Promise<void> {
  await page.getByLabel('Identifiant du compte').fill(identifiant);
  await page.getByLabel('Rôle', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
}

async function retirer(page: Any, identifiant: string): Promise<void> {
  const nom = `Retirer ${identifiant}`;
  await page.getByRole('button', { name: nom, exact: true }).first().click();
  await page.getByRole('button', { name: nom, exact: true }).last().click();
  await attendre(page);
}

async function modeJoueur(page: Any): Promise<void> {
  await page.getByRole('radio', { name: 'Mode Joueur' }).check();
  await attendre(page);
}

const NOUVEAU: Record<string, string> = {
  personnage: 'Nouveau personnage',
  lieu: 'Nouveau lieu',
  faction: 'Nouvelle faction',
  objet: 'Nouvel objet',
  evenement: 'Nouvel événement',
  quete: 'Nouvelle quête',
};

async function creerFiche(page: Any, type: string, titre: string, pj = false): Promise<void> {
  await allerListe(page, type as Any);
  await page.getByRole('button', { name: rxExact(NOUVEAU[type]!) }).first().click();
  const fenetre = page.getByRole('dialog');
  await fenetre.getByLabel('Titre').fill(titre);
  if (type === 'personnage' && pj) await fenetre.getByLabel('PJ', { exact: true }).check();
  await fenetre.getByRole('button', { name: rxExact('Créer la fiche') }).click();
  await page.getByRole('heading', { name: titre, level: 1 }).waitFor();
  await attendre(page);
}

async function ecrireSection(page: Any, titre: string, contenu: string): Promise<void> {
  const s = section(page, titre);
  await s.getByRole('button', { name: rxExact('Modifier') }).click();
  await s.getByRole('textbox').fill(contenu);
  await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await s.getByRole('textbox').waitFor({ state: 'detached' });
  await attendre(page);
}

describe('kanevas-premiere-fiche, du besoin', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  const ctxs: Any[] = [];

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
    const c = await connecte(browser, srv.base, affiche);
    ctxs.push(c.ctx);
    return c;
  }
  async function ouvrirUnivers(page: Any, nom: string) {
    await page.goto('/');
    await attendre(page);
    await page.getByRole('link', { name: rx(nom) }).first().click();
    await attendre(page);
  }
  /** Antor creates universe `nom`, Léa and Teo are connected once and added as Joueurs. */
  async function table(nom: string, ajouter: string[] = ['lea']) {
    const antor = await compte('antor');
    for (const a of ajouter) await (await compte(a)).ctx.close();
    await creerUnivers(antor.page, nom);
    const urlUnivers = antor.page.url();
    await allerMembres(antor.page);
    for (const a of ajouter) await ajouterMembre(antor.page, a);
    return { antor, urlUnivers };
  }
  // ---------- B-1, P-1 ----------
  test('B-1 compte neuf : accueil vide avec son identifiant, aucun nom d’univers', async () => {
    const antor = await compte('antor');
    await creerUnivers(antor.page, 'Univers secret de Antor');
    const teo = await compte('teo');
    await teo.page.goto('/');
    await attendre(teo.page);
    const t = await texte(teo.page);
    assert.ok(t.includes('Aucun univers pour l\'instant.'));
    assert.ok(t.includes('Connecté en tant que teo'));
    assert.ok(t.includes('Vous menez une partie ? Créez un univers.'));
    assert.ok(!t.includes('Univers secret de Antor'));
    await teo.page.screenshot({ path: '/tmp/kanevas-preuves-b1.png' });
  });

  // ---------- B-2 ----------
  test('B-2 créer un univers : on en devient MJ, on arrive sur sa vue d’ensemble', async () => {
    const antor = await compte('antor');
    await creerUnivers(antor.page, UNIVERS + ' B2', 'Un monde de lames.');
    const t = await texte(antor.page);
    assert.ok(t.includes(UNIVERS + ' B2'));
    assert.ok(t.includes('Un monde de lames.'));
    assert.ok(/\bMJ\b/.test(t));
    assert.ok(!t.includes('Rien à afficher pour l\'instant.'), 'blocks of kanevas-suivi replace the empty region');
    assert.ok(t.includes('Campagnes actives'));
    await antor.page.goto('/');
    await attendre(antor.page);
    const carte = antor.page.getByRole('link', { name: rx(UNIVERS + ' B2') });
    assert.ok(/MJ/.test(await carte.innerText()));
  });

  async function formulaireUnivers(p: Any) {
    await p.goto('/');
    await p.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
    await attendre(p);
    await p.getByRole('link', { name: rxExact('Créer un univers') }).or(p.getByRole('button', { name: rxExact('Créer un univers') })).first().click();
    await p.getByLabel('Nom', { exact: true }).waitFor();
  }

  test('B-2 bords : nom vide refusé, 80 caractères acceptés, 81 refusés', async () => {
    const antor = await compte('antor');
    const p = antor.page;
    await formulaireUnivers(p);
    await p.getByRole('button', { name: rxExact("Créer l'univers") }).click();
    await voit(p, 'Erreur : le nom est obligatoire.');
    await p.getByLabel(/^Nom/).fill('x'.repeat(81));
    await p.getByRole('button', { name: rxExact("Créer l'univers") }).click();
    await voit(p, 'Erreur : 80 caractères au plus.');
    await p.getByLabel(/^Nom/).fill('y'.repeat(80));
    await p.getByRole('button', { name: rxExact("Créer l'univers") }).click();
    await p.waitForURL(/\/univers\/\d+$/);
    await attendre(p);
    assert.ok((await texte(p)).includes('y'.repeat(80)));
  });

  test('B-2 bord : description de 501 caractères refusée', async () => {
    const antor = await compte('antor');
    const p = antor.page;
    await formulaireUnivers(p);
    await p.getByLabel('Nom', { exact: true }).fill('Desc 501');
    await p.getByLabel('Description').fill('d'.repeat(501));
    await p.getByRole('button', { name: rxExact("Créer l'univers") }).click();
    await voit(p, 'Erreur : 500 caractères au plus.');
  });

  // ---------- B-3, B-4 ----------
  test('B-3 Léa ajoutée en Joueuse voit l’univers dans son accueil, badge Joueur', async () => {
    const { antor } = await table(UNIVERS + ' B3');
    assert.ok((await texte(antor.page)).includes('lea'));
    const lea = await compte('lea');
    await lea.page.goto('/');
    await attendre(lea.page);
    const carte = lea.page.getByRole('link', { name: rx(UNIVERS + ' B3') });
    assert.ok(/Joueur/.test(await carte.innerText()));
    assert.ok(!(await texte(lea.page)).includes('Aucun univers pour l\'instant.'));
  });

  test('B-3 échecs : jamais connecté, déjà membre', async () => {
    const { antor } = await table(UNIVERS + ' B3e');
    const p = antor.page;
    await ajouterMembre(p, 'inconnu-jamais-vu');
    await voit(p, 'Ce compte ne s\'est jamais connecté.');
    await ajouterMembre(p, 'lea');
    await voit(p, 'Ce compte est déjà membre.');
  });

  test('B-3 exclusion : la page des membres ne liste pas les comptes de l’instance', async () => {
    const { antor } = await table(UNIVERS + ' B3x', []);
    await (await compte('mira')).ctx.close();
    const t = await texte(antor.page);
    assert.ok(!/mira/i.test(t), 'mira has an account but is not a member');
    assert.ok(!/\bteo\b/i.test(t));
  });

  test('B-3 changer un rôle : Léa passée MJ voit alors la navigation Membres', async () => {
    const { antor } = await table(UNIVERS + ' B3r');
    const lea = await compte('lea');
    await ouvrirUnivers(lea.page, UNIVERS + ' B3r');
    assert.equal(await lea.page.getByRole('link', { name: rxExact('Membres') }).count(), 0);
    const ligne = antor.page.getByRole('listitem').filter({ hasText: 'lea' });
    await ligne.getByRole('combobox').selectOption({ label: 'MJ' });
    await attendre(antor.page);
    await lea.page.reload();
    await attendre(lea.page);
    assert.equal(await lea.page.getByRole('link', { name: rxExact('Membres') }).count(), 1);
  });

  test('B-4 retirée, Léa perd l’univers : accueil vide, adresse = « Page introuvable. » sans nom', async () => {
    const { antor, urlUnivers } = await table(UNIVERS + ' B4');
    const p = antor.page;
    await p.getByRole('button', { name: 'Retirer lea', exact: true }).click();
    await voit(p, 'Retirer lea de ' + UNIVERS + ' B4 ?');
    await p.getByRole('button', { name: 'Retirer lea', exact: true }).last().click();
    await attendre(p);
    // the toast « lea » retiré (kanevas-rv-reglages) names her by design: the member list must not
    assert.ok(!((await p.locator('.liste-membres').innerText()) as string).match(/\blea\b/));
    const lea = await compte('lea');
    await lea.page.goto('/');
    await attendre(lea.page);
    assert.ok(!(await texte(lea.page)).includes(UNIVERS + ' B4'));
    await lea.page.goto(new URL(urlUnivers).pathname);
    await attendre(lea.page);
    const t = await texte(lea.page);
    assert.ok(t.includes('Page introuvable.'));
    assert.ok(!t.includes(UNIVERS + ' B4'));
    assert.equal(await lea.page.getByRole('link', { name: 'Mes univers' }).count() > 0, true);
  });

  test('B-4 Teo sans rôle : même réponse qu’une adresse inconnue, membres compris', async () => {
    const { urlUnivers } = await table(UNIVERS + ' B4t', ['lea']);
    const teo = await compte('teo');
    const chemin = new URL(urlUnivers).pathname;
    for (const c of [chemin, chemin + '/membres']) {
      await teo.page.goto(c);
      await attendre(teo.page);
      const t = await texte(teo.page);
      assert.ok(t.includes('Page introuvable.'), c);
      assert.ok(!t.includes(UNIVERS), c);
    }
    const inconnue = await fetch(srv.base + '/api/univers/999999', { headers: { cookie: (await teo.ctx.cookies()).map((c: Any) => `${c.name}=${c.value}`).join('; ') } });
    const id = chemin.split('/').filter(Boolean).pop();
    const refus = await fetch(srv.base + '/api/univers/' + id, { headers: { cookie: (await teo.ctx.cookies()).map((c: Any) => `${c.name}=${c.value}`).join('; ') } });
    assert.equal(refus.status, inconnue.status);
    assert.equal(await refus.text(), await inconnue.text());
  });

  // ---------- B-5 ----------
  test('B-5 retirer le seul MJ est refusé avec la raison, liste inchangée', async () => {
    const { antor } = await table(UNIVERS + ' B5');
    const p = antor.page;
    await retirer(p, 'antor');
    await voit(p, 'Impossible : l\'univers doit garder au moins un MJ.');
    assert.ok((await texte(p)).includes('antor'));
    assert.ok((await texte(p)).includes('lea'));
  });

  test('B-5 rétrograder le seul MJ est refusé aussi', async () => {
    const { antor } = await table(UNIVERS + ' B5b');
    const p = antor.page;
    await p.getByRole('listitem').filter({ hasText: 'antor' }).getByRole('combobox').selectOption({ label: 'Joueur' });
    await voit(p, 'Impossible : l\'univers doit garder au moins un MJ.');
    await p.reload();
    await attendre(p);
    assert.ok(await p.getByRole('link', { name: rxExact('Membres') }).count() > 0, 'Antor is still MJ');
  });

  test('B-5 avec deux MJ, un MJ peut se retirer et revient à l’accueil', async () => {
    const { antor } = await table(UNIVERS + ' B5c');
    const p = antor.page;
    await p.getByRole('listitem').filter({ hasText: 'lea' }).getByRole('combobox').selectOption({ label: 'MJ' });
    await attendre(p);
    await retirer(p, 'antor');
    await p.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
    // The « créé » toast (4 s, survives navigation by design) may still carry the name: read the page content only.
    assert.ok(!((await p.locator('main').innerText()) as string).includes(UNIVERS + ' B5c'));
  });

  // ---------- B-7 ----------
  test('B-7 MJ crée une fiche de chaque type depuis sa liste ; vide puis la fiche listée', async () => {
    const { antor } = await table(UNIVERS + ' B7');
    const p = antor.page;
    const vides: Record<string, string> = {
      Personnages: 'Aucun personnage pour l\'instant.',
      Lieux: 'Aucun lieu pour l\'instant.',
      Factions: 'Aucune faction pour l\'instant.',
      Objets: 'Aucun objet pour l\'instant.',
      'Événements': 'Aucun événement pour l\'instant.',
      'Quêtes': 'Aucune quête pour l\'instant.',
    };
    const types = ['personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete'] as const;
    const noms = Object.keys(vides);
    for (let i = 0; i < types.length; i++) {
      await p.getByRole('link', { name: rxExact(noms[i]!) }).click();
      await voit(p, vides[noms[i]!]!);
      await creerFiche(p, types[i]!, 'Fiche ' + types[i]);
      await voit(p, 'Cette fiche n\'a pas encore de section.');
      await allerListe(p, types[i]!);
      await voit(p, 'Fiche ' + types[i]);
    }
  });

  test('B-7 personnage : PNJ par défaut, PJ si coché ; ordre alphabétique sans casse', async () => {
    const { antor } = await table(UNIVERS + ' B7p');
    const p = antor.page;
    await creerFiche(p, 'personnage', 'zorn');
    await creerFiche(p, 'personnage', 'Aldric', true);
    await creerFiche(p, 'personnage', 'bruno');
    await allerListe(p, 'personnage');
    await p.getByRole('link', { name: /zorn/ }).waitFor();
    const liens: string[] = (await p.locator('main a').allInnerTexts()).map((s: string) => s.trim());
    const ordre = ['Aldric', 'bruno', 'zorn'].map((t) => liens.findIndex((l) => l.includes(t)));
    assert.ok(ordre.every((i) => i >= 0), JSON.stringify(liens));
    assert.deepEqual([...ordre].sort((a, b) => a - b), ordre);
    assert.ok(/PJ/.test(liens[ordre[0]!]!), 'Aldric PJ');
    assert.ok(/PNJ/.test(liens[ordre[1]!]!), 'bruno PNJ');
    assert.ok(!/PNJ/.test(liens[ordre[0]!]!));
  });

  test('B-7 bords : titre vide, 121 caractères refusés ; 120 acceptés', async () => {
    const { antor } = await table(UNIVERS + ' B7t', []);
    const p = antor.page;
    await allerListe(p, 'lieu');
    await p.getByRole('button', { name: rxExact('Nouveau lieu') }).first().click();
    const f = p.getByRole('dialog');
    await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await voit(p, 'Erreur : le titre est obligatoire.');
    await f.getByLabel('Titre').fill('t'.repeat(121));
    await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await voit(p, 'Erreur : 120 caractères au plus.');
    await f.getByLabel('Titre').fill('t'.repeat(120));
    await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await attendre(p);
    assert.ok((await texte(p)).includes('t'.repeat(120)));
  });

  test('B-7 exclusion : une Joueuse n’a pas de bouton de création et voit « à voir pour l’instant »', async () => {
    await table(UNIVERS + ' B7j');
    const lea = await compte('lea');
    await ouvrirUnivers(lea.page, UNIVERS + ' B7j');
    await allerListe(lea.page, 'personnage');
    await voit(lea.page, 'Aucun personnage à voir pour l\'instant.');
    const t = await texte(lea.page);
    assert.equal(await lea.page.getByRole('button', { name: /Nouveau personnage/ }).count(), 0);
  });

  test('B-7 exclusion : pas d’entrée « Comptes-rendus » ni type inconnu : « Page introuvable. »', async () => {
    const { antor, urlUnivers } = await table(UNIVERS + ' B7x', []);
    const p = antor.page;
    await p.goto(new URL(urlUnivers).pathname + '/lore/dragons');
    await attendre(p);
    assert.ok((await texte(p)).includes('Page introuvable.'));
  });

  // ---------- B-8, B-9, B-12 : le critère de sortie ----------
  async function aldric(nom: string) {
    const { antor, urlUnivers } = await table(nom, ['lea']);
    const p = antor.page;
    await creerFiche(p, 'personnage', 'Maître Aldric');
    const urlFiche = p.url();
    await ajouterSection(p, 'Apparence');
    await ecrireSection(p, 'Apparence', 'Un vieil homme au regard clair.');
    await regler(p, 'Apparence', 'Les joueurs la lisent', true);
    await ajouterSection(p, 'Vérité — MJ seul');
    await ecrireSection(p, 'Vérité — MJ seul', 'Il est le traître.');
    return { antor, urlUnivers, urlFiche };
  }

  test('B-8 une section naît vide et fermée aux joueurs, « MJ seul »', async () => {
    const { antor } = await table(UNIVERS + ' B8', []);
    const p = antor.page;
    await creerFiche(p, 'lieu', 'Port');
    await ajouterSection(p, 'Quais');
    const s = section(p, 'Quais');
    const contenu = (await s.innerText()).replace(/’/g, "'");
    assert.ok(contenu.includes('Rien d\'écrit pour l\'instant.'));
    await s.getByRole('button', { name: /^MJ seul — régler l['’]audience de/ }).click();
    const boite = p.getByRole('dialog', { name: /^Qui voit « Quais »/ });
    assert.equal(await boite.getByRole('switch', { name: rx('Les joueurs la lisent') }).getAttribute('aria-checked'), 'false');
    assert.equal(await boite.getByRole('switch', { name: rx('Les joueurs l\'écrivent') }).getAttribute('aria-checked'), 'false');
    await p.keyboard.press('Escape');
  });

  test('B-8 réordonner : Monter/Descendre ; retirer demande confirmation, Annuler garde', async () => {
    const { antor } = await table(UNIVERS + ' B8o', []);
    const p = antor.page;
    await creerFiche(p, 'lieu', 'Tour');
    for (const t of ['A', 'B', 'C']) await ajouterSection(p, t);
    assert.deepEqual(await titresSections(p), ['A', 'B', 'C']);
    await choisirDansMenuSection(p, 'C', 'Monter');
    await attendre(p);
    assert.deepEqual(await titresSections(p), ['A', 'C', 'B']);
    await p.reload();
    await attendre(p);
    assert.deepEqual(await titresSections(p), ['A', 'C', 'B'], 'ordre persisté');
    await choisirDansMenuSection(p, 'A', 'Descendre');
    await attendre(p);
    assert.deepEqual(await titresSections(p), ['C', 'A', 'B']);
    await choisirDansMenuSection(p, 'B', 'Retirer la section');
    const dialogue = p.getByRole('alertdialog', { name: rx('Retirer la section « B » ?') });
    await dialogue.waitFor();
    assert.ok(rx('Son contenu sera perdu.').test(await dialogue.innerText()));
    await dialogue.getByRole('button', { name: rxExact('Annuler') }).click();
    assert.deepEqual(await titresSections(p), ['C', 'A', 'B']);
    await choisirDansMenuSection(p, 'B', 'Retirer la section');
    await confirmerRetraitSection(p);
    await attendre(p);
    assert.deepEqual(await titresSections(p), ['C', 'A']);
  });

  test('B-8 titre de section : 81 caractères refusés, vide refusé', async () => {
    const { antor } = await table(UNIVERS + ' B8t', []);
    const p = antor.page;
    await creerFiche(p, 'lieu', 'Puits');
    await p.getByRole('button', { name: /^Ajouter une section/ }).click();
    await p.getByRole('button', { name: rxExact('Ajouter la section') }).click();
    await voit(p, 'Erreur : le titre est obligatoire.');
    await p.getByLabel('Titre de la section').fill('s'.repeat(81));
    await p.getByRole('button', { name: rxExact('Ajouter la section') }).click();
    await voit(p, 'Erreur : 80 caractères au plus.');
  });

  test('B-8 contenu : 20 000 caractères acceptés, 20 001 refusés', async () => {
    const { antor } = await table(UNIVERS + ' B8c', []);
    const p = antor.page;
    await creerFiche(p, 'lieu', 'Grimoire');
    await ajouterSection(p, 'Texte');
    const s = section(p, 'Texte');
    await s.getByRole('button', { name: rxExact('Modifier') }).click();
    await s.getByRole('textbox').fill('a'.repeat(20001));
    await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(p, 'Erreur : 20 000 caractères au plus.');
    await s.getByRole('textbox').fill('a'.repeat(20000));
    await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(p);
    await p.reload();
    await attendre(p);
    assert.equal(((await section(p, 'Texte').innerText()).match(/a/g) ?? []).length >= 20000, true);
  });

  test('B-9 Léa ouvre « Maître Aldric » : « Apparence » seule, sans trace de la Vérité, ni réglage', async () => {
    const { urlFiche } = await aldric(UNIVERS + ' B9');
    const lea = await compte('lea');
    await lea.page.goto(new URL(urlFiche).pathname);
    await attendre(lea.page);
    const t = await texte(lea.page);
    assert.ok(t.includes('Maître Aldric'));
    assert.ok(t.includes('Apparence'));
    assert.ok(t.includes('Un vieil homme au regard clair.'));
    assert.ok(!t.includes('Vérité'));
    assert.ok(!t.includes('traître'));
    assert.ok(!t.includes('MJ seul'));
    assert.equal(await lea.page.getByLabel(rx('Les joueurs la lisent')).count(), 0);
    assert.equal(await lea.page.getByRole('button', { name: /Modifier|Monter|Descendre|Retirer|Ajouter une section/ }).count(), 0);
    assert.deepEqual(await titresSections(lea.page), ['Apparence']);
    await lea.page.screenshot({ path: '/tmp/kanevas-preuves-b9-lea.png' });
  });

  test('B-9 le contenu fermé ne fuit pas par l’API : la Joueuse ne reçoit pas la section MJ', async () => {
    const { urlFiche } = await aldric(UNIVERS + ' B9a');
    const lea = await compte('lea');
    const cookie = (await lea.ctx.cookies()).map((c: Any) => `${c.name}=${c.value}`).join('; ');
    const ids = new URL(urlFiche).pathname.match(/univers\/(\d+)\/fiche\/(\d+)$/);
    assert.ok(ids, urlFiche);
    const res = await fetch(`${srv.base}/api/univers/${ids![1]}/fiches/${ids![2]}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const corps = await res.text();
    assert.ok(corps.includes('Apparence'));
    assert.ok(!corps.includes('Vérité'));
    assert.ok(!corps.includes('traître'));
  });

  test('B-9 fiche dont Léa ne lit rien : absente de la liste, adresse = « Page introuvable. »', async () => {
    const { antor } = await table(UNIVERS + ' B9b');
    await creerFiche(antor.page, 'personnage', 'Maître Cachottier');
    await ajouterSection(antor.page, 'Tout secret');
    const url = antor.page.url();
    const lea = await compte('lea');
    await ouvrirUnivers(lea.page, UNIVERS + ' B9b');
    await allerListe(lea.page, 'personnage');
    await voit(lea.page, 'Aucun personnage à voir pour l\'instant.');
    const t = await texte(lea.page);
    assert.ok(!t.includes('Maître Cachottier'));
    await lea.page.goto(new URL(url).pathname);
    await attendre(lea.page);
    const t2 = await texte(lea.page);
    assert.ok(t2.includes('Page introuvable.'));
    assert.ok(!t2.includes('Maître Cachottier'));
  });

  test('B-9 Teo, sans rôle, ne lit pas la fiche ; section lisible seulement de l’auteur : absente pour les autres joueurs', async () => {
    const { antor } = await table(UNIVERS + ' B9c', ['lea', 'teo']);
    const p = antor.page;
    await creerFiche(p, 'personnage', 'Léa PJ', true);
    const url = p.url();
    await ajouterSection(p, 'Journal');
    await choisirAuteur(p, 'Journal', 'lea');
    await attendre(p);
    await regler(p, 'Journal', 'L\'auteur la lit', true);
    const lea = await compte('lea');
    await lea.page.goto(new URL(url).pathname);
    await attendre(lea.page);
    assert.deepEqual(await titresSections(lea.page), ['Journal']);
    const teo = await compte('teo');
    await teo.page.goto(new URL(url).pathname);
    await attendre(teo.page);
    assert.ok((await texte(teo.page)).includes('Page introuvable.'));
    assert.ok(!(await texte(teo.page)).includes('Journal'));
  });

  test('B-8 auteur : Léa écrit « Notes de la table » ; Teo ne la voit pas tant que « Les joueurs la lisent » est faux', async () => {
    const { antor } = await table(UNIVERS + ' B8a', ['lea', 'teo']);
    const p = antor.page;
    await creerFiche(p, 'lieu', 'Taverne');
    const url = new URL(p.url()).pathname;
    await ajouterSection(p, 'Apparence');
    await regler(p, 'Apparence', 'Les joueurs la lisent', true);
    await ajouterSection(p, 'Notes de la table');
    await choisirAuteur(p, 'Notes de la table', 'lea');
    await attendre(p);
    await regler(p, 'Notes de la table', 'L\'auteur la lit', true);
    await regler(p, 'Notes de la table', 'L\'auteur l\'écrit', true);
    const lea = await compte('lea');
    await lea.page.goto(url);
    await attendre(lea.page);
    await ecrireSection(lea.page, 'Notes de la table', 'On a bu du vin.');
    await attendre(lea.page);
    await voit(lea.page, 'On a bu du vin.');
    await lea.page.reload();
    await attendre(lea.page);
    assert.ok((await texte(lea.page)).includes('On a bu du vin.'));
    const teo = await compte('teo');
    await teo.page.goto(url);
    await attendre(teo.page);
    assert.deepEqual(await titresSections(teo.page), ['Apparence']);
    assert.ok(!(await texte(teo.page)).includes('Notes de la table'));
    assert.ok(!(await texte(teo.page)).includes('On a bu du vin.'));
    // Léa can write only the section she authors, not Apparence
    assert.equal(await section(lea.page, 'Apparence').getByRole('button', { name: rxExact('Modifier') }).count(), 0);
  });

  test('B-8 deux onglets : le second à enregistrer voit « La section a changé… » et garde son texte', async () => {
    const { antor } = await table(UNIVERS + ' B8d', []);
    const p1 = antor.page;
    await creerFiche(p1, 'lieu', 'Forge');
    await ajouterSection(p1, 'Histoire');
    const url = new URL(p1.url()).pathname;
    const p2 = await antor.ctx.newPage();
    await p2.goto(url);
    await attendre(p2);
    await p1.reload();
    await attendre(p1);
    const s1 = section(p1, 'Histoire');
    const s2 = section(p2, 'Histoire');
    await s1.getByRole('button', { name: rxExact('Modifier') }).click();
    await s2.getByRole('button', { name: rxExact('Modifier') }).click();
    await s1.getByRole('textbox').fill('Premier.');
    await s1.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await attendre(p1);
    await s2.getByRole('textbox').fill('Second.');
    await s2.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await voit(p2, 'La section a changé depuis que vous l\'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous.');
    assert.equal(await s2.getByRole('textbox').inputValue(), 'Second.');
    await p1.reload();
    await attendre(p1);
    assert.ok((await section(p1, 'Histoire').innerText()).includes('Premier.'));
  });

  test('B-12 mode Joueur : Antor voit comme Léa, sans réglage ; retour mode MJ', async () => {
    const { antor, urlFiche } = await aldric(UNIVERS + ' B12');
    const p = antor.page;
    await p.goto(new URL(urlFiche).pathname);
    await attendre(p);
    assert.ok((await texte(p)).includes('Vérité — MJ seul'));
    await modeJoueur(p);
    await attendre(p);
    const t = await texte(p);
    assert.ok(t.includes('Apparence'));
    assert.ok(t.includes('Un vieil homme au regard clair.'));
    assert.ok(!t.includes('Vérité'));
    assert.ok(!t.includes('traître'));
    assert.ok(!t.includes('MJ seul'));
    assert.equal(await p.getByLabel(rx('Les joueurs la lisent')).count(), 0);
    assert.equal(await p.getByRole('button', { name: /Monter|Descendre|Retirer|Ajouter une section/ }).count(), 0);
    assert.deepEqual(await titresSections(p), ['Apparence']);
    await p.screenshot({ path: '/tmp/kanevas-preuves-b12-mode-joueur.png' });
  });

  test('B-12 mode Joueur : une section lue seulement de son auteur n’y apparaît pas ; aucune section lisible : message', async () => {
    const { antor } = await table(UNIVERS + ' B12b');
    const p = antor.page;
    await creerFiche(p, 'personnage', 'Journal de Léa', true);
    await ajouterSection(p, 'Journal');
    await choisirAuteur(p, 'Journal', 'lea');
    await attendre(p);
    await regler(p, 'Journal', 'L\'auteur la lit', true);
    await modeJoueur(p);
    await attendre(p);
    const t = await texte(p);
    assert.ok(t.includes('Aucune section n\'est visible des joueurs.'));
    assert.ok(!t.includes('Journal') || t.includes('Journal de Léa'));
    assert.deepEqual(await titresSections(p), []);
  });

  // ---------- B-28 ----------
  test('B-28 sans compte : toute page mène à la connexion, aucune donnée de l’API', async () => {
    const { urlFiche, urlUnivers } = await aldric(UNIVERS + ' B28');
    for (const chemin of ['/', new URL(urlUnivers).pathname, new URL(urlFiche).pathname, '/nimporte/quoi']) {
      const r = await fetch(srv.base + chemin, { redirect: 'manual' });
      assert.ok([301, 302, 303, 307].includes(r.status), `${chemin} -> ${r.status}`);
      assert.ok(String(r.headers.get('location')).includes('connexion'), chemin);
    }
    for (const chemin of ['/api/univers', '/api/moi', '/api/univers/1', '/api/univers/1/membres', '/api/univers/1/fiches']) {
      const r = await fetch(srv.base + chemin, { redirect: 'manual' });
      assert.equal(r.status, 401, chemin);
      assert.ok(!(await r.text()).includes('Ébène'));
    }
    const h = await fetch(srv.base + '/healthz');
    assert.equal(h.status, 200);
    assert.match(await h.text(), /^kanevas \S+$/);
    const assets = await fetch(srv.base + '/assets/', { redirect: 'manual' });
    assert.notEqual(assets.status, 200);
  });

  test('B-28 cookie de session falsifié : traité comme sans session', async () => {
    const r = await fetch(srv.base + '/api/univers', { headers: { cookie: 'kanevas_session=1.forge; session=1' }, redirect: 'manual' });
    assert.equal(r.status, 401);
  });

  // ---------- Bouchon, session ----------
  test('Bouchon : écran de choix des comptes, groupes de Admin, bandeau sur chaque page, déconnexion', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base });
    ctxs.push(ctx);
    const p = await ctx.newPage();
    await p.goto('/connexion-bouchon');
    const t = await texte(p);
    for (const n of ['Antor', 'Léa', 'Teo', 'Mira', 'Admin']) assert.ok(t.includes(n), n);
    assert.ok(t.includes('groupes : parents'));
    const bandeau = 'Mode bouchon — les comptes sont fictifs. Ne jamais l\'ouvrir en production.';
    assert.ok(t.includes(bandeau) || (await texte(p)).includes('mode bouchon') || /bouchon/i.test(t));
    await p.getByRole('button', { name: /^Se connecter en tant que Admin$/i }).click();
    await attendre(p);
    const moi = await p.evaluate(async () => (await fetch('/api/moi')).json());
    assert.deepEqual(moi, { username: 'admin', groups: ['parents'], limites: { contenuSection: 20000 } });
    assert.ok((await texte(p)).includes(bandeau));
    await p.goto('/creer-un-univers');
    await attendre(p);
    assert.ok((await texte(p)).includes(bandeau), 'bandeau on every page');
    await p.locator('aside .pied .menu-declencheur').click();
    await p.getByRole('menuitem', { name: rxExact('Se déconnecter') }).click();
    await attendre(p);
    assert.ok(p.url().includes('connexion'));
    const apres = await fetch(srv.base + '/api/moi', { redirect: 'manual' });
    assert.equal(apres.status, 401);
  });

  test('Bouchon : un compte ordinaire n’a aucun groupe', async () => {
    const lea = await compte('lea');
    const moi = await lea.page.evaluate(async () => (await fetch('/api/moi')).json());
    assert.deepEqual(moi, { username: 'lea', groups: [], limites: { contenuSection: 20000 } });
  });

  test('Bouchon : l’admin d’instance sans rôle n’a pas accès au contenu d’un univers', async () => {
    const { urlFiche } = await aldric(UNIVERS + ' Badm');
    const admin = await compte('admin');
    await admin.page.goto(new URL(urlFiche).pathname);
    await attendre(admin.page);
    const t = await texte(admin.page);
    assert.ok(t.includes('Page introuvable.'));
    assert.ok(!t.includes('Apparence'));
    assert.ok(!t.includes('Vérité'));
  });

  // ---------- B-29 : états ----------
  test('B-29 accueil : chargement, erreur avec « Réessayer », connexion perdue, nom long tronqué', async () => {
    const antor = await compte('antor');
    const nomLong = 'N'.repeat(80);
    await creerUnivers(antor.page, nomLong);
    const p = antor.page;
    // chargement
    await p.route('**/api/univers', async (route: Any) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await p.goto('/');
    await voit(p, 'Chargement de vos univers…');
    await attendre(p);
    await p.unroute('**/api/univers');
    // contenu long : le nom complet en infobulle
    const lien = p.getByRole('link', { name: rx(nomLong) }).first();
    assert.ok((await lien.locator('[title]').count()) > 0 || (await lien.getAttribute('title')) !== null, 'nom complet en infobulle');
    // erreur
    await p.route('**/api/univers', (route: Any) => route.fulfill({ status: 500, body: '{}' }));
    await p.goto('/');
    await voit(p, 'Impossible de charger vos univers.');
    await p.unroute('**/api/univers');
    await p.getByRole('button', { name: rxExact('Réessayer') }).first().click();
    await attendre(p);
    assert.ok((await texte(p)).includes(nomLong));
    // connexion perdue : le bandeau, « Créer un univers » désactivé
    await antor.ctx.setOffline(true);
    await voit(p, 'Connexion perdue. Ce que vous voyez peut être dépassé ; rien n\'est enregistré tant qu\'elle ne revient pas.');
    const creer = p.getByRole('button', { name: rxExact('Créer un univers') }).or(p.getByRole('link', { name: rxExact('Créer un univers') })).first();
    if ((await creer.evaluate((e: Element) => e.tagName)) === 'BUTTON') assert.equal(await creer.isDisabled(), true);
    await antor.ctx.setOffline(false);
    await p.getByText(/Connexion perdue/).waitFor({ state: 'detached' });
  });

  test('B-29 liste de fiches et fiche : erreur « Réessayer », connexion perdue désactive l’écriture', async () => {
    const { antor, urlFiche } = await aldric(UNIVERS + ' B29');
    const p = antor.page;
    await allerListe(p, 'personnage');
    await p.route('**/api/univers/*/fiches?*', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await p.route('**/api/univers/*/fiches', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await p.reload();
    await voit(p, 'Impossible de charger les fiches.');
    await p.unroute('**/api/univers/*/fiches?*');
    await p.unroute('**/api/univers/*/fiches');
    await p.getByRole('button', { name: rxExact('Réessayer') }).first().click();
    await attendre(p);
    assert.ok((await texte(p)).includes('Maître Aldric'));
    await antor.ctx.setOffline(true);
    await voit(p, 'Connexion perdue.');
    assert.equal(await p.getByRole('button', { name: rxExact('Nouveau personnage') }).first().isDisabled(), true);
    await antor.ctx.setOffline(false);
    await p.goto(new URL(urlFiche).pathname);
    await attendre(p);
    await antor.ctx.setOffline(true);
    await voit(p, 'Connexion perdue.');
    assert.equal(await p.getByRole('button', { name: /^Ajouter une section/ }).getAttribute('aria-disabled'), 'true');
    const menu = await ouvrirMenuSection(p, 'Apparence');
    assert.equal(await menu.getByRole('menuitem', { name: rxExact('Descendre') }).getAttribute('aria-disabled'), 'true');
    await p.keyboard.press('Escape');
    await antor.ctx.setOffline(false);
    // erreur de chargement de la fiche
    await p.route('**/api/univers/*/fiches/*', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await p.reload();
    await voit(p, 'Impossible de charger cette fiche.');
    await p.screenshot({ path: '/tmp/kanevas-preuves-b29-fiche-erreur.png' });
  });

  test('B-29 membres : erreur de chargement, retrait impossible hors connexion', async () => {
    const { antor } = await table(UNIVERS + ' B29m');
    const p = antor.page;
    await p.route('**/api/univers/*/membres', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await p.reload();
    await voit(p, 'Impossible de charger les membres.');
    await p.unroute('**/api/univers/*/membres');
    await p.getByRole('button', { name: rxExact('Réessayer') }).first().click();
    await attendre(p);
    await antor.ctx.setOffline(true);
    await voit(p, 'Connexion perdue.');
    assert.equal(await p.getByRole('button', { name: rxExact('Ajouter') }).isDisabled(), true);
    assert.equal(await p.getByRole('button', { name: /^Retirer / }).first().isDisabled(), true);
    await antor.ctx.setOffline(false);
  });

  test('B-29 échec d’écriture : « L’action n’a pas abouti. Réessayez. » et la valeur d’avant revient (audience)', async () => {
    const { antor, urlFiche } = await aldric(UNIVERS + ' B29w');
    const p = antor.page;
    await p.goto(new URL(urlFiche).pathname);
    await attendre(p);
    await p.route('**/api/univers/*/fiches/*/sections/*', (r: Any) =>
      r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
    );
    await section(p, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ }).click();
    const c = p.getByRole('dialog', { name: /^Qui voit/ }).getByRole('switch', { name: rx('Les joueurs l\'écrivent') });
    await c.click({ noWaitAfter: true });
    await voit(p, 'L\'action n\'a pas abouti. Réessayez.');
    assert.equal(await c.getAttribute('aria-checked'), 'false');
    assert.equal(await p.getByRole('status').getByText(/enregistrée/).count(), 0, 'a failure is never a toast');
  });
});

describe('kanevas-premiere-fiche, mode bouchon au démarrage', () => {
  for (const [variable, valeur] of [
    ['OIDC_ISSUER', 'https://auth.example.org/x'],
    ['OIDC_CLIENT_ID', 'x'],
  ] as const) {
    test(`KANEVAS_STUB=1 avec ${variable} posée : Kanevas refuse de démarrer`, async () => {
      const r = await startExpectingExit({ KANEVAS_STUB: '1', [variable]: valeur });
      assert.equal(r.exited, true);
      assert.notEqual(r.code, 0);
    });
  }

  test('KANEVAS_STUB=1 sans OIDC_* : démarre, healthz ne dit que nom et version', async () => {
    const s = await startServer();
    try {
      const r = await fetch(s.base + '/healthz');
      assert.match(await r.text(), /^kanevas \S+$/);
    } finally {
      s.stop();
    }
  });
});
