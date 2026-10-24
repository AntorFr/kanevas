// Browser check of kanevas-mediatheque-fiche (E-9 « Fichiers »), written from the exit criterion of the
// task and docs/ecrans.md, not from the code. Real server in stub mode on the seed, real Chromium.
//
// TEST PLAN (literal expectations from the criterion)
//   nominal   : Antor joins « tarifs-du-port.pdf » to « Description » of Port-Sel from the device: it is joined
//               and listed « Visible des joueurs » in E-19; from a GM block, « plan.png » enters « MJ seul »
//   exclusion : the reserved file picked into a section read by players warns; Léa reads « Image réservée au MJ. »
//   bords     : a PDF for the illustration -> « « regles.pdf » n'est pas une image. », nothing changes
//   échec     : the library unreachable -> « Impossible de charger la médiathèque. »
//   exclusion : Léa's joined block has no « Réserver au MJ »
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
let portId = 0;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const fiches = await (await antor.request.get(`/api/univers/${uid}/fiches?type=lieu`)).json();
  portId = (Array.isArray(fiches) ? fiches : fiches.fiches).find((f: Any) => f.titre === 'Port-Sel').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const ouvrirPort = async (p: Any) => {
  await p.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(p);
};
const description = (p: Any) => p.getByRole('region', { name: /Description/ });

test('Antor joint « tarifs-du-port.pdf » à « Description » depuis son appareil ; E-19 le liste « Visible des joueurs »', opts, async () => {
  await ouvrirPort(antor);
  await description(antor).locator('input[type=file]').first().setInputFiles(PDF('tarifs-du-port.pdf'));
  await description(antor).getByText('tarifs-du-port.pdf').first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/fiche-joint.png' });
  await antor.goto(`/univers/${uid}/mediatheque`);
  await attendre(antor);
  const tuile = antor.locator('.med-tuile').filter({ has: antor.locator('[title="tarifs-du-port.pdf"]') });
  await tuile.waitFor();
  assert.doesNotMatch(await tuile.innerText(), /MJ seul/);
});

const AVERT = 'Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas.';

test('fichier réservé choisi dans une section lue des joueurs : avertissement, Léa lit « Image réservée au MJ. », puis bloc MJ : plus rien', opts, async () => {
  await ouvrirPort(antor);
  await description(antor).getByRole('button', { name: 'Modifier', exact: true }).click();
  await antor.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByRole('dialog').getByRole('button', { name: /Plan secret/ }).click();
  await antor.getByText(AVERT).waitFor();
  await antor.screenshot({ path: '/tmp/scr/fiche-averti.png' });
  await antor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await attendre(antor);

  await ouvrirPort(lea);
  const lu = await texte(lea);
  assert.match(lu, /Image réservée au MJ\./);
  assert.doesNotMatch(lu, /Plan secret de la Guilde/);
  await lea.screenshot({ path: '/tmp/scr/lea-reserve.png' });

  // The file moves into a GM block: no warning any more, the visibility of the file did not change.
  await ouvrirPort(antor);
  await description(antor).getByRole('button', { name: 'Modifier', exact: true }).click();
  const champ = antor.getByLabel('Contenu de « Description »');
  const source: string = await champ.inputValue();
  const ligne = source.split('\n').find((l) => l.includes('fichier:'))!;
  await champ.fill(source.replace(ligne, `:::mj\n${ligne}\n:::`));
  await antor.waitForTimeout(500);
  assert.equal(await antor.getByText(AVERT).count(), 0, 'avertissement disparu');
  await antor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await attendre(antor);
  const liste = await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json();
  const plan = (liste.fichiers ?? liste).find((f: Any) => f.nom === 'Plan secret de la Guilde');
  assert.equal(plan.visibilite, 'mj', 'la visibilité du fichier n’a pas changé');
  await ouvrirPort(lea);
  assert.doesNotMatch(await texte(lea), /Image réservée au MJ\./);
});

test('médiathèque injoignable : « Impossible de charger la médiathèque. »', opts, async () => {
  await ouvrirPort(antor);
  await description(antor).getByRole('button', { name: 'Modifier', exact: true }).click();
  await antor.route('**/api/univers/*/fichiers?*', (r: Any) => r.abort());
  await antor.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByText('Impossible de charger la médiathèque.').waitFor();
  await antor.screenshot({ path: '/tmp/scr/selecteur-erreur.png' });
  await antor.unroute('**/api/univers/*/fichiers?*');
});

const entete = (p: Any) => p.locator('header').filter({ hasText: 'Port-Sel' }).last();

test('illustration : « regles.pdf » depuis l’appareil est refusé « n’est pas une image. », l’illustration ne change pas', opts, async () => {
  await ouvrirPort(antor);
  const avant = await antor.locator('img[alt^="Illustration"]').first().getAttribute('src');
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).click();
  await antor.getByRole('menuitem', { name: /Ajouter depuis l’appareil/ }).waitFor();
  await antor.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(PDF('regles.pdf'));
  await antor.getByText('« regles.pdf » n’est pas une image.').first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/illustration-pdf.png' });
  assert.equal(await antor.locator('img[alt^="Illustration"]').first().getAttribute('src'), avant);
  // A refusal that will never pass offers « Ignorer » only (docs/ecrans.md E-9): « Réessayer » is for an interrupted send.
  assert.equal(await antor.getByRole('button', { name: 'Réessayer' }).count(), 0, 'pas de « Réessayer » sur un refus définitif');
  await antor.getByRole('button', { name: 'Ignorer' }).click();
  await antor.locator('input[type=file][data-ajout-appareil]').first().setInputFiles({ name: 'vide.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
  await antor.getByText('« vide.png » est vide.').first().waitFor();
  assert.equal(await antor.getByRole('button', { name: 'Réessayer' }).count(), 0, 'pas de « Réessayer » sur un fichier vide');
});

test('illustration : le sélecteur ne propose que des images', opts, async () => {
  await ouvrirPort(antor);
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  const fenetre = antor.getByRole('dialog');
  await fenetre.getByText('Choisir un fichier').waitFor();
  await fenetre.getByRole('button', { name: /Carte des Sphères/ }).waitFor();
  assert.equal(await fenetre.getByText('tarifs-du-port.pdf').count(), 0, 'aucun document dans le choix d’une illustration');
  assert.ok((await fenetre.getByRole('button', { name: /Carte des Sphères/ }).count()) > 0);
  await antor.screenshot({ path: '/tmp/scr/illustration-selecteur.png' });
});

test('Carte des Sphères réservée au MJ : Léa lit « Image réservée au MJ. » dans l’en-tête de Port-Sel', opts, async () => {
  const liste = await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json();
  const carte = (liste.fichiers ?? liste).find((f: Any) => f.nom === 'Carte des Sphères');
  const r = await antor.request.patch(`/api/univers/${uid}/fichiers/${carte.id}`, { data: { visibilite: 'mj' } });
  assert.equal(r.status(), 200);
  await ouvrirPort(lea);
  assert.match(await texte(lea), /Image réservée au MJ\./);
  assert.equal(await lea.locator('img[alt^="Illustration"]').count(), 0);
  await lea.screenshot({ path: '/tmp/scr/lea-entete.png' });
});

test('« Retirer » ôte la jointure et laisse le fichier dans la médiathèque', opts, async () => {
  await ouvrirPort(antor);
  const zone = description(antor);
  await zone.getByText('tarifs-du-port.pdf').first().waitFor();
  await zone.getByRole('button', { name: 'Actions sur « tarifs-du-port.pdf »' }).click();
  await antor.getByRole('menuitem', { name: 'Retirer' }).click();
  const boite = antor.getByRole('alertdialog', { name: 'Confirmer le retrait' });
  await boite.getByRole('button', { name: /^Retirer/ }).click();
  await boite.waitFor({ state: 'hidden' });
  await antor.screenshot({ path: '/tmp/scr/retire.png' });
  assert.equal(await zone.getByText('tarifs-du-port.pdf').count(), 0);
  const liste = await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json();
  assert.ok((liste.fichiers ?? liste).some((f: Any) => f.nom === 'tarifs-du-port.pdf'), 'toujours dans la médiathèque');
});

test('menu d’un fichier joint : « Réserver au MJ » ouvre la boîte d’impact, « Ouvrir dans la médiathèque » ouvre E-19 sur ce fichier', opts, async () => {
  await ouvrirPort(antor);
  const zone = description(antor);
  await zone.getByRole('button', { name: 'Actions sur « port-sel-quais.webp »' }).click();
  await antor.getByRole('menuitem', { name: 'Réserver au MJ' }).click();
  await antor.getByRole('alertdialog', { name: /Réserver « port-sel-quais\.webp » au MJ \?/ }).waitFor();
  await antor.screenshot({ path: '/tmp/scr/impact.png' });
  await antor.getByRole('button', { name: 'Annuler' }).last().click();
  await zone.getByRole('button', { name: 'Actions sur « port-sel-quais.webp »' }).click();
  await antor.getByRole('menuitem', { name: 'Ouvrir dans la médiathèque' }).click();
  await antor.waitForURL(/\/mediatheque\?fichier=\d+/);
  await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
});

async function leaFiche(): Promise<{ fiche: number; notes: number }> {
  const l = await (await antor.request.get(`/api/univers/${uid}/fiches?type=personnage`)).json();
  const fiche = (Array.isArray(l) ? l : l.fiches).find((f: Any) => f.titre === 'Léa Brisefer').id;
  const v = await (await antor.request.get(`/api/univers/${uid}/fiches/${fiche}`)).json();
  return { fiche, notes: v.sections.find((s: Any) => s.titre === 'Notes de la table').id };
}

test('Léa ajoute « carnet.pdf » à « Notes de la table » : elle le voit sans « MJ seul », Teo (Joueur) nulle part', opts, async () => {
  const r = await antor.request.post(`/api/univers/${uid}/membres`, { data: { username: 'teo', role: 'joueur' } });
  assert.ok(r.status() < 300, String(r.status()));
  const { fiche } = await leaFiche();
  await lea.goto(`/univers/${uid}/fiche/${fiche}`);
  await attendre(lea);
  const notes = lea.getByRole('region', { name: /Notes de la table/ });
  await notes.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(PDF('carnet.pdf'));
  await notes.getByText('carnet.pdf').first().waitFor();
  await lea.screenshot({ path: '/tmp/scr/lea-carnet.png' });
  assert.doesNotMatch(await notes.innerText(), /MJ seul/);
  assert.equal(await notes.getByRole('menuitem', { name: 'Réserver au MJ' }).count(), 0);
  await notes.getByRole('button', { name: 'Actions sur « carnet.pdf »' }).click();
  assert.equal(await lea.getByRole('menuitem', { name: 'Réserver au MJ' }).count(), 0, 'pas de « Réserver au MJ » pour Léa');
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  const liste = await (await teo.request.get(`/api/univers/${uid}/fichiers`)).json();
  assert.ok(!(liste.fichiers ?? liste).some((f: Any) => f.nom === 'carnet.pdf'), 'Teo ne voit pas carnet.pdf');
  await teo.goto(`/univers/${uid}/fiche/${fiche}`);
  await attendre(teo);
  assert.doesNotMatch(await texte(teo), /carnet\.pdf/);
});

test('Antor en mode Joueur voit les fichiers joueurs et les siens, pas « carnet.pdf »', opts, async () => {
  const liste = await (await antor.request.get(`/api/univers/${uid}/fichiers?mode=joueur`)).json();
  const noms = (liste.fichiers ?? liste).map((f: Any) => f.nom);
  assert.ok(!noms.includes('carnet.pdf'), JSON.stringify(noms));
  assert.ok(noms.includes('Plan secret de la Guilde'), 'ce qu’Antor a lui-même ajouté reste visible');
});

test('100 fichiers joints : le 101e est refusé, avec le chiffre pour Antor, sans pour Léa', opts, async () => {
  const { fiche, notes } = await leaFiche();
  const joindre = (p: Any, sec: number, i: number) =>
    p.request.post(`/api/univers/${uid}/fichiers`, {
      multipart: { section: String(sec), maniere: 'joint', fichier: { name: `lot-${i}.pdf`, mimeType: 'application/pdf', buffer: PDF('x').buffer } },
    });
  // Léa's notes already carry « carnet.pdf »: 99 more fill it.
  for (let i = 0; i < 99; i++) assert.equal((await joindre(lea, notes, i)).status(), 201, `lot ${i}`);
  await lea.goto(`/univers/${uid}/fiche/${fiche}`);
  await attendre(lea);
  const zl = lea.getByRole('region', { name: /Notes de la table/ });
  await zl.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(PDF('un-de-trop.pdf'));
  await zl.getByText('Cette section ne peut pas recevoir d\'autre fichier.').waitFor();
  await lea.screenshot({ path: '/tmp/scr/limite-lea.png' });
  assert.doesNotMatch(await zl.innerText(), /porte déjà|100 fichiers/);

  // Antor, on « Histoire » of Port-Sel.
  const v = await (await antor.request.get(`/api/univers/${uid}/fiches/${portId}`)).json();
  const hist = v.sections.find((s: Any) => s.titre === 'Histoire').id;
  for (let i = 0; i < 100; i++) assert.equal((await joindre(antor, hist, i)).status(), 201, `lot ${i}`);
  await ouvrirPort(antor);
  const za = antor.getByRole('region', { name: /Histoire/ });
  await za.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(PDF('un-de-trop.pdf'));
  await za.getByText('Cette section porte déjà 100 fichiers joints.').waitFor();
  await antor.screenshot({ path: '/tmp/scr/limite-antor.png' });
});
