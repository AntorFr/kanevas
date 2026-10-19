// Black-box tests of kanevas-refonte-visuelle (verification pass), E-7 « Scénario »: the six states of the
// screen in the new frame, written from docs/ecrans.md « E-7 Scénario » and « Détail de kanevas-refonte-visuelle »
// (B-29) only. Expected texts are literals of the doc. Real server in stub mode + real Chromium.
//
// TEST PLAN
//   B-29 E-7 chargement      : « Chargement du scénario… » while the API is slow, the title absent
//   B-29 E-7 erreur          : « Impossible de charger ce scénario. » + « Réessayer » which brings the content back
//   B-29 E-7 échec d'écriture: « L'action n'a pas abouti. Réessayez. », typed text kept, no toast
//   B-29 E-7 connexion perdue: banner, « Enregistrer » disabled, typed text kept
//   B-29 E-7 contenu long    : 120-character title and 20 000-character content shown whole, no horizontal overflow (desktop, 390 px)
//   B-29 E-7 refus           : Léa, Joueuse -> « Page introuvable. », without the title
//   cadre E-7                : avatar menu holds theme + « Se déconnecter », the sidebar does not
//   toast E-7                : a successful save gives a toast, which does not take the focus
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  connecte,
  creerUnivers,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';
import { changerStatut, ouvrirNouveauScenario } from './suivi-aide.js';

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let urlScenario = '';

const BANDEAU_PERDU =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";
const ECHEC = "L'action n'a pas abouti. Réessayez.";
const TITRE = 'Acte III — La crypte';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Crypte');
  await antor.getByRole('heading', { name: 'Crypte', level: 1 }).waitFor();
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
  await antor.getByRole('link', { name: rxExact('Campagnes') }).click();
  await antor.getByLabel('Nom', { exact: true }).fill('La Couronne brisée');
  await antor.getByRole('button', { name: rxExact('Créer la campagne') }).click();
  await antor.getByRole('link', { name: rx('La Couronne brisée') }).waitFor();
  await changerStatut(antor, 'Active', 'La Couronne brisée');
  await antor.getByRole('link', { name: rx('La Couronne brisée') }).click();
  await antor.getByRole('heading', { name: 'La Couronne brisée', level: 1 }).waitFor();
  await ouvrirNouveauScenario(antor);
  await antor.getByLabel('Titre', { exact: true }).first().fill(TITRE);
  await antor.getByRole('button', { name: rxExact('Créer le scénario') }).click();
  await antor.getByRole('heading', { name: TITRE, level: 1 }).waitFor();
  urlScenario = new URL(antor.url()).pathname;
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

async function neuve(): Promise<Any> {
  const p = await antor.context().newPage();
  p.setDefaultTimeout(8000);
  return p;
}

test('E-7 chargement : « Chargement du scénario… » tant que l’API est lente, sans le titre', opts, async () => {
  const p = await neuve();
  await p.route(/\/api\/scenarios\/\d+$/, async (r: Any) => {
    await new Promise((s) => setTimeout(s, 1500));
    await r.continue();
  });
  await p.goto(urlScenario);
  await p.getByText(rx('Chargement du scénario…')).waitFor();
  assert.equal(await p.getByRole('heading', { name: TITRE, level: 1 }).count(), 0);
  await p.getByRole('heading', { name: TITRE, level: 1 }).waitFor();
  await p.close();
});

test('E-7 erreur : « Impossible de charger ce scénario. » puis « Réessayer » rend le scénario', opts, async () => {
  const p = await neuve();
  await p.route(/\/api\/scenarios\/\d+$/, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await p.goto(urlScenario);
  await p.getByText(rx('Impossible de charger ce scénario.')).waitFor();
  await p.unroute(/\/api\/scenarios\/\d+$/);
  await p.getByRole('button', { name: rxExact('Réessayer') }).click();
  await p.getByRole('heading', { name: TITRE, level: 1 }).waitFor();
  assert.ok(!(await texte(p)).includes('Impossible de charger ce scénario.'));
  await p.close();
});

test('E-7 échec d’écriture : message en ligne, texte conservé, aucun toast', opts, async () => {
  const p = await neuve();
  await p.goto(urlScenario);
  await p.getByRole('heading', { name: TITRE, level: 1 }).waitFor();
  await p.getByRole('button', { name: rxExact('Modifier') }).click();
  await p.getByLabel('Contenu').fill('texte à garder');
  await p.route(/\/api\/scenarios\/\d+$/, (r: Any) =>
    r.request().method() === 'PUT' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
  );
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await p.getByText(rx(ECHEC)).waitFor();
  assert.equal(await p.getByLabel('Contenu').inputValue(), 'texte à garder');
  assert.equal(await p.locator('[role="status"]:has-text("enregistré")').count(), 0);
  await p.close();
});

test('E-7 connexion perdue : bandeau, « Enregistrer » désactivé, texte conservé', opts, async () => {
  const p = await neuve();
  await p.goto(urlScenario);
  await p.getByRole('heading', { name: TITRE, level: 1 }).waitFor();
  await p.getByRole('button', { name: rxExact('Modifier') }).click();
  await p.getByLabel('Contenu').fill('en cours');
  await p.context().setOffline(true);
  await p.getByText(rx(BANDEAU_PERDU)).first().waitFor();
  assert.equal(await p.getByRole('button', { name: rxExact('Enregistrer') }).isDisabled(), true);
  assert.equal(await p.getByLabel('Contenu').inputValue(), 'en cours');
  await p.context().setOffline(false);
  for (let i = 0; i < 60 && (await p.getByText(rx(BANDEAU_PERDU)).count()) > 0; i++) await p.waitForTimeout(100);
  assert.equal(await p.getByText(rx(BANDEAU_PERDU)).count(), 0);
  await p.close();
});

test('E-7 contenu long : titre de 120 et contenu de 20 000 caractères en entier, sans débordement, au bureau et à 390 px', opts, async () => {
  const long = 'T'.repeat(120);
  const contenu = ('mot ' + 'x'.repeat(46) + ' ').repeat(400).slice(0, 20000);
  const p = await neuve();
  await p.goto(urlScenario);
  await p.getByRole('heading', { name: TITRE, level: 1 }).waitFor();
  await p.getByRole('button', { name: rxExact('Modifier') }).click();
  await p.getByLabel('Titre', { exact: true }).fill(long);
  await p.getByLabel('Contenu').fill(contenu);
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await p.getByRole('heading', { name: long, level: 1 }).waitFor();
  for (const [w, h] of [[1280, 800], [390, 800]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(200);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    const culprit = await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 3).map((e) => e.tagName + '.' + e.className + ':' + (e.textContent ?? '').slice(0, 20)));
    assert.ok(o.sw <= o.cw, `no horizontal overflow at ${w}px (${o.sw} > ${o.cw}) ${JSON.stringify(culprit)}`);
    assert.ok((await texte(p)).replace(/\s+/g, ' ').includes(contenu.trim().replace(/\s+/g, ' ').slice(-200)), 'the end of the 20 000 characters is shown');
  }
  await p.close();
});

test('E-7 refus : Léa, Joueuse, voit « Page introuvable. » sans le titre', opts, async () => {
  await lea.goto(urlScenario);
  await lea.getByText(rx('Page introuvable.')).waitFor();
  assert.ok(!(await texte(lea)).includes(TITRE));
  assert.ok(await lea.getByRole('link', { name: rx('Mes univers') }).count());
});

test('E-7 cadre : le menu de l’avatar porte le thème et « Se déconnecter », la barre non ; un enregistrement donne un toast sans prendre le focus', opts, async () => {
  const p = await neuve();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(urlScenario);
  await p.getByRole('heading', { level: 1 }).first().waitFor();
  assert.equal(await p.getByRole('button', { name: rx('Se déconnecter') }).count(), 0);
  assert.equal(await p.getByRole('menuitem', { name: rx('Se déconnecter') }).count(), 0);
  await p.getByRole('button', { name: rx('antor') }).last().click();
  for (const n of ['Clair', 'Sombre', 'Système']) assert.ok(await p.getByRole('menuitemradio', { name: rx(n) }).or(p.getByRole('button', { name: rx(n) })).or(p.getByRole('radio', { name: rx(n) })).count(), n);
  assert.ok(await p.getByRole('menuitem', { name: rx('Se déconnecter') }).or(p.getByRole('button', { name: rx('Se déconnecter') })).count());
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: rxExact('Modifier') }).click();
  await p.getByLabel('Contenu').fill('toast');
  await p.getByRole('button', { name: rxExact('Enregistrer') }).click();
  await p.getByText(rx('enregistré')).first().waitFor();
  assert.notEqual(await p.evaluate(() => document.activeElement?.closest('[role="status"], [aria-live]') !== null && document.activeElement?.tagName !== 'BODY'), true);
  await p.close();
});
