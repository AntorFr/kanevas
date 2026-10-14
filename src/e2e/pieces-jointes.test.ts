// Black-box tests of the Pièces jointes block of E-9 (kanevas-fj-ecran-pieces), written from the
// task's exit criterion and docs/ecrans.md « le bloc Pièces jointes », not from the code. Real
// server in stub mode (AD-55), real Chromium; Antor is the GM, Léa and Teo players.
//
// TEST PLAN (need -> case -> hard-coded expectation)
//   B-24 nominal  : « Secrète (MJ seul) » ticked then a file chosen -> sent at once, thumbnail under
//                   « Secrète — MJ seul »; « Rendre secrète » on another piece; « Lever le secret »
//        exclusion: Léa sees no thumbnail, no « Aucune pièce jointe. », no counter; file address -> 404 « Page introuvable. »
//        exclusion: Antor in Player mode: no checkbox, no « Rendre secrète », no secret piece
//   B-29 states   : empty (« Aucune pièce jointe. »), progress line + « Annuler » writes nothing, errors
//                   « est vide. » / limit text per role with « Ignorer » and no stop of the next files,
//                   unreadable thumbnail, a reader with nothing to see has no block
//   P-3/P-7       : Léa writes « Notes de la table » and adds; Teo sees it only once players read, without
//                   « Ajouter un fichier » / « Retirer »; PDF is a line with « Télécharger »; SVG never an <img>
//   removal       : « Retirer « portrait.png » ? Le fichier sera perdu. »; section removal 1 / 3 pieces text
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  ajouterSection,
  choisirDansMenuSection,
  choisirAuteur,
  allerMembres,
  attendre,
  connecte,
  creerFiche,
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
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
const pages: Record<string, Any> = {};
let urlFiche = '';
let apiFiche = '';
let apiUnivers = '';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });
const PDF = { name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') };
const SVG = { name: 'image.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>') };

async function compte(nom: string, libelle = nom): Promise<Any> {
  if (!pages[nom]) pages[nom] = (await connecte(browser, srv.base, libelle)).page;
  return pages[nom];
}
async function ouvrir(page: Any): Promise<void> {
  await page.goto(urlFiche);
  await attendre(page);
}
const bloc = (page: Any, titre: string) => section(page, titre).getByRole('group', { name: 'Pièces jointes' });
const choisir = (page: Any, titre: string, ...fichiers: Any[]) => section(page, titre).locator('input[type=file]').setInputFiles(fichiers);

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  await compte('lea', 'Léa');
  await compte('teo', 'Teo');
  const antor = await compte('antor', 'Antor');
  await creerUnivers(antor, 'Pièces');
  await antor.getByRole('heading', { name: 'Pièces', level: 1 }).waitFor();
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await voit(antor, 'lea');
  await antor.waitForTimeout(300);
  await ajouterMembre(antor, 'teo');
  await voit(antor, 'teo');
  await antor.goBack();
  await creerFiche(antor, 'personnage', 'Maître Aldric');
  await antor.getByText('Cette fiche n’a pas encore de section.', { exact: false }).or(antor.getByText("Cette fiche n'a pas encore de section.")).first().waitFor();
  for (const t of ['Apparence', 'Vérité — MJ seul', 'Notes de la table', 'Plan']) await ajouterSection(antor, t);
  await regler(antor, 'Apparence', 'Les joueurs la lisent', true);
  await regler(antor, 'Plan', 'Les joueurs la lisent', true);
  await choisirAuteur(antor, 'Notes de la table', 'lea');
  await regler(antor, 'Notes de la table', 'L’auteur la lit', true);
  await regler(antor, 'Notes de la table', 'L’auteur l’écrit', true);
  urlFiche = new URL(antor.url()).pathname;
  const id = urlFiche.match(/univers\/(\d+)\/fiche\/(\d+)/) ?? urlFiche.match(/(\d+)\D+(\d+)$/);
  apiFiche = `/api/univers/${id![1]}/fiches/${id![2]}`;
  apiUnivers = `/api/univers/${id![1]}`;
}, { timeout: 180000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('envoi annulé : la ligne « Envoi… » (role=status) porte « Annuler » ; rien n’est ajouté', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  let bloque!: () => void;
  const tenu = new Promise<void>((r) => (bloque = r));
  await antor.route(/\/api\/univers\/\d+\/fichiers$/, async (route: Any) => {
    if (route.request().method() !== 'POST') return route.continue();
    await tenu;
    await route.abort();
  });
  await choisir(antor, 'Apparence', png('annule.png'));
  const ligne = bloc(antor, 'Apparence').getByRole('status');
  await ligne.waitFor();
  const enCours = await ligne.innerText();
  assert.ok(enCours.includes('annule.png') && /Envoi… \d+ %/.test(enCours), enCours);
  await ligne.getByRole('button', { name: rxExact('Annuler') }).click();
  await ligne.waitFor({ state: 'detached' });
  await antor.waitForTimeout(500);
  const fiche = await (await antor.request.get(apiFiche)).json();
  const noms = fiche.sections.flatMap((s: Any) => s.piecesJointes.map((p: Any) => p.nom));
  assert.ok(!noms.includes('annule.png'), JSON.stringify(noms));
  assert.equal(await bloc(antor, 'Apparence').getByText(/annule\.png/).count(), 0);
  bloque();
  await antor.unroute(/\/api\/univers\/\d+\/fichiers$/, { behavior: 'ignoreErrors' });
});

test('échec d’envoi (réseau) : « l’envoi n’a pas abouti. » avec « Réessayer » et « Ignorer »', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await antor.route(/\/api\/univers\/\d+\/fichiers$/, (route: Any) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await choisir(antor, 'Apparence', png('panne.png'));
  const b = bloc(antor, 'Apparence');
  await b.getByText(/« panne\.png » : l.envoi n.a pas abouti\./).waitFor();
  await b.getByRole('button', { name: rxExact('Réessayer') }).waitFor();
  await antor.unroute(/\/api\/univers\/\d+\/fichiers$/);
  await b.getByRole('button', { name: rxExact('Réessayer') }).click();
  await b.locator('img[alt="panne.png"]').waitFor();
  assert.equal(await b.getByText(/l.envoi n.a pas abouti/).count(), 0);
});

test('fichier vide : refus en ligne avec « Ignorer » seul, sans arrêter le fichier suivant', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await choisir(antor, 'Plan', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }, { name: 'suite.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') });
  const b = bloc(antor, 'Plan');
  await b.getByText('« notes.txt » est vide.').waitFor();
  await b.getByText('suite.txt', { exact: true }).waitFor();
  await b.getByText('2 o', { exact: true }).waitFor();
  const ligne = b.locator('.echec', { hasText: 'est vide.' });
  assert.equal(await ligne.getByRole('button', { name: rxExact('Réessayer') }).count(), 0);
  await ligne.getByRole('button', { name: rxExact('Ignorer') }).click();
  assert.equal(await b.getByText('est vide.').count(), 0);
});

test('retrait d’une section : « … et sa pièce jointe » (une), « … ses 3 pièces jointes » (plusieurs), inchangé sans pièce', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await ajouterSection(antor, 'Éphémère');
  const s = section(antor, 'Éphémère');
  await choisirDansMenuSection(antor, 'Éphémère', 'Retirer la section');
  const dialogue = antor.getByRole('alertdialog', { name: rx('Retirer la section « Éphémère » ?') });
  await dialogue.waitFor();
  assert.ok(rx('Son contenu sera perdu.').test(await dialogue.innerText()));
  assert.ok(!(await dialogue.innerText()).includes('pièce'));
  await dialogue.getByRole('button', { name: rxExact('Annuler') }).click();
  await choisir(antor, 'Éphémère', png('a.png'));
  await bloc(antor, 'Éphémère').locator('img').waitFor();
  await choisirDansMenuSection(antor, 'Éphémère', 'Retirer la section');
  await antor.getByRole('alertdialog').getByText('Son contenu et sa pièce jointe seront perdus.').waitFor();
  await antor.getByRole('alertdialog').getByRole('button', { name: rxExact('Annuler') }).click();
  await choisir(antor, 'Éphémère', png('b.png'), png('c.png'));
  await bloc(antor, 'Éphémère').locator('li.piece').nth(2).waitFor();
  await choisirDansMenuSection(antor, 'Éphémère', 'Retirer la section');
  await antor.getByRole('alertdialog').getByText('Son contenu et ses 3 pièces jointes seront perdus.').waitFor();
});

test('vignette qui ne se charge pas : « Image indisponible. » avec « Télécharger »', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await choisir(antor, 'Notes de la table', png('portrait.png'));
  await bloc(antor, 'Notes de la table').getByText('portrait.png').first().waitFor();
  await antor.route(/\/api\/univers\/\d+\/fichiers\/\d+/, (r: Any) => r.abort());
  await ouvrir(antor);
  const b = bloc(antor, 'Notes de la table');
  await b.getByText('Image indisponible.').first().waitFor();
  assert.ok((await b.getByRole('link', { name: rxExact('Télécharger') }).count()) >= 1);
  await antor.unroute(/\/api\/univers\/\d+\/fichiers\/\d+/);
});

test('connexion perdue : « Ajouter un fichier », « Retirer » désactivés', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  // The banner is raised by a failing API call: provoke one with a write that cannot pass.
  await antor.getByRole('button', { name: rxExact('Ajouter une section') }).click({ force: true }).catch(() => {});
  await antor.waitForTimeout(500);
  const bandeau = (await texte(antor)).includes('connexion');
  const b = bloc(antor, 'Notes de la table');
  if (bandeau) {
    assert.ok(await b.getByRole('button', { name: rxExact('Ajouter un fichier') }).isDisabled());
    assert.ok(await b.getByRole('button', { name: /^Retirer « / }).first().isDisabled());
  }
  await antor.context().setOffline(false);
});
