// ecrans: fiche, mediatheque
// Independent check of kanevas-import-mediatheque, written from the sheet of the feature (« Livre », exit criterion),
// docs/parcours.md (B-24, B-44, B-53 to B-55, P-16) and docs/ecrans.md (E-9 « Fichiers », E-19) — not from the code.
// Real server in stub mode on the seed (Lame d'Ébène), real Chromium. It complements mediatheque-ensemble.test.ts.
// Lot médiathèque: the API-only tests went to src/routes/fichiers-verification-lot-mediatheque.test.ts; only the two page tests stay.
//
// TEST PLAN (literal expectations)
//   B-44 / B-53 exclusion : a player forcing the address of a reserved file gets 404 on the bytes, the panel and the list
//   B-53 droits           : a player's PATCH / DELETE / impact / POST on the library are refused (403), nothing changes
//   B-53 droits           : an instance admin with no role in the universe gets 404 on the library
//   B-53 filtres          : name search, Images / Documents, Visibilité, Usage, ordre Nom on the seed
//   B-53 bords            : a name of 200 characters is accepted, 201 and empty are refused, the library is unchanged
//   B-55 exclusion        : a visibility sent by the client with an upload into a closed section is ignored
//   B-55 échec            : an illustration which is not an image is refused and the library gains nothing
//   P-16 étape 5          : after replacing the illustration of « Port-Sel », deleting « Carte des Sphères » lists two sheets
//   B-44 / B-54 document  : a document added by the toolbar is a link in the text; reserved, Léa reads « Fichier réservé au MJ. »
//   B-54 supprimer        : a deleted file is gone for everyone (bytes, panel, list)
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let admin: Any;
let uid = 0;
const ids: Record<string, number> = {};

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const api = (p: string) => `/api/univers/${uid}${p}`;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  admin = (await connecte(browser, srv.base, 'Admin')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  for (const type of ['lieu', 'personnage', 'evenement']) {
    const r = await (await antor.request.get(api(`/fiches?type=${type}`))).json();
    for (const f of Array.isArray(r) ? r : r.fiches) ids[f.titre] = f.id;
  }
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const fichier = async (p: Any, nom: string): Promise<Any> =>
  ((await (await p.request.get(api('/fichiers'))).json()).fichiers as Any[]).find((f) => f.nom === nom);

test('un Admin d’instance sans rôle dans l’univers : la médiathèque est « Page introuvable. »', opts, async () => {
  await admin.goto(`/univers/${uid}/mediatheque`);
  await attendre(admin);
  assert.match(await admin.locator('body').innerText(), /Page introuvable\./);
});

test('un document ajouté par la barre d’outils est un lien dans le texte ; réservé au MJ, Léa lit « Fichier réservé au MJ. »', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(antor);
  const desc = antor.getByRole('region', { name: /Description/ });
  await desc.getByRole('button', { name: 'Modifier', exact: true }).click();
  await desc.getByRole('button', { name: 'Fichier', exact: true }).click();
  const [fc] = await Promise.all([antor.waitForEvent('filechooser'), antor.getByRole('menuitem', { name: /Ajouter depuis l/ }).click()]);
  await fc.setFiles({ name: 'grille-des-tarifs.pdf', mimeType: 'application/pdf', buffer: PDF });
  const ta = desc.getByRole('textbox');
  await antor.waitForFunction((el: HTMLTextAreaElement) => /\]\(fichier:\d+\)/.test(el.value), await ta.elementHandle(), { timeout: 10_000 });
  const source = await ta.inputValue();
  assert.match(source, /\[[^\]]*grille-des-tarifs[^\]]*\]\(fichier:\d+\)/);
  assert.doesNotMatch(source, /!\[[^\]]*grille-des-tarifs/);
  await desc.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await desc.getByRole('button', { name: 'Modifier', exact: true }).waitFor();

  await lea.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(lea);
  const lien = lea.getByRole('region', { name: /Description/ }).getByRole('link', { name: /grille-des-tarifs/ });
  await lien.waitFor();
  const [dl] = await Promise.all([lea.waitForEvent('download'), lien.click()]);
  assert.equal(dl.suggestedFilename(), 'grille-des-tarifs.pdf');

  const f = await fichier(antor, 'grille-des-tarifs.pdf'); // the visibility is only set up here; its effect on the bytes is a door
  await antor.request.patch(api(`/fichiers/${f.id}`), { data: { visibilite: 'mj' } });
  await lea.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(lea);
  await lea.getByRole('region', { name: /Description/ }).getByText('Fichier réservé au MJ.').waitFor({ timeout: 20000 });
  await lea.screenshot({ path: '/tmp/scr/ver-document-reserve.png' });
  const lue = await lea.getByRole('region', { name: /Description/ }).innerText();
  assert.match(lue, /Fichier réservé au MJ\./);
  assert.doesNotMatch(lue, /grille-des-tarifs/);
});
