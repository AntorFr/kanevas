// Independent verification of kanevas-import-mediatheque, written from the sheet of the feature
// (« Livre », exit criterion), docs/parcours.md (B-24, B-44, B-53, B-54, B-55, P-16) and
// docs/ecrans.md (E-19, E-9 « Fichiers »), NOT from the code and NOT from the other tests of the
// feature: it covers what the file-level tests of `mediatheque-ensemble.test.ts` do not.
// Real server in stub mode, real Chromium, real SQLite; literal expectations.
//
// TEST PLAN
//   B-53 filtres        : Visibilité « Réservées au MJ » shows the reserved files only; Usage « Non utilisés »
//                         leaves out « Carte des Sphères » (used); a player has no « Visibilité » filter
//   B-53 droits         : Teo (not a member) and Admin (no role in the universe) get « Page introuvable. » and a 404 list;
//                         without a session the bytes are not served
//   B-53 droits (excl.) : Léa cannot rename, re-open or delete a file (state unchanged)
//   B-53 nom            : 200 characters accepted, 201 refused, the new name is what Léa reads
//   B-53 ajout direct   : « Ajouter des fichiers » : a PDF and an unknown type enter « Visible des joueurs »; an empty file in
//                         the same drop is refused, the others are added
//   B-54 sans usage     : reserve without usage = no box, toast; delete without usage = box without list, toast
//   B-44 double garde   : a reserved document in a text → « Fichier réservé au MJ. » for Léa; a visible image in a GM block → nothing
//   B-55 exclusion      : the client cannot send the visibility; Léa cannot join a file she does not see
//   B-24 retirer        : « Retirer » removes the reference, never the file
//   E-19 sélecteur      : a file deleted between opening and choosing → « Ce fichier n'existe plus. »
//   E-19 vide / long    : empty library, MJ and player sentences; 102 files = 100 then « Charger la suite »
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let srv2: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let teo: Any;
let admin: Any;
let uid = 0;
const ids: Record<string, number> = {};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  teo = (await connecte(browser, srv.base, 'Teo')).page;
  admin = (await connecte(browser, srv.base, 'admin')).page;
  uid = (await (await antor.request.get('/api/univers')).json()).find((u: Any) => u.nom === "Lame d'Ébène").id;
  for (const type of ['lieu', 'personnage']) {
    const r = await (await antor.request.get(`/api/univers/${uid}/fiches?type=${type}`)).json();
    for (const f of r.fiches) ids[f.titre] = f.id;
  }
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
  srv2?.stop();
});

const liste = async (p: Any, q = ''): Promise<Any[]> => (await (await p.request.get(`/api/univers/${uid}/fichiers${q}`)).json()).fichiers;
const fichierId = async (p: Any, nom: string): Promise<number> => {
  const f = (await liste(p)).find((x: Any) => x.nom === nom);
  assert.ok(f, `file « ${nom} » is in the library`);
  return f.id;
};
const sectionDe = async (p: Any, titreFiche: string, titreSection: string): Promise<Any> => {
  const f = await (await p.request.get(`/api/univers/${uid}/fiches/${ids[titreFiche]}`)).json();
  return f.sections.find((s: Any) => s.titre === titreSection);
};
const mediatheque = async (p: Any, base = '') => {
  await p.goto(`${base}/univers/${uid}/mediatheque`);
  await p.getByRole('heading', { name: 'Médiathèque', level: 1 }).waitFor();
  await attendre(p);
};
const grille = async (p: Any): Promise<string> => (await p.locator('main').innerText()) as string;
const ouvrir = async (p: Any, nom: string) => {
  await p.getByRole('button', { name: nom, exact: false }).filter({ hasText: nom }).first().click();
  await p.getByRole('link', { name: 'Télécharger' }).first().waitFor();
};
const depot = async (p: Any, nom: string, mime: string, contenu: Buffer, extra: Record<string, string> = {}) =>
  p.request.post(`/api/univers/${uid}/fichiers`, { multipart: { ...extra, fichier: { name: nom, mimeType: mime, buffer: contenu } } });

test('B-53 · Antor filtre « Réservées au MJ » : les réservés seuls ; « Non utilisés » écarte « Carte des Sphères »', opts, async () => {
  await mediatheque(antor);
  await antor.getByLabel('Visibilité', { exact: true }).selectOption({ label: 'Réservées au MJ' });
  await antor.getByRole('button', { name: /Lames Grises/ }).first().waitFor({ state: 'detached' });
  const reserves = await grille(antor);
  assert.match(reserves, /Plan secret de la Guilde/);
  assert.match(reserves, /Cercle des Cendres/);
  assert.doesNotMatch(reserves, /Carte des Sphères|Lames Grises|port-sel-quais\.webp/);
  await antor.screenshot({ path: '/tmp/scr/ver-filtre-reserves.png' });
  await antor.getByLabel('Visibilité', { exact: true }).selectOption({ label: 'Toutes' });
  await antor.getByLabel('Usage', { exact: true }).selectOption({ label: 'Non utilisés' });
  await antor.getByRole('button', { name: /Carte des Sphères/ }).first().waitFor({ state: 'detached' });
  const inutilises = await grille(antor);
  assert.match(inutilises, /Plan secret de la Guilde/);
  assert.doesNotMatch(inutilises, /Carte des Sphères/);
});

test('B-53 · Léa n’a pas de filtre « Visibilité » mais voit « Usage » ; elle ne voit aucun fichier réservé', opts, async () => {
  await mediatheque(lea);
  assert.equal(await lea.getByLabel('Visibilité', { exact: true }).count(), 0);
  assert.equal(await lea.getByLabel('Usage', { exact: true }).count(), 1);
  assert.equal(await lea.getByRole('button', { name: 'Ajouter des fichiers' }).count(), 0);
  assert.doesNotMatch(await grille(lea), /MJ seul|Plan secret|Cercle des Cendres/);
  await lea.screenshot({ path: '/tmp/scr/ver-lea-mediatheque.png' });
});

test('B-53 · Teo (pas membre) et Admin (sans rôle dans l’univers) : « Page introuvable. », liste 404 ; sans session, pas d’octets', opts, async () => {
  const carte = await fichierId(antor, 'Carte des Sphères');
  for (const p of [teo, admin]) {
    await p.goto(`/univers/${uid}/mediatheque`);
    await attendre(p);
    assert.match(await texte(p), /Page introuvable\./);
    assert.equal((await p.request.get(`/api/univers/${uid}/fichiers`)).status(), 404);
    assert.equal((await p.request.get(`/api/univers/${uid}/fichiers/${carte}`)).status(), 404);
  }
  const anonyme = await (await browser.newContext({ baseURL: srv.base })).request.get(`/api/univers/${uid}/fichiers/${carte}`);
  assert.equal(anonyme.status(), 401);
  assert.doesNotMatch(String(anonyme.headers()['content-type']), /image\/png/);
});

test('B-53 · Léa ne renomme, ne réserve ni ne supprime : l’état du fichier ne bouge pas', opts, async () => {
  const id = await fichierId(antor, 'La Fresque effacée');
  const avant = (await liste(antor)).find((f: Any) => f.id === id);
  for (const r of [
    await lea.request.patch(`/api/univers/${uid}/fichiers/${id}`, { data: { nom: 'Piraté' } }),
    await lea.request.patch(`/api/univers/${uid}/fichiers/${id}`, { data: { visibilite: 'mj' } }),
    await lea.request.delete(`/api/univers/${uid}/fichiers/${id}`),
  ]) {
    assert.ok(r.status() >= 400 && r.status() < 500, `refused, got ${r.status()}`);
  }
  const apres = (await liste(antor)).find((f: Any) => f.id === id);
  assert.equal(apres.nom, 'La Fresque effacée');
  assert.equal(apres.visibilite, 'joueurs');
  assert.deepEqual(apres, avant);
});

test('B-53 · nom de 200 caractères accepté, de 201 refusé ; Léa lit le nouveau nom dans sa médiathèque', opts, async () => {
  const id = await fichierId(antor, 'port-sel-quais.webp');
  const long = 'q'.repeat(200);
  assert.equal((await antor.request.patch(`/api/univers/${uid}/fichiers/${id}`, { data: { nom: 'q'.repeat(201) } })).status(), 400);
  assert.equal((await antor.request.patch(`/api/univers/${uid}/fichiers/${id}`, { data: { nom: long } })).status(), 200);
  assert.equal((await liste(lea)).find((f: Any) => f.id === id).nom, long);
  assert.equal((await antor.request.patch(`/api/univers/${uid}/fichiers/${id}`, { data: { nom: 'Quais de Port-Sel' } })).status(), 200);
  await mediatheque(lea);
  assert.match(await grille(lea), /Quais de Port-Sel/);
  assert.doesNotMatch(await grille(lea), /port-sel-quais\.webp/);
});

test('B-53 · « Ajouter des fichiers » : un PDF et un type inconnu entrent « Visible des joueurs » ; le fichier vide du même dépôt est refusé', opts, async () => {
  await mediatheque(antor);
  await antor.locator('input[type=file]').first().setInputFiles([
    pdf('regles-de-la-guilde.pdf'),
    { name: 'notes.xyz', mimeType: 'application/octet-stream', buffer: Buffer.from('des notes') },
    { name: 'vide.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
  ]);
  await antor.getByText('« vide.txt » est vide.').waitFor();
  await antor.screenshot({ path: '/tmp/scr/ver-depot-multiple.png' });
  const noms = (await liste(antor)).map((f: Any) => f.nom);
  assert.ok(noms.includes('regles-de-la-guilde.pdf'));
  assert.ok(noms.includes('notes.xyz'));
  assert.ok(!noms.includes('vide.txt'));
  for (const nom of ['regles-de-la-guilde.pdf', 'notes.xyz']) {
    const f = (await liste(lea)).find((x: Any) => x.nom === nom);
    assert.equal(f.visibilite, 'joueurs');
    assert.equal(f.image, false);
  }
  await mediatheque(antor);
  await antor.getByRole('radio', { name: 'Documents' }).click();
  await antor.getByRole('button', { name: /port-sel-quais|Quais de Port-Sel/ }).first().waitFor({ state: 'detached' });
  assert.match(await grille(antor), /regles-de-la-guilde\.pdf/);
  assert.match(await grille(antor), /notes\.xyz/);
});

test('B-54 · réserver un fichier sans usage : pas de boîte, le toast ; supprimer sans usage : boîte sans liste, puis le toast', opts, async () => {
  await mediatheque(antor);
  await ouvrir(antor, 'regles-de-la-guilde.pdf');
  await antor.getByRole('radio', { name: 'Réservé au MJ' }).click();
  await antor.getByText('Fichier réservé au MJ.').first().waitFor();
  assert.equal(await antor.getByRole('alertdialog').count() + (await antor.getByRole('dialog').count()), 0);
  assert.equal((await liste(lea)).some((f: Any) => f.nom === 'regles-de-la-guilde.pdf'), false);
  await antor.getByRole('radio', { name: 'Visible des joueurs' }).click();
  await attendre(antor);
  assert.equal((await liste(lea)).some((f: Any) => f.nom === 'regles-de-la-guilde.pdf'), true);

  await antor.getByRole('button', { name: 'Supprimer le fichier' }).click();
  const boite = antor.getByRole('alertdialog').or(antor.getByRole('dialog')).last();
  await boite.getByText('Supprimer « regles-de-la-guilde.pdf » ?').waitFor();
  const t = ((await boite.innerText()) as string).replace(/’/g, "'");
  assert.doesNotMatch(t, /utilis/);
  await antor.screenshot({ path: '/tmp/scr/ver-supprimer-sans-usage.png' });
  await boite.getByRole('button', { name: 'Supprimer le fichier' }).click();
  await antor.getByText('Fichier supprimé.').first().waitFor();
  assert.equal((await liste(antor)).some((f: Any) => f.nom === 'regles-de-la-guilde.pdf'), false);
});

test('B-44 · un document réservé lié dans le texte : Léa lit « Fichier réservé au MJ. » ; une image visible dans un bloc MJ : rien pour Léa, l’image pour Antor', opts, async () => {
  const doc = await (await depot(antor, 'tarif-secret.pdf', 'application/pdf', pdf('x').buffer)).json();
  assert.equal((await antor.request.patch(`/api/univers/${uid}/fichiers/${doc.id}`, { data: { visibilite: 'mj' } })).status(), 200);
  const grise = await fichierId(antor, 'Lames Grises');
  const s = await sectionDe(antor, 'Port-Sel', 'Description');
  const r = await antor.request.put(`/api/univers/${uid}/fiches/${ids['Port-Sel']}/sections/${s.id}/contenu`, {
    data: {
      version: s.version,
      contenu: `Voir [le tarif](fichier:${doc.id}).\n\n:::mj\n![blason](fichier:${grise})\n\nSecret du bloc.\n:::\n`,
    },
  });
  assert.equal(r.status(), 200);
  await lea.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(lea);
  const t = await texte(lea);
  assert.match(t, /Fichier réservé au MJ\./);
  assert.doesNotMatch(t, /Secret du bloc|blason/);
  const jetonGrise = (await liste(antor)).find((f: Any) => f.id === grise).jeton;
  const vueLea = await (await lea.request.get(`/api/univers/${uid}/fiches/${ids['Port-Sel']}`)).json();
  assert.doesNotMatch(JSON.stringify(vueLea), new RegExp(`Secret du bloc|blason|${jetonGrise}`));
  await lea.screenshot({ path: '/tmp/scr/ver-lea-document-reserve.png' });
  await antor.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(antor);
  assert.match(await texte(antor), /Secret du bloc/);
  assert.equal(await antor.locator(`img[src*="${jetonGrise}"], img[src*="/fichiers/${grise}"]`).count() > 0, true);
});

test('B-55 · le client ne choisit pas la visibilité ; Léa ne joint pas un fichier qu’elle ne voit pas', opts, async () => {
  const s = await sectionDe(antor, 'Port-Sel', 'Description');
  const v = await (await depot(antor, 'forcé.pdf', 'application/pdf', pdf('x').buffer, { section: String(s.id), maniere: 'joint', visibilite: 'mj' })).json();
  assert.equal((await liste(antor)).find((f: Any) => f.id === v.id).visibilite, 'joueurs');

  const notes = await sectionDe(antor, 'Port-Sel', 'Description');
  const plan = await fichierId(antor, 'Plan secret de la Guilde');
  const r = await lea.request.post(`/api/univers/${uid}/fiches/${ids['Port-Sel']}/sections/${notes.id}/fichiers`, { data: { fichierId: plan } });
  assert.ok(r.status() >= 400 && r.status() < 500, `refused, got ${r.status()}`);
  const apres = await sectionDe(antor, 'Port-Sel', 'Description');
  assert.equal(JSON.stringify(apres.piecesJointes).includes('Plan secret'), false);
});

test('B-24 · « Retirer » ôte la référence de la section, jamais le fichier de la médiathèque', opts, async () => {
  const s = await sectionDe(antor, 'Port-Sel', 'Description');
  const v = (await liste(antor)).find((f: Any) => f.nom === 'forcé.pdf');
  assert.ok(s.piecesJointes.some((p: Any) => p.nom === 'forcé.pdf'), 'joined');
  const d = await antor.request.delete(`/api/univers/${uid}/fiches/${ids['Port-Sel']}/sections/${s.id}/fichiers/${v.id}`);
  assert.equal(d.status(), 204);
  const apres = await sectionDe(antor, 'Port-Sel', 'Description');
  assert.equal(apres.piecesJointes.some((p: Any) => p.nom === 'forcé.pdf'), false);
  assert.equal((await liste(lea)).some((f: Any) => f.nom === 'forcé.pdf'), true);
});

test('E-19 sélecteur · « Joindre un fichier » : un fichier supprimé entre l’ouverture et le choix dit « Ce fichier n’existe plus. » et la grille se recharge', opts, async () => {
  const eph = await (await depot(antor, 'ephemere-jointe.png', 'image/png', PNG)).json();
  await antor.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(antor);
  await antor.getByRole('region', { name: /Description/ }).getByRole('button', { name: 'Joindre un fichier' }).first().click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  const dlg = antor.getByRole('dialog');
  await dlg.getByRole('button', { name: /ephemere-jointe\.png/ }).waitFor();
  assert.equal((await antor.request.delete(`/api/univers/${uid}/fichiers/${eph.id}`)).status(), 204);
  await dlg.getByRole('button', { name: /ephemere-jointe\.png/ }).click();
  await antor.getByText(/Ce fichier n.existe plus\./).waitFor();
  await antor.screenshot({ path: '/tmp/scr/ver-selecteur-disparu-joindre.png' });
  await dlg.getByRole('button', { name: /ephemere-jointe\.png/ }).waitFor({ state: 'detached' });
  await antor.keyboard.press('Escape');
});

test('E-19 sélecteur · barre d’outils de l’éditeur : un fichier supprimé entre l’ouverture et le choix dit « Ce fichier n’existe plus. » et n’entre pas dans le texte', opts, async () => {
  const eph = await (await depot(antor, 'ephemere-texte.png', 'image/png', PNG)).json();
  await antor.goto(`/univers/${uid}/fiche/${ids['Port-Sel']}`);
  await attendre(antor);
  const d = antor.getByRole('region', { name: /Description/ });
  await d.getByRole('button', { name: 'Modifier', exact: true }).click();
  await d.getByRole('button', { name: 'Fichier', exact: true }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  const dlg = antor.getByRole('dialog');
  await dlg.getByRole('button', { name: /ephemere-texte\.png/ }).waitFor();
  assert.equal((await antor.request.delete(`/api/univers/${uid}/fichiers/${eph.id}`)).status(), 204);
  await dlg.getByRole('button', { name: /ephemere-texte\.png/ }).click();
  await antor.waitForTimeout(1500);
  await antor.screenshot({ path: '/tmp/scr/ver-selecteur-disparu-texte.png' });
  const dit = await antor.getByText(/Ce fichier n.existe plus\./).count();
  const insere = (await d.getByRole('textbox').inputValue()).includes(`fichier:${eph.id}`);
  await d.getByRole('button', { name: 'Annuler', exact: true }).click().catch(() => undefined);
  assert.equal(dit > 0 && !insere, true, `message shown: ${dit > 0}; reference inserted into the text: ${insere}`);
});

let u2 = 0;
let a2: Any;
let l2: Any;
test('E-19 vide · bibliothèque vide : la phrase du MJ et celle du joueur', opts, async () => {
  srv2 = await startServer({});
  a2 = (await connecte(browser, srv2.base, 'Antor')).page;
  l2 = (await connecte(browser, srv2.base, 'Léa')).page;
  await creerUnivers(a2, 'Univers Vide');
  await allerMembres(a2);
  await ajouterMembre(a2, 'lea', 'Joueur');
  u2 = (await (await a2.request.get('/api/univers')).json()).find((x: Any) => x.nom === 'Univers Vide').id;
  await a2.goto(`/univers/${u2}/mediatheque`);
  await attendre(a2);
  assert.match(await texte(a2), /Aucun fichier pour l'instant\. Ajoutez-en, ou posez-en un dans une fiche\./);
  assert.equal(await a2.getByRole('button', { name: 'Ajouter des fichiers' }).count() > 0, true);
  await a2.screenshot({ path: '/tmp/scr/ver-vide-mj.png' });
  await l2.goto(`/univers/${u2}/mediatheque`);
  await attendre(l2);
  assert.match(await texte(l2), /Aucun fichier à voir pour l'instant\./);
  await l2.screenshot({ path: '/tmp/scr/ver-vide-joueur.png' });
});

test('E-19 contenu long · 102 fichiers : 100 puis « Charger la suite », le dernier arrive, plus de bouton', opts, async () => {
  for (let i = 0; i < 102; i++) {
    const r = await a2.request.post(`/api/univers/${u2}/fichiers`, {
      multipart: { fichier: { name: `f${String(i).padStart(3, '0')}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${i}\n%%EOF\n`) } },
    });
    assert.equal(r.status(), 201);
  }
  await a2.goto(`/univers/${u2}/mediatheque`);
  await attendre(a2);
  const tuiles = () => a2.locator('main').getByRole('button', { name: /f\d{3}\.pdf/ }).count();
  assert.equal(await tuiles(), 100);
  await a2.getByRole('button', { name: 'Charger la suite' }).click();
  for (let i = 0; i < 100 && (await tuiles()) < 102; i++) await a2.waitForTimeout(100);
  assert.equal(await tuiles(), 102);
  assert.equal(await a2.getByRole('button', { name: 'Charger la suite' }).count(), 0);
  await a2.screenshot({ path: '/tmp/scr/ver-102.png' });
});

test('E-19 en-tête · avec 102 fichiers visibles, l’en-tête dit « 102 fichiers » (ceux que le lecteur voit)', opts, async () => {
  await a2.goto(`/univers/${u2}/mediatheque`);
  await attendre(a2);
  assert.match(await texte(a2), /(^|\n)102 fichiers(\n|$)/);
  await l2.goto(`/univers/${u2}/mediatheque`);
  await attendre(l2);
  assert.match(await texte(l2), /(^|\n)102 fichiers(\n|$)/);
});
