// Feature-level check of kanevas-import-mediatheque, second pass: the bords, échecs and exclusions of the needs
// (docs/parcours.md B-24, B-44, B-53, B-54, B-55, P-16; docs/ecrans.md E-19, E-9 « Fichiers »), written from the needs only.
// Real server in stub mode on the seed (« Lame d'Ébène », 13 files, 3 reserved to the GM), real Chromium for what is seen.
//
// TEST PLAN (literal expectations; the state is cumulative, tests run in this order)
//   B-53 exclusion  : Léa's library counts « 10 fichiers » (13 - 3 reserved), no add action, no visibility filter;
//                     her panel has neither visibility switch nor « Supprimer le fichier »
//   B-53 refusé     : Léa forces the address of « Plan secret de la Guilde » -> « Page introuvable. »; its bytes 404;
//                     her PATCH / DELETE / direct add are refused and change nothing
//   B-53 nominal    : Antor adds « regles-guilde.pdf » from E-19 -> « Visible des joueurs », count 14, Documents lists it
//                     (« Document PDF »), Images does not; a name nobody has -> « Aucun fichier ne correspond. »
//   B-53 échec      : an empty « notes.txt » next to « ok.txt » -> « « notes.txt » est vide. », ok.txt added, notes.txt not
//   B-53 renommer   : empty name -> « Erreur : le nom est obligatoire. »; 201 characters -> « Erreur : 200 caractères au plus. »;
//                     200 characters accepted
//   B-54 réserver   : an unused file reserved -> no dialog, toast « Fichier réservé au MJ. », Léa loses it; made visible again, no toast
//   B-54 supprimer  : an unused file deleted -> dialog without usages, toast « Fichier supprimé. »
//   B-55 exclusion  : the client never decides the visibility (extra field ignored), in a section players read or not
//   B-44 bloc MJ    : a file inserted in a :::mj block shows nothing to Léa (no image, no « Image réservée au MJ. »)
//   B-44 document   : a reserved joined document is « Fichier réservé au MJ. » for Léa, bytes 404
//   B-24 illustration: a PDF as illustration -> « « regles.pdf » n'est pas une image. », the illustration stays
//   B-55 menu       : the illustration menu (« Ajouter depuis l'appareil », « Choisir dans la médiathèque ») is readable whole
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, attendreTransitions, connecte, launch, rx, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
const U = 1;
const PORT_SEL = 12;
const DESCRIPTION = 13; // « Description » of Port-Sel, read by players
const LEA_FICHE = 4;
let NOTES = 0; // « Notes de la table » of Léa's sheet, resolved in before(): the seed's section ids move when it grows
const PLAN_SECRET = 11;
const LAMES_GRISES = 8;
const CARTE = 12;
const PDF = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + name),
});
const PNG = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  ),
});
const VIDE = (name: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.alloc(0) });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  const fl = await (await lea.request.get(`/api/univers/${U}/fiches/${LEA_FICHE}`)).json();
  NOTES = fl.sections.find((x: Any) => x.titre === 'Notes de la table').id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const norm = (t: string): string => t.replace(/[\s  ]+/g, ' ').replace(/’/g, "'");
const get = async (p: Any, url: string): Promise<Any> => (await p.request.get(`/api/univers/${U}${url}`)).json();
const liste = async (p: Any): Promise<Any[]> => (await get(p, '/fichiers')).fichiers;
const parNom = async (p: Any, nom: string): Promise<Any> => (await liste(p)).find((f: Any) => f.nom === nom);
const ajouter = (p: Any, champs: Record<string, string>, fichier: Any): Promise<Any> =>
  p.request.post(`/api/univers/${U}/fichiers`, { multipart: { ...champs, fichier } });
async function mediatheque(p: Any, qs = ''): Promise<void> {
  await p.goto(`/univers/${U}/mediatheque${qs}`);
  await attendre(p);
  await p.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
}
async function dit(p: Any, phrase: string): Promise<boolean> {
  try {
    await p.getByText(rx(phrase)).first().waitFor({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

test('Léa : « 10 fichiers » (les 3 réservés au MJ absents), ni ajout, ni filtre de visibilité, ni réglage dans le panneau', opts, async () => {
  await mediatheque(lea);
  const t = norm(await texte(lea));
  assert.match(t, /10 fichiers/);
  assert.doesNotMatch(t, /Ajouter des fichiers/);
  assert.doesNotMatch(t, /Plan secret de la Guilde|Cercle des Cendres|Le Prieur masqué/);
  assert.equal(await lea.getByText('Visibilité', { exact: true }).count(), 0);
  await mediatheque(lea, `?fichier=${LAMES_GRISES}`);
  assert.ok(await dit(lea, 'ajouté par antor'));
  const t2 = norm(await texte(lea));
  assert.doesNotMatch(t2, /Supprimer le fichier/);
  assert.doesNotMatch(t2, /Réservé au MJ/);
  await lea.screenshot({ path: '/tmp/shots/lea-panneau.png' });
});

test('Léa force l\'adresse d\'un fichier réservé : « Page introuvable. »', opts, async () => {
  await lea.goto(`/univers/${U}/mediatheque?fichier=${PLAN_SECRET}`);
  await attendre(lea);
  assert.ok(await dit(lea, 'Page introuvable.'));
});

test('Antor ajoute un PDF depuis E-19 : « Visible des joueurs », 14 fichiers, listé en Documents seulement, « Document PDF »', opts, async () => {
  await mediatheque(antor);
  await antor.locator('input[type=file]').first().setInputFiles(PDF('regles-guilde.pdf'));
  // the name first shows in the upload row: wait for the saved tile and the loaded count
  await antor.locator('.med-tuile').filter({ has: antor.locator('[title="regles-guilde.pdf"]') }).waitFor();
  await antor.locator('.med-compte').filter({ hasText: '14 fichiers' }).waitFor();
  await attendre(antor);
  const f = await parNom(antor, 'regles-guilde.pdf');
  assert.equal(f.visibilite, 'joueurs');
  assert.match(norm(await texte(antor)), /14 fichiers/);
  await antor.getByText('Documents', { exact: true }).click();
  await antor.getByText('Carte des Sphères', { exact: true }).waitFor({ state: 'hidden' });
  await antor.locator('.med-tuile').filter({ has: antor.locator('[title="regles-guilde.pdf"]') }).first().waitFor();
  await attendre(antor);
  let t = norm(await texte(antor));
  await antor.screenshot({ path: '/tmp/shots/antor-filtre-documents.png' });
  assert.match(t, /regles-guilde\.pdf/);
  assert.doesNotMatch(t, /Carte des Sphères/);
  await antor.getByText('Images', { exact: true }).click();
  await antor.getByText('regles-guilde.pdf', { exact: true }).first().waitFor({ state: 'hidden' });
  await antor.getByText('Carte des Sphères', { exact: true }).first().waitFor();
  await attendre(antor);
  t = norm(await texte(antor));
  assert.doesNotMatch(t, /regles-guilde\.pdf/);
  assert.match(t, /Carte des Sphères/);
  await antor.getByText('Tout', { exact: true }).click();
  await antor.locator('.med-tuile').filter({ has: antor.locator('[title="regles-guilde.pdf"]') }).first().waitFor();
  await antor.getByText('Carte des Sphères', { exact: true }).first().waitFor();
  await antor.getByPlaceholder('Chercher par nom').fill('zzz-introuvable');
  await attendre(antor);
  assert.ok(await dit(antor, 'Aucun fichier ne correspond.'));
  await antor.getByPlaceholder('Chercher par nom').fill('');
  await mediatheque(antor, `?fichier=${f.id}`);
  assert.ok(await dit(antor, 'Document PDF'));
  assert.match(norm(await texte(antor)), /Télécharger/);
  await antor.screenshot({ path: '/tmp/shots/antor-document.png' });
});

test('un fichier vide parmi deux : « « notes.txt » est vide. », ok.txt ajouté, notes.txt rien', opts, async () => {
  await mediatheque(antor);
  const ok = { name: 'ok.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') };
  // The message is a toast that may disappear: register its wait before the upload,
  // then wait on the state (both uploads answered, ok.txt listed) before asserting it.
  const message = antor.getByText(rx("« notes.txt » est vide.")).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  const reponses = Promise.all([1, 2].map(() => antor.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/fichiers$/.test(r.url()), { timeout: 30000 })));
  await antor.locator('input[type=file]').first().setInputFiles([VIDE('notes.txt'), ok]);
  await reponses;
  await antor.getByText('ok.txt').first().waitFor({ timeout: 30000 });
  assert.ok(await message, "le message « notes.txt » est vide. s'est affiché");
  await antor.screenshot({ path: '/tmp/shots/antor-vide.png' });
});

test('renommer : nom vide et 201 caractères refusés avec leurs mots, 200 caractères acceptés', opts, async () => {
  const f = await parNom(antor, 'ok.txt');
  await mediatheque(antor, `?fichier=${f.id}`);
  const champ = antor.getByRole('textbox', { name: 'Nom' });
  await champ.fill('');
  await champ.press('Enter');
  assert.ok(await dit(antor, 'Erreur : le nom est obligatoire.'));
  await champ.fill('a'.repeat(201));
  await champ.press('Enter');
  assert.ok(await dit(antor, 'Erreur : 200 caractères au plus.'));
  await champ.fill('b'.repeat(200));
  await champ.press('Enter');
  await attendre(antor);
  await champ.fill('Règles de la Guilde.txt');
  await champ.press('Enter');
  await attendre(antor);
});

test('réserver un fichier sans usage : pas de boîte, toast « Fichier réservé au MJ. », Léa le perd ; rendre visible : sans toast', opts, async () => {
  const f = await parNom(antor, 'regles-guilde.pdf');
  await mediatheque(antor, `?fichier=${f.id}`);
  await antor.getByText('Réservé au MJ', { exact: true }).click();
  assert.ok(await dit(antor, 'Fichier réservé au MJ.'));
  assert.equal(await antor.getByRole('dialog', { name: /Réserver/ }).count(), 0);
  await antor.getByText('Fichier réservé au MJ.').first().waitFor({ state: 'hidden', timeout: 15000 });
  await antor.getByText('Visible des joueurs', { exact: true }).click();
  await attendre(antor);
  assert.doesNotMatch(norm(await texte(antor)), /Fichier réservé au MJ\.|Fichier visible/);
});

test('supprimer un fichier sans usage : boîte sans usages, toast « Fichier supprimé. », le fichier disparaît', opts, async () => {
  const f = await parNom(antor, 'Règles de la Guilde.txt');
  await mediatheque(antor, `?fichier=${f.id}`);
  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  const boite = antor.getByRole('dialog').or(antor.getByRole('alertdialog')).last();
  await boite.waitFor();
  const t = norm(await boite.innerText());
  assert.match(t, /Supprimer « Règles de la Guilde\.txt » \?/);
  assert.doesNotMatch(t, /utilisé/i);
  await antor.screenshot({ path: '/tmp/shots/antor-supprimer.png' });
  await boite.getByRole('button', { name: 'Supprimer le fichier' }).click();
  assert.ok(await dit(antor, 'Fichier supprimé.'));
});

test('B-44 : un fichier posé dans un bloc MJ ne montre rien à Léa ; un document joint puis réservé devient « Fichier réservé au MJ. »', opts, async () => {
  const img = await ajouter(antor, { section: String(DESCRIPTION), maniere: 'texte', blocMj: 'true' }, PNG('plan-bloc.png'));
  assert.equal(img.status(), 201);
  const fid = (await img.json()).id;
  const fiche = await get(antor, `/fiches/${PORT_SEL}`);
  const sec = fiche.sections.find((s: Any) => s.id === DESCRIPTION);
  const put = await antor.request.put(`/api/univers/${U}/fiches/${PORT_SEL}/sections/${DESCRIPTION}/contenu`, {
    data: { version: sec.version, contenu: `Port-Sel ferme la côte.\n\n:::mj\n\n![plan-bloc](fichier:${fid})\n\n:::\n` },
  });
  assert.equal(put.status(), 200); // setup of the text
  assert.equal((await ajouter(antor, { section: String(DESCRIPTION), maniere: 'joint' }, PDF('tarifs.pdf'))).status(), 201); // setup: a document joined to « Description »
  const doc = await parNom(antor, 'tarifs.pdf');
  const r = await antor.request.patch(`/api/univers/${U}/fichiers/${doc.id}`, { data: { visibilite: 'mj' } });
  assert.equal(r.status(), 200); // setup: the document is reserved after its join
  await lea.goto(`/univers/${U}/fiche/${PORT_SEL}`);
  await attendre(lea);
  await lea.getByText('Port-Sel ferme la côte.').first().waitFor();
  const t = norm(await texte(lea));
  assert.doesNotMatch(t, /Image réservée au MJ\./);
  assert.match(t, /Fichier réservé au MJ\./);
  assert.doesNotMatch(t, /tarifs\.pdf/);
  await lea.screenshot({ path: '/tmp/shots/lea-port-sel.png' });
});

test('B-24 illustration : un PDF refusé avec « « regles.pdf » n\'est pas une image. », l\'illustration de Port-Sel reste la Carte', opts, async () => {
  await antor.goto(`/univers/${U}/fiche/${PORT_SEL}`);
  await attendre(antor);
  await antor.getByRole('button', { name: /Remplacer/ }).first().click();
  await antor.getByText(rx("Ajouter depuis l'appareil")).first().waitFor();
  await antor.locator('input[type=file]').first().setInputFiles(PDF('regles.pdf'));
  assert.ok(await dit(antor, "« regles.pdf » n'est pas une image."));
  await antor.screenshot({ path: '/tmp/shots/antor-illustration-pdf.png' });
});

test('B-55 menu de l\'illustration : « Ajouter depuis l\'appareil » et « Choisir dans la médiathèque » se lisent en entier', opts, async () => {
  await antor.goto(`/univers/${U}/fiche/${PORT_SEL}`);
  await attendre(antor);
  await antor.getByRole('button', { name: /Remplacer/ }).first().click();
  await antor.getByText(rx("Ajouter depuis l'appareil")).first().waitFor();
  await attendreTransitions(antor);
  await antor.screenshot({ path: '/tmp/shots/antor-menu-illustration.png' });
  // the point at the right end of each label must belong to the label itself: not clipped, not covered
  const coupes: string[] = await antor.evaluate(() => {
    const res: string[] = [];
    for (const re of [/Ajouter depuis l.appareil/, /Choisir dans la médiathèque/]) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      let noeud: Node | null = null;
      while ((n = w.nextNode())) if (re.test(n.textContent ?? '')) noeud = n;
      if (!noeud) {
        res.push(String(re) + ' absent');
        continue;
      }
      const r = document.createRange();
      r.selectNodeContents(noeud);
      const b = r.getBoundingClientRect();
      const hit = document.elementFromPoint(b.right - 2, b.top + b.height / 2);
      const el = noeud.parentElement as HTMLElement;
      if (!(hit && (hit === el || el.contains(hit) || hit.contains(el)))) res.push(String(re) + ' coupé ou recouvert');
    }
    return res;
  });
  assert.deepEqual(coupes, []);
});
