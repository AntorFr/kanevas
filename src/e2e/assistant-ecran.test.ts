// Black-box tests of kanevas-am-ecran: E-12 Assistant (docs/ecrans.md § `kanevas-assistant-membre`),
// driven in a real Chromium against the real server in stub mode (AD-55, AD-78).
//
// TEST PLAN
//   bouton       : members (GM, player) have « Demander à Kanevas »; the admin without a role and a
//                  page outside a universe have none
//   lecture      : Léa asks « Que sait-on d'Aldric ? » → « Apparence », never « Vérité »; asks to read
//                  « Vérité » → « Introuvable. »
//   écriture     : Léa adds a paragraph to « Notes de la table » → « Écrit par l'assistant », the label,
//                  « Ouvrir » leads to the sheet where the paragraph is written
//   refus        : Léa writes in a section she only reads → « Vous ne pouvez pas modifier cette section. »
//                  and no write block; Léa asks for a scenario → no write block
//   création     : Antor creates a scenario (link → E-7, listed on E-6) and a campaign (link → E-6)
//   pastille     : the badge says « MJ » for Antor, « Joueur » for Léa, also in player mode
//   fil          : survives a screen change and closing the panel; « Nouvelle conversation » empties it;
//                  never written in the browser storage
//   erreur       : « échec » → « Je n'ai pas pu répondre — réessayer », « Réessayer » sends the question
//                  again, shown once
//   états        : empty, availability loading / failure / unavailable, answer pending (« Kanevas
//                  réfléchit… »), 429, connection lost, 2 001 characters, more than 20 messages
//   clavier      : Escape closes the panel and gives the focus back to the button; 390 px: full screen
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  allerMembres,
  attendre,
  choisirAuteur,
  connecte,
  creerFiche,
  creerUnivers,
  ecrireSection,
  launch,
  regler,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
  texte,
  voit,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
const ERREUR = /Je n['’]ai pas pu répondre — réessayer/;
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let admin: Any;
let urlFiche = '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  admin = (await connecte(browser, srv.base, 'Admin')).page;
  await creerUnivers(antor, 'Lame d’Ébène');
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  urlFiche = '/univers/1/fiche/1'; // fresh database
  await ajouterSection(antor, 'Apparence');
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  await ecrireSection(antor, 'Apparence', 'Un grand homme à la cape grise.');
  await voit(antor, 'Un grand homme à la cape grise.');
  await ajouterSection(antor, 'Vérité');
  await ecrireSection(antor, 'Vérité', 'Aldric est le régent déchu.');
  await voit(antor, 'Aldric est le régent déchu.');
  await ajouterSection(antor, 'Notes de la table');
  await choisirAuteur(antor, 'Notes de la table', 'lea');
  await regler(antor, 'Notes de la table', 'L’auteur la lit', true);
  await regler(antor, 'Notes de la table', 'L’auteur l’écrit', true);
  // a campaign for the scenario
  await antor.goto('/univers/1/campagnes');
  await attendre(antor);
  await antor.getByLabel(/^Nom/).fill('La Couronne brisée');
  await antor.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await attendre(antor);
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const bouton = (p: Any) => p.getByRole('button', { name: 'Demander à Kanevas' });
const panneau = (p: Any) => p.getByRole('complementary', { name: /Kanevas — assistant/ });
const champ = (p: Any) => panneau(p).getByRole('textbox', { name: 'Demander à Kanevas' });
const envoyer = (p: Any) => panneau(p).getByRole('button', { name: 'Envoyer' });

async function ouvrir(p: Any, url = urlFiche) {
  await p.goto(url);
  await attendre(p);
  if ((await panneau(p).count()) === 0) await bouton(p).click();
  await panneau(p).waitFor();
  await champ(p).waitFor();
}
async function demander(p: Any, q: string) {
  await champ(p).fill(q);
  await envoyer(p).click();
}
async function nouvelle(p: Any) {
  await panneau(p).getByRole('button', { name: 'Nouvelle conversation' }).click();
}
const blocs = (p: Any) => panneau(p).getByText('Écrit par l’assistant');

test('bouton : un membre l’a, l’admin sans rôle ne l’a pas, ni hors d’un univers', opts, async () => {
  await antor.goto(urlFiche);
  await attendre(antor);
  await bouton(antor).waitFor();
  await lea.goto(urlFiche);
  await attendre(lea);
  await bouton(lea).waitFor();
  await admin.goto('/univers/1');
  await attendre(admin);
  await admin.waitForTimeout(500);
  assert.equal(await bouton(admin).count(), 0);
  await antor.goto('/');
  await attendre(antor);
  await antor.waitForTimeout(300);
  assert.equal(await bouton(antor).count(), 0);
});

test('lecture : Léa lit « Apparence » sans « Vérité », puis « Introuvable. » pour « Vérité »', opts, async () => {
  await ouvrir(lea);
  await demander(lea, 'Que sait-on d’Aldric ?');
  const fil = panneau(lea).getByRole('log');
  await fil.getByText(/Un grand homme à la cape grise\./).waitFor();
  const t = await fil.innerText();
  assert.match(t, /Apparence/);
  assert.ok(!t.includes('Vérité') && !t.includes('régent déchu'));
  assert.equal(await blocs(lea).count(), 0);
  await demander(lea, 'Lis-moi la section « Vérité »');
  await fil.getByText('Introuvable.', { exact: true }).waitFor();
  assert.ok(!(await fil.innerText()).includes('régent déchu'));
});

test('lecture : Antor obtient « Vérité » et la pastille « MJ »', opts, async () => {
  await ouvrir(antor);
  await panneau(antor).getByText('MJ', { exact: true }).waitFor();
  await demander(antor, 'Que sait-on d’Aldric ?');
  await panneau(antor).getByText(/régent déchu/).waitFor();
});

test('pastille : « Joueur » pour Léa', opts, async () => {
  await ouvrir(lea);
  await panneau(lea).getByText('Joueur', { exact: true }).waitFor();
});

test('pastille : le MJ en mode Joueur garde « MJ » et un catalogue de MJ', opts, async () => {
  await antor.goto(urlFiche);
  await attendre(antor);
  await antor.getByRole('radio', { name: 'Mode Joueur' }).click();
  await attendre(antor);
  if ((await panneau(antor).count()) === 0) await bouton(antor).click();
  await panneau(antor).getByText('MJ', { exact: true }).waitFor();
  await antor.getByRole('radio', { name: 'Mode MJ' }).click();
});

test('refus : Léa écrit dans une section qu’elle lit sans l’écrire → message, aucun bloc', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await demander(lea, 'Ajoute le paragraphe « Il boite. » dans « Apparence »');
  await panneau(lea).getByText('Vous ne pouvez pas modifier cette section.').waitFor();
  assert.equal(await blocs(lea).count(), 0);
  await lea.goto(urlFiche);
  await attendre(lea);
  assert.ok(!(await texte(lea)).includes('Il boite.'));
});

test('refus : Léa demande de créer un scénario → aucun événement, rien de créé', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await demander(lea, 'Crée un scénario « Acte Zéro » dans « La Couronne brisée »');
  await panneau(lea).getByText(/ne fait pas partie de ceux dont vous disposez/).waitFor();
  assert.equal(await blocs(lea).count(), 0);
  const r = await antor.request.get(srv.base + '/api/univers/1/campagnes');
  assert.ok(r.ok());
  await antor.goto('/univers/1/campagnes');
  await attendre(antor);
  await antor.getByRole('link', { name: /La Couronne brisée/ }).first().click();
  await attendre(antor);
  assert.ok(!(await texte(antor)).includes('Acte Zéro'));
});

test('écriture : Léa complète « Notes de la table », « Ouvrir » mène à la fiche où le paragraphe est écrit', opts, async () => {
  await ouvrir(lea, '/univers/1/campagnes');
  await nouvelle(lea);
  await demander(lea, 'Ajoute le paragraphe « Elle cherche son frère. » dans « Notes de la table »');
  await blocs(lea).waitFor();
  await panneau(lea).getByText('Section « Notes de la table » complétée').first().waitFor();
  const lien = panneau(lea).getByRole('link', { name: /^Ouvrir/ });
  assert.equal(await lien.count(), 1);
  await lien.click();
  await lea.waitForURL(/\/univers\/1\/fiche\/1$/);
  await attendre(lea);
  await voit(lea, 'Elle cherche son frère.');
  assert.ok(!(await texte(lea)).includes('régent déchu'));
});

test('création : Antor crée un scénario, « Ouvrir » mène à E-7, il figure sur E-6', opts, async () => {
  await ouvrir(antor, '/univers/1');
  await nouvelle(antor);
  await demander(antor, 'Crée un scénario « Acte III — La crypte » dans « La Couronne brisée »');
  await panneau(antor).getByText('Scénario « Acte III — La crypte » créé dans La Couronne brisée').first().waitFor();
  await panneau(antor).getByRole('link', { name: /^Ouvrir/ }).click();
  await antor.waitForURL(/\/univers\/1\/scenarios\/\d+$/);
  await attendre(antor);
  await antor.getByRole('heading', { name: /Acte III — La crypte/ }).first().waitFor();
  await antor.goto('/univers/1/campagnes');
  await attendre(antor);
  await antor.getByRole('link', { name: /La Couronne brisée/ }).first().click();
  await attendre(antor);
  await antor.getByText(/Acte III — La crypte/).first().waitFor();
});

test('création : Antor crée une campagne, « Ouvrir » mène à E-6 où elle figure', opts, async () => {
  await ouvrir(antor, '/univers/1');
  await nouvelle(antor);
  await demander(antor, 'Crée une campagne « Les Marches rouges »');
  await panneau(antor).getByText('Campagne « Les Marches rouges » créée').first().waitFor();
  await panneau(antor).getByRole('link', { name: /^Ouvrir/ }).click();
  await antor.waitForURL(/\/univers\/1\/campagnes\/\d+$/);
  await attendre(antor);
  await antor.getByRole('heading', { name: /Les Marches rouges/ }).first().waitFor();
});

test('fil : survit au changement d’écran et à la fermeture, vidé par « Nouvelle conversation », absent du stockage', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await demander(lea, 'Que sait-on d’Aldric ?');
  await panneau(lea).getByText(/cape grise/).waitFor();
  // close, reopen
  await panneau(lea).getByRole('button', { name: 'Fermer' }).click();
  assert.equal(await panneau(lea).count(), 0);
  await bouton(lea).click();
  await panneau(lea).getByText(/cape grise/).waitFor();
  // change of screen without reload (sidebar link)
  await lea.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Campagnes' }).click();
  await lea.waitForURL(/campagnes/);
  if ((await panneau(lea).count()) === 0) await bouton(lea).click();
  await panneau(lea).getByText(/cape grise/).waitFor();
  await panneau(lea).getByText('Que sait-on d’Aldric ?').waitFor();
  // nothing in the browser storage
  const stock = await lea.evaluate(() => JSON.stringify([localStorage, sessionStorage]) + localStorage.length + sessionStorage.length);
  assert.ok(!stock.includes('cape grise') && !stock.includes('Aldric'));
  for (const k of Object.keys(await lea.evaluate(() => ({ ...localStorage, ...sessionStorage })))) {
    assert.ok(!/assistant|fil|kanevas-fil/i.test(k), `storage key ${k}`);
  }
  // reload empties the thread
  await lea.reload();
  await attendre(lea);
  assert.equal(await lea.getByText(/cape grise/).count(), 0);
  // « Nouvelle conversation » empties it
  await ouvrir(lea);
  await demander(lea, 'Que sait-on d’Aldric ?');
  await panneau(lea).getByText(/cape grise/).waitFor();
  await nouvelle(lea);
  assert.equal(await panneau(lea).getByText(/cape grise/).count(), 0);
  await panneau(lea).getByText(/Exemple : « Que sait-on d['’]Aldric \? »/).waitFor();
});

test('erreur : « échec » → message, « Réessayer » renvoie la question, affichée une seule fois', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await demander(lea, 'échec');
  await panneau(lea).getByRole('alert').filter({ hasText: ERREUR }).waitFor();
  assert.equal(await panneau(lea).getByText('échec', { exact: true }).count(), 1);
  assert.equal(await blocs(lea).count(), 0);
  let envois = 0;
  await lea.route('**/assistant/messages', async (route: Any) => {
    envois++;
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await panneau(lea).getByRole('button', { name: 'Réessayer' }).click();
  await panneau(lea).getByRole('status').filter({ hasText: 'Kanevas réfléchit…' }).waitFor();
  assert.equal(await panneau(lea).getByRole('alert').count(), 0, 'error message gone while retrying');
  assert.equal(await panneau(lea).getByText('échec', { exact: true }).count(), 1);
  assert.equal(await panneau(lea).locator('.asst-saisie button').textContent(), 'Envoyer…', 'pending: « … » shown over the masked label');
  assert.equal(await panneau(lea).locator('.asst-saisie button').getAttribute('aria-disabled'), 'true');
  assert.equal(await panneau(lea).getByRole('button', { name: 'Nouvelle conversation' }).isDisabled(), true);
  await panneau(lea).getByRole('alert').filter({ hasText: ERREUR }).waitFor();
  assert.equal(envois, 1);
  assert.equal(await panneau(lea).getByText('échec', { exact: true }).count(), 1);
  await lea.unroute('**/assistant/messages');
});

test('erreur : 429 → « Une demande est déjà en cours. Patientez. » avec « Réessayer »', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await lea.route('**/assistant/messages', (route: Any) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: '{"message":"x","code":"assistant_occupe"}' }),
  );
  await demander(lea, 'Que sait-on d’Aldric ?');
  await panneau(lea).getByRole('alert').filter({ hasText: 'Une demande est déjà en cours. Patientez.' }).waitFor();
  await panneau(lea).getByRole('button', { name: 'Réessayer' }).waitFor();
  assert.equal(await panneau(lea).getByText('Que sait-on d’Aldric ?', { exact: true }).count(), 1);
  await lea.unroute('**/assistant/messages');
  await panneau(lea).getByRole('button', { name: 'Réessayer' }).click();
  await panneau(lea).getByText(/cape grise/).waitFor();
  assert.equal(await panneau(lea).getByText('Que sait-on d’Aldric ?', { exact: true }).count(), 1);
});

test('états : fil vide, texte d’aide, étiquette visible', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await panneau(lea).getByText(/Demandez-moi de chercher, de résumer ou d['’]écrire/).waitFor();
  assert.equal(await champ(lea).getAttribute('placeholder'), 'Votre question');
  assert.ok(await panneau(lea).locator('label', { hasText: 'Demander à Kanevas' }).isVisible());
  assert.equal(await envoyer(lea).isDisabled(), true, 'nothing to send');
});

test('états : réponse en cours → « Kanevas réfléchit… », « Envoyer » affiche « … »', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await lea.route('**/assistant/messages', async (route: Any) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await demander(lea, 'Que sait-on d’Aldric ?');
  await panneau(lea).getByRole('status').filter({ hasText: 'Kanevas réfléchit…' }).waitFor();
  assert.equal(await panneau(lea).locator('.asst-saisie button').textContent(), 'Envoyer…', 'pending: « … » shown over the masked label');
  assert.equal(await panneau(lea).locator('.asst-saisie button').getAttribute('aria-disabled'), 'true');
  assert.equal(await champ(lea).inputValue(), '', 'the field is emptied at sending');
  await panneau(lea).getByText(/cape grise/).waitFor();
  await lea.unroute('**/assistant/messages');
});

test('états : disponibilité en chargement → « Chargement… » à la place du champ, bouton présent', opts, async () => {
  await lea.route('**/api/univers/1/assistant', async (route: Any) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await lea.goto(urlFiche);
  await bouton(lea).waitFor();
  await bouton(lea).click();
  await panneau(lea).getByText('Chargement…').waitFor();
  assert.equal(await panneau(lea).getByRole('textbox').count(), 0);
  assert.equal(await envoyer(lea).count(), 0);
  assert.equal(await panneau(lea).getByRole('button', { name: 'Réessayer' }).count(), 0);
  await champ(lea).waitFor();
  await lea.unroute('**/api/univers/1/assistant');
});

test('états : disponibilité en échec → message, « Réessayer » relit, champ et « Envoyer » désactivés', opts, async () => {
  await lea.route('**/api/univers/1/assistant', (route: Any) => route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }));
  await ouvrir(lea);
  await panneau(lea).getByRole('alert').filter({ hasText: ERREUR }).waitFor();
  assert.equal(await champ(lea).getAttribute('aria-disabled'), 'true');
  assert.equal(await envoyer(lea).isDisabled(), true);
  await champ(lea).fill('bonjour').catch(() => undefined);
  assert.equal(await envoyer(lea).isDisabled(), true);
  await lea.unroute('**/api/univers/1/assistant');
  await panneau(lea).getByRole('button', { name: 'Réessayer' }).click();
  await panneau(lea).getByRole('alert').waitFor({ state: 'detached' });
  await champ(lea).fill('bonjour');
  assert.equal(await envoyer(lea).isDisabled(), false);
});

test('états : indisponible → message, champ et « Envoyer » désactivés', opts, async () => {
  await lea.route('**/api/univers/1/assistant', (route: Any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"disponible":false,"catalogue":"Joueur"}' }),
  );
  await ouvrir(lea);
  await panneau(lea).getByText('L’assistant n’est pas disponible pour le moment.').waitFor();
  assert.equal(await champ(lea).getAttribute('aria-disabled'), 'true');
  assert.equal(await envoyer(lea).isDisabled(), true);
  await champ(lea).press('Enter').catch(() => undefined);
  assert.equal(await panneau(lea).getByRole('log').getByRole('paragraph').filter({ hasText: 'bonjour' }).count(), 0);
  await lea.unroute('**/api/univers/1/assistant');
});

test('états : connexion perdue → bandeau, champ désactivé ; perdue pendant la réponse → erreur, retour → réactivé', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await demander(lea, 'Que sait-on d’Aldric ?');
  await panneau(lea).getByText(/cape grise/).waitFor();
  await lea.context().setOffline(true);
  await lea.getByText(/Connexion perdue\./).first().waitFor();
  assert.equal(await champ(lea).getAttribute('aria-disabled'), 'true');
  assert.equal(await envoyer(lea).isDisabled(), true);
  await panneau(lea).getByText(/cape grise/).waitFor(); // thread still readable
  await lea.context().setOffline(false);
  await lea.getByText(/Connexion perdue\./).first().waitFor({ state: 'detached', timeout: 10000 });
  await champ(lea).fill('x');
  assert.equal(await envoyer(lea).isDisabled(), false);
  await champ(lea).fill('');

  // lost during the answer
  await nouvelle(lea);
  await lea.route('**/assistant/messages', async (route: Any) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.abort('internetdisconnected');
  });
  await demander(lea, 'Que sait-on d’Aldric ?');
  await panneau(lea).getByRole('status').filter({ hasText: 'Kanevas réfléchit…' }).waitFor();
  await lea.context().setOffline(true);
  await panneau(lea).getByRole('alert').filter({ hasText: ERREUR }).waitFor();
  assert.equal(await panneau(lea).getByRole('button', { name: 'Réessayer' }).isDisabled(), true, 'disabled while offline');
  await lea.unroute('**/assistant/messages');
  await lea.context().setOffline(false);
  await lea.getByText(/Connexion perdue\./).first().waitFor({ state: 'detached', timeout: 10000 });
  assert.equal(await panneau(lea).getByRole('button', { name: 'Réessayer' }).isDisabled(), false);
});

test('contenu long : 2 001 caractères → « Erreur : 2 000 caractères au plus. », « Envoyer » désactivé ; 2 000 passe', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await champ(lea).fill('a'.repeat(2001));
  await panneau(lea).getByText('Erreur : 2 000 caractères au plus.').waitFor();
  assert.equal(await envoyer(lea).isDisabled(), true);
  await champ(lea).fill('a'.repeat(2000));
  assert.equal(await panneau(lea).getByText('Erreur : 2 000 caractères au plus.').count(), 0);
  assert.equal(await envoyer(lea).isDisabled(), false);
  await champ(lea).fill('');
});

test('contenu long : plus de 20 messages → la note, et seuls 20 messages partent', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  const tailles: number[] = [];
  await lea.route('**/assistant/messages', async (route: Any) => {
    tailles.push(JSON.parse(route.request().postData()).historique.length);
    await route.continue();
  });
  for (let i = 0; i < 12; i++) {
    await demander(lea, `question ${i}`);
    await panneau(lea).getByRole('log').getByText('Je ne sais répondre', { exact: false }).nth(i).waitFor();
  }
  // 24 messages in the thread
  await panneau(lea).getByText('Seuls les 20 derniers messages sont transmis à l’assistant.').waitFor();
  assert.equal(tailles.at(-1), 20);
  assert.ok(tailles.every((n) => n <= 20));
  assert.deepEqual(tailles.slice(0, 4), [0, 2, 4, 6]);
  await lea.unroute('**/assistant/messages');
});

test('contenu long : Entrée envoie, Maj+Entrée va à la ligne', opts, async () => {
  await ouvrir(lea);
  await nouvelle(lea);
  await champ(lea).fill('ligne 1');
  await champ(lea).press('Shift+Enter');
  await champ(lea).type('ligne 2');
  assert.equal(await champ(lea).inputValue(), 'ligne 1\nligne 2');
  await champ(lea).press('Enter');
  await panneau(lea).getByText('Je ne sais répondre', { exact: false }).waitFor();
  assert.equal(await champ(lea).inputValue(), '');
});

test('clavier : Échap ferme le panneau et rend le focus au bouton', opts, async () => {
  await ouvrir(lea);
  await lea.keyboard.press('Escape');
  assert.equal(await panneau(lea).count(), 0);
  assert.equal(await lea.evaluate(() => document.activeElement?.textContent?.includes('Demander à Kanevas')), true);
});

test('téléphone 390 px : le panneau prend tout l’écran, Échap rend le focus au bouton', opts, async () => {
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  await p.goto('/connexion-bouchon');
  await p.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
  await attendre(p);
  await ouvrir(p);
  const b = await panneau(p).boundingBox();
  assert.ok(b.x <= 1 && b.y <= 1, `panel origin ${b.x},${b.y}`);
  assert.ok(Math.abs(b.width - 390) <= 1 && Math.abs(b.height - 800) <= 1, `panel ${b.width}x${b.height}`);
  await p.keyboard.press('Escape');
  assert.equal(await panneau(p).count(), 0);
  assert.equal(await p.evaluate(() => document.activeElement?.textContent?.includes('Demander à Kanevas')), true);
  // a link followed on a phone closes the panel
  await bouton(p).click();
  await demander(p, 'Ajoute le paragraphe « Un deuxième. » dans « Notes de la table »');
  await panneau(p).getByRole('link', { name: /^Ouvrir/ }).click();
  await p.waitForURL(/\/fiche\/1$/);
  assert.equal(await panneau(p).count(), 0);
  await ctx.close();
});

test('bureau : panneau de 380 px à droite, le contenu dessous reste utilisable', opts, async () => {
  await ouvrir(lea);
  const b = await panneau(lea).boundingBox();
  assert.ok(Math.abs(b.width - 380) <= 1, `width ${b.width}`);
  const vp = lea.viewportSize();
  assert.ok(Math.abs(b.x + b.width - vp.width) <= 1);
  await lea.getByRole('heading', { level: 1 }).first().waitFor();
});
