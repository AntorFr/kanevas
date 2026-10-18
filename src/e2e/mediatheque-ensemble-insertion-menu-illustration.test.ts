// Independent feature-level check of kanevas-import-mediatheque, third pass, written from the sheet of the feature
// (« Livre », exit criterion), docs/parcours.md (B-44, B-54, B-55, P-16) and docs/ecrans.md (E-9 « Fichiers »,
// « Le bloc Pièces jointes », E-19), NOT from the code and NOT from the other tests. It covers what the earlier
// passes leave out. Real server in stub mode on the seed (« Lame d'Ébène »), real Chromium; literal expectations.
//
// TEST PLAN (one server; the tests run in this order, the state is cumulative)
//   B-54 menu E-9 nominal : the menu of a joined file « Carte des Sphères » (Maître Aldric, « Apparence »), « Réserver au MJ »,
//                           lists the three places where players lose it; « Annuler » changes nothing
//   B-54 menu E-9 confirm : confirming reserves it (« MJ seul » in the library, Léa reads « Fichier/Image réservé(e) au MJ. »);
//                           the same menu then offers « Rendre visible des joueurs », which restores it for Léa without a box
//   B-55 ligne propre / fence : a file added from the toolbar with the caret right after the closing « ::: » of a GM block
//                           is referenced on its own line, OUTSIDE the block: Léa sees the image, it is « Visible des joueurs »
//   B-55 ligne propre / texte : a document added with the caret at the end of a text line is a line of its own
//   B-55 ligne propre / tableau: an image added with the caret at the end of a table row does not stick to the row
//   B-55 illustration       : an image added as illustration of a sheet with no section read by players enters « Réservé au MJ »
//                           (Léa's library lacks it); added to a sheet with a section read by players it enters « Visible des joueurs »
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;
const ids: Record<string, number> = {};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
const norm = (t: string): string => t.replace(/[\s  ]+/g, ' ').replace(/’/g, "'");

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const r = await (await antor.request.get(`/api/univers/${uid}/fiches`)).json();
  for (const f of r.fiches) ids[f.titre] = f.id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const liste = async (p: Any): Promise<Any[]> => (await (await p.request.get(`/api/univers/${uid}/fichiers`)).json()).fichiers;
const parNom = async (p: Any, nom: string): Promise<Any> => (await liste(p)).find((f: Any) => f.nom === nom);
const sectionDe = async (p: Any, fiche: number, titre: string): Promise<Any> =>
  (await (await p.request.get(`/api/univers/${uid}/fiches/${fiche}`)).json()).sections.find((s: Any) => s.titre === titre);
async function ouvre(p: Any, titre: string): Promise<void> {
  await p.goto(`/univers/${uid}/fiche/${ids[titre]}`);
  // a draft left by an earlier edit would reopen the editor by itself: this check starts from the saved text
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kanevas:brouillon')).forEach((k) => localStorage.removeItem(k)));
  await p.goto(`/univers/${uid}/fiche/${ids[titre]}`);
  await attendre(p);
  await p.getByRole('heading', { name: titre, level: 1 }).first().waitFor();
}
const region = (p: Any, titre: string): Any => p.getByRole('region', { name: new RegExp(titre) });

/** Edit a section, put the caret after `apres` (end of that text), add `fichier` from the toolbar, save. */
async function ajouterDepuisBarre(p: Any, section: string, apres: string, fichier: Any): Promise<void> {
  const r = region(p, section);
  await r.getByRole('button', { name: 'Modifier', exact: true }).click();
  await r.getByRole('textbox').evaluate((el: HTMLTextAreaElement, fin: string) => {
    const i = el.value.indexOf(fin);
    if (i < 0) throw new Error('text not found: ' + fin);
    el.focus();
    el.setSelectionRange(i + fin.length, i + fin.length);
  }, apres);
  await r.getByRole('button', { name: 'Fichier', exact: true }).click();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc.setFiles(fichier);
  await p.waitForResponse((x: Any) => x.url().includes('/fichiers') && x.request().method() === 'POST');
  await attendre(p);
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await attendre(p);
}

test('B-54 · menu E-9 de « Carte des Sphères » : « Réserver au MJ » liste les trois endroits, « Annuler » ne change rien', opts, async () => {
  await ouvre(antor, 'Maître Aldric');
  const apparence = region(antor, 'Apparence');
  await apparence.getByRole('button', { name: /Actions sur « Carte des Sphères »/ }).click();
  await antor.getByRole('menuitem', { name: 'Réserver au MJ' }).click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last();
  await boite.waitFor();
  const t = norm(await boite.innerText());
  assert.match(t, /Val-Fortin — « Description »/);
  assert.match(t, /Maître Aldric — « Apparence » \(jointe\)/);
  assert.match(t, /Port-Sel \(illustration\)/);
  await antor.screenshot({ path: '/tmp/scr/ins-menu-reserver.png' });
  await boite.getByRole('button', { name: 'Annuler' }).click();
  await attendre(antor);
  assert.equal((await parNom(antor, 'Carte des Sphères')).visibilite, 'joueurs');
});

test('B-54/B-44 · confirmer réserve le fichier (Léa lit la mention) ; « Rendre visible des joueurs » le lui rend, sans boîte', opts, async () => {
  await ouvre(antor, 'Maître Aldric');
  const apparence = region(antor, 'Apparence');
  await apparence.getByRole('button', { name: /Actions sur « Carte des Sphères »/ }).click();
  await antor.getByRole('menuitem', { name: 'Réserver au MJ' }).click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last();
  await boite.waitFor();
  await boite.getByRole('button', { name: 'Réserver au MJ' }).click();
  await attendre(antor);
  assert.equal((await parNom(antor, 'Carte des Sphères')).visibilite, 'mj');
  assert.equal(await parNom(lea, 'Carte des Sphères'), undefined, 'Léa no longer sees it in her library');

  await ouvre(lea, 'Maître Aldric');
  assert.match(norm(await texte(lea)), /Image réservée au MJ\./);
  await lea.screenshot({ path: '/tmp/scr/ins-lea-reserve.png' });

  await ouvre(antor, 'Maître Aldric');
  await region(antor, 'Apparence').getByRole('button', { name: /Actions sur « Carte des Sphères »/ }).click();
  await antor.getByRole('menuitem', { name: 'Rendre visible des joueurs' }).click();
  await attendre(antor);
  assert.equal(await antor.getByRole('alertdialog').count(), 0, 'no box to make a file visible');
  assert.equal((await parNom(antor, 'Carte des Sphères')).visibilite, 'joueurs');
  await ouvre(lea, 'Maître Aldric');
  assert.doesNotMatch(norm(await texte(lea)), /Image réservée au MJ\./);
  assert.ok((await parNom(lea, 'Carte des Sphères')), 'back in Léa\'s library');
});

test('B-55 · caret juste après la clôture « ::: » d’un bloc MJ : l’image est sur sa propre ligne, hors du bloc, et Léa la voit', opts, async () => {
  await ouvre(antor, 'Port-Sel');
  await ajouterDepuisBarre(antor, 'Histoire', 'qui y fait passer ses cargaisons.\n:::', png('apres-bloc.png'));
  const contenu: string = (await sectionDe(antor, ids['Port-Sel']!, 'Histoire')).contenu;
  const f = await parNom(antor, 'apres-bloc.png');
  assert.ok(f, 'the file entered the library');
  assert.equal(f.visibilite, 'joueurs', 'added outside the GM block of a section players read');
  const lignes = contenu.split('\n');
  const i = lignes.findIndex((l) => l.includes(`fichier:${f.id}`));
  assert.ok(i >= 0, 'the reference is in the text');
  assert.match(lignes[i]!, /^!\[[^\]]*\]\(fichier:\d+( "[^"]*")?\)$/, 'the reference is alone on its line');
  const avant = lignes.slice(0, i).join('\n');
  assert.match(avant, /cargaisons\.\n:::$/, 'the block is closed before the reference');
  assert.equal((avant.match(/^:::mj$/gm) ?? []).length, 1);
  await ouvre(lea, 'Port-Sel');
  const img = region(lea, 'Histoire').locator(`img[src*="/fichiers/${f.id}"]`);
  await img.first().waitFor();
  assert.equal(await img.first().evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), true);
  await lea.screenshot({ path: '/tmp/scr/ins-lea-apres-bloc.png' });
});

test('B-55 · un document ajouté avec le caret en fin de ligne de texte occupe sa propre ligne', opts, async () => {
  await ouvre(antor, 'Port-Sel');
  await ajouterDepuisBarre(antor, 'Description', 'Port-Sel ferme la côte des Brumes.', pdf('barre-droits.pdf'));
  const contenu: string = (await sectionDe(antor, ids['Port-Sel']!, 'Description')).contenu;
  const f = await parNom(antor, 'barre-droits.pdf');
  assert.ok(f);
  const lignes = contenu.split('\n');
  const i = lignes.findIndex((l) => l.includes(`fichier:${f.id}`));
  assert.ok(i >= 0);
  assert.match(lignes[i]!, /^\[[^\]]*\]\(fichier:\d+( "[^"]*")?\)$/);
  assert.equal(lignes[i - 1] !== undefined && lignes[i - 1]!.includes('Port-Sel ferme la côte des Brumes.'), true, 'the text line is intact right above');
  assert.equal(lignes[i - 1], 'Port-Sel ferme la côte des Brumes.');
});

test('B-55 · une image ajoutée avec le caret en fin de ligne de tableau ne se colle pas à la ligne du tableau', opts, async () => {
  await ouvre(antor, 'Port-Sel');
  await ajouterDepuisBarre(antor, 'Description', '| Quartier des Cordiers | Cordages et voiles |', png('apres-tableau.png'));
  const contenu: string = (await sectionDe(antor, ids['Port-Sel']!, 'Description')).contenu;
  const f = await parNom(antor, 'apres-tableau.png');
  assert.ok(f);
  const lignes = contenu.split('\n');
  assert.ok(lignes.includes('| Quartier des Cordiers | Cordages et voiles |'), 'the table row is intact');
  const i = lignes.findIndex((l) => l.includes(`fichier:${f.id}`));
  assert.ok(i >= 0);
  assert.match(lignes[i]!, /^!\[[^\]]*\]\(fichier:\d+( "[^"]*")?\)$/);
  await ouvre(lea, 'Port-Sel');
  assert.equal(await region(lea, 'Description').locator('table tr').count(), 3, 'the table keeps header + 2 rows');
});

test('B-55 · illustration ajoutée à une fiche sans section lue des joueurs : « Réservé au MJ » ; avec une section lue : « Visible des joueurs »', opts, async () => {
  await ouvre(antor, "Rapport secret de l'amirauté");
  await antor.getByRole('button', { name: /Ajouter une illustration/ }).first().click();
  const [fc] = await Promise.all([antor.waitForEvent('filechooser'), antor.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc.setFiles(png('illustration-secrete.png'));
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).waitFor();
  assert.equal((await parNom(antor, 'illustration-secrete.png')).visibilite, 'mj');
  assert.equal(await parNom(lea, 'illustration-secrete.png'), undefined);

  await ouvre(antor, 'Maître Aldric');
  await antor.getByRole('button', { name: /Ajouter une illustration/ }).first().click();
  const [fc2] = await Promise.all([antor.waitForEvent('filechooser'), antor.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc2.setFiles(png('portrait-aldric.png'));
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).waitFor();
  assert.equal((await parNom(antor, 'portrait-aldric.png')).visibilite, 'joueurs');
  await ouvre(lea, 'Maître Aldric');
  assert.equal(await lea.locator('main img').first().evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), true);
  await lea.screenshot({ path: '/tmp/scr/ins-lea-illustration.png' });
});
