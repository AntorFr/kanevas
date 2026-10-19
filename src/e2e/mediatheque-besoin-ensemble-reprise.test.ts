// Independent complements for kanevas-import-mediatheque, written from the sheet of the feature
// (« Livre », exit criterion), docs/parcours.md (B-24, B-53, B-54, P-16) and docs/ecrans.md
// (E-19, E-9 « Le bloc Pièces jointes »), NOT from the code. Real server in stub mode with the
// starting data, real Chromium, real SQLite; literal expectations.
//
// TEST PLAN
//   B-24 exclusion   : Léa reads « Description » of « Port-Sel » without writing it: no « Joindre un fichier », no
//                      « Retirer » in the UI; the API refuses her upload and her removal (403) and nothing changes
//   B-24 retirer     : removing a section takes its references, never the file: the confirmation says « Son contenu et son
//                      fichier joint seront retirés. », the file stays in the library, no longer used anywhere
//   E-19 contenu long: a file used in 40 sheets: « Utilisé dans » shows 10, then « Afficher les 30 autres » shows the rest
//   E-19 téléphone   : at 390 px the grid and the file panel hold in the width (no sideways scroll), the panel opens on a file
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import {
  type Any,
  attendre,
  choisirDansMenuSection,
  connecte,
  launch,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;
const ids: Record<string, number> = {};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  const r = await (await antor.request.get(`/api/univers/${uid}/fiches?type=lieu`)).json();
  for (const f of r.fiches) ids[f.titre] = f.id;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const liste = async (p: Any, q = ''): Promise<Any[]> => (await (await p.request.get(`/api/univers/${uid}/fichiers${q}`)).json()).fichiers;
const depot = async (p: Any, nom: string, mime: string, contenu: Buffer, extra: Record<string, string> = {}) =>
  p.request.post(`/api/univers/${uid}/fichiers`, { multipart: { ...extra, fichier: { name: nom, mimeType: mime, buffer: contenu } } });
const sectionDe = async (p: Any, fiche: number, titreSection: string): Promise<Any> => {
  const f = await (await p.request.get(`/api/univers/${uid}/fiches/${fiche}`)).json();
  return f.sections.find((s: Any) => s.titre === titreSection);
};

test('B-24 · Léa lit « Description » sans l’écrire : ni « Joindre un fichier » ni « Retirer », l’API refuse (403), rien ne change', opts, async () => {
  const s = await sectionDe(antor, ids['Port-Sel']!, 'Description');
  const avant = (await sectionDe(antor, ids['Port-Sel']!, 'Description')).piecesJointes.length;
  assert.ok(avant >= 1, 'the seeded « port-sel-quais.webp » is joined');

  await lea.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(lea);
  const d = lea.getByRole('region', { name: /Description/ });
  await d.getByText('port-sel-quais.webp').first().waitFor();
  assert.equal(await d.getByRole('button', { name: /Joindre un fichier/ }).count(), 0);
  assert.equal(await d.getByRole('button', { name: /^Retirer/ }).count(), 0);
  await lea.screenshot({ path: '/tmp/scr/rep-lea-description-lecture.png' });

  const envoi = await depot(lea, 'intrus.pdf', 'application/pdf', PDF, { section: String(s.id), maniere: 'joint' });
  assert.equal(envoi.status(), 403);
  assert.equal((await liste(antor)).some((f: Any) => f.nom === 'intrus.pdf'), false, 'nothing entered the library');

  const quais = (await liste(lea)).find((f: Any) => f.nom === 'port-sel-quais.webp');
  assert.ok(quais, 'Léa sees the joined file');
  const retrait = await lea.request.delete(`/api/univers/${uid}/fiches/${ids['Port-Sel']}/sections/${s.id}/fichiers/${quais.id}`);
  assert.equal(retrait.status(), 403);
  assert.equal((await sectionDe(antor, ids['Port-Sel']!, 'Description')).piecesJointes.length, avant);
});

test('B-24 · retirer une section retire ses références, jamais le fichier : la confirmation le dit, le fichier reste dans la médiathèque', opts, async () => {
  const fiche = await (await antor.request.post(`/api/univers/${uid}/fiches`, { data: { type: 'lieu', titre: 'Fiche à ranger' } })).json();
  const sec = await (await antor.request.post(`/api/univers/${uid}/fiches/${fiche.id}/sections`, { data: { titre: 'Annexes' } })).json();
  const v = await (await depot(antor, 'annexe-orpheline.pdf', 'application/pdf', PDF, { section: String(sec.id), maniere: 'joint' })).json();
  assert.equal((await sectionDe(antor, fiche.id, 'Annexes')).piecesJointes.length, 1);

  await antor.goto(`/univers/${uid}/fiche/${fiche.id}`);
  await attendre(antor);
  await choisirDansMenuSection(antor, 'Annexes', 'Retirer la section');
  const dialogue = antor.getByRole('alertdialog');
  await dialogue.waitFor();
  assert.match(((await dialogue.innerText()) as string).replace(/’/g, "'"), /Son contenu et son fichier joint seront retirés\./);
  await antor.screenshot({ path: '/tmp/scr/rep-retirer-section-fichier.png' });
  await dialogue.getByRole('button', { name: 'Retirer la section' }).click();
  await attendre(antor);

  const apres = await liste(antor);
  const reste = apres.find((f: Any) => f.id === v.id);
  assert.ok(reste, 'the file stays in the library');
  const detail = await (await antor.request.get(`/api/univers/${uid}/fichiers/${v.id}/detail`)).json();
  assert.equal(JSON.stringify(detail).includes('Annexes'), false, 'no usage names the removed section');
  assert.equal((await antor.request.get(`/api/univers/${uid}/fichiers/${v.id}`)).status(), 200, 'the bytes are still served to the GM');
});

test('E-19 · un fichier utilisé dans 40 fiches : « Utilisé dans » en montre 10, puis « Afficher les 30 autres »', opts, async () => {
  const f = await (await depot(antor, 'affiche-des-quarante.png', 'image/png', PNG)).json();
  for (let i = 1; i <= 40; i++) {
    const n = String(i).padStart(2, '0');
    const fiche = await (await antor.request.post(`/api/univers/${uid}/fiches`, { data: { type: 'lieu', titre: `Affichage ${n}` } })).json();
    const r = await antor.request.post(`/api/univers/${uid}/fiches/${fiche.id}/sections`, { data: { titre: 'Mur', contenu: `![affiche](fichier:${f.id})` } });
    assert.equal(r.status(), 201);
  }
  await antor.goto(`/univers/${uid}/mediatheque`);
  await antor.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(antor);
  await antor.getByRole('button', { name: /affiche-des-quarante\.png/ }).first().click();
  await antor.locator('.med-panneau').waitFor();
  const bloc = antor.getByRole('complementary').or(antor.getByRole('dialog')).last();
  await antor.getByText('Utilisé dans').first().waitFor();
  const plus = antor.getByRole('button', { name: /Afficher les 30 autres/ });
  await plus.waitFor();
  const avant = await antor.getByRole('link', { name: /Affichage \d\d/ }).count();
  assert.equal(avant, 10);
  await antor.screenshot({ path: '/tmp/scr/rep-quarante-usages.png' });
  await plus.click();
  await antor.getByRole('link', { name: 'Affichage 40' }).waitFor();
  await attendre(antor);
  assert.equal(await antor.getByRole('link', { name: /Affichage \d\d/ }).count(), 40);
  assert.equal(await antor.getByRole('button', { name: /Afficher les \d+ autres/ }).count(), 0);
  void bloc;
});

test('E-19 · au téléphone (390 px) : la grille et le panneau d’un fichier tiennent dans la largeur', opts, async () => {
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('/connexion-bouchon');
  await p.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
  await p.waitForLoadState('networkidle');
  await p.goto(`/univers/${uid}/mediatheque`);
  await p.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(p);
  const large = async () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok((await large()) <= 0, 'no sideways scroll on the grid');
  await p.screenshot({ path: '/tmp/scr/rep-mediatheque-390-grille.png' });
  await p.getByRole('button', { name: /Carte des Sphères/ }).first().click();
  await p.locator('.med-panneau').waitFor();
  assert.ok((await large()) <= 0, 'no sideways scroll with the panel open');
  assert.match(await texte(p), /Carte des Sphères/);
  await p.screenshot({ path: '/tmp/scr/rep-mediatheque-390-panneau.png' });
  await ctx.close();
});
