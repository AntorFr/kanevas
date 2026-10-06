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
}, { timeout: 180000 });

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('vide : le MJ voit « Aucune pièce jointe. » et « Ajouter un fichier » sur chaque section ; un lecteur seul n’a pas de bloc', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  for (const t of ['Apparence', 'Vérité — MJ seul', 'Notes de la table', 'Plan']) {
    const b = bloc(antor, t);
    assert.ok((await b.innerText()).includes('Aucune pièce jointe.'), t);
    assert.equal(await b.getByRole('button', { name: rxExact('Ajouter un fichier') }).count(), 1, t);
  }
  const lea = await compte('lea', 'Léa');
  await ouvrir(lea);
  assert.equal(await bloc(lea, 'Apparence').count(), 0, 'Léa only reads « Apparence »: no block');
  const t = await section(lea, 'Apparence').innerText();
  assert.ok(!t.includes('Aucune pièce jointe.') && !t.includes('Pièces jointes'));
  assert.equal(await bloc(lea, 'Notes de la table').getByRole('button', { name: rxExact('Ajouter un fichier') }).count(), 1);
});

test('B-24 cocher « Secrète (MJ seul) » puis choisir : l’envoi part seul, vignette sous « Secrète — MJ seul »', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await section(antor, 'Vérité — MJ seul').getByLabel('Secrète (MJ seul)').check();
  await choisir(antor, 'Vérité — MJ seul', png('portrait.png'));
  const b = bloc(antor, 'Vérité — MJ seul');
  await b.getByText('Secrète — MJ seul').waitFor();
  assert.equal(await b.locator('img[alt="portrait.png"]').count(), 1);
  assert.ok((await b.innerText()).includes('portrait.png · 70 o'));
  assert.ok(!(await b.innerText()).includes('Aucune pièce jointe.'));
});

test('B-24 « Rendre secrète » sur une pièce publique, puis « Lever le secret »', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await choisir(antor, 'Apparence', png('apparence.png'));
  const b = bloc(antor, 'Apparence');
  await b.locator('img').waitFor();
  assert.equal(await b.getByText('Secrète — MJ seul').count(), 0, 'case is unticked by default: public');
  await b.getByRole('button', { name: /^Rendre secrète « / }).click();
  await b.getByText('Secrète — MJ seul').waitFor();
  await b.getByRole('button', { name: /^Lever le secret de « / }).waitFor();
  await b.getByRole('button', { name: /^Lever le secret de « / }).click();
  await b.getByRole('button', { name: /^Rendre secrète « / }).waitFor();
  await b.getByRole('button', { name: /^Rendre secrète « / }).click();
  await b.getByText('Secrète — MJ seul').waitFor();
});

test('exclusion : Léa ne voit ni vignette ni bloc ; l’adresse du fichier répond « Page introuvable. »', opts, async () => {
  const antor = await compte('antor');
  const fiche = await (await antor.request.get(apiFiche)).json();
  const secret = fiche.sections.find((s: Any) => s.titre === 'Apparence').piecesJointes[0];
  assert.equal(secret.secrete, true);
  const lea = await compte('lea', 'Léa');
  await ouvrir(lea);
  assert.equal(await lea.locator('img').count(), 0);
  assert.equal(await bloc(lea, 'Apparence').count(), 0);
  const t = await section(lea, 'Apparence').innerText();
  assert.ok(!t.includes('Aucune pièce jointe.') && !/apparence\.png|Pièces jointes|\(\d+\)/.test(t), t);
  assert.ok(!(await texte(lea)).includes('portrait.png'), 'the secret piece of the closed section is nowhere');
  const url = `${apiFiche}/pieces-jointes/${secret.id}/fichier`;
  assert.equal((await lea.request.get(url)).status(), 404);
  await lea.goto(url);
  await voit(lea, 'Page introuvable.');
  assert.ok(!JSON.stringify(await (await lea.request.get(apiFiche)).json()).includes('apparence.png'));
});

test('P-7 Léa choisit un portrait pour « Notes de la table » : il s’envoie et s’affiche ; pas de case « Secrète »', opts, async () => {
  const lea = await compte('lea', 'Léa');
  await ouvrir(lea);
  const s = section(lea, 'Notes de la table');
  assert.equal(await s.getByLabel('Secrète (MJ seul)').count(), 0);
  await choisir(lea, 'Notes de la table', png('notes.png'));
  const b = bloc(lea, 'Notes de la table');
  await b.locator('img[alt="notes.png"]').waitFor();
  assert.equal(await b.getByRole('button', { name: /Rendre secrète|Lever le secret/ }).count(), 0);
  assert.equal(await b.getByRole('button', { name: /^Retirer « notes.png »/ }).count(), 1);
});

test('Teo ne voit pas « Notes de la table » avant « Les joueurs la lisent », puis la voit sans « Ajouter » ni « Retirer »', opts, async () => {
  const teo = await compte('teo', 'Teo');
  await ouvrir(teo);
  assert.equal(await teo.locator('img[alt="notes.png"]').count(), 0);
  assert.ok(!(await texte(teo)).includes('Notes de la table'));
  const antor = await compte('antor');
  await ouvrir(antor);
  await regler(antor, 'Notes de la table', 'Les joueurs la lisent', true);
  await antor.waitForTimeout(500);
  await attendre(antor);
  await ouvrir(teo);
  const b = bloc(teo, 'Notes de la table');
  await b.locator('img[alt="notes.png"]').waitFor();
  assert.equal(await b.getByRole('button').count(), 0, 'no button at all for a reader: no Ajouter, no Retirer, no Rendre secrète');
  assert.equal(await b.getByLabel('Secrète (MJ seul)').count(), 0);
});

test('PDF : une ligne avec « Télécharger », nom d’origine ; SVG : jamais affiché dans la page', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await choisir(antor, 'Plan', PDF, SVG);
  const b = bloc(antor, 'Plan');
  await b.getByText(/image\.svg/).waitFor();
  await b.getByText('plan.pdf', { exact: true }).waitFor();
  assert.equal(await b.locator('img').count(), 0, 'no <img>, even for the SVG');
  assert.equal(await b.locator('object, embed, iframe, svg:not([aria-hidden="true"])').count(), 0);
  assert.equal(await b.getByRole('link', { name: rxExact('Télécharger') }).count(), 2);
  const [dl] = await Promise.all([antor.waitForEvent('download'), b.getByRole('link', { name: rxExact('Télécharger') }).first().click()]);
  assert.equal(dl.suggestedFilename(), 'plan.pdf');
  // Léa reads « Plan »: the lines, no way to add.
  const lea = await compte('lea', 'Léa');
  await ouvrir(lea);
  const bl = bloc(lea, 'Plan');
  await bl.getByText('plan.pdf', { exact: true }).waitFor();
  assert.equal(await bl.getByRole('button').count(), 0);
  const fiche = await (await lea.request.get(apiFiche)).json();
  const p = fiche.sections.find((s: Any) => s.titre === 'Plan').piecesJointes.find((x: Any) => x.nom === 'image.svg');
  const r = await lea.request.get(`${apiFiche}/pieces-jointes/${p.id}/fichier`);
  assert.ok(!/image\/svg/.test(r.headers()['content-type'] ?? ''), 'SVG is not served as an image');
  assert.ok(/attachment/.test(r.headers()['content-disposition'] ?? ''));
});

test('envoi annulé : la ligne « Envoi… » (role=status) porte « Annuler » ; rien n’est ajouté', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  let bloque!: () => void;
  const tenu = new Promise<void>((r) => (bloque = r));
  await antor.route('**/pieces-jointes', async (route: Any) => {
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
  await antor.unroute('**/pieces-jointes', { behavior: 'ignoreErrors' });
});

test('échec d’envoi (réseau) : « l’envoi n’a pas abouti. » avec « Réessayer » et « Ignorer »', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  await antor.route('**/pieces-jointes', (route: Any) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await choisir(antor, 'Apparence', png('panne.png'));
  const b = bloc(antor, 'Apparence');
  await b.getByText(/« panne\.png » : l.envoi n.a pas abouti\./).waitFor();
  await b.getByRole('button', { name: rxExact('Réessayer') }).waitFor();
  await antor.unroute('**/pieces-jointes');
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

test('limite : 50 pièces, la 51e refusée — texte du MJ « porte déjà 50 », du Joueur sans chiffre', opts, async () => {
  const antor = await compte('antor');
  await antor.goto(urlFiche);
  const lea = await compte('lea', 'Léa');
  const fiche = await (await antor.request.get(apiFiche)).json();
  const sec = fiche.sections.find((s: Any) => s.titre === 'Notes de la table');
  const compteur = sec.piecesJointes.length;
  for (let i = compteur; i < 50; i++) {
    const r = await lea.request.post(`${apiFiche}/sections/${sec.id}/pieces-jointes`, {
      multipart: { secrete: 'false', fichier: { name: `p${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('x') } },
    });
    assert.equal(r.status(), 201, `piece ${i}`);
  }
  await ouvrir(lea);
  await choisir(lea, 'Notes de la table', { name: 'trop.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await bloc(lea, 'Notes de la table').getByText('Cette section ne peut pas recevoir d’autre fichier.').waitFor();
  assert.ok(!(await texte(lea)).includes('50 pièces'));
  await ouvrir(antor);
  await choisir(antor, 'Notes de la table', { name: 'trop.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  const b = bloc(antor, 'Notes de la table');
  await b.getByText('Cette section porte déjà 50 pièces jointes.').waitFor();
  await b.locator('.echec').getByRole('button', { name: rxExact('Ignorer') }).click();
  assert.equal(await b.getByText('50 pièces jointes.').count(), 0);
  // 50 pieces: the whole list is shown.
  assert.equal(await b.locator('li.piece').count(), 50);
});

test('retrait d’une pièce : confirmation « Retirer « portrait.png » ? Le fichier sera perdu. », Annuler garde, confirmer retire', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  const b = bloc(antor, 'Vérité — MJ seul');
  await b.getByRole('button', { name: rxExact('Retirer « portrait.png »') }).click();
  await b.getByText('Retirer « portrait.png » ? Le fichier sera perdu.').waitFor();
  await b.getByRole('button', { name: rxExact('Annuler') }).click();
  assert.equal(await b.locator('li.piece').count(), 1);
  await b.getByRole('button', { name: rxExact('Retirer « portrait.png »') }).click();
  await b.getByRole('button', { name: rxExact('Retirer le fichier') }).click();
  await b.getByText('Aucune pièce jointe.').waitFor();
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

test('mode Joueur : Antor ne voit ni la case « Secrète », ni « Rendre secrète », ni les pièces secrètes', opts, async () => {
  const antor = await compte('antor');
  await ouvrir(antor);
  // « Apparence » carries a secret piece (set earlier).
  assert.equal(await bloc(antor, 'Apparence').getByText('Secrète — MJ seul').count(), 1);
  await antor.getByRole('button', { name: /Mode Joueur|mode Joueur/ }).or(antor.getByRole('switch')).or(antor.getByLabel(/Joueur/)).first().click();
  await antor.getByRole('region', { name: /Vérité/ }).waitFor({ state: 'detached' }); // the player view has been read
  await attendre(antor);
  const t = await texte(antor);
  assert.ok(!t.includes('Secrète') && !t.includes('apparence.png'), t);
  assert.equal(await antor.getByLabel('Secrète (MJ seul)').count(), 0);
  assert.equal(await antor.getByRole('button', { name: /Rendre secrète|Lever le secret/ }).count(), 0);
  // « Plan » is read-only for players in this mode: no add, no remove.
  assert.equal(await bloc(antor, 'Plan').getByRole('button').count(), 0);
});

test('vignette qui ne se charge pas : « Image indisponible. » avec « Télécharger »', opts, async () => {
  const antor = await compte('antor');
  await antor.route('**/pieces-jointes/*/fichier', (r: Any) => r.abort());
  await ouvrir(antor);
  const b = bloc(antor, 'Notes de la table');
  await b.getByText('Image indisponible.').first().waitFor();
  assert.ok((await b.getByRole('link', { name: rxExact('Télécharger') }).count()) >= 1);
  await antor.unroute('**/pieces-jointes/*/fichier');
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
