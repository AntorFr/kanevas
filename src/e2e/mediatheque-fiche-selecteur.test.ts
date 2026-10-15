// Browser check of the « Choisir un fichier » picker (kanevas-mediatheque-fiche, B2 + B4), written from the
// arbitration and docs/maquettes/e19-mediatheque.html, not from the code. Real server in stub mode, real Chromium.
//
// TEST PLAN
//   nominal   : picker = tile grid, « Ajouter depuis l'appareil » is the first tile, « Chercher par nom » field
//   bords     : 5 columns at 1440 px, 2 at 390 px, cadres 4/3; search is sent to the server (q) and keeps the
//               Images filter of the illustration; no match -> empty text, the device tile stays
//   échec     : B2 file deleted between opening and choosing -> « Ce fichier n'existe plus. », nothing inserted,
//               grid reloaded; same when it became unreadable for the reader (Léa, file reserved meanwhile)
//   exclusion : a reserved file never appears in the picker of a player; offline the device tile is disabled
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = 0;
let portId = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  const a = await connecte(browser, srv.base, 'Antor');
  antor = a.page;
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

const fichiersApi = async () => {
  const l = await (await antor.request.get(`/api/univers/${uid}/fichiers`)).json();
  return (l.fichiers ?? l) as Any[];
};
const ouvrirEdition = async (p: Any) => {
  await p.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(p);
  await p.getByRole('region', { name: /Description/ }).getByRole('button', { name: 'Modifier', exact: true }).click();
};
const ouvrirSelecteur = async (p: Any) => {
  await p.getByRole('button', { name: 'Fichier', exact: true }).click();
  await p.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  const d = p.getByRole('dialog');
  await d.getByText('Choisir un fichier').waitFor();
  return d;
};

test('sélecteur : première tuile « Ajouter depuis l’appareil », champ « Chercher par nom », 5 colonnes, cadres 4/3', opts, async () => {
  await antor.setViewportSize({ width: 1440, height: 900 });
  await ouvrirEdition(antor);
  const d = await ouvrirSelecteur(antor);
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor();
  await d.getByLabel('Chercher par nom').waitFor();
  const premiere = d.locator('.med-grille > li').first();
  assert.match(await premiere.innerText(), /Ajouter depuis l’appareil/);
  const cadres = await d.locator('.med-grille .med-cadre').evaluateAll((els: Element[]) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height, x: Math.round(r.left) };
    }),
  );
  assert.ok(cadres.length >= 3, 'tuile appareil + fichiers');
  for (const c of cadres) assert.ok(Math.abs(c.w / c.h - 4 / 3) < 0.05, `cadre 4/3, obtenu ${c.w}×${c.h}`);
  const colonnes = await d.locator('.med-grille').evaluate((g: Element) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  assert.equal(colonnes, 5);
  await antor.screenshot({ path: '/tmp/scr/selecteur-bureau.png' });
  await antor.setViewportSize({ width: 390, height: 900 });
  const mobile = await d.locator('.med-grille').evaluate((g: Element) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  assert.equal(mobile, 2);
  const deborde = await antor.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(deborde, false, 'aucun débordement à 390 px');
  await antor.screenshot({ path: '/tmp/scr/selecteur-mobile.png' });
  await antor.setViewportSize({ width: 1440, height: 900 });
});

test('recherche par nom : envoyée au serveur (q), la tuile appareil reste, « aucun résultat » vide la grille', opts, async () => {
  await ouvrirEdition(antor);
  const d = await ouvrirSelecteur(antor);
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor();
  const requetes: string[] = [];
  antor.on('request', (r: Any) => requetes.push(r.url()));
  await d.getByLabel('Chercher par nom').fill('Plan secret');
  await d.getByRole('button', { name: /Plan secret de la Guilde/ }).waitFor();
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor({ state: 'detached' });
  assert.ok(requetes.some((u) => /\/fichiers\?/.test(u) && /[?&]q=Plan(\+|%20)secret/.test(u)), `q envoyé : ${requetes.join(' ')}`);
  await d.getByLabel('Chercher par nom').fill('zzzintrouvable');
  await d.getByText(/Aucun fichier à choisir\./).waitFor();
  assert.equal(await d.getByRole('button', { name: 'Ajouter depuis l’appareil' }).count(), 1, 'tuile appareil conservée');
  await antor.screenshot({ path: '/tmp/scr/selecteur-vide.png' });
});

test('illustration : recherche et filtre Images se combinent, pas de document', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${portId}`);
  await attendre(antor);
  await antor.getByRole('button', { name: 'Remplacer l’illustration' }).click();
  await antor.getByRole('menuitem', { name: /Choisir dans la médiathèque/ }).click();
  const d = antor.getByRole('dialog');
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor();
  const requetes: string[] = [];
  antor.on('request', (r: Any) => requetes.push(r.url()));
  await d.getByLabel('Chercher par nom').fill('Sphères');
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor();
  await antor.waitForTimeout(300);
  const derniere = requetes.filter((u) => /\/fichiers\?/.test(u)).pop() ?? '';
  assert.match(derniere, /nature=images/);
  assert.match(derniere, /q=Sph/);
  await d.getByLabel('Chercher par nom').fill('zzz');
  await d.getByText('Aucune image à choisir.').waitFor();
});

test('B2 : fichier supprimé entre l’ouverture et le choix -> « Ce fichier n’existe plus. », rien inséré, grille rechargée', opts, async () => {
  await ouvrirEdition(antor);
  const champ = antor.getByLabel('Contenu de « Description »');
  const avant: string = await champ.inputValue();
  const d = await ouvrirSelecteur(antor);
  await d.getByRole('button', { name: /Plan secret de la Guilde/ }).waitFor();
  const plan = (await fichiersApi()).find((f) => f.nom === 'Plan secret de la Guilde');
  const r = await antor.request.delete(`/api/univers/${uid}/fichiers/${plan.id}`);
  assert.ok(r.status() < 300, String(r.status()));
  await d.getByRole('button', { name: /Plan secret de la Guilde/ }).click();
  await antor.getByText('Ce fichier n’existe plus.').first().waitFor();
  await d.getByRole('button', { name: /Plan secret de la Guilde/ }).waitFor({ state: 'detached' });
  await antor.screenshot({ path: '/tmp/scr/selecteur-supprime.png' });
  assert.equal(await champ.inputValue(), avant, 'aucun caractère inséré');
  assert.doesNotMatch(await champ.inputValue(), /fichier:/);
});

test('B2 : fichier devenu illisible pour Léa entre l’ouverture et le choix -> « Ce fichier n’existe plus. », texte inchangé, pas de pastille MJ', opts, async () => {
  const l = await (await antor.request.get(`/api/univers/${uid}/fiches?type=personnage`)).json();
  const fiche = (Array.isArray(l) ? l : l.fiches).find((f: Any) => f.titre === 'Léa Brisefer').id;
  await lea.goto(`/univers/${uid}/fiche/${fiche}`);
  await attendre(lea);
  const notes = lea.getByRole('region', { name: /Notes de la table/ });
  await notes.getByRole('button', { name: 'Modifier', exact: true }).click();
  const champ = lea.getByLabel('Contenu de « Notes de la table »');
  const avant: string = await champ.inputValue();
  const d = await ouvrirSelecteur(lea);
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor();
  const carte = (await fichiersApi()).find((f) => f.nom === 'Carte des Sphères');
  const r = await antor.request.patch(`/api/univers/${uid}/fichiers/${carte.id}`, { data: { visibilite: 'mj' } });
  assert.equal(r.status(), 200);
  await d.getByRole('button', { name: /Carte des Sphères/ }).click();
  await lea.getByText('Ce fichier n’existe plus.').first().waitFor();
  assert.equal(await champ.inputValue(), avant);
  await d.getByRole('button', { name: /Carte des Sphères/ }).waitFor({ state: 'detached' });
  assert.equal(await d.getByText('MJ seul').count(), 0);
});

test('sélecteur d’un fichier lisible : la référence est insérée ; hors connexion la tuile appareil est désactivée', opts, async () => {
  await ouvrirEdition(antor);
  const champ = antor.getByLabel('Contenu de « Description »');
  const d = await ouvrirSelecteur(antor);
  const tuile = d.getByRole('button', { name: 'Ajouter depuis l’appareil' });
  await tuile.waitFor();
  assert.equal(await tuile.isDisabled(), false);
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  await antor.waitForTimeout(300);
  const desactivee = await tuile.isDisabled();
  await antor.context().setOffline(false);
  await antor.evaluate(() => window.dispatchEvent(new Event('online')));
  assert.equal(desactivee, true, 'tuile appareil désactivée hors connexion');
  const fichiers = await fichiersApi();
  const lisible = fichiers.find((f) => f.nom === 'port-sel-quais.webp');
  await d.getByRole('button', { name: /port-sel-quais\.webp/ }).click();
  await antor.waitForFunction(() => /fichier:\d+/.test((document.querySelector('textarea') as HTMLTextAreaElement)?.value ?? ''));
  assert.match(await champ.inputValue(), new RegExp(`\\(fichier:${lisible.id}\\)`));
});
