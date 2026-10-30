// Feature-level check of kanevas-import-mediatheque, written from the sheet of the feature (« Livre » and
// exit criterion), docs/parcours.md (B-24, B-44, B-53 to B-55, P-16) and docs/ecrans.md (E-9 « Fichiers »,
// E-19), not from the code. Real server in stub mode on the seed (Lame d'Ébène), real Chromium.
// One server for the whole file: the tests follow the story of the exit criterion, in order.
//
// TEST PLAN (literal expectations)
//   B-55/B-24 nominal   : Antor joins « tarifs-du-port.pdf » to « Description » (read by players): joined, in E-19, not « MJ seul »
//   B-55 bords          : « plan.png » added inside a GM block enters « MJ seul »; added from « Description » it is visible,
//                         and picked later into a GM block its visibility does not change
//   B-55 exclusion      : picking « Plan secret de la Guilde » (reserved) for « Description » warns; inside a GM block it does not
//   B-44 / double garde : Léa reads « Description »: the PDF downloads, « Image réservée au MJ. » replaces the secret plan;
//                         her library shows neither « plan.png » nor « Plan secret de la Guilde », count 10 against 13 for Antor
//   B-53 « Utilisé dans »: never names a section Léa does not read; no block at all when only unreadable usages remain
//   B-55 troisième règle: Léa adds « carnet.pdf » to « Notes de la table » (closed to Teo): she sees it, Teo nowhere
//   B-54 réserver       : cancel changes nothing; confirm lists the three places; Léa then reads « Image réservée au MJ. »
//   B-54 supprimer      : lists the three sheets; Antor then reads « Fichier supprimé de la médiathèque. », Léa nothing
//   B-53 droits         : Léa has no « Ajouter des fichiers », no visibility switch, no « Supprimer le fichier »; forced address 404
//   B-53 filtres/nom    : Documents shows only documents; empty name / 201 characters refused
//   échecs              : empty file, non-image illustration
//   AD-111 limite       : the 100th joined file is accepted, the 101st refused with the two sentences
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { type Any, allerMembres, ajouterMembre, attendre, connecte, launch, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;
const ids: Record<string, number> = {};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });
const PDF_TEXTE = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n';
const pdf = (name: string, plus = '') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(PDF_TEXTE + plus) });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  for (const type of ['lieu', 'personnage', 'evenement']) {
    const r = await (await antor.request.get(`/api/univers/${uid}/fiches?type=${type}`)).json();
    for (const f of Array.isArray(r) ? r : r.fiches) ids[f.titre] = f.id;
  }
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const fiche = async (p: Any, titre: string) => {
  await p.goto(`/univers/${uid}/fiche/${ids[titre]}`);
  await attendre(p);
};
const region = (p: Any, titre: string) => p.getByRole('region', { name: new RegExp(titre) });
const mediatheque = async (p: Any) => {
  await p.goto(`/univers/${uid}/mediatheque`);
  await p.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(p);
};
const tuile = (p: Any, nom: string) => p.getByRole('button', { name: nom, exact: false }).filter({ hasText: nom });
const tuilesNoms = async (p: Any): Promise<string> => (await p.locator('main').innerText()) as string;
const ouvrirFichier = async (p: Any, nom: string) => {
  await tuile(p, nom).first().click();
  await p.locator('.med-panneau').waitFor();
};
const nbFichiers = async (p: Any): Promise<string> => {
  const t = await texte(p);
  return /(\d[\d\s  ]*) fichiers?/.exec(t)?.[0] ?? '(aucun compte)';
};
const sectionId = async (p: Any, titreFiche: string, titreSection: string): Promise<number> => {
  const f = await (await p.request.get(`/api/univers/${uid}/fiches/${ids[titreFiche]}`)).json();
  return f.sections.find((s: Any) => s.titre === titreSection).id;
};
const fichierId = async (p: Any, nom: string): Promise<number> => {
  const l = await (await p.request.get(`/api/univers/${uid}/fichiers`)).json();
  return l.fichiers.find((f: Any) => f.nom === nom).id;
};
const inserer = async (p: Any, titre: string) => {
  // waits until the editor of the section holds a file reference (the upload is over)
  const ta = region(p, titre).getByRole('textbox');
  for (let i = 0; i < 100; i++) {
    if (/\]\(fichier:\d+\)/.test(await ta.inputValue())) return;
    await p.waitForTimeout(100);
  }
  throw new Error('no file reference in the editor of ' + titre);
};
const AVERT = 'Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas.';

test('départ : la médiathèque de Léa compte 10 fichiers, celle d’Antor 13 (les 3 réservés ne sont pas comptés pour elle)', opts, async () => {
  await mediatheque(lea);
  assert.match(await nbFichiers(lea), /^10 fichiers$/);
  assert.doesNotMatch(await tuilesNoms(lea), /Plan secret de la Guilde|Le Prieur masqué|Cercle des Cendres/);
  await mediatheque(antor);
  assert.match(await nbFichiers(antor), /^13 fichiers$/);
  await antor.screenshot({ path: '/tmp/scr/ens-antor-depart.png' });
});

test('Antor joint « tarifs-du-port.pdf » à « Description » depuis son appareil : joint, et « Visible des joueurs » dans E-19', opts, async () => {
  await fiche(antor, 'Port-Sel');
  await region(antor, 'Description').locator('input[type=file]').first().setInputFiles(pdf('tarifs-du-port.pdf'));
  await region(antor, 'Description').getByText('tarifs-du-port.pdf').first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/ens-joint.png' });
  await mediatheque(antor);
  const t = tuile(antor, 'tarifs-du-port.pdf');
  await t.waitFor();
  assert.doesNotMatch(await t.innerText(), /MJ seul/);
  assert.match(await t.innerText(), /PDF/);
  await t.click();
  assert.equal(await antor.getByRole('radio', { name: 'Visible des joueurs' }).isChecked(), true);
  assert.match(await texte(antor), /Document PDF/);
  assert.match(await texte(antor), /Port-Sel — « Description »|Port-Sel.*Description/);
  await antor.screenshot({ path: '/tmp/scr/ens-pdf-panneau.png' });
});

test('« plan.png » ajouté depuis un bloc MJ entre « Réservé au MJ » ; depuis « Description » il entre visible, et choisi dans un bloc MJ il le reste', opts, async () => {
  await fiche(antor, 'Port-Sel');
  const h = region(antor, 'Histoire');
  await h.getByRole('button', { name: 'Modifier', exact: true }).click();
  await h.getByRole('textbox').evaluate((el: HTMLTextAreaElement) => {
    const i = el.value.indexOf('Le port est tenu');
    el.focus();
    el.setSelectionRange(i, i);
  });
  await h.getByRole('button', { name: 'Fichier', exact: true }).click();
  const [fc] = await Promise.all([antor.waitForEvent('filechooser'), antor.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc.setFiles(png('plan.png'));
  await inserer(antor, 'Histoire');
  await region(antor, 'Histoire').getByRole('button', { name: 'Annuler', exact: true }).click();
  await attendre(antor);
  await mediatheque(antor);
  assert.match(await tuile(antor, 'plan.png').first().innerText(), /MJ seul/);

  // from « Description » (read by players): visible
  await fiche(antor, 'Port-Sel');
  const d = region(antor, 'Description');
  await d.getByRole('button', { name: 'Modifier', exact: true }).click();
  await d.getByRole('button', { name: 'Fichier', exact: true }).click();
  const [fc2] = await Promise.all([antor.waitForEvent('filechooser'), antor.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc2.setFiles(png('croquis.png'));
  await inserer(antor, 'Description');
  await region(antor, 'Description').getByRole('button', { name: 'Annuler', exact: true }).click();
  await mediatheque(antor);
  assert.doesNotMatch(await tuile(antor, 'croquis.png').first().innerText(), /MJ seul/);

  // picked afterwards for a GM block: the visibility does not change
  await fiche(antor, 'Port-Sel');
  const h2 = region(antor, 'Histoire');
  await h2.getByRole('button', { name: 'Modifier', exact: true }).click();
  await h2.getByRole('textbox').evaluate((el: HTMLTextAreaElement) => {
    const i = el.value.indexOf('Le port est tenu');
    el.focus();
    el.setSelectionRange(i, i);
  });
  await h2.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByRole('dialog').getByRole('button', { name: /croquis\.png/ }).click();
  await inserer(antor, 'Histoire');
  await region(antor, 'Histoire').getByRole('button', { name: 'Annuler', exact: true }).click();
  await mediatheque(antor);
  assert.doesNotMatch(await tuile(antor, 'croquis.png').first().innerText(), /MJ seul/);
});

test('« Plan secret » choisi pour « Description » : l’éditeur avertit ; dans un bloc MJ, non ; Antor enregistre', opts, async () => {
  await fiche(antor, 'Port-Sel');
  const d = region(antor, 'Description');
  await d.getByRole('button', { name: 'Modifier', exact: true }).click();
  await d.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByRole('dialog').getByRole('button', { name: /Plan secret/ }).click();
  await antor.getByText(AVERT).waitFor();
  await antor.screenshot({ path: '/tmp/scr/ens-averti.png' });
  await antor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await attendre(antor);
  await region(antor, 'Description').getByText(AVERT).waitFor({ state: 'detached' }).catch(() => undefined);

  // same pick inside a GM block of « Histoire »: no warning
  const h = region(antor, 'Histoire');
  await h.getByRole('button', { name: 'Modifier', exact: true }).click();
  await h.getByRole('textbox').evaluate((el: HTMLTextAreaElement) => {
    const i = el.value.indexOf('Le port est tenu');
    el.focus();
    el.setSelectionRange(i, i);
  });
  await h.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByRole('dialog').getByRole('button', { name: /Plan secret/ }).click();
  await antor.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await antor.getByText(AVERT).count(), 0);
  await region(antor, 'Histoire').getByRole('button', { name: 'Annuler', exact: true }).click();
});

test('Léa lit « Description » : le PDF se télécharge, « Image réservée au MJ. » tient la place du plan secret', opts, async () => {
  await fiche(lea, 'Port-Sel');
  const lu = await texte(lea);
  assert.match(lu, /Image réservée au MJ\./);
  assert.doesNotMatch(lu, /Plan secret de la Guilde/);
  assert.doesNotMatch(lu, /plan\.png/);
  const [dl] = await Promise.all([
    lea.waitForEvent('download'),
    region(lea, 'Description').getByRole('listitem').filter({ hasText: 'tarifs-du-port.pdf' }).getByRole('link', { name: 'Télécharger' }).click(),
  ]);
  assert.equal(dl.suggestedFilename(), 'tarifs-du-port.pdf');
  assert.equal(readFileSync(await dl.path(), 'utf8'), PDF_TEXTE);
  await lea.screenshot({ path: '/tmp/scr/ens-lea-description.png' });
});

test('la médiathèque de Léa ne montre ni « plan.png » ni « Plan secret », et le fichier réservé n’existe pas pour elle', opts, async () => {
  await mediatheque(lea);
  const t = await tuilesNoms(lea);
  assert.doesNotMatch(t, /plan\.png/);
  assert.doesNotMatch(t, /Plan secret/);
  assert.match(t, /tarifs-du-port\.pdf/);
  assert.match(await nbFichiers(lea), /^12 fichiers$/); // 10 + tarifs-du-port.pdf + croquis.png
  const reserve = await fichierId(antor, 'Plan secret de la Guilde');
  const r = await lea.request.get(`/api/univers/${uid}/fichiers/${reserve}`);
  assert.equal(r.status(), 404);
  const d = await lea.request.get(`/api/univers/${uid}/fichiers/${reserve}/detail`);
  assert.equal(d.status(), 404);
  await lea.goto(`/api/univers/${uid}/fichiers/${reserve}`);
  assert.doesNotMatch(await texte(lea), /PNG/);
});

test('« Utilisé dans » ne nomme jamais une section que Léa ne lit pas, et disparaît quand tout usage lui est fermé', opts, async () => {
  // setup (not the behaviour under test): one visible file used in Port-Sel « Description » and in the GM-only
  // event; another one joined to a MJ-only section of Maître Aldric and put in a GM block of Port-Sel.
  await mediatheque(antor);
  const vue = await fichierId(antor, 'croquis.png');
  const rapport = await (await antor.request.get(`/api/univers/${uid}/fiches/${ids["Rapport secret de l'amirauté"]}`)).json();
  const secOk = await sectionId(antor, 'Port-Sel', 'Description');
  assert.ok(rapport.sections.length > 0);
  const ja = await antor.request.post(`/api/univers/${uid}/fiches/${ids["Rapport secret de l'amirauté"]}/sections/${rapport.sections[0].id}/fichiers`, { data: { fichierId: vue } });
  assert.ok(ja.ok(), `join in the secret report: ${ja.status()}`);
  const jb = await antor.request.post(`/api/univers/${uid}/fiches/${ids['Port-Sel']}/sections/${secOk}/fichiers`, { data: { fichierId: vue } });
  assert.ok(jb.ok(), `join in Description: ${jb.status()}`);
  await mediatheque(lea);
  await ouvrirFichier(lea, 'croquis.png');
  await lea.locator('.med-panneau [role=status]').filter({ hasText: 'Chargement' }).waitFor({ state: 'detached' });
  const panneau = await texte(lea);
  assert.match(panneau, /Utilisé dans/);
  assert.match(panneau, /Port-Sel/);
  assert.doesNotMatch(panneau, /Rapport secret de l'amirauté/);

  // second file: only usages Léa cannot read
  const verite = await sectionId(antor, 'Maître Aldric', 'Vérité — MJ seul');
  const up = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { section: String(verite), maniere: 'joint', fichier: png('seul-mj-lit.png') } });
  assert.ok(up.ok(), `upload to Vérité: ${up.status()}`);
  const idSeul = await fichierId(antor, 'seul-mj-lit.png');
  // visible to players explicitly (the add from a MJ-only section made it « Réservé au MJ ») then used only out of sight
  const pa = await antor.request.patch(`/api/univers/${uid}/fichiers/${idSeul}`, { data: { visibilite: 'joueurs' } });
  assert.ok(pa.ok(), `patch visibility: ${pa.status()}`);
  await mediatheque(lea);
  await ouvrirFichier(lea, 'seul-mj-lit.png');
  await lea.locator('.med-panneau [role=status]').filter({ hasText: 'Chargement' }).waitFor({ state: 'detached' });
  const p2 = await texte(lea);
  assert.doesNotMatch(p2, /Utilisé dans/);
  assert.doesNotMatch(p2, /Vérité/);
  // and it counts as « Non utilisés » for her
  await lea.getByLabel('Usage').selectOption({ label: 'Non utilisés' });
  await attendre(lea);
  assert.match(await tuilesNoms(lea), /seul-mj-lit\.png/);
  await lea.screenshot({ path: '/tmp/scr/ens-lea-usage.png' });
});

test('Léa ajoute « carnet.pdf » à « Notes de la table » (que Teo ne lit pas) : elle le voit, Teo nulle part', opts, async () => {
  await allerMembres((await (async () => { await antor.goto(`/univers/${uid}`); await attendre(antor); return antor; })()));
  await ajouterMembre(antor, 'teo', 'Joueur');
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  await fiche(lea, 'Léa Brisefer');
  await region(lea, 'Notes de la table').locator('input[type=file]').first().setInputFiles(pdf('carnet.pdf'));
  await region(lea, 'Notes de la table').getByText('carnet.pdf').first().waitFor();
  await mediatheque(lea);
  const t = tuile(lea, 'carnet.pdf').first();
  await t.waitFor();
  await t.click();
  await lea.getByRole('link', { name: 'Télécharger' }).first().waitFor();
  assert.match(await texte(lea), /ajouté\s+par lea/i);
  await mediatheque(teo);
  assert.doesNotMatch(await tuilesNoms(teo), /carnet\.pdf/);
  const id = await fichierId(antor, 'carnet.pdf');
  assert.equal((await teo.request.get(`/api/univers/${uid}/fichiers/${id}`)).status(), 404);
  await fiche(teo, 'Léa Brisefer');
  assert.doesNotMatch(await texte(teo), /carnet\.pdf/);
  await mediatheque(antor);
  assert.match(await tuile(antor, 'carnet.pdf').first().innerText(), /MJ seul/);
  await teo.screenshot({ path: '/tmp/scr/ens-teo.png' });
});

test('Léa : ni ajout, ni bascule de visibilité, ni suppression, ni renommage dans E-19', opts, async () => {
  await mediatheque(lea);
  assert.equal(await lea.getByRole('button', { name: 'Ajouter des fichiers' }).count(), 0);
  assert.equal(await lea.getByLabel('Visibilité', { exact: true }).count(), 0);
  await ouvrirFichier(lea, 'tarifs-du-port.pdf');
  assert.equal(await lea.getByRole('button', { name: 'Supprimer le fichier' }).count(), 0);
  assert.equal(await lea.getByRole('radio', { name: 'Réservé au MJ' }).count(), 0);
  assert.equal(await lea.getByLabel('Nom', { exact: true }).count(), 0);
});

test('Antor réserve « Carte des Sphères » : Annuler ne change rien ; la boîte liste les trois endroits ; Léa lit « Image réservée au MJ. »', opts, async () => {
  await mediatheque(antor);
  await ouvrirFichier(antor, 'Carte des Sphères');
  await antor.getByRole('radio', { name: 'Réservé au MJ' }).click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last();
  await boite.getByText(/Val-Fortin/).waitFor();
  const b = (await boite.innerText()).replace(/’/g, "'").replace(/[\u00a0\u202f]/g, ' ');
  assert.match(b, /Val-Fortin — « Description »/);
  assert.match(b, /Maître Aldric — « Apparence » \(jointe\)/);
  assert.match(b, /Port-Sel \(illustration\)/);
  await antor.screenshot({ path: '/tmp/scr/ens-reserver.png' });
  await boite.getByRole('button', { name: 'Annuler' }).click();
  await mediatheque(lea);
  assert.match(await tuilesNoms(lea), /Carte des Sphères/);

  await mediatheque(antor);
  await ouvrirFichier(antor, 'Carte des Sphères');
  await antor.getByRole('radio', { name: 'Réservé au MJ' }).click();
  await antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last().getByRole('button', { name: 'Réserver au MJ' }).click();
  await antor.getByText('Fichier réservé au MJ.').first().waitFor();

  await fiche(lea, 'Val-Fortin');
  assert.match(await texte(lea), /Image réservée au MJ\./);
});

test('« Carte des Sphères » réservée : Léa lit « Image réservée au MJ. » à la place de la pièce jointe de « Apparence » (Maître Aldric)', opts, async () => {
  await fiche(lea, 'Maître Aldric');
  await lea.screenshot({ path: '/tmp/scr/ens-lea-aldric-reserve.png' });
  assert.match(await texte(lea), /Image réservée au MJ\./);
});

test('« Carte des Sphères » réservée : Léa lit « Image réservée au MJ. » dans l’en-tête de « Port-Sel » (illustration), et sa médiathèque ne la montre plus', opts, async () => {
  await fiche(lea, 'Port-Sel');
  await lea.screenshot({ path: '/tmp/scr/ens-lea-port-reserve.png' });
  // one mention in « Description » (the secret plan chosen above) and one in the header (the illustration)
  assert.equal(await lea.locator('main').getByText('Image réservée au MJ.').count(), 2);
  assert.equal(await region(lea, 'Description').getByText('Image réservée au MJ.').count(), 1);
  await mediatheque(lea);
  assert.doesNotMatch(await tuilesNoms(lea), /Carte des Sphères/);
});

test('supprimer « Carte des Sphères » : Annuler garde le fichier ; la boîte liste les trois fiches ; Antor lit « Fichier supprimé de la médiathèque. », Léa rien', opts, async () => {
  await mediatheque(antor);
  await ouvrirFichier(antor, 'Carte des Sphères');
  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last();
  await boite.getByText(/Val-Fortin/).waitFor();
  const b = (await boite.innerText()).replace(/’/g, "'").replace(/[\u00a0\u202f]/g, ' ');
  assert.match(b, /utilisée dans 3 fiches/);
  assert.match(b, /Val-Fortin/);
  assert.match(b, /Maître Aldric/);
  assert.match(b, /Port-Sel/);
  await antor.screenshot({ path: '/tmp/scr/ens-supprimer.png' });
  await boite.getByRole('button', { name: 'Annuler' }).click();
  assert.match(await tuilesNoms(antor), /Carte des Sphères/);

  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last().getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByText('Fichier supprimé.').first().waitFor();

  await fiche(antor, 'Val-Fortin');
  assert.match(await texte(antor), /Fichier supprimé de la médiathèque\./);
  await fiche(lea, 'Val-Fortin');
  const lu = await texte(lea);
  assert.doesNotMatch(lu, /Fichier supprimé de la médiathèque\./);
  assert.doesNotMatch(lu, /Image réservée au MJ\./);
  await mediatheque(antor);
  assert.doesNotMatch(await tuilesNoms(antor), /Carte des Sphères/);
});

test('Documents ne montre que des documents ; Images aucun ; le nom vide et de 201 caractères sont refusés', opts, async () => {
  await mediatheque(antor);
  await antor.getByRole('radio', { name: 'Documents' }).click();
  await antor.getByRole('button', { name: /plan\.png/ }).first().waitFor({ state: 'detached' });
  const docs = await tuilesNoms(antor);
  assert.match(docs, /tarifs-du-port\.pdf/);
  assert.match(docs, /carnet\.pdf/);
  assert.doesNotMatch(docs, /plan\.png|croquis\.png|port-sel-quais\.webp/);
  await antor.getByRole('radio', { name: 'Images' }).click();
  await antor.getByRole('button', { name: /carnet\.pdf/ }).first().waitFor({ state: 'detached' });
  const imgs = await tuilesNoms(antor);
  assert.doesNotMatch(imgs, /tarifs-du-port\.pdf|carnet\.pdf/);
  assert.match(imgs, /plan\.png/);

  await antor.getByLabel('Chercher par nom').fill('plan.png');
  await antor.getByRole('button', { name: /croquis\.png/ }).first().waitFor({ state: 'detached' });
  const filtre = await tuilesNoms(antor);
  assert.match(filtre, /plan\.png/);
  assert.doesNotMatch(filtre, /croquis\.png/);
  await antor.getByLabel('Chercher par nom').fill('zzz-rien');
  await antor.getByText('Aucun fichier ne correspond.').waitFor();
  await antor.getByLabel('Chercher par nom').fill('');

  await antor.getByLabel('Chercher par nom').fill('plan.png');
  await antor.getByRole('button', { name: /plan\.png/ }).first().waitFor();
  await ouvrirFichier(antor, 'plan.png');
  const nom = antor.getByLabel('Nom', { exact: true });
  await nom.fill('');
  await nom.blur();
  await antor.getByText('Erreur : le nom est obligatoire.').waitFor();
  await nom.fill('x'.repeat(201));
  await nom.blur();
  await antor.getByText('Erreur : 200 caractères au plus.').waitFor();
  await nom.fill('Plan du port');
  await nom.blur();
  await attendre(antor);
  await mediatheque(antor);
  assert.match(await tuilesNoms(antor), /Plan du port/);
});

test('échecs : un fichier vide n’est pas ajouté ; une illustration qui n’est pas une image est refusée', opts, async () => {
  const avant = await tuilesNoms((await mediatheque(antor), antor));
  await fiche(antor, 'Port-Sel');
  await region(antor, 'Description').locator('input[type=file]').first().setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
  await antor.getByText('« notes.txt » est vide.').first().waitFor();
  await mediatheque(antor);
  assert.doesNotMatch(await tuilesNoms(antor), /notes\.txt/);
  assert.equal(await tuilesNoms(antor), avant);

  await fiche(antor, 'Port-Sel');
  const r = await antor.request.put(`/api/univers/${uid}/fiches/${ids['Port-Sel']}/illustration`, { multipart: { fichier: pdf('regles.pdf') } });
  assert.equal(r.status(), 400);
  await mediatheque(antor);
  assert.doesNotMatch(await tuilesNoms(antor), /regles\.pdf/);
});

test('illustration : un PDF choisi par l’en-tête dit « « regles.pdf » n’est pas une image. » et rien ne change', opts, async () => {
  await fiche(antor, 'Rue des Cordiers');
  const avant = await texte(antor);
  const bouton = antor.getByRole('button', { name: /Ajouter une illustration/ }).first();
  await bouton.click();
  const entree = antor.getByRole('menuitem', { name: /Ajouter depuis l/ });
  const [fc] = await Promise.all([antor.waitForEvent('filechooser'), entree.click()]);
  await fc.setFiles(pdf('regles.pdf'));
  await antor.getByText("« regles.pdf » n'est pas une image.").or(antor.getByText('« regles.pdf » n’est pas une image.')).first().waitFor();
  await mediatheque(antor);
  assert.doesNotMatch(await tuilesNoms(antor), /regles\.pdf/);
  assert.ok(avant.length > 0);
});

test('illustration depuis l’appareil : l’image entre « Visible des joueurs » et Léa la voit ; un fichier réservé choisi pour l’illustration avertit', opts, async () => {
  await fiche(antor, 'Rue des Cordiers');
  await antor.getByRole('button', { name: /Ajouter une illustration/ }).first().click();
  const [fc] = await Promise.all([antor.waitForEvent('filechooser'), antor.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc.setFiles(png('vignette-rue.png'));
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).waitFor();
  await mediatheque(antor);
  const t = tuile(antor, 'vignette-rue.png').first();
  await t.waitFor();
  assert.doesNotMatch(await t.innerText(), /MJ seul/);
  await fiche(lea, 'Rue des Cordiers');
  assert.equal(await lea.locator('main img').first().evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), true);

  // a reserved file chosen for the illustration of a sheet that players see: the warning
  await fiche(antor, 'Rue des Cordiers');
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByRole('dialog').getByRole('button', { name: /Plan secret/ }).click();
  await antor.getByText(AVERT).first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/ens-illustration-averti.png' });
  await fiche(lea, 'Rue des Cordiers');
  assert.match(await texte(lea), /Image réservée au MJ\./);
});

test('une section qui porte 100 fichiers joints refuse le 101e : phrase d’Antor, phrase de Léa', opts, async () => {
  // « Notes de la table » already carries « carnet.pdf » (1): 99 more make 100, all accepted; Léa can write this section.
  const sec = await sectionId(antor, 'Léa Brisefer', 'Notes de la table');
  for (let i = 2; i <= 100; i++) {
    const r = await antor.request.post(`/api/univers/${uid}/fichiers`, { multipart: { section: String(sec), maniere: 'joint', fichier: pdf(`lot-${String(i).padStart(3, '0')}.pdf`, `\n%${i}`) } });
    assert.ok(r.ok(), `joined file #${i} must be accepted, got ${r.status()}`);
  }
  await fiche(antor, 'Léa Brisefer');
  await region(antor, 'Notes de la table').locator('input[type=file]').first().setInputFiles(pdf('cent-un.pdf', '\n%101'));
  await antor.getByText('Cette section porte déjà 100 fichiers joints.').first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/ens-limite-antor.png' });
  await fiche(lea, 'Léa Brisefer');
  await region(lea, 'Notes de la table').locator('input[type=file]').first().setInputFiles(pdf('cent-un-lea.pdf', '\n%102'));
  await lea.getByText('Cette section ne peut pas recevoir d’autre fichier.').or(lea.getByText("Cette section ne peut pas recevoir d'autre fichier.")).first().waitFor();
  await lea.screenshot({ path: '/tmp/scr/ens-limite-lea.png' });
  await mediatheque(antor);
  await antor.getByLabel('Chercher par nom').fill('cent-un');
  await antor.getByText('Aucun fichier ne correspond.').waitFor();
});
