// ecrans: carte, fiche
// Black-box tests of kanevas-synchro-cartes-ecrans, written from its exit criterion and
// docs/ecrans.md « E-11 Carte — text and attached sheet » and « E-9 — the block « Cartes » ».
// Real server in stub mode + real Chromium; expected texts are literals. The effects (rights, versions) are
// proved by the routes' own tests; here only what the screen shows and the gestures' nominal.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let antor2: Any;
let lea: Any;
let uid = '';
let cid = 0;
let cachee = 0;
let aldric = 0;
let secrete = 0;

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}
const base = (id = cid) => `/api/univers/${uid}/cartes/${id}`;
async function ouvrir(page: Any, id = cid) {
  await page.goto(`/univers/${uid}/cartes/${id}`);
  await page.locator('h1, [role=alert]').first().waitFor();
  await attendre(page);
}
async function ouvrirFiche(page: Any, id: number) {
  await page.goto(`/univers/${uid}/fiche/${id}`);
  await page.locator('h1').first().waitFor();
  await attendre(page);
}
const bouton = (page: Any, nom: string) => page.getByRole('button', { name: rxExact(nom) });

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  antor2 = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Brume');
  await antor.getByRole('heading', { name: 'Brume', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
  const reglage = async (fid: number, lisent: boolean) => {
    const sec = (await api(antor, 'POST', `/api/univers/${uid}/fiches/${fid}/sections`, { titre: 'Présentation', contenu: 'x' })).body;
    assert.equal((await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${fid}/sections/${sec.id}`, { joueursLisent: lisent })).status, 200);
  };
  aldric = (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: 'Port de Brume' })).body.id;
  secrete = (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'faction', titre: 'Les Ombres' })).body.id;
  await reglage(aldric, true);
  await reglage(secrete, false);
  cid = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'La ville de Brume', forme: 'illustree' })).body.id;
  assert.equal((await api(antor, 'PATCH', base(), { visible: true })).status, 200);
  cachee = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'Les caves', forme: 'graphe' })).body.id;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('E-11 : le MJ rattache la carte à un lieu par la fenêtre, la ligne mène au lieu, qui liste la carte', opts, async () => {
  await ouvrir(antor);
  assert.equal(await antor.getByText(rx('Rattachée à')).count(), 0, 'rien de rattaché au départ');
  await bouton(antor, 'Rattacher à une fiche…').click();
  const dlg = antor.getByRole('dialog');
  await dlg.waitFor();
  await attendre(antor);
  await dlg.getByLabel('Type de fiche').selectOption('lieu');
  await dlg.getByRole('button', { name: rx('Port de Brume') }).click();
  await antor.getByText(rx('Rattachée à')).waitFor();
  await attendre(antor);
  const f = (await api(antor, 'GET', base())).body.carte.fiche;
  assert.equal(f.id, aldric);
  const t = await texte(antor);
  assert.ok(t.includes('Rattachée à Port de Brume'), t);
  assert.ok(t.includes('Changer de fiche…'));
  assert.equal(await bouton(antor, 'Détacher').count(), 1);
  await antor.screenshot({ path: '/tmp/e11-rattachee.png' });
  await antor.getByRole('link', { name: 'Port de Brume' }).first().click();
  await antor.waitForURL(/(fiche\/\d+|lieu\/port-de-brume)$/);
  await attendre(antor);
  await antor.getByText('La ville de Brume').waitFor();
  const tf = await texte(antor);
  assert.ok(tf.includes('Cartes'), 'bloc Cartes');
  assert.ok(tf.includes('La ville de Brume'), tf);
  assert.ok(tf.includes('Carte illustrée'), tf);
  await antor.screenshot({ path: '/tmp/e9-cartes.png' });
});

test('E-11 : le MJ écrit un texte avec un bloc MJ ; la joueuse le lit sans le bloc, avec la ligne « Rattachée à »', opts, async () => {
  await ouvrir(antor);
  await bouton(antor, 'Ajouter un texte').click();
  await antor.getByLabel('Texte de la carte').fill('Le port **gris**.\n\n:::mj\nLe passage secret est sous le quai.\n:::\n');
  await bouton(antor, 'Enregistrer').click();
  await bouton(antor, 'Modifier').waitFor();
  await attendre(antor);
  let t = await texte(antor);
  assert.ok(t.includes('Le port gris.'), t);
  assert.ok(t.includes('Le passage secret est sous le quai.'), 'le MJ lit son bloc MJ');
  assert.equal(await bouton(antor, 'Vider').count(), 1);
  // Player mode: the GM sees what a player sees, no gesture.
  await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
  await attendre(antor);
  t = await texte(antor);
  assert.ok(t.includes('Le port gris.'), t);
  assert.ok(!t.includes('passage secret'), 'mode Joueur : pas de bloc MJ');
  assert.ok(t.includes('Rattachée à Port de Brume'));
  for (const nom of ['Modifier', 'Vider', 'Détacher', 'Changer de fiche…']) assert.equal(await bouton(antor, nom).count(), 0, nom);
  await antor.getByRole('radio', { name: 'Mode MJ' }).check();
  await attendre(antor);
  // The player.
  await ouvrir(lea);
  t = await texte(lea);
  assert.ok(t.includes('Le port gris.'), t);
  assert.ok(!t.includes('passage secret'), 'la joueuse ne lit pas le bloc MJ');
  assert.ok(t.includes('Rattachée à Port de Brume'));
  for (const nom of ['Modifier', 'Vider', 'Détacher', 'Rattacher à une fiche…', 'Changer de fiche…']) assert.equal(await bouton(lea, nom).count(), 0, nom);
  await lea.screenshot({ path: '/tmp/e11-joueuse.png' });
  await lea.getByRole('link', { name: 'Port de Brume' }).first().click();
  await lea.waitForURL(/(fiche\/\d+|lieu\/port-de-brume)$/);
  await attendre(lea);
  assert.ok((await texte(lea)).includes('La ville de Brume'), 'la fiche du lieu liste la carte pour la joueuse');
});

test('E-11 : un texte fait seulement de blocs MJ n’affiche aucun bloc « Texte » à la joueuse', opts, async () => {
  const v = (await api(antor, 'GET', base())).body.carte.version;
  assert.equal((await api(antor, 'PUT', `${base()}/texte`, { texte: ':::mj\nSecret seul.\n:::\n', version: v })).status, 200);
  await ouvrir(lea);
  const t = await texte(lea);
  assert.ok(!t.includes('Secret seul'));
  assert.equal(await lea.getByRole('heading', { name: rxExact('Texte') }).count(), 0, 'pas de bloc Texte');
  await ouvrir(antor);
  assert.ok((await texte(antor)).includes('Secret seul.'));
});

test('E-11 : deux onglets du MJ sur la même version — le second voit « Le texte a changé depuis votre lecture. », son brouillon gardé, « Recharger »', opts, async () => {
  await ouvrir(antor);
  await ouvrir(antor2);
  await bouton(antor, 'Modifier').click();
  await bouton(antor2, 'Modifier').click();
  await antor.getByLabel('Texte de la carte').fill('Première version du port.');
  await bouton(antor, 'Enregistrer').click();
  await bouton(antor, 'Modifier').waitFor();
  await antor2.getByLabel('Texte de la carte').fill('Brouillon du second onglet.');
  await bouton(antor2, 'Enregistrer').click();
  await antor2.getByText(rx('Le texte a changé depuis votre lecture.')).waitFor();
  assert.equal(await antor2.getByLabel('Texte de la carte').inputValue(), 'Brouillon du second onglet.', 'le brouillon est gardé');
  assert.equal((await api(antor, 'GET', base())).body.carte.texte, 'Première version du port.', 'rien n’a été écrasé');
  await antor2.screenshot({ path: '/tmp/e11-409.png' });
  await bouton(antor2, 'Recharger').click();
  await attendre(antor2);
  // The draft is still in the field; saving it now goes through on the fresh version.
  await bouton(antor2, 'Enregistrer').click();
  await bouton(antor2, 'Modifier').waitFor();
  assert.equal((await api(antor, 'GET', base())).body.carte.texte, 'Brouillon du second onglet.');
});

test('E-11 : « Vider » vide sans confirmation ; « Ajouter un texte » revient ; plus de bloc Texte pour la joueuse', opts, async () => {
  await ouvrir(antor);
  await bouton(antor, 'Vider').click();
  await bouton(antor, 'Ajouter un texte').waitFor();
  assert.equal((await api(antor, 'GET', base())).body.carte.texte ?? '', '');
  await ouvrir(lea);
  assert.equal(await lea.getByRole('heading', { name: rxExact('Texte') }).count(), 0);
});

test('E-11 : plus de 5 000 caractères — « Enregistrer » inactif, rien d’écrit', opts, async () => {
  await ouvrir(antor);
  await bouton(antor, 'Ajouter un texte').click();
  await antor.getByLabel('Texte de la carte').fill('a'.repeat(5001));
  assert.equal(await bouton(antor, 'Enregistrer').isDisabled(), true);
  await antor.getByLabel('Texte de la carte').fill('a'.repeat(5000));
  assert.equal(await bouton(antor, 'Enregistrer').isDisabled(), false);
  await bouton(antor, 'Annuler').click();
  assert.equal(((await api(antor, 'GET', base())).body.carte.texte ?? ''), '');
});

test('E-11 : « Changer de fiche… » puis « Détacher » ; la fiche ne liste plus la carte', opts, async () => {
  await ouvrir(antor);
  await bouton(antor, 'Changer de fiche…').click();
  const dlg = antor.getByRole('dialog');
  await dlg.waitFor();
  await attendre(antor);
  await dlg.getByLabel('Type de fiche').selectOption('faction');
  await dlg.getByRole('button', { name: rx('Les Ombres') }).click();
  await antor.getByText(rx('Rattachée à Les Ombres')).waitFor();
  assert.equal((await api(antor, 'GET', base())).body.carte.fiche.id, secrete);
  // The player does not read « Les Ombres »: the line is absent and the sheet is not named.
  await ouvrir(lea);
  const t = await texte(lea);
  assert.ok(!t.includes('Rattachée à'), t);
  assert.ok(!t.includes('Les Ombres'));
  await ouvrir(antor);
  await bouton(antor, 'Détacher').click();
  await bouton(antor, 'Rattacher à une fiche…').waitFor();
  assert.equal(await antor.getByText(rx('Rattachée à')).count(), 0);
  assert.equal(await bouton(antor, 'Détacher').count(), 0);
  assert.equal((await api(antor, 'GET', base())).body.carte.fiche, null);
  await ouvrirFiche(antor, secrete);
  assert.ok(!(await texte(antor)).includes('La ville de Brume'));
});

test('E-9 : une carte cachée apparaît au MJ avec « Cachée aux joueurs », jamais à la joueuse (ni fiche, ni liste)', opts, async () => {
  assert.equal((await api(antor, 'PUT', `${base(cachee)}/fiche`, { ficheId: aldric })).status, 200);
  assert.equal((await api(antor, 'PUT', `${base()}/fiche`, { ficheId: aldric })).status, 200);
  assert.equal((await api(antor, 'PATCH', base(cachee), { visible: false })).status, 200);
  await ouvrirFiche(antor, aldric);
  const tm = await texte(antor);
  assert.ok(tm.includes('Les caves') && tm.includes('Graphe'), tm);
  assert.ok(tm.includes('Cachée aux joueurs'));
  await antor.screenshot({ path: '/tmp/e9-cachee-mj.png' });
  await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
  await attendre(antor);
  const tmj = await texte(antor);
  assert.ok(tmj.includes('La ville de Brume'));
  assert.ok(!tmj.includes('Les caves') && !tmj.includes('Cachée aux joueurs'), 'mode Joueur : comme une joueuse');
  await antor.getByRole('radio', { name: 'Mode MJ' }).check();
  await ouvrirFiche(lea, aldric);
  const tl = await texte(lea);
  assert.ok(tl.includes('La ville de Brume'));
  assert.ok(!tl.includes('Les caves') && !tl.includes('Cachée aux joueurs'), tl);
  await ouvrir(lea, cachee);
  assert.ok(!(await texte(lea)).includes('Rattachée à'), 'la carte cachée ne se lit pas');
  await lea.goto(`/univers/${uid}/cartes`);
  await attendre(lea);
  assert.ok(!(await texte(lea)).includes('Les caves'), 'ni dans la liste des cartes');
});

test('E-9 : une fiche sans carte n’a pas de bloc « Cartes »', opts, async () => {
  await ouvrirFiche(antor, secrete);
  assert.equal(await antor.getByRole('heading', { name: rxExact('Cartes') }).count(), 0);
});

test('E-11 : « Modifier » et « Vider » sont dans l’en-tête du bloc Texte, à droite du titre, avec leur icône', opts, async () => {
  const v = (await api(antor, 'GET', base())).body.carte.version;
  assert.equal((await api(antor, 'PUT', `${base()}/texte`, { texte: 'Un texte à gérer.', version: v })).status, 200);
  await ouvrir(antor);
  const titre = await antor.getByRole('heading', { name: rxExact('Texte') }).boundingBox();
  for (const nom of ['Modifier', 'Vider']) {
    const b = antor.getByRole('button', { name: rxExact(nom) });
    const r = await b.boundingBox();
    assert.ok(r && titre, nom);
    assert.ok(r.y < titre.y + titre.height + 4, `${nom} est dans l’en-tête (pas sous le texte)`);
    assert.ok(r.x > titre.x + titre.width, `${nom} est à droite du titre`);
    assert.equal(await b.locator('svg').count(), 1, `${nom} porte une icône`);
  }
});

test('E-9 : le bloc « Cartes » est un libellé avec icône ; à 360 px le titre d’une carte reste lisible, le type et la pastille passent à la ligne', opts, async () => {
  const longue = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'Carte des quartiers marchands de Brume', forme: 'illustree' })).body.id;
  assert.equal((await api(antor, 'PUT', `${base(longue)}/fiche`, { ficheId: aldric })).status, 200);
  assert.equal((await api(antor, 'PATCH', base(longue), { visible: false })).status, 200);
  await antor.setViewportSize({ width: 360, height: 800 });
  try {
    await ouvrirFiche(antor, aldric);
    const lien = antor.getByRole('link', { name: rx('Carte des quartiers marchands') }).first();
    await lien.waitFor();
    const l = await lien.boundingBox();
    assert.ok(l && l.width >= 120, `titre lisible à 360 px (largeur ${l?.width})`);
    const pastille = await antor.getByText('Cachée aux joueurs').last().boundingBox();
    assert.ok(pastille && pastille.y >= l.y + l.height - 2, 'la pastille passe sous le titre');
    assert.equal(await antor.getByRole('heading', { name: rxExact('Cartes') }).count(), 0, 'pas de cadre à titre serif');
    await antor.screenshot({ path: '/tmp/e9-360.png', fullPage: true });
  } finally {
    await antor.setViewportSize({ width: 1280, height: 800 });
  }
});
