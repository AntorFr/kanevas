// Independent check of kanevas-import-mediatheque, written from the sheet of the feature (« Livre », exit criterion),
// docs/parcours.md (B-24, B-44, B-53 to B-55, P-16) and docs/ecrans.md (E-9 « Fichiers », E-19) — not from the code.
// Real server in stub mode on the seed (Lame d'Ébène), real Chromium. It complements mediatheque-ensemble.test.ts.
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
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

const noms = async (p: Any, query = ''): Promise<string[]> =>
  ((await (await p.request.get(api(`/fichiers${query}`))).json()).fichiers as Any[]).map((f) => f.nom);
const fichier = async (p: Any, nom: string): Promise<Any> =>
  ((await (await p.request.get(api('/fichiers'))).json()).fichiers as Any[]).find((f) => f.nom === nom);
const envoyer = (p: Any, champs: Record<string, string>, nom: string, mimeType: string, buffer: Buffer, url = '/fichiers') =>
  p.request.post(api(url), { multipart: { ...champs, fichier: { name: nom, mimeType, buffer } } });

test('un joueur qui force l’adresse d’un fichier réservé au MJ : octets, panneau et liste disent « introuvable »', opts, async () => {
  const plan = await fichier(antor, 'Plan secret de la Guilde');
  assert.equal(plan.visibilite, 'mj');
  assert.equal((await antor.request.get(api(`/fichiers/${plan.id}`))).status(), 200);
  assert.equal((await lea.request.get(api(`/fichiers/${plan.id}`))).status(), 404);
  const detail = await lea.request.get(api(`/fichiers/${plan.id}/detail`));
  assert.equal(detail.status(), 404);
  assert.equal((await detail.json()).message, 'Page introuvable.');
  assert.deepEqual(await noms(lea, '?q=Plan%20secret'), []);
  assert.equal((await noms(lea)).length, 10);
});

test('un joueur ne modifie, ne supprime, n’interroge l’impact ni n’ajoute dans la médiathèque : refusé, rien ne change', opts, async () => {
  const carte = await fichier(antor, 'Carte des Sphères');
  const patch = await lea.request.patch(api(`/fichiers/${carte.id}`), { data: { nom: 'Piratée', visibilite: 'mj' } });
  assert.equal(patch.status(), 403);
  assert.equal((await lea.request.delete(api(`/fichiers/${carte.id}`))).status(), 403);
  assert.equal((await lea.request.get(api(`/fichiers/${carte.id}/impact?action=supprimer`))).status(), 403);
  assert.equal((await envoyer(lea, {}, 'intrus.png', 'image/png', PNG)).status(), 403);
  const apres = await fichier(antor, 'Carte des Sphères');
  assert.equal(apres.visibilite, 'joueurs');
  assert.equal((await noms(antor)).includes('intrus.png'), false);
  assert.equal((await noms(antor)).length, 13);
});

test('un Admin d’instance sans rôle dans l’univers : la médiathèque est « Page introuvable. »', opts, async () => {
  const r = await admin.request.get(api('/fichiers'));
  assert.equal(r.status(), 404);
  assert.equal((await r.json()).message, 'Page introuvable.');
  await admin.goto(`/univers/${uid}/mediatheque`);
  await attendre(admin);
  assert.match(await admin.locator('body').innerText(), /Page introuvable\./);
});

test('filtres de la médiathèque d’Antor : nom, Images, Documents, Visibilité, Usage, ordre Nom', opts, async () => {
  assert.deepEqual(await noms(antor, '?q=carte'), ['Carte des Sphères']);
  assert.deepEqual(await noms(antor, '?q=zzz-introuvable'), []);
  assert.equal((await noms(antor, '?nature=images')).length, 13);
  assert.deepEqual(await noms(antor, '?nature=documents'), []);
  assert.deepEqual((await noms(antor, '?visibilite=mj')).sort(), ['Cercle des Cendres', 'Le Prieur masqué', 'Plan secret de la Guilde']);
  assert.equal((await noms(antor, '?visibilite=joueurs')).length, 10);
  assert.deepEqual(await noms(antor, '?usage=non_utilises'), ['Plan secret de la Guilde']);
  assert.equal((await noms(antor, '?usage=utilises')).length, 12);
  const alpha = await noms(antor, '?tri=nom');
  assert.equal(alpha[0], 'Carte des Sphères');
  assert.equal(alpha[alpha.length - 1], 'Val-Fortin');
  assert.deepEqual(await noms(lea, '?visibilite=mj'), []);
});

test('renommer : 200 caractères acceptés, 201 et vide refusés, le nom reste celui d’avant', opts, async () => {
  await envoyer(antor, {}, 'nom-a-changer.pdf', 'application/pdf', PDF);
  const f = await fichier(antor, 'nom-a-changer.pdf');
  assert.equal(f.visibilite, 'joueurs');
  const long = 'a'.repeat(200);
  assert.equal((await antor.request.patch(api(`/fichiers/${f.id}`), { data: { nom: long } })).status(), 200);
  assert.equal((await fichier(antor, long)).id, f.id);
  assert.equal((await antor.request.patch(api(`/fichiers/${f.id}`), { data: { nom: 'b'.repeat(201) } })).status(), 400);
  assert.equal((await antor.request.patch(api(`/fichiers/${f.id}`), { data: { nom: '' } })).status(), 400);
  assert.equal((await fichier(antor, long)).id, f.id);
  await antor.request.delete(api(`/fichiers/${f.id}`));
});

test('Léa ajoute à « Notes de la table » en envoyant « visibilite=joueurs » : le fichier entre quand même réservé au MJ', opts, async () => {
  const fiche = await (await lea.request.get(api(`/fiches/${ids['Léa Brisefer']}`))).json();
  const notes = fiche.sections.find((s: Any) => s.titre === 'Notes de la table');
  const r = await envoyer(lea, { visibilite: 'joueurs', section: String(notes.id), maniere: 'joint' }, 'forcer.pdf', 'application/pdf', PDF);
  assert.ok(r.status() < 300, `statut ${r.status()}`);
  assert.equal((await fichier(antor, 'forcer.pdf')).visibilite, 'mj');
});

test('une illustration qui n’est pas une image (octets de texte nommés .png) est refusée et n’ajoute rien', opts, async () => {
  const avant = (await noms(antor)).length;
  const r = await antor.request.put(api(`/fiches/${ids['Port-Sel']}/illustration`), {
    multipart: { fichier: { name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci est du texte, pas une image') } },
  });
  assert.equal(r.status(), 400);
  assert.equal((await noms(antor)).length, avant);
  const f = await (await antor.request.get(api(`/fiches/${ids['Port-Sel']}`))).json();
  assert.ok(f.illustration, 'l’illustration de Port-Sel n’a pas changé');
});

test('P-16 étape 5 : après avoir remplacé l’illustration de Port-Sel, supprimer « Carte des Sphères » liste deux fiches', opts, async () => {
  const carte = await fichier(antor, 'Carte des Sphères');
  const avant = await (await antor.request.get(api(`/fichiers/${carte.id}/impact?action=supprimer`))).json();
  assert.deepEqual(avant.usages.map((u: Any) => u.libelle).sort(), [
    'Maître Aldric — « Apparence » (jointe)',
    'Port-Sel (illustration)',
    'Val-Fortin — « Description »',
  ]);
  const autre = await fichier(antor, 'La Fresque effacée');
  const put = await antor.request.put(api(`/fiches/${ids['Port-Sel']}/illustration`), { data: { fichierId: autre.id } });
  assert.equal(put.status(), 200);
  const apres = await (await antor.request.get(api(`/fichiers/${carte.id}/impact?action=supprimer`))).json();
  assert.deepEqual(apres.usages.map((u: Any) => u.libelle).sort(), ['Maître Aldric — « Apparence » (jointe)', 'Val-Fortin — « Description »']);
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
  let source = '';
  for (let i = 0; i < 100 && !/\]\(fichier:\d+\)/.test(source); i++) {
    await antor.waitForTimeout(100);
    source = await ta.inputValue();
  }
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

  const f = await fichier(antor, 'grille-des-tarifs.pdf');
  assert.equal((await antor.request.patch(api(`/fichiers/${f.id}`), { data: { visibilite: 'mj' } })).status(), 200);
  await lea.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(lea);
  await lea.screenshot({ path: '/tmp/scr/ver-document-reserve.png' });
  const lue = await lea.getByRole('region', { name: /Description/ }).innerText();
  assert.match(lue, /Fichier réservé au MJ\./);
  assert.doesNotMatch(lue, /grille-des-tarifs/);
});

test('un fichier supprimé n’existe plus pour personne : octets, panneau, liste', opts, async () => {
  await envoyer(antor, {}, 'ephemere.pdf', 'application/pdf', PDF);
  const f = await fichier(antor, 'ephemere.pdf');
  assert.equal((await antor.request.delete(api(`/fichiers/${f.id}`))).status(), 204);
  for (const p of [antor, lea]) {
    assert.equal((await p.request.get(api(`/fichiers/${f.id}`))).status(), 404);
    assert.equal((await p.request.get(api(`/fichiers/${f.id}/detail`))).status(), 404);
    assert.equal((await noms(p)).includes('ephemere.pdf'), false);
  }
});
