// Black-box tests of kanevas-rv-accueil: E-1, E-2, E-3 redone (docs/ecrans.md § E-1, E-2, E-3 and
// § Détail de `kanevas-refonte-visuelle` « Partout »: one toast per successful action, a failure stays
// an inline message). Expected values are literals of those sections. Real server in stub mode + real
// Chromium (harnais.test.ts).
//
// TEST PLAN (panne nommée → test)
//   toast E-2      : création réussie → un seul toast « « <nom> » créé », sur E-3     [le toast manque / double]
//   Ctrl+Entrée    : crée comme « Créer l'univers » ; > 80 caractères : ne part pas   [raccourci absent / contourne la validation]
//   Échap          : revient à E-1 sans rien créer                                    [Échap sans effet / crée]
//   erreurs E-2    : « Erreur : le nom est obligatoire. », « Erreur : 80 caractères au plus. » (nom, 81e),
//                    idem 500 pour la description ; compteurs « n / 80 » et « n / 500 » ; aucun toast
//   échec E-2      : l'API refuse → « L'action n'a pas abouti. Réessayez. », saisie gardée, AUCUN toast
//   copie E-1      : état vide, « Copier l'identifiant » → toast « Identifiant copié »
//   E-1 liste      : par nom, rôle MJ / Joueur, clic mène à E-3
//   E-3 matrice    : « Préparation » + « MJ seul » pour le MJ, absente pour le Joueur ; un seul lien
//                    « Tous les comptes-rendus » (mène à E-13)
//   téléphone      : E-1 (vide, liste), E-2, E-3 (contenu long) ne débordent pas de 390 px
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  ouvrirFormulaireUnivers,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let idUnivers = '';

const toasts = (page: Any) => page.locator('.toasts .toast');
const creer = (page: Any) => page.getByRole('button', { name: rxExact("Créer l'univers") });

async function debordement(page: Any): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await (await connecte(browser, srv.base, 'Léa')).ctx.close();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Lame d’Ébène', 'Une cité marchande où chaque guilde cache un serment brisé.');
  await antor.getByRole('heading', { name: 'Lame d’Ébène', level: 1 }).waitFor();
  idUnivers = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea', 'Joueur');
  await antor.getByLabel('Rôle de lea').waitFor();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('E-2 une création réussie donne un seul toast « « <nom> » créé » et mène à E-3', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Toast');
  await creer(page).click();
  await page.getByRole('heading', { name: 'Toast', level: 1 }).waitFor();
  await toasts(page).first().waitFor();
  assert.equal(await toasts(page).count(), 1);
  assert.match((await toasts(page).first().innerText()).replace(/’/g, "'"), /^« Toast » créé/);
  await page.close();
});

test('E-2 Ctrl+Entrée crée comme le bouton ; Échap revient à E-1 sans rien créer', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Au clavier');
  await page.keyboard.press('Control+Enter');
  await page.getByRole('heading', { name: 'Au clavier', level: 1 }).waitFor();
  assert.equal(await toasts(page).count(), 1);

  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Abandonné');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(page);
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.getByRole('link', { name: rx('Abandonné') }).count(), 0);
  await page.close();
});

test('E-2 erreurs : nom vide, 81e caractère du nom, 501e de la description ; compteurs ; ni toast ni création', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await ouvrirFormulaireUnivers(page);
  await creer(page).click();
  await page.getByText('Erreur : le nom est obligatoire.').waitFor();
  assert.equal(await toasts(page).count(), 0);

  const nom = page.getByLabel('Nom', { exact: true });
  await nom.fill('n'.repeat(80));
  assert.equal(await page.getByText('Erreur : 80 caractères au plus.').count(), 0);
  assert.ok((await texte(page)).includes('80 / 80'));
  await nom.fill('n'.repeat(81));
  await page.getByText('Erreur : 80 caractères au plus.').waitFor();
  assert.ok((await texte(page)).includes('81 / 80'));
  await page.keyboard.press('Control+Enter'); // must not go out
  await attendre(page);
  assert.equal(new URL(page.url()).pathname, '/univers/nouveau');
  assert.equal(await toasts(page).count(), 0);

  await nom.fill('Valide');
  const description = page.getByLabel('Description');
  await description.fill('d'.repeat(500));
  assert.equal(await page.getByText('Erreur : 500 caractères au plus.').count(), 0);
  await description.fill('d'.repeat(501));
  await page.getByText('Erreur : 500 caractères au plus.').waitFor();
  assert.ok((await texte(page)).includes('501 / 500'));
  await creer(page).click();
  await attendre(page);
  assert.equal(new URL(page.url()).pathname, '/univers/nouveau');
  await page.close();
});

test('E-2 la création échoue : message en ligne, saisie conservée, aucun toast', opts, async () => {
  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.route(/\/api\/univers$/, (route: Any) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }) : route.continue(),
  );
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill('Refusé');
  await creer(page).click();
  await page.getByText(/L['’]action n['’]a pas abouti\. Réessayez\./).waitFor();
  assert.equal(await toasts(page).count(), 0);
  assert.equal(await page.getByLabel('Nom', { exact: true }).inputValue(), 'Refusé');
  await page.close();
});

test('E-1 état vide : « Aucun univers pour l\'instant. », les deux chemins, copie de l\'identifiant → toast « Identifiant copié »', opts, async () => {
  const { ctx, page } = await connecte(browser, srv.base, 'Teo');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(page);
  const t = await texte(page);
  assert.ok(t.includes("Aucun univers pour l'instant."));
  assert.ok(t.includes('Connecté en tant que teo'));
  assert.ok(t.includes('Vous menez une partie ? Créez un univers.'));
  assert.ok(t.replace(/\s+/g, ' ').includes('Vous êtes joueur ? Donnez votre identifiant à votre MJ : teo')); // line breaks aside: the existing premiere-fiche test pins the one-line form
  assert.equal(await page.getByRole('link', { name: rx('Lame d’Ébène') }).count(), 0);
  await page.getByRole('button', { name: rx('Copier l’identifiant') }).click();
  await toasts(page).first().waitFor();
  assert.equal((await toasts(page).first().innerText()).trim().split('\n')[0], 'Identifiant copié');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'teo');
  // « Créer un univers » is still the way out, from the first path
  await page.getByRole('button', { name: rxExact('Créer un univers') }).or(page.getByRole('link', { name: rxExact('Créer un univers') })).first().click();
  await page.getByLabel('Nom', { exact: true }).waitFor();
  await ctx.close();
});

test('E-1 liste : par nom, rôle MJ ou Joueur, un clic mène à E-3', opts, async () => {
  const mj = await antor.context().newPage();
  mj.setDefaultTimeout(8000);
  await mj.request.post('/api/univers', { data: { nom: 'Aaa premier', description: '' } });
  await mj.goto('/');
  await attendre(mj);
  const noms = await mj.locator('ul[aria-label="Vos univers"] li .nom-u').allInnerTexts();
  const tries = [...noms].sort((a, b) => a.localeCompare(b, 'fr'));
  assert.deepEqual(noms, tries);
  assert.equal(noms[0], 'Aaa premier');
  assert.ok(noms.some((n: string) => n.replace(/’/g, "'") === "Lame d'Ébène"));
  const ligne = mj.getByRole('link', { name: rx('Lame d’Ébène') }).first();
  assert.match(await ligne.innerText(), /MJ/);
  await ligne.click();
  await mj.getByRole('heading', { name: 'Lame d’Ébène', level: 1 }).waitFor();
  assert.equal(new URL(mj.url()).pathname, `/univers/${idUnivers}`);
  await mj.close();

  await lea.goto('/');
  await attendre(lea);
  assert.match(await lea.getByRole('link', { name: rx('Lame d’Ébène') }).first().innerText(), /Joueur/);
});

test('E-3 matrice des rôles : Préparation « MJ seul » pour le MJ, absente pour le Joueur ; un seul lien « Tous les comptes-rendus »', opts, async () => {
  const mj = await antor.context().newPage();
  mj.setDefaultTimeout(8000);
  const c = await (await mj.request.post(`/api/univers/${idUnivers}/campagnes`, { data: { nom: 'La Couronne brisée' } })).json();
  await mj.request.patch(`/api/campagnes/${c.id}`, { data: { statut: 'active' } });
  await mj.request.post(`/api/campagnes/${c.id}/taches`, { data: { categorie: 'monstres', libelle: 'Statistiques du Revenant' } });
  await mj.request.post(`/api/univers/${idUnivers}/comptes-rendus`, { data: { campagneId: c.id, titre: 'Session 12', texte: 'x' } });

  await mj.goto(`/univers/${idUnivers}`);
  await mj.getByRole('heading', { name: 'Préparation' }).waitFor();
  await attendre(mj);
  let t = await texte(mj);
  assert.ok(t.includes('MJ seul'));
  assert.ok(t.includes('Statistiques du Revenant'));
  assert.ok(t.includes('Campagnes actives'));
  assert.ok(t.includes('La Couronne brisée'));
  assert.ok(t.includes('Session 12'));
  assert.equal(await mj.getByRole('link', { name: rx('Tous les comptes-rendus') }).count(), 1);
  await mj.getByRole('link', { name: rx('Tous les comptes-rendus') }).click();
  await mj.getByRole('heading', { name: 'Comptes-rendus', level: 1 }).waitFor();
  await mj.close();

  await lea.goto(`/univers/${idUnivers}`);
  await lea.getByRole('heading', { name: 'Campagnes actives' }).waitFor();
  await attendre(lea);
  t = await texte(lea);
  assert.equal(await lea.getByRole('heading', { name: 'Préparation' }).count(), 0);
  assert.ok(!t.includes('MJ seul'));
  assert.ok(!t.includes('Statistiques du Revenant'));
  assert.ok(t.includes('Session 12'));
});

test('téléphone (390 px) : E-1 vide, E-1 liste, E-2 et E-3 au contenu long ne débordent pas', opts, async () => {
  const { ctx: c1, page: teo } = await connecte(browser, srv.base, 'Teo');
  await teo.setViewportSize({ width: 390, height: 800 });
  await teo.goto('/');
  await teo.getByRole('heading', { name: 'Mes univers', level: 1 }).waitFor();
  await attendre(teo);
  assert.equal(await debordement(teo), 0);
  await c1.close();

  const page = await antor.context().newPage();
  page.setDefaultTimeout(8000);
  await page.setViewportSize({ width: 390, height: 800 });
  const long = 'Un nom d’univers tout à fait démesuré '.repeat(3).slice(0, 80);
  await page.request.post('/api/univers', { data: { nom: long, description: 'mot '.repeat(125) } });
  await page.goto('/');
  await attendre(page);
  assert.equal(await debordement(page), 0);
  await ouvrirFormulaireUnivers(page);
  await page.getByLabel('Nom', { exact: true }).fill(long);
  await page.getByLabel('Description').fill('d'.repeat(500));
  assert.equal(await debordement(page), 0);
  await page.getByRole('button', { name: rxExact('Annuler') }).click();
  await page.getByRole('link', { name: rx('Un nom d’univers tout') }).first().click();
  await page.locator('h1').waitFor();
  await attendre(page);
  assert.equal(await debordement(page), 0);
  await page.close();
});
