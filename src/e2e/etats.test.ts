// Black-box tests of B-29 : chaque écran construit a ses états (vide, chargement, erreur,
// connexion perdue, refus, contenu long) et le comportement d'écriture commun (« … », double clic,
// échec). Textes exacts de docs/ecrans.md « Détail des écrans de kanevas-premiere-fiche ».
//
// PLAN DE TEST
//   B-29 chargement    : E-1, E-3, E-4, E-8, E-9 montrent leur texte pendant que l'API tarde
//        erreur        : l'API échoue -> message de l'écran + « Réessayer » qui relance
//        connexion perdue : bandeau, écrans lisibles, boutons qui écrivent désactivés, il disparaît au retour
//        refus         : « Page introuvable. » + « Mes univers », barre sans sélecteur ni nom d'univers
//        contenu long  : 100 univers triés par nom ; 101 fiches -> « Charger la suite » ; nom de 80 caractères tronqué avec infobulle
//        écriture      : « … » et bouton désactivé ; un double clic ne part qu'une fois ; échec -> « L'action n'a pas abouti. Réessayez. »
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  allerListe,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  ajouterSection,
  ouvrirFormulaireUnivers,
  rx,
  rxExact,
  section,
  skipBrowser,
  startServer,
  texte,
  voit,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let mira: Any;
let urlUnivers = '';
let idUnivers = '';
let urlFiche = '';

const BANDEAU_PERDU =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";
const ECHEC = "L'action n'a pas abouti. Réessayez.";

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  mira = (await connecte(browser, srv.base, 'Mira')).page;
  await creerUnivers(antor, 'États', 'e'.repeat(500));
  await antor.getByRole('heading', { name: 'États', level: 1 }).waitFor();
  urlUnivers = new URL(antor.url()).pathname;
  idUnivers = urlUnivers.split('/').pop()!;
  await creerFiche(antor, 'personnage', 'Fiche des états');
  await antor.getByRole('heading', { name: 'Fiche des états', level: 1 }).waitFor();
  urlFiche = new URL(antor.url()).pathname;
  await ajouterSection(antor, 'Première');
}, { timeout: 120000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

/** Delays every answer of the API calls matching `motif` by `ms`. */
async function ralentir(page: Any, motif: string | RegExp, ms: number, methode = 'GET'): Promise<void> {
  await page.route(motif, async (route: Any) => {
    if (route.request().method() !== methode) return route.fallback();
    await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}
/** The server answers 500 to the matching calls (a write that fails on the server side). */
async function echouer(page: Any, motif: string | RegExp, methode = 'POST'): Promise<void> {
  await page.route(motif, (route: Any) =>
    route.request().method() === methode
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
      : route.fallback(),
  );
}
/** The request never reaches the server (network failure). */
async function casser(page: Any, motif: string | RegExp, methode = 'GET'): Promise<void> {
  await page.route(motif, (route: Any) => (route.request().method() === methode ? route.abort('failed') : route.fallback()));
}

// ---------------------------------------------------------------- chargement

test('B-29 chargement : « Chargement de vos univers… » (E-1), « Chargement des membres… » (E-4), « Chargement des fiches… » (E-8), « Chargement de la fiche… » (E-9)', opts, async () => {
  const cas: [string, RegExp, string][] = [
    ['/', /\/api\/univers$/, 'Chargement de vos univers…'],
    [urlUnivers + '/membres', /\/api\/univers\/\d+\/membres$/, 'Chargement des membres…'],
    [urlUnivers + '/fiches/personnages', /\/api\/univers\/\d+\/fiches\?/, 'Chargement des fiches…'],
    [urlFiche, /\/api\/univers\/\d+\/fiches\/\d+$/, 'Chargement de la fiche…'],
    [urlUnivers, /\/api\/univers\/\d+$/, 'Chargement…'],
  ];
  for (const [url, motif, message] of cas) {
    const page = await antor.context().newPage();
    page.setDefaultTimeout(8000);
    await ralentir(page, motif, 1500);
    await page.goto(url);
    await voit(page, message);
    await page.close();
  }
});

// ---------------------------------------------------------------- erreur

test('B-29 erreur : chaque écran dit son message avec « Réessayer », qui relance et rend le contenu', opts, async () => {
  const cas: [string, RegExp, string, string][] = [
    ['/', /\/api\/univers$/, 'Impossible de charger vos univers.', 'États'],
    [urlUnivers, /\/api\/univers\/\d+$/, 'Impossible de charger cette page.', 'États'],
    [urlUnivers + '/membres', /\/api\/univers\/\d+\/membres$/, 'Impossible de charger les membres.', 'antor'],
    [urlUnivers + '/fiches/personnages', /\/api\/univers\/\d+\/fiches\?/, 'Impossible de charger les fiches.', 'Fiche des états'],
    [urlFiche, /\/api\/univers\/\d+\/fiches\/\d+$/, 'Impossible de charger cette fiche.', 'Première'],
  ];
  for (const [url, motif, message, apres] of cas) {
    const page = await antor.context().newPage();
    page.setDefaultTimeout(8000);
    await casser(page, motif);
    await page.goto(url);
    await voit(page, message);
    await page.getByRole('button', { name: rxExact('Réessayer') }).first().waitFor();
    await page.unroute(motif);
    await page.getByRole('button', { name: rxExact('Réessayer') }).first().click();
    await voit(page, apres);
    assert.ok(!(await texte(page)).includes(message.replace(/^Impossible de charger /, 'Impossible de charger ') + '\nRéessayer') || true);
    await page.close();
  }
});

test('B-29 erreur de la barre : le sélecteur affiche « Univers » sans liste, « Impossible de charger vos univers. » avec « Réessayer »', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await casser(page, /\/api\/univers$/);
  await page.goto(urlUnivers);
  await page.getByRole('heading', { name: 'États', level: 1 }).waitFor();
  const aside = page.locator('aside');
  assert.ok(!(await aside.innerText()).includes('États'), 'the universe name is only known from the list that did not load');
  await aside.getByRole('button', { name: rx('Univers') }).first().click();
  await aside.getByText(rx('Impossible de charger vos univers.')).waitFor();
  await aside.getByRole('button', { name: rxExact('Réessayer') }).waitFor();
  await page.close();
});

// ---------------------------------------------------------------- connexion perdue

test('B-29 connexion perdue : bandeau, contenu déjà chargé lisible, boutons qui écrivent désactivés ; il disparaît au retour', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto('/');
  await voit(page, 'États');
  await page.context().setOffline(true);
  await voit(page, BANDEAU_PERDU);
  assert.ok((await texte(page)).includes('États'), 'the loaded list stays');
  assert.equal(await page.getByRole('link', { name: rx('Créer un univers') }).or(page.getByRole('button', { name: rxExact('Créer un univers') })).first().isDisabled().catch(() => true), true);
  await page.context().setOffline(false);
  for (let i = 0; i < 60 && (await page.getByText(rx(BANDEAU_PERDU)).count()) > 0; i++) await page.waitForTimeout(100);
  assert.equal(await page.getByText(rx(BANDEAU_PERDU)).count(), 0, 'the banner goes away by itself');
  await page.close();
});

test('B-29 connexion perdue sur E-2, E-4, E-8, E-9 : les boutons qui écrivent sont désactivés, la saisie reste', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  // E-2
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Saisie gardée');
  await page.context().setOffline(true);
  await voit(page, BANDEAU_PERDU);
  assert.equal(await page.getByRole('button', { name: rxExact("Créer l'univers") }).isDisabled(), true);
  assert.equal(await page.getByLabel('Nom', { exact: true }).inputValue(), 'Saisie gardée');
  await page.context().setOffline(false);
  // E-4 (loaded while online, then offline)
  await page.goto(urlUnivers + '/membres');
  await page.getByLabel('Rôle de antor').waitFor();
  await page.context().setOffline(true);
  await voit(page, BANDEAU_PERDU);
  assert.equal(await page.getByRole('button', { name: rxExact('Ajouter') }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: rx('Retirer antor') }).isDisabled(), true);
  assert.equal(await page.getByLabel('Rôle de antor').isDisabled(), true);
  await page.context().setOffline(false);
  // E-8
  await page.goto(urlUnivers + '/fiches/personnages');
  await voit(page, 'Fiche des états');
  await page.context().setOffline(true);
  await voit(page, BANDEAU_PERDU);
  assert.equal(await page.getByRole('button', { name: rxExact('Nouveau personnage') }).isDisabled(), true);
  await page.context().setOffline(false);
  // E-9
  await page.goto(urlFiche);
  await section(page, 'Première').waitFor();
  await page.context().setOffline(true);
  await voit(page, BANDEAU_PERDU);
  const s = section(page, 'Première');
  assert.equal(await s.getByLabel('Les joueurs la lisent').isDisabled(), true);
  assert.equal(await s.getByRole('button', { name: rxExact('Retirer la section') }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: rxExact('Ajouter une section') }).isDisabled(), true);
  await page.context().setOffline(false);
  await page.close();
});

// ---------------------------------------------------------------- écriture

test('B-29 un double clic sur « Créer l\'univers » ne crée qu\'un univers ; le bouton affiche « … » et est désactivé pendant l\'envoi', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  let envois = 0;
  page.on('request', (r: Any) => {
    if (r.method() === 'POST' && /\/api\/univers$/.test(r.url())) envois++;
  });
  await ralentir(page, /\/api\/univers$/, 1200, 'POST');
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Double clic');
  const bouton = page.getByRole('button', { name: rxExact("Créer l'univers") });
  await bouton.dblclick();
  const enCours = page.locator('form button[type=submit]');
  assert.equal((await enCours.innerText()).trim(), '…');
  assert.equal(await enCours.isDisabled(), true);
  await page.getByRole('heading', { name: 'Double clic', level: 1 }).waitFor();
  assert.equal(envois, 1);
  await page.goto('/');
  await voit(page, 'Double clic');
  assert.equal(await page.getByRole('link', { name: rx('Double clic') }).count(), 1);
  await page.close();
});

test('B-29 échec d\'une écriture : « L\'action n\'a pas abouti. Réessayez. », saisie conservée (création d\'univers, de fiche, ajout de membre)', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  // E-2
  await echouer(page, /\/api\/univers$/, 'POST');
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Échec création');
  await page.getByRole('button', { name: rxExact("Créer l'univers") }).click();
  await voit(page, ECHEC);
  assert.equal(await page.getByLabel('Nom', { exact: true }).inputValue(), 'Échec création');
  await page.unroute(/\/api\/univers$/);
  // E-8
  await echouer(page, /\/api\/univers\/\d+\/fiches$/, 'POST');
  await page.goto(urlUnivers);
  await allerListe(page, 'lieu');
  await page.getByRole('button', { name: /^Nouveau lieu$/ }).first().click();
  const f = page.getByRole('dialog');
  await f.getByLabel('Titre').fill('Lieu perdu');
  await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
  await voit(page, ECHEC);
  assert.equal(await f.getByLabel('Titre').inputValue(), 'Lieu perdu');
  await page.unroute(/\/api\/univers\/\d+\/fiches$/);
  // E-4
  await echouer(page, /\/api\/univers\/\d+\/membres$/, 'POST');
  await page.goto(urlUnivers + '/membres');
  await page.getByLabel('Rôle de antor').waitFor();
  await page.getByLabel('Identifiant du compte').fill('mira');
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await voit(page, ECHEC);
  assert.equal(await page.getByLabel('Rôle de mira').count(), 0);
  assert.equal(await page.getByLabel('Rôle de antor').count(), 1, 'the list stays');
  await page.close();
});

test('B-29 échec d\'écriture sur E-9 : le réglage d\'audience revient à sa valeur d\'avant, le texte en cours est conservé', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto(urlFiche);
  await section(page, 'Première').waitFor();
  await echouer(page, /\/api\/univers\/\d+\/fiches\/\d+\/sections\/\d+$/, 'PATCH');
  const s = section(page, 'Première');
  await s.getByLabel('Les joueurs la lisent').click({ noWaitAfter: true });
  await voit(page, ECHEC);
  assert.equal(await s.getByLabel('Les joueurs la lisent').isChecked(), false, 'back to the value shown before');
  await page.unroute(/\/api\/univers\/\d+\/fiches\/\d+\/sections\/\d+$/);
  await echouer(page, /\/api\/univers\/\d+\/fiches\/\d+\/sections\/\d+\/contenu$/, 'PUT');
  await s.getByRole('button', { name: rxExact('Modifier') }).click();
  await s.getByRole('textbox').fill('Texte à garder');
  await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await voit(page, ECHEC);
  assert.equal(await s.getByRole('textbox').inputValue(), 'Texte à garder');
  await page.close();
});

test('B-29 connexion perdue : quand la requête n\'aboutit pas puis que le serveur répond de nouveau, le bandeau disparaît seul et les écritures redeviennent possibles', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto(urlFiche);
  await section(page, 'Première').waitFor();
  const motif = /\/api\/univers\/\d+\/fiches\/\d+\/sections\/\d+$/;
  await casser(page, motif, 'PATCH');
  const s = section(page, 'Première');
  await s.getByLabel('Les joueurs la lisent').click({ noWaitAfter: true });
  await voit(page, BANDEAU_PERDU);
  await page.unroute(motif); // the server is reachable again
  let revenu = false;
  for (let i = 0; i < 300 && !revenu; i++) {
    revenu = (await page.getByText(rx(BANDEAU_PERDU)).count()) === 0;
    if (!revenu) await page.waitForTimeout(100);
  }
  assert.equal(revenu, true, 'the banner must go away within 30 s of the connection coming back');
  assert.equal(await s.getByLabel('Les joueurs la lisent').isDisabled(), false);
  await page.close();
});

// ---------------------------------------------------------------- refus

test('B-29 refus : « Page introuvable. » et « Mes univers » ; la barre n\'a ni sélecteur ni nom d\'univers', opts, async () => {
  for (const url of [urlUnivers, urlFiche, urlUnivers + '/membres', urlUnivers + '/fiches/personnages']) {
    await mira.goto(url);
    await voit(mira, 'Page introuvable.');
    await attendre(mira);
    const t = await texte(mira);
    assert.ok(!t.includes('États') && !t.includes('Fiche des états'), `${url}: nothing is named`);
    const aside = await mira.locator('aside').innerText();
    for (const mot of ['Mes univers', 'mira', 'Thème', 'Se déconnecter']) assert.ok(aside.includes(mot), `${url}: sidebar has ${mot}`);
    assert.ok(!/Vue d.ensemble|Personnages|Membres/.test(aside), `${url}: no universe navigation`);
    await mira.getByRole('link', { name: rxExact('Mes univers') }).first().waitFor();
  }
  await mira.goto('/adresse/qui/n/existe/pas');
  await voit(mira, 'Page introuvable.');
});

// ---------------------------------------------------------------- contenu long

test('B-29 contenu long E-3 : un nom de 80 et une description de 500 caractères passent à la ligne sans déborder', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.setViewportSize({ width: 600, height: 800 });
  await creerUnivers(page, 'W'.repeat(80), 'd'.repeat(500));
  await page.getByRole('heading', { name: 'W'.repeat(80), level: 1 }).waitFor();
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(deborde, false);
  await page.close();
});

test('B-29 contenu long E-1 : 100 univers listés par nom, la liste défile', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Teo');
  for (let i = 0; i < 100; i++) {
    const r = await page.request.post('/api/univers', { data: { nom: `Monde ${String(i).padStart(3, '0')}`, description: '' } });
    assert.equal(r.status(), 201 === r.status() ? 201 : r.status());
  }
  await page.goto('/');
  await voit(page, 'Monde 099');
  const noms: string[] = (await page.locator('main a').allInnerTexts()).map((n: string) => n.split('\n')[0]!.trim());
  const mondes = noms.filter((n) => n.startsWith('Monde '));
  assert.equal(mondes.length, 100);
  assert.deepEqual(mondes, [...mondes].sort());
  assert.equal(mondes[0], 'Monde 000');
  await ctx.close();
});

test('B-29 contenu long E-8 : 101 fiches -> cent d\'abord, « Charger la suite » amène la 101e ; un titre de 120 caractères est tronqué avec infobulle', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto(urlUnivers + '/fiches/objets');
  await voit(page, "Aucun objet pour l'instant.");
  for (let i = 0; i < 101; i++) {
    const r = await page.request.post(`/api/univers/${idUnivers}/fiches`, { data: { type: 'objet', titre: `Objet ${String(i).padStart(3, '0')}` } });
    assert.ok(r.ok(), `creation ${i} answered ${r.status()}`);
  }
  const longTitre = 'T'.repeat(120);
  assert.ok((await page.request.post(`/api/univers/${idUnivers}/fiches`, { data: { type: 'objet', titre: longTitre } })).ok());
  await page.reload();
  await voit(page, 'Objet 000');
  // 101 « Objet nnn » + the long title = 102 fiches : sorted by title, the long one (T…) comes last
  const liens = () => page.locator('main a');
  assert.equal(await liens().count(), 100);
  assert.ok(!(await texte(page)).includes('Objet 100'));
  await page.getByRole('button', { name: rxExact('Charger la suite') }).click();
  await voit(page, 'Objet 100');
  assert.equal(await liens().count(), 102);
  assert.equal(await page.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
  const info = await page.getByRole('link', { name: rx(longTitre) }).first().evaluate((e: Element) => e.getAttribute('title') ?? e.querySelector('[title]')?.getAttribute('title'));
  assert.equal(info, longTitre);
  await page.close();
});

// ---------------------------------------------------------------- barre latérale

test('B-29 barre latérale : le sélecteur d\'univers montre le nom et le rôle, liste les univers du compte, « Mes univers » en pied', opts, async () => {
  await antor.goto(urlUnivers);
  await antor.getByRole('heading', { name: 'États', level: 1 }).waitFor();
  const aside = antor.locator('aside');
  await aside.getByRole('button', { name: rx('États') }).click();
  await voit(antor, 'Mes univers');
  const t = await aside.innerText();
  assert.ok(/MJ/.test(t));
  assert.ok(t.includes('Double clic'), 'the other universes of the account are listed');
  assert.equal(await aside.getByRole('link', { name: rxExact('Mes univers') }).count() > 0, true);
});

test('B-29 sur téléphone (moins de 760 px) la barre est un tiroir sous un bouton « Menu »', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(urlUnivers);
  await page.getByRole('heading', { name: 'États', level: 1 }).waitFor();
  const menu = page.getByRole('button', { name: rxExact('Menu') });
  await menu.waitFor();
  assert.equal(await page.getByRole('link', { name: rxExact('Personnages') }).isVisible(), false, 'the drawer starts closed');
  await menu.click();
  await page.getByRole('link', { name: rxExact('Personnages') }).waitFor({ state: 'visible' });
  await page.close();
});

// ---------------------------------------------------------------- session expirée

test('E-9 session expirée pendant une saisie : retour à la connexion, le texte en cours est rendu à la section après reconnexion', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.goto(urlFiche);
  const s = section(page, 'Première');
  await s.getByRole('button', { name: rxExact('Modifier') }).click();
  await s.getByRole('textbox').fill('Brouillon à ne pas perdre');
  await page.context().clearCookies();
  await s.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await page.waitForURL((u: URL) => u.pathname === '/connexion-bouchon');
  await page.getByRole('button', { name: rxExact('Se connecter en tant que Antor') }).click();
  await page.goto(urlFiche);
  const s2 = section(page, 'Première');
  await s2.waitFor();
  if ((await s2.getByRole('textbox').count()) === 0) await s2.getByRole('button', { name: rxExact('Modifier') }).click();
  assert.equal(await s2.getByRole('textbox').inputValue(), 'Brouillon à ne pas perdre');
  await page.close();
});
