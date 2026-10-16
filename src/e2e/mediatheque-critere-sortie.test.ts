// Feature-level check of kanevas-import-mediatheque, written from the exit criterion of the feature sheet and
// from docs/parcours.md (B-24, B-44, B-53, B-54, B-55, P-16) and docs/ecrans.md (E-19, E-9 « Fichiers »),
// not from the code. Real server in stub mode on the seed (« Lame d'Ébène »), real Chromium for what is seen.
//
// TEST PLAN (literal expectations; the state is cumulative, tests run in this order)
//   B-55 nominal   : Antor joins « tarifs-du-port.pdf » to « Description » (read by players) -> joined, library
//                    says « joueurs »; Léa downloads the bytes
//   B-55 visibilité: Antor adds « plan.png » from a GM block -> « mj »; Léa's library lacks it, bytes 404 for her
//   B-55 choisir   : Antor joins « Plan secret de la Guilde » (mj) -> stays « mj »; the editor warns him
//                    « Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas. »
//   B-44 double garde: Léa reads « Description »: the PDF, and « Image réservée au MJ. » for the secret plan
//   B-53 / D1      : Léa's library shows neither plan.png nor Plan secret; « Utilisé dans » never names a
//                    section she does not read (« Vérité — MJ seul » where the Carte is also joined)
//   B-55 auteur    : Léa adds « carnet.pdf » to « Notes de la table » -> « mj », ajouté par lea; Teo (Joueur) sees it nowhere
//   B-54 réserver  : reserving « Carte des Sphères » lists 3 places; then Léa reads « Image réservée au MJ. »
//   AD-111 limite  : 100 files joined -> the 101st is refused, with the words of the criterion, for Antor and for Léa
//   B-54 supprimer : deleting « Carte des Sphères » lists its three sheets; after, Antor reads
//                    « Fichier supprimé de la médiathèque. », Léa nothing
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let teo: Any;
const U = 1; // « Lame d'Ébène » on a fresh seeded base
const PORT_SEL = 12;
const DESCRIPTION = 13;
const VALFORTIN = 8;
const VALFORTIN_DESCRIPTION = 9;
const ALDRIC_VERITE = 2;
const LEA_FICHE = 4;
const NOTES = 28;
const PDF = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + name),
});
// 1x1 PNG
const PNG = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  ),
});

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  teo = (await connecte(browser, srv.base, 'Teo')).page;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const norm = (t: string): string => t.replace(/[\s\u00a0\u202f]+/g, ' ').replace(/’/g, "'");
const get = async (p: Any, url: string): Promise<Any> => (await p.request.get(`/api/univers/${U}${url}`)).json();
const noms = async (p: Any): Promise<string[]> => (await get(p, '/fichiers')).fichiers.map((f: Any) => f.nom);
const parNom = async (p: Any, nom: string): Promise<Any> => (await get(p, '/fichiers')).fichiers.find((f: Any) => f.nom === nom);
async function ajouter(p: Any, champs: Record<string, string>, fichier: Any): Promise<Any> {
  return p.request.post(`/api/univers/${U}/fichiers`, { multipart: { ...champs, fichier } });
}
const joints = async (p: Any, fiche: number, section: number): Promise<string[]> =>
  (await get(p, `/fiches/${fiche}`)).sections.find((s: Any) => s.id === section).piecesJointes.map((x: Any) => x.nom);

test('Antor joint un PDF à « Description » : joint, « Visible des joueurs », téléchargeable par Léa', opts, async () => {
  const r = await ajouter(antor, { section: String(DESCRIPTION), maniere: 'joint' }, PDF('tarifs-du-port.pdf'));
  assert.equal(r.status(), 201);
  assert.ok((await joints(antor, PORT_SEL, DESCRIPTION)).includes('tarifs-du-port.pdf'));
  assert.equal((await parNom(antor, 'tarifs-du-port.pdf')).visibilite, 'joueurs');
  const f = await parNom(lea, 'tarifs-du-port.pdf');
  assert.ok(f, 'Léa voit le PDF dans sa médiathèque');
  const octets = await lea.request.get(`/api/univers/${U}/fichiers/${f.id}`);
  assert.equal(octets.status(), 200);
  assert.ok((await octets.body()).toString().startsWith('%PDF-1.4'));
  // E-19 as seen by Antor
  await antor.goto(`/univers/${U}/mediatheque`);
  await attendre(antor);
  await antor.getByText('tarifs-du-port.pdf').first().click();
  await antor.getByText('Visible des joueurs').first().waitFor();
  await antor.screenshot({ path: '/tmp/scr/cs-e19-pdf.png' });
});

test('Antor ajoute « plan.png » depuis un bloc MJ : « Réservé au MJ », invisible de Léa', opts, async () => {
  const r = await ajouter(antor, { section: String(DESCRIPTION), maniere: 'joint', blocMj: 'true' }, PNG('plan.png'));
  assert.equal(r.status(), 201);
  const f = await parNom(antor, 'plan.png');
  assert.equal(f.visibilite, 'mj');
  assert.ok(!(await noms(lea)).includes('plan.png'));
  assert.equal((await lea.request.get(`/api/univers/${U}/fichiers/${f.id}`)).status(), 404);
  assert.equal((await teo.request.get(`/api/univers/${U}/fichiers/${f.id}`)).status(), 404);
});

test('hors bloc MJ, une image ajoutée depuis une section lue des joueurs entre « Visible des joueurs »', opts, async () => {
  const r = await ajouter(antor, { section: String(DESCRIPTION), maniere: 'texte' }, PNG('plan-public.png'));
  assert.equal(r.status(), 201);
  assert.equal((await parNom(antor, 'plan-public.png')).visibilite, 'joueurs');
  assert.ok((await noms(lea)).includes('plan-public.png'));
});

test('choisir « Plan secret de la Guilde » (réservé) pour « Description » : visibilité inchangée et l’éditeur avertit', opts, async () => {
  const plan = await parNom(antor, 'Plan secret de la Guilde');
  assert.equal(plan.visibilite, 'mj');
  const r = await antor.request.post(`/api/univers/${U}/fiches/${PORT_SEL}/sections/${DESCRIPTION}/fichiers`, {
    data: { fichierId: plan.id },
  });
  assert.equal(r.status(), 201);
  assert.equal((await parNom(antor, 'Plan secret de la Guilde')).visibilite, 'mj');
  // the gesture in the editor: Modifier ▸ Fichier ▸ Choisir dans la médiathèque ▸ the file
  await antor.goto(`/univers/${U}/fiche/${PORT_SEL}`);
  await attendre(antor);
  const section = antor.getByRole('region', { name: /Histoire/ });
  await section.getByRole('button', { name: 'Modifier' }).click();
  await section.getByRole('button', { name: /^Fichier/ }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  await antor.getByRole('dialog', { name: /Choisir un fichier/ }).waitFor();
  await antor.getByRole('dialog').getByText('Plan secret de la Guilde').first().click();
  await antor.getByText(/Ce fichier est réservé au MJ : les joueurs qui lisent cette section ne le verront pas\./).waitFor();
  await antor.screenshot({ path: '/tmp/scr/cs-avertissement.png' });
});

test('Léa lit « Description » : le PDF à télécharger, « Image réservée au MJ. » à la place du plan secret', opts, async () => {
  await lea.goto(`/univers/${U}/fiche/${PORT_SEL}`);
  await attendre(lea);
  const t = await texte(lea);
  assert.ok(t.includes('tarifs-du-port.pdf'), 'le PDF est joint pour Léa');
  assert.ok(t.includes('Image réservée au MJ.'), 'le plan secret est remplacé par la mention');
  assert.ok(!t.includes('plan.png'), 'plan.png (bloc MJ) ne paraît pas');
  assert.ok(!t.includes('Plan secret'), 'le nom du plan secret ne paraît pas');
  await lea.screenshot({ path: '/tmp/scr/cs-lea-description.png', fullPage: true });
  const dl = lea.waitForEvent('download');
  await lea.getByText('tarifs-du-port.pdf').first().click({ trial: false }).catch(() => {});
  void dl.catch(() => {});
});

test('la médiathèque de Léa ne montre ni « plan.png » ni « Plan secret de la Guilde »', opts, async () => {
  const n = await noms(lea);
  assert.ok(!n.includes('plan.png'));
  assert.ok(!n.includes('Plan secret de la Guilde'));
  await lea.goto(`/univers/${U}/mediatheque`);
  await attendre(lea);
  const t = await texte(lea);
  assert.ok(t.includes('tarifs-du-port.pdf'));
  assert.ok(!t.includes('plan.png'));
  assert.ok(!t.includes('Plan secret'));
  await lea.screenshot({ path: '/tmp/scr/cs-lea-mediatheque.png' });
});

test('« Utilisé dans » ne nomme jamais pour Léa une section qu’elle ne lit pas', opts, async () => {
  const carte = await parNom(antor, 'Carte des Sphères');
  const r = await antor.request.post(`/api/univers/${U}/fiches/1/sections/${ALDRIC_VERITE}/fichiers`, { data: { fichierId: carte.id } });
  assert.equal(r.status(), 201);
  const detail = JSON.stringify(await get(lea, `/fichiers/${carte.id}/detail`));
  assert.ok(!detail.includes('Vérité'), detail);
  assert.ok(detail.includes('Val-Fortin — « Description »'), detail);
  await lea.goto(`/univers/${U}/mediatheque`);
  await attendre(lea);
  await lea.getByText('Carte des Sphères').first().click();
  await lea.getByText('Utilisé dans').first().waitFor();
  assert.ok(!(await texte(lea)).includes('Vérité'));
  await lea.screenshot({ path: '/tmp/scr/cs-lea-utilise-dans.png' });
});

test('Léa ajoute « carnet.pdf » à « Notes de la table » : elle le voit, Teo nulle part', opts, async () => {
  // Teo, Joueur de Lame d'Ébène ajouté par Antor
  const m = await antor.request.post(`/api/univers/${U}/membres`, { data: { username: 'teo', role: 'joueur' } });
  assert.equal(m.status(), 201);
  const r = await ajouter(lea, { section: String(NOTES), maniere: 'joint' }, PDF('carnet.pdf'));
  assert.equal(r.status(), 201);
  const f = await parNom(lea, 'carnet.pdf');
  assert.ok(f, 'Léa le voit dans sa médiathèque');
  assert.ok((await joints(lea, LEA_FICHE, NOTES)).includes('carnet.pdf'));
  const dAntor = await parNom(antor, 'carnet.pdf');
  assert.equal(dAntor.visibilite, 'mj');
  assert.equal((await get(lea, `/fichiers/${f.id}/detail`)).fichier.ajouteParNom, 'lea');
  assert.ok(!(await noms(teo)).includes('carnet.pdf'));
  assert.equal((await teo.request.get(`/api/univers/${U}/fichiers/${f.id}`)).status(), 404);
  assert.equal((await teo.request.get(`/api/univers/${U}/fiches/${LEA_FICHE}`)).status() === 200
    ? JSON.stringify(await get(teo, `/fiches/${LEA_FICHE}`)).includes('carnet.pdf')
    : false, false);
  await lea.goto(`/univers/${U}/fiche/${LEA_FICHE}`);
  await attendre(lea);
  assert.ok((await texte(lea)).includes('carnet.pdf'));
  await teo.goto(`/univers/${U}/mediatheque`);
  await attendre(teo);
  assert.ok(!(await texte(teo)).includes('carnet.pdf'));
  await teo.screenshot({ path: '/tmp/scr/cs-teo-mediatheque.png' });
});

test('réserver « Carte des Sphères » : la boîte liste les endroits perdus, puis Léa lit « Image réservée au MJ. »', opts, async () => {
  const carte = await parNom(antor, 'Carte des Sphères');
  const impact = JSON.stringify(await get(antor, `/fichiers/${carte.id}/impact?action=reserver`));
  assert.ok(impact.includes('Val-Fortin — « Description »'), impact);
  assert.ok(impact.includes('Maître Aldric — « Apparence » (jointe)'), impact);
  assert.ok(impact.includes('Port-Sel (illustration)'), impact);
  // the gesture on E-19
  await antor.goto(`/univers/${U}/mediatheque`);
  await attendre(antor);
  await antor.getByPlaceholder('Chercher par nom').fill('Carte des Sphères');
  await attendre(antor);
  await antor.getByText('Carte des Sphères').first().click();
  await antor.getByText('Réservé au MJ', { exact: true }).last().click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).first();
  await boite.waitFor();
  const tb = norm(await boite.innerText());
  assert.ok(tb.includes('Maître Aldric — « Apparence » (jointe)'), tb);
  assert.ok(tb.includes('Port-Sel (illustration)'), tb);
  await antor.screenshot({ path: '/tmp/scr/cs-reserver.png' });
  await boite.getByRole('button', { name: 'Réserver au MJ' }).click();
  await antor.getByText('Fichier réservé au MJ.').waitFor();
  assert.equal((await parNom(antor, 'Carte des Sphères')).visibilite, 'mj');
  // Léa
  await lea.goto(`/univers/${U}/fiche/${VALFORTIN}`);
  await attendre(lea);
  assert.ok((await texte(lea)).includes('Image réservée au MJ.'));
  await lea.screenshot({ path: '/tmp/scr/cs-lea-valfortin.png', fullPage: true });
  await lea.goto(`/univers/${U}/fiche/${PORT_SEL}`);
  await attendre(lea);
  assert.ok((await texte(lea)).includes('Image réservée au MJ.'));
  assert.ok(!(await noms(lea)).includes('Carte des Sphères'));
});

test('une section à 100 fichiers joints refuse le 101e : mots d’Antor, mots de Léa', opts, async () => {
  // Léa : « Notes de la table » (1 joint : carnet.pdf) -> 99 de plus puis le 101e
  for (let i = 0; i < 99; i++) {
    const r = await ajouter(lea, { section: String(NOTES), maniere: 'joint' }, PDF(`lea-${i}.pdf`));
    assert.equal(r.status(), 201, `ajout ${i}`);
  }
  assert.equal((await joints(lea, LEA_FICHE, NOTES)).length, 100);
  const refusLea = await ajouter(lea, { section: String(NOTES), maniere: 'joint' }, PDF('lea-101.pdf'));
  assert.ok(refusLea.status() >= 400 && refusLea.status() < 500, String(refusLea.status()));
  assert.ok((await refusLea.text()).includes('Cette section ne peut pas recevoir d’autre fichier.') ||
    (await refusLea.text()).includes("Cette section ne peut pas recevoir d'autre fichier."), await refusLea.text());
  assert.equal((await joints(lea, LEA_FICHE, NOTES)).length, 100);
  assert.ok(!(await noms(lea)).includes('lea-101.pdf'), 'un refus n’ajoute rien à la médiathèque');
  // Antor : « Description » de Port-Sel
  let n = (await joints(antor, PORT_SEL, DESCRIPTION)).length;
  for (let i = 0; n < 100; i++, n++) {
    const r = await ajouter(antor, { section: String(DESCRIPTION), maniere: 'joint' }, PDF(`antor-${i}.pdf`));
    assert.equal(r.status(), 201, `ajout ${i}`);
  }
  const refus = await ajouter(antor, { section: String(DESCRIPTION), maniere: 'joint' }, PDF('antor-101.pdf'));
  assert.ok(refus.status() >= 400 && refus.status() < 500);
  assert.ok((await refus.text()).includes('Cette section porte déjà 100 fichiers joints.'), await refus.text());
  assert.equal((await joints(antor, PORT_SEL, DESCRIPTION)).length, 100);
  assert.ok(!(await noms(antor)).includes('antor-101.pdf'));
});

test('supprimer « Carte des Sphères » liste les trois fiches, puis Antor lit la mention et Léa rien', opts, async () => {
  const carte = await parNom(antor, 'Carte des Sphères');
  await antor.goto(`/univers/${U}/mediatheque`);
  await attendre(antor);
  await antor.getByPlaceholder('Chercher par nom').fill('Carte des Sphères');
  await attendre(antor);
  await antor.getByText('Carte des Sphères').first().click();
  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).first();
  await boite.waitFor();
  const tb = norm(await boite.innerText());
  for (const t of ['Port-Sel', 'Val-Fortin', 'Maître Aldric', '3 fiches']) assert.ok(tb.includes(t), `${t} dans ${tb}`);
  await antor.screenshot({ path: '/tmp/scr/cs-supprimer.png' });
  await boite.getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByText('Fichier supprimé.').waitFor();
  assert.ok(!(await noms(antor)).includes('Carte des Sphères'));
  await antor.goto(`/univers/${U}/fiche/${VALFORTIN}`);
  await attendre(antor);
  assert.ok((await texte(antor)).includes('Fichier supprimé de la médiathèque.'));
  await lea.goto(`/univers/${U}/fiche/${VALFORTIN}`);
  await attendre(lea);
  const tl = await texte(lea);
  assert.ok(!tl.includes('Fichier supprimé'), tl);
  assert.ok(!tl.includes('Image réservée'), tl);
  await lea.screenshot({ path: '/tmp/scr/cs-lea-supprime.png' });
  void rx; void carte;
});
