// Black-box tests of kanevas-cg-ecran-cartes, written from its exit criterion and
// docs/ecrans.md « E-10 Cartes », « E-3 — le bloc Cartes visibles ».
// Real server in stub mode + real Chromium. Expected texts are literals from the doc.
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
let lea: Any;
let teo: Any;
let uid = '';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}
const ligne = (page: Any, titre: string) => page.locator('li').filter({ has: page.getByRole('link', { name: rxExact(titre) }) });
const bloc = (page: Any) => page.locator('section, article, div').filter({ has: page.getByRole('heading', { name: 'Cartes visibles' }) }).last();

async function versCartes(page: Any) {
  await page.goto(`/univers/${uid}/cartes`);
  await page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
  await attendre(page);
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  teo = (await connecte(browser, srv.base, 'Teo')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Brume');
  await antor.getByRole('heading', { name: 'Brume', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('vide : MJ (avec Nouvelle carte, via la barre), Joueuse, et E-3 sans bloc pour elle', opts, async () => {
  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('link', { name: rxExact('Cartes') }).click();
  await antor.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
  await attendre(antor);
  let t = await texte(antor);
  assert.ok(t.includes("Aucune carte pour l'instant. Créez-en une pour commencer."));
  assert.ok(t.includes("Les cartes de l'univers. Les joueurs ne voient que celles que vous rendez visibles."));
  assert.ok(await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).count());
  await antor.screenshot({ path: '/tmp/e10-vide-mj.png' });

  await lea.goto(`/univers/${uid}`);
  await lea.getByRole('heading', { name: 'Campagnes actives' }).waitFor();
  await attendre(lea);
  assert.ok(!(await texte(lea)).includes('Cartes visibles'), 'pas de bloc pour Léa sans carte visible');
  await lea.getByRole('link', { name: rxExact('Cartes') }).click();
  await lea.getByText(rx("Aucune carte n'est visible pour l'instant.")).waitFor();
  t = await texte(lea);
  assert.ok(!t.includes('Nouvelle carte') && !t.includes('Les joueurs ne voient que'));
  await lea.screenshot({ path: '/tmp/e10-vide-joueur.png' });

  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('heading', { name: 'Cartes visibles' }).waitFor();
  await attendre(antor);
  assert.ok((await texte(antor)).includes('Aucune carte visible des joueurs.'));
  await antor.screenshot({ path: '/tmp/e3-bloc-vide-mj.png' });
});

test('Teo (sans rôle) force l’adresse : Page introuvable.', opts, async () => {
  await teo.goto(`/univers/${uid}/cartes`);
  await teo.getByText(rx('Page introuvable.')).waitFor();
  await teo.screenshot({ path: '/tmp/e10-refus.png' });
});

test('fond refusé (plan.pdf), titre vide : erreurs, rien créé', opts, async () => {
  await versCartes(antor);
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await antor.getByRole('button', { name: rxExact('Créer') }).click();
  await antor.getByText(rx('Erreur : le titre est obligatoire.')).waitFor();

  await antor.getByLabel('Titre').fill('Plan raté');
  await antor.getByLabel('Image de fond').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await antor.getByRole('button', { name: rxExact('Créer') }).click();
  await antor.getByText(rx("Erreur : ce fichier n'est pas une image (PNG, JPEG, GIF ou WebP).")).waitFor();
  assert.match(antor.url(), /\/cartes$/);
  await antor.screenshot({ path: '/tmp/e10-fond-refuse.png' });
  const r = await api(antor, 'GET', `/api/univers/${uid}/cartes`);
  assert.equal(r.body.cartes.length, 0);
});

test('80 caractères au plus', opts, async () => {
  await versCartes(antor);
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await antor.getByLabel('Titre').fill('x'.repeat(81));
  await antor.getByRole('button', { name: rxExact('Créer') }).click();
  await antor.getByText(rx('Erreur : 80 caractères au plus.')).waitFor();
});

test('création en échec : la saisie et le fond choisi sont gardés', opts, async () => {
  await versCartes(antor);
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await antor.getByLabel('Titre').fill('La ville de Brume');
  await antor.getByLabel('Image de fond').setInputFiles({ name: 'brume.png', mimeType: 'image/png', buffer: PNG });
  await antor.route('**/api/univers/*/cartes', (route: Any) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
  await antor.getByRole('button', { name: rxExact('Créer') }).click();
  await antor.getByText(rx("La carte n'a pas pu être créée. Réessayez.")).waitFor();
  assert.equal(await antor.getByLabel('Titre').inputValue(), 'La ville de Brume');
  assert.ok((await texte(antor)).includes('brume.png'), 'fond choisi gardé');
  await antor.screenshot({ path: '/tmp/e10-creation-echec.png' });
  await antor.unroute('**/api/univers/*/cartes');
  const r = await api(antor, 'GET', `/api/univers/${uid}/cartes`);
  assert.equal(r.body.cartes.length, 0);
});

test('parcours : créer « La ville de Brume » avec fond, MJ seul, Léa ne la voit pas, Rendre visible', opts, async () => {
  await versCartes(antor);
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await antor.getByLabel('Titre').fill('La ville de Brume');
  await antor.getByLabel('Image de fond').setInputFiles({ name: 'brume.png', mimeType: 'image/png', buffer: PNG });
  await antor.getByRole('button', { name: rxExact('Créer') }).click();
  await antor.waitForURL(new RegExp(`/cartes/\\d+$`));
  const cid = antor.url().split('/').pop();
  await versCartes(antor);
  const l = ligne(antor, 'La ville de Brume');
  await l.waitFor();
  const tl = (await l.innerText()).replace(/\s+/g, ' ');
  assert.ok(tl.includes('Carte illustrée') && tl.includes('MJ seul') && tl.includes('Rendre visible'), tl);
  assert.equal(await l.locator('img').count(), 1, 'vignette = le fond');
  await antor.screenshot({ path: '/tmp/e10-liste-mj.png' });

  await versCartes(lea);
  assert.ok(!(await texte(lea)).includes('La ville de Brume'));
  assert.equal((await api(lea, 'GET', `/api/univers/${uid}/cartes/${cid}`)).status, 404);

  await l.getByRole('button', { name: rxExact('Rendre visible') }).click();
  await l.getByRole('button', { name: rxExact('Cacher aux joueurs') }).waitFor();
  assert.ok((await l.innerText()).includes('Visible des joueurs'));
  await versCartes(lea);
  const ll = ligne(lea, 'La ville de Brume');
  await ll.waitFor();
  const t = await ll.innerText();
  assert.ok(!t.includes('MJ seul') && !t.includes('Visible des joueurs') && !t.includes('Rendre visible') && !t.includes('Cacher'), t);
  assert.equal(await lea.getByRole('button', { name: /Nouvelle carte/ }).count(), 0);
  await lea.screenshot({ path: '/tmp/e10-liste-joueur.png' });

  // cacher again
  await l.getByRole('button', { name: rxExact('Cacher aux joueurs') }).click();
  await l.getByText('MJ seul').waitFor();
});

test('échec de visibilité : message et état d’avant', opts, async () => {
  await versCartes(antor);
  const l = ligne(antor, 'La ville de Brume');
  await antor.route('**/api/univers/*/cartes/*', (route: Any) =>
    route.request().method() === 'PATCH' ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
  await l.getByRole('button', { name: rxExact('Rendre visible') }).click();
  await antor.getByText(rx("L'action n'a pas abouti. Réessayez.")).waitFor();
  assert.ok((await l.innerText()).includes('MJ seul'));
  await antor.unroute('**/api/univers/*/cartes/*');
});

test('bloc E-3 : deux visibles sur trois pour Léa comme pour Antor, sans la « MJ seul »', opts, async () => {
  for (const [titre, forme] of [['Carte B', 'illustree'], ['Carte C secrète', 'graphe']] as const) {
    const r = await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre, forme });
    assert.equal(r.status, 201);
    if (titre === 'Carte B') await api(antor, 'PATCH', `/api/univers/${uid}/cartes/${r.body.id}`, { visible: true });
  }
  // visible: « La ville de Brume » (re-made visible), « Carte B » ; hidden: « Carte C secrète »
  const l = (await api(antor, 'GET', `/api/univers/${uid}/cartes`)).body.cartes.find((c: Any) => c.titre === 'La ville de Brume');
  await api(antor, 'PATCH', `/api/univers/${uid}/cartes/${l.id}`, { visible: true });
  for (const p of [lea, antor]) {
    await p.goto(`/univers/${uid}`);
    await p.getByRole('heading', { name: 'Cartes visibles' }).waitFor();
    await attendre(p);
    const b = bloc(p);
    const items = await b.locator('li').allInnerTexts();
    assert.equal(items.length, 2, items.join('|'));
    const t = (await b.innerText());
    assert.ok(t.includes('La ville de Brume') && t.includes('Carte B') && !t.includes('secrète'));
    assert.ok(t.includes('Toutes'));
    await p.screenshot({ path: '/tmp/e3-bloc.png' });
  }
  await lea.getByRole('link', { name: 'Carte B' }).click();
  await lea.waitForURL(/\/cartes\/\d+$/);
});

test('bloc : en échec sans toucher aux autres blocs', opts, async () => {
  await antor.route('**/api/univers/*/cartes**', (route: Any) => route.fulfill({ status: 500, body: '{}' }));
  await antor.goto(`/univers/${uid}`);
  await antor.getByText(rx('Impossible de charger les cartes.')).waitFor();
  const t = await texte(antor);
  assert.ok(t.includes('Campagnes actives') && t.includes('Derniers comptes-rendus'));
  assert.ok(!t.includes('Impossible de charger cette page.'));
  await antor.screenshot({ path: '/tmp/e3-bloc-erreur.png' });
  await antor.unroute('**/api/univers/*/cartes**');
  await antor.getByRole('button', { name: rxExact('Réessayer') }).click();
  await antor.getByRole('link', { name: 'Carte B' }).waitFor();
});

test('E-10 en erreur de chargement : message et Réessayer', opts, async () => {
  await lea.route('**/api/univers/*/cartes**', (route: Any) => route.fulfill({ status: 500, body: '{}' }));
  await lea.goto(`/univers/${uid}/cartes`);
  await lea.getByText(rx('Impossible de charger cette page.')).waitFor();
  await lea.unroute('**/api/univers/*/cartes**');
  await lea.getByRole('button', { name: rxExact('Réessayer') }).click();
  await lea.getByRole('link', { name: 'Carte B' }).waitFor();
});

test('plus de 100 cartes : cent puis « Charger la suite »', opts, async () => {
  for (let i = 0; i < 100; i++) await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: `Zone ${String(i).padStart(3, '0')}`, forme: 'graphe' });
  await versCartes(antor);
  assert.equal(await antor.locator('ul.cartes-liste > li').count(), 100);
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
  await antor.waitForFunction(() => document.querySelectorAll('ul.cartes-liste > li').length === 103);
  assert.equal(await antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
  await antor.screenshot({ path: '/tmp/e10-long.png' });
  const t = await texte(antor);
  assert.ok(t.indexOf('Carte B') < t.indexOf('Zone 000'), 'ordre alphabétique');
});

test('Charger la suite en échec : message, bouton reste', opts, async () => {
  await versCartes(antor);
  await antor.route('**/api/univers/*/cartes?curseur=*', (route: Any) => route.fulfill({ status: 500, body: '{}' }));
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
  await antor.getByText(rx('Impossible de charger la suite.')).waitFor();
  assert.equal(await antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 1);
  await antor.unroute('**/api/univers/*/cartes?curseur=*');
});

test('connexion perdue : bandeau, écritures désactivées, liste gardée', opts, async () => {
  await versCartes(antor);
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await antor.getByLabel('Titre').fill('Hors ligne');
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  await antor.getByText(rx('Connexion perdue.')).first().waitFor();
  assert.ok(await antor.getByRole('button', { name: rxExact('Créer') }).isDisabled());
  assert.ok(await antor.getByRole('button', { name: rxExact('Rendre visible') }).first().isDisabled().catch(() => true)
    || await antor.getByRole('button', { name: rxExact('Cacher aux joueurs') }).first().isDisabled());
  assert.ok(await antor.getByRole('link', { name: 'Carte B' }).count(), 'liste gardée');
  await antor.screenshot({ path: '/tmp/e10-hors-ligne.png' });
  await antor.context().setOffline(false);
});

test('connexion perdue : Nouvelle carte désactivé', opts, async () => {
  await versCartes(antor);
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  await antor.getByText(rx('Connexion perdue.')).first().waitFor();
  assert.ok(await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).isDisabled());
  await antor.context().setOffline(false);
});
