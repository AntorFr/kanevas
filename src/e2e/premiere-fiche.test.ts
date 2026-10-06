// Black-box tests of kanevas-premiere-fiche, from the need (docs/parcours.md B-1..B-5, B-7..B-9,
// B-12 ; docs/ecrans.md E-1..E-4, E-8, E-9) and not from the code. The real server runs in stub
// mode (AD-55), a real Chromium plays the users Antor (MJ), Léa and Teo (players), Mira.
//
// TEST PLAN (need -> case -> hard-coded expectation)
//   B-2  nominal  : Antor creates « Lame d'Ébène » -> its overview, GM badge, listed on the home screen
//        edges    : empty name; 80 / 81-character name; description 501; Annuler
//   B-1  nominal  : Teo, a new account -> « Aucun univers pour l'instant. » + « teo »
//        exclusion: no universe name is shown to an account without a role
//   B-3  nominal  : Antor adds lea (Joueur) -> Léa sees the universe, Joueur badge
//        failure  : « personne » -> « Ce compte ne s'est jamais connecté. »; lea twice -> « déjà membre »
//        edges    : partial identifier refused; changing the role (MJ then Joueur) opens/closes « Membres »
//        exclusion: no list of the instance's accounts
//   B-7  nominal  : « Maître Aldric » (PNJ) created from Personnages; PJ; case-insensitive alphabetical order
//        edges    : empty title; 120 / 121 characters; empty list GM / Player; unknown type
//   B-8  nominal  : add, set, reorder, remove (with confirmation), edit
//        edges    : section title 80 / 81; content 20,000 / 20,001; plain text; move the first one up
//        failure  : stale write -> « La section a changé depuis que vous l'avez ouverte… », text kept
//   B-9  nominal  : Léa opens Aldric -> « Apparence » only
//        exclusions: no « Vérité » title, no « MJ seul », no setting, no trace in the
//                    server's answers; a sheet without a readable section absent from the list and « Page introuvable. »
//   B-12 nominal  : Antor in Player mode sees what Léa sees; edges: « Modifier » only if players write
//   B-5  failure  : removing / demoting the only GM -> « Impossible : l'univers doit garder au moins un MJ. »
//   B-4  nominal  : Léa removed -> no more universe on the home screen, addresses -> « Page introuvable. »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  choisirDansMenuSection,
  confirmerRetraitSection,
  ouvrirMenuSection,
  allerListe,
  allerMembres,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  ecrireSection,
  launch,
  ouvrirFormulaireUnivers,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
  texte,
  titresSections,
  voit,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
const comptes: Record<string, Any> = {};

async function compte(nom: string): Promise<Any> {
  if (!comptes[nom]) {
    const { page } = await connecte(browser, srv.base, nom[0]!.toUpperCase() + nom.slice(1) === 'Lea' ? 'Léa' : nom[0]!.toUpperCase() + nom.slice(1));
    comptes[nom] = page;
  }
  return comptes[nom];
}

const NOM = "Lame d'Ébène";
const DESC = 'Un royaume de cendres et de lames.';
let urlUnivers = '';
let urlFiche = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await (await import('./harnais.test.js')).launch();
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

// ---------------------------------------------------------------- B-2

test('B-2 Antor crée « Lame d\'Ébène » : il arrive sur sa vue d\'ensemble, en MJ, et la retrouve à l\'accueil', opts, async () => {
  const antor = await compte('antor');
  await creerUnivers(antor, NOM, DESC);
  await antor.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  urlUnivers = new URL(antor.url()).pathname;
  const t = await texte(antor);
  assert.ok(t.includes(DESC), 'description shown');
  assert.ok(/\bMJ\b/.test(t), 'role badge MJ shown');
  assert.ok(!t.includes("Rien à afficher pour l'instant."), 'blocks of kanevas-suivi replace the empty region');
  assert.ok(t.includes('Campagnes actives') && t.includes('Derniers comptes-rendus'));
  await antor.goto('/');
  await voit(antor, NOM);
  const carte = antor.getByRole('link', { name: rx(NOM) });
  assert.ok(/MJ/.test(await carte.innerText()));
});

test('B-2 nom vide, 81 caractères, description de 501 : refusés avec le texte de la doc, rien n\'est créé', opts, async () => {
  const antor = await compte('antor');
  await ouvrirFormulaireUnivers(antor);
  await antor.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await voit(antor, 'Erreur : le nom est obligatoire.');
  await antor.getByRole('textbox', { name: /^Nom/ }).fill('N'.repeat(81));
  await antor.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await voit(antor, 'Erreur : 80 caractères au plus.');
  await antor.getByRole('textbox', { name: /^Nom/ }).fill('Valide');
  await antor.getByLabel('Description').fill('d'.repeat(501));
  await antor.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await voit(antor, 'Erreur : 500 caractères au plus.');
  await antor.getByRole('button', { name: rxExact('Annuler') }).click();
  await antor.waitForURL((u: URL) => u.pathname === '/');
  await voit(antor, NOM);
  const t = await texte(antor);
  assert.ok(!t.includes('Valide'), 'no universe was created by the refused submissions');
  assert.ok(!t.includes('NNNNNNNN'));
});

test('B-2 un nom de 80 caractères est accepté, tronqué à l\'accueil avec le nom complet en infobulle', opts, async () => {
  const antor = await compte('antor');
  const long = 'L'.repeat(80);
  await creerUnivers(antor, long);
  await antor.getByRole('heading', { name: long, level: 1 }).waitFor();
  await antor.goto('/');
  await voit(antor, long);
  const lien = antor.getByRole('link', { name: rx(long) }).first();
  const titre = await lien.evaluate((e: Element) => e.getAttribute('title') ?? e.querySelector('[title]')?.getAttribute('title'));
  assert.equal(titre, long);
});

// ---------------------------------------------------------------- B-1

test('B-1 Teo, compte neuf, voit « Aucun univers pour l\'instant. » et son identifiant, aucun nom d\'univers', opts, async () => {
  const teo = await compte('teo');
  await teo.goto('/');
  await voit(teo, "Aucun univers pour l'instant.");
  const t = await texte(teo);
  assert.ok(t.includes('Connecté en tant que teo'));
  assert.ok(t.includes("Vous menez une partie ? Créez un univers."));
  assert.ok(t.includes('Vous êtes joueur ? Donnez votre identifiant à votre MJ : teo'));
  assert.ok(!t.includes("Lame d'Ébène"), 'existing universe is not named');
  assert.ok(!t.includes('LLLLLLLL'));
});

// ---------------------------------------------------------------- B-3

test('B-3 « personne » (jamais connecté) est refusé : « Ce compte ne s\'est jamais connecté. »', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await ajouterMembre(antor, 'personne');
  await voit(antor, "Ce compte ne s'est jamais connecté.");
  assert.ok(!(await texte(antor)).includes('personne\n'), 'unknown account is not listed');
});

test('B-3 Antor ajoute lea en Joueur : Léa voit l\'univers, badge Joueur ; ajouter lea une seconde fois est refusé', opts, async () => {
  const lea = await compte('lea'); // Léa has now connected once
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await antor.locator('.liste-membres, main').getByText('lea', { exact: true }).first().waitFor();
  await lea.goto('/');
  await voit(lea, NOM);
  assert.ok(/Joueur/.test(await lea.getByRole('link', { name: rx(NOM) }).first().innerText()));
  await lea.getByRole('link', { name: rx(NOM) }).first().click();
  await lea.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  await ajouterMembre(antor, 'lea', 'Joueur');
  await voit(antor, 'Ce compte est déjà membre.');
});

test('B-3 identifiant partiel refusé (« le » n\'est pas « lea »), et aucune liste des comptes de l\'instance', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await ajouterMembre(antor, 'le');
  await voit(antor, "Ce compte ne s'est jamais connecté.");
  const t = await texte(antor);
  assert.ok(!t.includes('teo'), 'Teo (connected, not a member) is not shown to the MJ');
  assert.ok(!t.includes('mira'));
});

test('B-3 changer le rôle de lea en MJ lui ouvre « Membres », la remettre Joueur le ferme', opts, async () => {
  const antor = await compte('antor');
  const lea = await compte('lea');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await antor.getByLabel('Rôle de lea').selectOption({ label: 'MJ' });
  await lea.goto(urlUnivers);
  await lea.getByRole('link', { name: rxExact('Membres') }).waitFor();
  await antor.getByLabel('Rôle de lea').selectOption({ label: 'Joueur' });
  await lea.goto(urlUnivers);
  await lea.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  assert.equal(await lea.getByRole('link', { name: rxExact('Membres') }).count(), 0);
  // forced address: « Page introuvable. »
  await lea.goto(urlUnivers + '/membres');
  await voit(lea, 'Page introuvable.');
});

// ---------------------------------------------------------------- B-7

test('B-7 listes vides : MJ « Aucun lieu pour l\'instant. » + « Nouveau lieu » ; Joueur « Aucun lieu à voir pour l\'instant. » sans bouton', opts, async () => {
  const antor = await compte('antor');
  const lea = await compte('lea');
  await antor.goto(urlUnivers);
  await allerListe(antor, 'lieu');
  await voit(antor, "Aucun lieu pour l'instant.");
  assert.equal(await antor.getByRole('button', { name: rxExact('Nouveau lieu') }).count(), 1);
  await lea.goto(urlUnivers);
  await allerListe(lea, 'lieu');
  await voit(lea, "Aucun lieu à voir pour l'instant.");
  assert.equal(await lea.getByRole('button', { name: rx('Nouveau') }).count(), 0);
});

test('B-7 titre vide ou de 121 caractères refusé ; 120 accepté ; les fiches se classent par titre sans casse', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await allerListe(antor, 'lieu');
  await antor.getByRole('button', { name: rxExact('Nouveau lieu') }).first().click();
  const f = antor.getByRole('dialog');
  await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
  await voit(antor, 'Erreur : le titre est obligatoire.');
  await f.getByLabel('Titre').fill('T'.repeat(121));
  await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
  await voit(antor, 'Erreur : 120 caractères au plus.');
  await f.getByRole('button', { name: rxExact('Annuler') }).click();
  for (const t of ['charlie', 'Alpha', 'bravo']) {
    await creerFiche(antor, 'lieu', t);
    await antor.getByRole('heading', { name: t, level: 1 }).waitFor();
  }
  await creerFiche(antor, 'lieu', 'L'.repeat(120));
  await allerListe(antor, 'lieu');
  await voit(antor, 'charlie');
  const noms: string[] = await antor.locator('main a').allInnerTexts();
  const courts = noms.map((n) => n.split('\n')[0]!.trim()).filter((n) => n.length < 20);
  assert.deepEqual(courts, ['Alpha', 'bravo', 'charlie']);
});

test('B-7 Antor crée « Maître Aldric » (PNJ par défaut) depuis Personnages, puis un PJ ; badges PNJ et PJ', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  urlFiche = new URL(antor.url()).pathname;
  assert.ok(/PNJ/.test(await antor.locator('main').innerText()));
  await voit(antor, "Cette fiche n'a pas encore de section.");
  await creerFiche(antor, 'personnage', 'Zora', true);
  await antor.getByRole('heading', { name: 'Zora', level: 1 }).waitFor();
  assert.ok(/\bPJ\b/.test(await antor.locator('main').innerText()));
  await allerListe(antor, 'personnage');
  await voit(antor, 'Maître Aldric');
  const t = await texte(antor);
  assert.ok(t.includes('Zora'));
});

test('B-7 un type inconnu répond « Page introuvable. »', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers + '/fiches/inconnus');
  await voit(antor, 'Page introuvable.');
});

// ---------------------------------------------------------------- B-8

test('B-8 Antor ajoute « Apparence » puis « Vérité — MJ seul » : sections vides, fermées aux joueurs, dans l\'ordre d\'ajout', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await antor.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await ajouterSection(antor, 'Apparence');
  await section(antor, 'Apparence').waitFor();
  await ajouterSection(antor, 'Vérité — MJ seul');
  await section(antor, 'Vérité').waitFor();
  assert.deepEqual(await titresSections(antor), ['Apparence', 'Vérité — MJ seul']);
  const s = section(antor, 'Apparence');
  assert.ok((await s.innerText()).replace(/’/g, "'").includes("Rien d'écrit pour l'instant."));
  await s.getByRole('button', { name: /^MJ seul — régler l['’]audience de/ }).waitFor();
  await s.getByRole('button', { name: /régler l['’]audience de/ }).click();
  const boite = antor.getByRole('dialog', { name: /^Qui voit « Apparence »/ });
  assert.equal(await boite.getByRole('switch', { name: rx('Les joueurs la lisent') }).getAttribute('aria-checked'), 'false');
  assert.equal(await boite.getByRole('switch', { name: rx('Les joueurs l’écrivent') }).getAttribute('aria-checked'), 'false');
  await antor.keyboard.press('Escape');
});

test('B-8 titre de section vide ou de 81 caractères refusé ; 80 accepté', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await section(antor, 'Apparence').waitFor();
  await antor.getByRole('button', { name: /^Ajouter une section/ }).click();
  await antor.getByRole('button', { name: rxExact('Ajouter la section') }).click();
  await voit(antor, 'Erreur : le titre est obligatoire.');
  await antor.getByLabel('Titre de la section').fill('S'.repeat(81));
  await antor.getByRole('button', { name: rxExact('Ajouter la section') }).click();
  await voit(antor, 'Erreur : 80 caractères au plus.');
  assert.equal((await titresSections(antor)).length, 2);
  await antor.getByLabel('Titre de la section').fill('S'.repeat(80));
  await antor.getByRole('button', { name: rxExact('Ajouter la section') }).click();
  await section(antor, 'S'.repeat(80)).waitFor();
  assert.equal((await titresSections(antor)).length, 3);
  // retire it again (cleanup of the shared scenario)
  await choisirDansMenuSection(antor, 'S'.repeat(80), 'Retirer la section');
  await confirmerRetraitSection(antor);
});

test('B-8 monter / descendre réordonne et l\'ordre survit au rechargement ; « Monter » sur la première est sans effet', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await section(antor, 'Vérité').waitFor();
  // « Monter » on the first section is inert: visible in the menu, aria-disabled, nothing moves.
  const menuPremiere = await ouvrirMenuSection(antor, 'Apparence');
  assert.equal(await menuPremiere.getByRole('menuitem', { name: rxExact('Monter') }).getAttribute('aria-disabled'), 'true');
  await menuPremiere.getByRole('menuitem', { name: rxExact('Monter') }).click({ force: true });
  await antor.keyboard.press('Escape');
  await antor.waitForTimeout(500);
  assert.deepEqual(await titresSections(antor), ['Apparence', 'Vérité — MJ seul']);
  await choisirDansMenuSection(antor, 'Vérité', 'Monter');
  for (let i = 0; i < 40 && (await titresSections(antor))[0] !== 'Vérité — MJ seul'; i++) await antor.waitForTimeout(100);
  assert.deepEqual(await titresSections(antor), ['Vérité — MJ seul', 'Apparence']);
  await antor.reload();
  await section(antor, 'Apparence').waitFor();
  assert.deepEqual(await titresSections(antor), ['Vérité — MJ seul', 'Apparence']);
  await choisirDansMenuSection(antor, 'Vérité', 'Descendre');
  for (let i = 0; i < 40 && (await titresSections(antor))[0] !== 'Apparence'; i++) await antor.waitForTimeout(100);
  assert.deepEqual(await titresSections(antor), ['Apparence', 'Vérité — MJ seul']);
});

test('B-8 écrire : le texte s\'affiche en texte brut (le HTML n\'est pas interprété), 20 000 caractères passent, 20 001 sont refusés', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await section(antor, 'Apparence').waitFor();
  await ecrireSection(antor, 'Apparence', 'Grand, barbe grise. <b>gras</b>');
  await voit(antor, 'Grand, barbe grise. <b>gras</b>');
  assert.equal(await section(antor, 'Apparence').locator('b').count(), 0);
  const s = section(antor, 'Apparence');
  await s.getByRole('button', { name: rxExact('Modifier') }).click();
  await s.getByRole('textbox').fill('x'.repeat(20001));
  await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(antor, 'Erreur : 20 000 caractères au plus.');
  await s.getByRole('textbox').fill('y'.repeat(20000));
  await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
  const plein = s.getByText(/^y{20000}$/);
  await plein.waitFor();
  assert.equal(((await plein.textContent()) ?? '').length, 20000);
  await ecrireSection(antor, 'Apparence', 'Grand, barbe grise.');
  await voit(antor, 'Grand, barbe grise.');
  await ecrireSection(antor, 'Vérité', 'Aldric est le traître.');
  await voit(antor, 'Aldric est le traître.');
});

test('B-8 deux onglets sur la même section : le second à enregistrer voit « La section a changé… » et son texte reste', opts, async () => {
  const antor = await compte('antor');
  const second = await antor.context().newPage();
  second.setDefaultTimeout(8000);
  await antor.goto(urlFiche);
  await second.goto(urlFiche);
  await section(antor, 'Vérité').waitFor();
  await section(second, 'Vérité').waitFor();
  const a = section(antor, 'Vérité');
  const b = section(second, 'Vérité');
  await a.getByRole('button', { name: rxExact('Modifier') }).click();
  await b.getByRole('button', { name: rxExact('Modifier') }).click();
  await a.getByRole('textbox').fill('Version du premier onglet.');
  await a.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(antor, 'Version du premier onglet.');
  await b.getByRole('textbox').fill('Version du second onglet.');
  await b.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(second, "La section a changé depuis que vous l'avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous.");
  assert.equal(await b.getByRole('textbox').inputValue(), 'Version du second onglet.');
  await b.getByRole('button', { name: rxExact('Recharger la section') }).waitFor();
  await second.close();
  await ecrireSection(antor, 'Vérité', 'Aldric est le traître.');
  await voit(antor, 'Aldric est le traître.');
});

test('B-8 retirer une section : confirmation « Retirer la section « Vérité — MJ seul » ? Son contenu sera perdu. », Annuler la garde', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await ajouterSection(antor, 'Éphémère');
  await section(antor, 'Éphémère').waitFor();
  await choisirDansMenuSection(antor, 'Éphémère', 'Retirer la section');
  const dialogue = antor.getByRole('alertdialog', { name: rx('Retirer la section « Éphémère » ?') });
  await dialogue.waitFor();
  assert.ok(rx('Son contenu sera perdu.').test(await dialogue.innerText()));
  await dialogue.getByRole('button', { name: rxExact('Annuler') }).click();
  assert.equal(await section(antor, 'Éphémère').count(), 1);
  await choisirDansMenuSection(antor, 'Éphémère', 'Retirer la section');
  await confirmerRetraitSection(antor);
  for (let i = 0; i < 40 && (await section(antor, 'Éphémère').count()) > 0; i++) await antor.waitForTimeout(100);
  assert.equal(await section(antor, 'Éphémère').count(), 0);
  assert.deepEqual(await titresSections(antor), ['Apparence', 'Vérité — MJ seul']);
});

// ---------------------------------------------------------------- B-9 (Aldric's sheet: Apparence open, Vérité closed)

test('B-9 Léa ouvre « Maître Aldric » dont « Apparence » est lue des joueurs : elle voit « Apparence » seule, sans trace de « Vérité »', opts, async () => {
  const antor = await compte('antor');
  const lea = await compte('lea');
  await antor.goto(urlFiche);
  await section(antor, 'Apparence').waitFor();
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  await section(antor, 'Apparence').getByRole('button', { name: /^Lue des joueurs — régler l['’]audience de/ }).waitFor();

  const corps: string[] = [];
  lea.on('response', async (r: Any) => {
    if (r.url().includes('/api/')) corps.push(await r.text().catch(() => ''));
  });
  await lea.goto(urlFiche);
  await lea.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
  await section(lea, 'Apparence').waitFor();
  await attendre(lea);
  const t = await texte(lea);
  assert.ok(t.includes('Grand, barbe grise.'));
  assert.deepEqual(await titresSections(lea), ['Apparence']);
  assert.ok(!t.includes('Vérité'), 'no title of the hidden section');
  assert.ok(!t.includes('traître'), 'no content of the hidden section');
  assert.ok(!t.includes('MJ seul'), 'no pill');
  for (const mot of ['Modifier', 'Les joueurs la lisent', 'Monter', 'Descendre', 'Retirer', 'Ajouter une section', 'Mode Joueur']) {
    assert.ok(!t.includes(mot), `no control « ${mot} » for a player`);
  }
  const html: string = await lea.content();
  assert.ok(!html.includes('Vérité') && !html.includes('traître'), 'no trace in the DOM');
  assert.ok(corps.length > 0, 'the page did call the API');
  assert.ok(corps.every((c) => !c.includes('Vérité') && !c.includes('traître')), 'no trace in the server answers');
});

test('B-9 une fiche dont Léa ne lit aucune section est absente de sa liste et son adresse répond « Page introuvable. »', opts, async () => {
  const antor = await compte('antor');
  const lea = await compte('lea');
  await antor.goto(urlUnivers);
  await creerFiche(antor, 'personnage', 'Seigneur Noir');
  await antor.getByRole('heading', { name: 'Seigneur Noir', level: 1 }).waitFor();
  const urlNoir = new URL(antor.url()).pathname;
  await ajouterSection(antor, 'Plans secrets');
  await section(antor, 'Plans secrets').waitFor();
  await ecrireSection(antor, 'Plans secrets', 'Conquérir la ville.');
  await voit(antor, 'Conquérir la ville.');
  // and a fiche without any section at all
  await creerFiche(antor, 'personnage', 'Fiche vide');
  await antor.getByRole('heading', { name: 'Fiche vide', level: 1 }).waitFor();
  const urlVide = new URL(antor.url()).pathname;

  await lea.goto(urlUnivers);
  await allerListe(lea, 'personnage');
  await voit(lea, 'Maître Aldric');
  const t = await texte(lea);
  assert.ok(!t.includes('Seigneur Noir'), 'fiche with no readable section is not listed');
  assert.ok(!t.includes('Fiche vide'), 'fiche with no section is not listed');
  for (const u of [urlNoir, urlVide]) {
    await lea.goto(u);
    await voit(lea, 'Page introuvable.');
    const tt = await texte(lea);
    assert.ok(!tt.includes('Seigneur Noir') && !tt.includes('Plans secrets') && !tt.includes('Conquérir'));
    await lea.getByRole('link', { name: rxExact('Mes univers') }).first().waitFor();
  }
});

test('B-9 Léa, auteur d\'une section fermée aux joueurs, la lit et l\'écrit ; Teo, simple Joueur, n\'en voit rien', opts, async () => {
  const antor = await compte('antor');
  const lea = await compte('lea');
  const teo = await compte('teo');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await ajouterMembre(antor, 'teo', 'Joueur');
  await antor.getByLabel('Rôle de teo').waitFor();
  await antor.goto(urlFiche);
  await ajouterSection(antor, 'Notes de la table');
  await section(antor, 'Notes de la table').waitFor();
  const s = section(antor, 'Notes de la table');
  await s.getByRole('button', { name: /régler l['’]audience de/ }).click();
  await antor.getByRole('dialog', { name: /^Qui voit/ }).getByRole('combobox', { name: /Auteur/ }).selectOption({ label: 'lea' });
  await antor.getByRole('dialog', { name: /^Qui voit/ }).getByRole('switch', { name: rx('L’auteur la lit') }).waitFor();
  await antor.getByRole('dialog', { name: /^Qui voit/ }).getByRole('combobox', { name: /Auteur/ }).focus();
  await antor.keyboard.press('Escape');
  await antor.getByRole('dialog', { name: /^Qui voit/ }).waitFor({ state: 'detached' });
  await regler(antor, 'Notes de la table', "L'auteur la lit", true);
  await regler(antor, 'Notes de la table', "L'auteur l'écrit", true);

  await lea.goto(urlFiche);
  await section(lea, 'Notes de la table').waitFor();
  await ecrireSection(lea, 'Notes de la table', 'Léa a vu Aldric au marché.');
  await voit(lea, 'Léa a vu Aldric au marché.');
  assert.ok(!(await texte(lea)).includes('Vérité'));

  await teo.goto(urlFiche);
  await section(teo, 'Apparence').waitFor();
  const t = await texte(teo);
  assert.ok(!t.includes('Notes de la table') && !t.includes('Léa a vu Aldric'), 'Teo sees nothing of the author section');
  assert.ok(!t.includes('Vérité'));

  // the author's own rights are those the MJ set: withdrawn, Léa no longer sees the section
  await antor.goto(urlFiche);
  await section(antor, 'Notes de la table').waitFor();
  await regler(antor, 'Notes de la table', "L'auteur l'écrit", false);
  await regler(antor, 'Notes de la table', "L'auteur la lit", false);
  await lea.goto(urlFiche);
  await section(lea, 'Apparence').waitFor();
  const tl = await texte(lea);
  assert.ok(!tl.includes('Notes de la table') && !tl.includes('Léa a vu Aldric'), 'author without « L\'auteur la lit » does not read');
  await regler(antor, 'Notes de la table', "L'auteur la lit", true);
  await regler(antor, 'Notes de la table', "L'auteur l'écrit", true);
});

test('B-9 Teo, sans rôle dans un univers, reçoit la même réponse que pour une fiche inconnue, nom de l\'univers tu', opts, async () => {
  const antor = await compte('antor');
  const mira = await compte('mira'); // never added to the universe
  await mira.goto(urlUnivers);
  await voit(mira, 'Page introuvable.');
  let t = await texte(mira);
  assert.ok(!t.includes("Lame d'Ébène"), 'universe name not leaked');
  await mira.getByRole('link', { name: rxExact('Mes univers') }).first().waitFor();
  await mira.goto(urlFiche);
  await voit(mira, 'Page introuvable.');
  t = await texte(mira);
  assert.ok(!t.includes('Aldric') && !t.includes('Apparence'));
  // same answer as an address that never existed, at the API level the pages use
  const id = urlUnivers.split('/').pop();
  const reel = await mira.request.get(`/api/univers/${id}`);
  const inconnu = await mira.request.get('/api/univers/987654');
  assert.equal(reel.status(), inconnu.status());
  assert.equal(await reel.text(), await inconnu.text());
  const f1 = await mira.request.get(`/api/univers/${id}/fiches/1`);
  const f2 = await mira.request.get('/api/univers/987654/fiches/1');
  assert.equal(f1.status(), f2.status());
  assert.equal(await f1.text(), await f2.text());
  void antor;
});

// ---------------------------------------------------------------- B-12

test('B-12 Antor en mode Joueur voit « Apparence » seule, comme Léa, et plus aucun réglage ; le mode MJ rend tout', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await section(antor, 'Vérité').waitFor();
  await antor.getByLabel('Mode Joueur').check();
  await section(antor, 'Apparence').waitFor();
  for (let i = 0; i < 40 && (await section(antor, 'Vérité').count()) > 0; i++) await antor.waitForTimeout(100);
  const t = await texte(antor);
  assert.deepEqual(await titresSections(antor), ['Apparence']);
  assert.ok(t.includes('Grand, barbe grise.'));
  assert.ok(!t.includes('Vérité') && !t.includes('traître') && !t.includes('MJ seul') && !t.includes('Notes de la table'));
  for (const mot of ['Les joueurs la lisent', 'Monter', 'Descendre', 'Retirer la section', 'Ajouter une section', 'Modifier']) {
    assert.ok(!t.includes(mot), `no « ${mot} » in player mode (nobody lets players write Apparence)`);
  }
  await voit(antor, 'Mode Joueur : vous voyez ce que voit un joueur.');
  assert.equal(await antor.getByRole('button', { name: /régler l['’]audience de/ }).count(), 0, 'no audience badge in player mode');
  assert.equal(await antor.getByRole('button', { name: /^Autres actions sur/ }).count(), 0, 'no « ⋯ » menu in player mode');
  assert.equal(await antor.locator('main section[data-aud]').count(), 0, 'no rule nor hatching in player mode');
  await antor.getByLabel('Mode MJ').check();
  await section(antor, 'Vérité').waitFor();
  assert.deepEqual(await titresSections(antor), ['Apparence', 'Vérité — MJ seul', 'Notes de la table']);
});

test('B-12 en mode Joueur, « Modifier » n\'apparaît que sur une section que les joueurs écrivent', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  await section(antor, 'Apparence').waitFor();
  await regler(antor, 'Apparence', 'Les joueurs l\'écrivent', true);
  await antor.getByLabel('Mode Joueur').check();
  for (let i = 0; i < 40 && (await section(antor, 'Vérité').count()) > 0; i++) await antor.waitForTimeout(100);
  await section(antor, 'Apparence').getByRole('button', { name: rxExact('Modifier') }).waitFor();
  assert.equal(await antor.getByRole('button', { name: rxExact('Modifier') }).count(), 1);
  await antor.getByLabel('Mode MJ').check();
  await section(antor, 'Apparence').getByRole('button', { name: /régler l['’]audience de/ }).waitFor();
  await regler(antor, 'Apparence', 'Les joueurs l\'écrivent', false);
});

test('B-12 mode Joueur sur une fiche dont aucune section n\'est lisible des joueurs : « Aucune section n\'est visible des joueurs. »', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await allerListe(antor, 'personnage');
  await antor.getByRole('link', { name: rx('Seigneur Noir') }).click();
  await antor.getByRole('heading', { name: 'Seigneur Noir', level: 1 }).waitFor();
  await antor.getByLabel('Mode Joueur').check();
  await voit(antor, "Aucune section n'est visible des joueurs.");
});

// ---------------------------------------------------------------- B-5 then B-4 (they undo the table)

test('B-5 Antor, seul MJ, ne peut ni se retirer ni se rétrograder : « Impossible : l\'univers doit garder au moins un MJ. », liste inchangée', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await antor.getByLabel('Rôle de lea').waitFor();
  await antor.getByRole('button', { name: rx('Retirer antor') }).click();
  await voit(antor, 'Retirer antor de Lame d\'Ébène ?');
  await antor.getByRole('button', { name: rxExact('Retirer antor') }).last().click();
  await voit(antor, "Impossible : l'univers doit garder au moins un MJ.");
  assert.equal(await antor.getByLabel('Rôle de antor').inputValue(), 'mj');
  await antor.reload();
  await antor.getByLabel('Rôle de antor').waitFor();
  assert.equal(await antor.getByLabel('Rôle de antor').inputValue(), 'mj');
  // demoting the only MJ is refused the same way
  await antor.getByLabel('Rôle de antor').selectOption({ label: 'Joueur' });
  await voit(antor, "Impossible : l'univers doit garder au moins un MJ.");
  assert.equal(await antor.getByLabel('Rôle de antor').inputValue(), 'mj');
});

test('B-4 retirer Léa : confirmation, Annuler la garde ; une fois retirée elle perd l\'univers (accueil vide, adresses introuvables)', opts, async () => {
  const antor = await compte('antor');
  const lea = await compte('lea');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await antor.getByRole('button', { name: rx('Retirer lea') }).click();
  // the confirmation is the standard dialog: title (h2) and text (p) are two elements
  const confirmation = antor.getByRole('alertdialog', { name: /Retirer lea de Lame d.Ébène \?/ });
  await confirmation.waitFor();
  assert.equal(((await confirmation.innerText()) as string).replace(/’/g, "'").replace(/\s+/g, ' ').includes("Elle ne verra plus l'univers."), true);
  await confirmation.getByRole('button', { name: rxExact('Annuler') }).click();
  await confirmation.waitFor({ state: 'detached' });
  await lea.goto('/');
  await voit(lea, NOM);
  await antor.getByRole('button', { name: rx('Retirer lea') }).click();
  await antor.getByRole('button', { name: rxExact('Retirer lea') }).last().click();
  for (let i = 0; i < 40 && (await antor.getByLabel('Rôle de lea').count()) > 0; i++) await antor.waitForTimeout(100);
  assert.equal(await antor.getByLabel('Rôle de lea').count(), 0);

  await lea.goto('/');
  await voit(lea, "Aucun univers pour l'instant.");
  assert.ok(!(await texte(lea)).includes(NOM));
  for (const u of [urlUnivers, urlFiche]) {
    await lea.goto(u);
    await voit(lea, 'Page introuvable.');
    const t = await texte(lea);
    assert.ok(!t.includes(NOM) && !t.includes('Aldric') && !t.includes('Apparence'));
  }
  const id = urlUnivers.split('/').pop();
  const reel = await lea.request.get(`/api/univers/${id}`);
  const inconnu = await lea.request.get('/api/univers/987654');
  assert.equal(reel.status(), inconnu.status());
  assert.equal(await reel.text(), await inconnu.text());
});

test('B-5 un second MJ permet à Antor de se retirer : il revient à l\'accueil, l\'univers reste à Mira', opts, async () => {
  const antor = await compte('antor');
  const mira = await compte('mira');
  await antor.goto(urlUnivers);
  await allerMembres(antor);
  await ajouterMembre(antor, 'mira', 'MJ');
  await antor.getByLabel('Rôle de mira').waitFor();
  await antor.getByRole('button', { name: rx('Retirer antor') }).click();
  await antor.getByRole('button', { name: rxExact('Retirer antor') }).last().click();
  await antor.waitForURL((u: URL) => u.pathname === '/');
  await mira.goto('/');
  await voit(mira, NOM);
  await mira.getByRole('link', { name: rx(NOM) }).first().click();
  await mira.getByRole('heading', { name: NOM, level: 1 }).waitFor();
  await mira.getByRole('link', { name: rxExact('Membres') }).waitFor();
});
