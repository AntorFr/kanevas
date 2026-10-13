// Black-box tests of kanevas-monde at the screen (E-12 block « Mise à jour proposée », docs/ecrans.md
// § `kanevas-monde`; critère de sortie of the feature), in a real Chromium against the real server in stub mode.
// Captures go to $MONDE_CAPTURES (default /tmp/monde-captures), outside the tree: proofs of the moment.
//
// TEST PLAN
//   critère nominal : Antor asks for « Vérité » from « Séance 3 » → « Mise à jour proposée » with « Actuel »
//                     (= « Il sert la Couronne. ») and « Proposé »; the sheet opened beside still says
//                     « Il sert la Couronne. »; « Appliquer » → « Appliquée : la section « Vérité » est à jour. »
//                     and the sheet shows the proposed content
//   critère périmée : the section changes, then « Appliquer » → refused with « La section a changé depuis la
//                     proposition. Demandez-en une nouvelle. », « Appliquer » aria-disabled, « Abandonner »
//                     active, nothing written; « Abandonner » → « Proposition abandonnée. »
//   exclusion       : Léa asks the same → no block, no « Appliquer »
//   états B-29      : chargement, erreur de lecture + Réessayer, erreur d'un geste, refus « Cette proposition
//                     n'existe plus. », appliquée ailleurs, connexion perdue, section vide, contenu long, 390 px
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, launch, rx, skipBrowser, startServer, texte } from './harnais.test.js';
import { CR_DEMANDE, VERITE, bati, comptes, idProposition, lireSection, modifierSection, propUrl, sectionUrl, demander, type Monde } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
const CAP = process.env.MONDE_CAPTURES ?? '/tmp/monde-captures';
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;

before(async () => {
  if (skipBrowser) return;
  mkdirSync(CAP, { recursive: true });
  srv = await startServer();
  browser = await launch();
  C = await comptes(srv, browser);
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

const ficheUrl = (m: Monde) => `/univers/${m.univers}/fiche/${m.fiche}`;

/** A page of `compte` on the sheet, with the assistant panel open. */
async function panneau(c: Any, m: Monde): Promise<Any> {
  const page = await c.ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(srv.base + ficheUrl(m));
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Demander à Kanevas/ }).click();
  await page.getByRole('textbox', { name: /Demander à Kanevas/ }).waitFor();
  return page;
}

async function envoyer(page: Any, message = CR_DEMANDE): Promise<void> {
  await page.getByRole('textbox', { name: /Demander à Kanevas/ }).fill(message);
  const reponse = page.waitForResponse((r: Any) => r.url().endsWith('/assistant/messages'));
  await page.getByRole('button', { name: /^Envoyer$/ }).click();
  const corps = await (await reponse).json().catch(() => null);
  page.propositionId = corps?.evenements?.[0]?.cible?.propositionId;
}

/** Antor, panel open, request sent, block displayed. */
async function avecBloc(m: Monde): Promise<Any> {
  const page = await panneau(C.antor, m);
  await envoyer(page);
  await page.getByText('Mise à jour proposée', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Appliquer$/ }).waitFor();
  return page;
}

const zone = (page: Any, nom: string) => page.getByRole('region', { name: nom, exact: true });
/** Text of a zone without its label line. */
async function contenu(page: Any, nom: string): Promise<string> {
  const t = (await zone(page, nom).innerText()) as string;
  return t.replace(new RegExp(`^${nom}\\n`), '');
}
const appliquer = (page: Any) => page.getByRole('button', { name: /^Appliquer$/ });
const abandonner = (page: Any) => page.getByRole('button', { name: /^Abandonner$/ });
const photo = (page: Any, nom: string) => page.screenshot({ path: `${CAP}/${nom}.png` });

test('critère : proposer ne change pas la section, Appliquer l’écrit et le bloc le dit', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await panneau(C.antor, m);
  await envoyer(page);
  await page.getByText('Mise à jour proposée', { exact: true }).waitFor();
  const t = await texte(page);
  assert.match(t, /Section « Vérité » de « Maître Aldric »/);
  assert.match(t, /d'après « Séance 3 »/);
  assert.equal(await contenu(page, 'Actuel'), 'Il sert la Couronne.');
  const propose = (await contenu(page, 'Proposé')) as string;
  assert.notEqual(propose.trim(), '');
  assert.notEqual(propose, VERITE);
  assert.equal(await page.getByRole('link', { name: /^Ouvrir$/ }).count() >= 1, true);
  await photo(page, 'nominal-en-attente');
  // the sheet, opened beside, still says the old content
  const fiche = await C.antor.ctx.newPage();
  await fiche.goto(srv.base + ficheUrl(m));
  await fiche.waitForLoadState('networkidle');
  assert.match(await texte(fiche), /Il sert la Couronne\./);
  assert.equal((await lireSection(C.antor, m)).contenu, VERITE);
  // apply
  await appliquer(page).click();
  await page.getByText('Appliquée : la section « Vérité » est à jour.').waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: 'Appliquée : la section « Vérité » est à jour.' }).count(), 1);
  assert.equal(await appliquer(page).count(), 0, 'no gesture left once applied');
  assert.equal(await abandonner(page).count(), 0);
  assert.equal(await zone(page, 'Proposé').count(), 0, '« Proposé » is gone');
  assert.equal(await contenu(page, 'Actuel'), propose, '« Actuel » shows the applied content');
  assert.equal((await lireSection(C.antor, m)).contenu, propose);
  await photo(page, 'nominal-appliquee');
  await fiche.reload();
  await fiche.waitForLoadState('networkidle');
  assert.equal((await texte(fiche)).includes('Mise à jour d'), true, 'the sheet shows the proposed content');
});

test('critère : la section change, Appliquer est refusé avec la raison, Abandonner reste actif', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  await modifierSection(C.antor, m, 'Il trahit la Couronne.');
  await appliquer(page).click();
  const bandeau = page.getByRole('alert').filter({ hasText: 'La section a changé depuis la proposition. Demandez-en une nouvelle.' });
  await bandeau.waitFor();
  assert.equal(await appliquer(page).getAttribute('aria-disabled'), 'true');
  assert.notEqual(await abandonner(page).getAttribute('aria-disabled'), 'true');
  assert.equal(await contenu(page, 'Actuel'), 'Il trahit la Couronne.', '« Actuel » shows the current content');
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il trahit la Couronne.', 'nothing written');
  await photo(page, 'perimee');
  await abandonner(page).click();
  await page.getByText('Proposition abandonnée.').waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: 'Proposition abandonnée.' }).count(), 1);
  assert.equal(await appliquer(page).count(), 0);
  assert.equal(await zone(page, 'Actuel').count(), 0, 'no zones after abandoning');
  assert.equal((await C.antor.ctx.request.get(propUrl(m, page.propositionId))).status() >= 400, true);
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il trahit la Couronne.');
});

test('périmée vue à l’affichage : le bandeau est là avant tout clic', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  await modifierSection(C.antor, m, 'Il hésite.');
  // a new gesture-free reread: reopening the panel's block through a fresh page is impossible (the thread is in
  // memory), so ask again in the same thread for another section state, then check the OLD block on screen
  await abandonner(page).waitFor();
  await page.getByRole('button', { name: /^Fermer$/ }).click();
  await page.getByRole('button', { name: /^Demander à Kanevas/ }).click();
  const bandeau = page.getByRole('alert').filter({ hasText: 'La section a changé depuis la proposition.' });
  await bandeau.waitFor();
  assert.equal(await appliquer(page).getAttribute('aria-disabled'), 'true');
});

test('exclusion : Léa fait la même demande et n’obtient ni bloc ni geste', opts, async () => {
  const m = await bati(C.antor, C.lea);
  await C.antor.ctx.request.patch(sectionUrl(m), { data: { joueursLisent: true, joueursEcrivent: true } });
  const page = await panneau(C.lea, m);
  await envoyer(page);
  await page.getByText('Kanevas réfléchit…').waitFor({ state: 'detached' });
  await page.waitForLoadState('networkidle');
  const t = await texte(page);
  assert.equal(t.includes('Mise à jour proposée'), false);
  assert.equal(await appliquer(page).count(), 0);
  assert.equal(await abandonner(page).count(), 0);
  assert.equal((await lireSection(C.antor, m)).contenu, VERITE);
  await photo(page, 'joueuse-sans-bloc');
});

test('état chargement : « Chargement de la proposition… » sans zones ni gestes', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await panneau(C.antor, m);
  await page.route('**/propositions/*', async (route: Any) => {
    if (route.request().method() !== 'GET') return route.continue();
    await new Promise((r) => setTimeout(r, 2500));
    return route.continue();
  });
  await envoyer(page);
  const s = page.getByRole('status').filter({ hasText: 'Chargement de la proposition…' });
  await s.waitFor();
  assert.equal(await appliquer(page).count(), 0);
  assert.equal(await zone(page, 'Actuel').count(), 0);
  await photo(page, 'chargement');
  await appliquer(page).waitFor();
});

test('état erreur de lecture : message, « Réessayer » relit et le bloc apparaît', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await panneau(C.antor, m);
  await page.route('**/propositions/*', (route: Any) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue(),
  );
  await envoyer(page);
  const alerte = page.getByRole('alert').filter({ hasText: /Je n['’]ai pas pu afficher la proposition — réessayer/ });
  await alerte.waitFor();
  await photo(page, 'erreur-lecture');
  await page.unroute('**/propositions/*');
  await page.getByRole('button', { name: /^Réessayer$/ }).click();
  await appliquer(page).waitFor();
  assert.equal(await contenu(page, 'Actuel'), 'Il sert la Couronne.');
});

test('état erreur d’un geste : « L’action n’a pas abouti. Réessayez. », la proposition reste en attente et les gestes se réactivent', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  await page.route('**/appliquer', (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }));
  await appliquer(page).click();
  await page.getByRole('alert').filter({ hasText: /L['’]action n['’]a pas abouti\. Réessayez\./ }).waitFor();
  await page.waitForLoadState('networkidle');
  assert.notEqual(await appliquer(page).getAttribute('aria-disabled'), 'true');
  assert.notEqual(await abandonner(page).getAttribute('aria-disabled'), 'true');
  assert.equal((await lireSection(C.antor, m)).contenu, VERITE);
  await photo(page, 'erreur-geste');
  await page.unroute('**/appliquer');
  await appliquer(page).click();
  await page.getByText('Appliquée : la section « Vérité » est à jour.').waitFor();
});

test('état refus : proposition abandonnée ailleurs → « Cette proposition n’existe plus. », plus de zones ni de geste', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  assert.equal((await C.antor.ctx.request.post(propUrl(m, page.propositionId) + '/abandonner')).status(), 204);
  await appliquer(page).click();
  await page.getByText(/Cette proposition n['’]existe plus\./).waitFor();
  assert.equal(await appliquer(page).count(), 0);
  assert.equal(await zone(page, 'Proposé').count(), 0);
  assert.equal((await lireSection(C.antor, m)).contenu, VERITE);
  await photo(page, 'refus-inconnue');
});

test('état « déjà appliquée » : appliquée depuis un autre onglet, un clic montre « Appliquée » sans double écriture', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  assert.equal((await C.antor.ctx.request.post(propUrl(m, page.propositionId) + '/appliquer')).status(), 200);
  const apres = await lireSection(C.antor, m);
  await appliquer(page).click();
  await page.getByText('Appliquée : la section « Vérité » est à jour.').waitFor();
  assert.equal((await lireSection(C.antor, m)).version, apres.version, 'written once');
});

test('état connexion perdue : bandeau commun, zones lisibles, gestes désactivés ; au retour, le bloc se relit', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  await C.antor.ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByText(/Connexion perdue\. Ce que vous voyez peut être dépassé ; rien n['’]est enregistré tant qu['’]elle ne revient pas\./).first().waitFor();
  assert.equal(await appliquer(page).getAttribute('aria-disabled'), 'true');
  assert.equal(await abandonner(page).getAttribute('aria-disabled'), 'true');
  assert.equal(await contenu(page, 'Actuel'), 'Il sert la Couronne.');
  await photo(page, 'connexion-perdue');
  await C.antor.ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !document.body.innerText.includes('Connexion perdue.'));
  await page.waitForLoadState('networkidle');
  assert.notEqual(await appliquer(page).getAttribute('aria-disabled'), 'true');
});

test('bord section vide : « Actuel » dit « (section vide) »', opts, async () => {
  const m = await bati(C.antor, C.lea);
  await modifierSection(C.antor, m, '');
  const page = await avecBloc(m);
  assert.equal(await contenu(page, 'Actuel'), '(section vide)');
  await photo(page, 'section-vide');
});

test('bord contenu long : chaque zone défile au clavier, hauteur bornée, paragraphes conservés', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const long = Array.from({ length: 200 }, (_, i) => `Paragraphe ${i + 1} de la vérité d'Aldric, qui sert la Couronne.`).join('\n\n');
  await modifierSection(C.antor, m, long);
  const page = await avecBloc(m);
  for (const nom of ['Actuel', 'Proposé']) {
    const z = zone(page, nom);
    assert.equal(await z.getAttribute('tabindex'), '0', `${nom} is focusable`);
    const mesures = await z.evaluate((e: HTMLElement) => ({ h: e.clientHeight, s: e.scrollHeight, lh: parseFloat(getComputedStyle(e).lineHeight) || 20 }));
    assert.equal(mesures.s > mesures.h, true, `${nom} scrolls`);
    assert.equal(mesures.h <= mesures.lh * 15 + 40, true, `${nom} is at most about 15 lines high (${mesures.h}px)`);
  }
  const actuel = (await contenu(page, 'Actuel')) as string;
  assert.match(actuel, /Paragraphe 1 de la vérité d'Aldric, qui sert la Couronne\.\n\nParagraphe 2/);
  await photo(page, 'contenu-long');
});

test('bord téléphone 390 px : « Actuel » puis « Proposé » empilés, le bloc ne déborde pas', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await C.antor.ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(srv.base + ficheUrl(m));
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Demander à Kanevas/ }).click();
  await envoyer(page);
  await page.getByText('Mise à jour proposée', { exact: true }).waitFor();
  const a = await zone(page, 'Actuel').boundingBox();
  const p = await zone(page, 'Proposé').boundingBox();
  assert.equal(p.y > a.y + a.height - 1, true, '« Proposé » under « Actuel »');
  assert.equal(Math.abs(p.x - a.x) < 4, true, 'same left edge');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no horizontal overflow');
  await photo(page, 'telephone-390');
});

test('bord ordinateur : « Actuel » et « Proposé » côte à côte', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const page = await avecBloc(m);
  const a = await zone(page, 'Actuel').boundingBox();
  const p = await zone(page, 'Proposé').boundingBox();
  assert.equal(p.x > a.x + a.width - 1, true, '« Proposé » right of « Actuel »');
  assert.equal(Math.abs(p.y - a.y) < 4, true);
});

void idProposition; void demander; void rx;
