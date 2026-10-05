// Black-box tests of kanevas-suivi-ecran-comptes-rendus, written from its exit criterion and
// docs/ecrans.md « E-13 Comptes-rendus », « Blocs de E-3 », « Ajouts… E-9 ».
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
let uid = '';
let campId = 0;
let session11 = 0;

const NOM = 'La Couronne brisée';

const avant = (t: string, a: string, b: string) => t.indexOf(a) >= 0 && t.indexOf(b) >= 0 && t.indexOf(a) < t.indexOf(b);

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The visible text of one E-3 block, found by its title. */
const bloc = (page: Any, titre: string) => page.locator('section, article, div').filter({ has: page.getByRole('heading', { name: titre }) }).last();

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = await connecte(browser, srv.base, 'Léa');
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Comptes');
  await antor.getByRole('heading', { name: 'Comptes', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('états vides : E-3 (blocs) et E-13, MJ et Joueuse', opts, async () => {
  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('heading', { name: 'Campagnes actives' }).waitFor();
  await attendre(antor);
  let t = await texte(antor);
  for (const s of ['Campagnes actives', 'Derniers comptes-rendus', 'Préparation', 'Aucune campagne active.', 'Aucun compte-rendu pour l\'instant.', 'Rien à préparer pour l\'instant.', 'Tous les comptes-rendus'])
    assert.ok(t.includes(s), `« ${s} » attendu`);
  assert.ok(!t.includes('Rien à afficher pour l\'instant.'));
  await antor.screenshot({ path: '/tmp/e3-vide-mj.png' });

  await lea.page.goto(`/univers/${uid}`);
  await lea.page.getByRole('heading', { name: 'Campagnes actives' }).waitFor();
  await attendre(lea.page);
  t = await texte(lea.page);
  assert.ok(t.includes('Derniers comptes-rendus') && t.includes('Aucun compte-rendu à lire pour l\'instant.'));
  assert.ok(!t.includes('Préparation') && !t.includes('Rien à préparer'), 'Préparation jamais pour un joueur');
  await lea.page.screenshot({ path: '/tmp/e3-vide-joueur.png' });

  await antor.getByRole('link', { name: rxExact('Comptes-rendus') }).click();
  await antor.getByRole('heading', { name: 'Comptes-rendus', level: 1 }).waitFor();
  await antor.getByText(rx('Aucun compte-rendu pour l\'instant.')).waitFor();
  assert.ok(await antor.getByRole('link', { name: rxExact('Voir les campagnes') }).count());
  await antor.screenshot({ path: '/tmp/e13-vide-mj.png' });
  await lea.page.getByRole('link', { name: rxExact('Comptes-rendus') }).click();
  await lea.page.getByText(rx('Aucun compte-rendu à lire pour l\'instant.')).first().waitFor();
  await lea.page.getByRole('link', { name: rxExact('Voir les campagnes') }).click();
  await lea.page.waitForURL(new RegExp(`/univers/${uid}/campagnes$`));
});

test('E-3 : Campagnes actives (seule l\'active, lien E-6), Préparation = cinq premières non cochées', opts, async () => {
  const c = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: NOM });
  campId = c.body.id;
  await api(antor, 'PATCH', `/api/campagnes/${campId}`, { statut: 'active' });
  const d = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: 'Dormante' });
  await api(antor, 'POST', `/api/campagnes/${d.body.id}/taches`, { categorie: 'pnj', libelle: 'Tâche dormante' });
  const ids: number[] = [];
  for (let i = 1; i <= 7; i++) {
    const r = await api(antor, 'POST', `/api/campagnes/${campId}/taches`, { categorie: i === 1 ? 'cartes' : 'pnj', libelle: `Tâche ${i}` });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push(r.body.id);
  }
  await api(antor, 'PUT', `/api/taches/${ids[1]}`, { faite: true }); // Tâche 2 checked

  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('heading', { name: 'Préparation' }).waitFor();
  await attendre(antor);
  const t = await texte(antor);
  assert.ok(t.includes(NOM));
  assert.ok(!t.includes('Dormante'), 'a campaign in preparation is not active');
  for (const s of ['Tâche 1', 'Tâche 3', 'Tâche 4', 'Tâche 5', 'Tâche 6']) assert.ok(t.includes(s), s);
  for (const s of ['Tâche 2', 'Tâche 7', 'Tâche dormante']) assert.ok(!t.includes(s), `${s} ne doit pas figurer`);
  assert.ok(avant(t, 'Tâche 1', 'Tâche 3') && avant(t, 'Tâche 5', 'Tâche 6'), 'plus anciennes d\'abord');
  await antor.screenshot({ path: '/tmp/e3-prepa.png' });
  await antor.getByRole('link', { name: rx(NOM) }).first().click();
  await antor.waitForURL(new RegExp(`/univers/${uid}/campagnes/${campId}$`));

  await lea.page.goto(`/univers/${uid}`);
  await lea.page.getByRole('link', { name: rx(NOM) }).first().waitFor();
  await attendre(lea.page);
  const tl = await texte(lea.page);
  assert.ok(!tl.includes('Tâche 1') && !tl.includes('Préparation'));
  assert.ok(!tl.includes('Dormante'));
});

test('comptes-rendus : cinq derniers sur E-3, ordre de création sur E-13, retouche sans remontée, fermeture aux joueurs sans trou', opts, async () => {
  const cr = async (page: Any, titre: string) => {
    const r = await api(page, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: campId, titre, texte: 'Texte.' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.id as number;
  };
  const premier = await cr(antor, 'Prologue');
  await dormir(1100);
  for (const n of [2, 3, 4, 5, 6]) {
    await cr(antor, `Session ${n}`);
    await dormir(1100);
  }
  await cr(lea.page, 'Récit de Léa');
  await dormir(1100);
  session11 = await cr(antor, 'Session 11');

  // edit the oldest one: it must not climb
  const f = await api(antor, 'GET', `/api/univers/${uid}/fiches/${premier}`);
  const sec = f.body.sections[0];
  const maj = await api(antor, 'PUT', `/api/univers/${uid}/fiches/${premier}/sections/${sec.id}/contenu`, { contenu: 'Retouché.', version: sec.version });
  assert.equal(maj.status, 200, JSON.stringify(maj.body));

  await antor.goto(`/univers/${uid}/comptes-rendus`);
  await antor.getByRole('link', { name: rx('Session 11') }).waitFor();
  await attendre(antor);
  let t = await texte(antor);
  const ordre = ['Session 11', 'Récit de Léa', 'Session 6', 'Session 5', 'Session 4', 'Session 3', 'Session 2', 'Prologue'];
  for (let i = 0; i + 1 < ordre.length; i++) assert.ok(avant(t, ordre[i]!, ordre[i + 1]!), `${ordre[i]} avant ${ordre[i + 1]}`);
  assert.ok(t.includes(NOM) && t.includes('lea'), 'campagne et auteur');
  assert.match(t, /\d{1,2} \S+ 2026/, 'date « 22 sept. 2026 »');
  await antor.screenshot({ path: '/tmp/e13-liste.png' });
  await antor.getByRole('link', { name: rx('Session 11') }).click();
  await antor.waitForURL(new RegExp(`/univers/${uid}/fiche/${session11}$`));

  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('heading', { name: 'Derniers comptes-rendus' }).waitFor();
  await attendre(antor);
  t = await texte(antor);
  for (const s of ['Session 11', 'Récit de Léa', 'Session 6', 'Session 5', 'Session 4']) assert.ok(t.includes(s), s);
  for (const s of ['Session 3', 'Session 2', 'Prologue']) assert.ok(!t.includes(s), `${s} hors des cinq`);
  assert.ok(await antor.getByRole('link', { name: rxExact('Tous les comptes-rendus') }).count());
  await antor.screenshot({ path: '/tmp/e3-derniers.png' });
  await antor.getByRole('link', { name: rxExact('Tous les comptes-rendus') }).click();
  await antor.waitForURL(new RegExp(`/univers/${uid}/comptes-rendus$`));

  // Antor closes the section of « Session 11 » to players
  const g = await api(antor, 'GET', `/api/univers/${uid}/fiches/${session11}`);
  const p = await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${session11}/sections/${g.body.sections[0].id}`, { joueursLisent: false });
  assert.equal(p.status, 200, JSON.stringify(p.body));

  await lea.page.goto(`/univers/${uid}/comptes-rendus`);
  await lea.page.getByRole('link', { name: rx('Récit de Léa') }).waitFor();
  await attendre(lea.page);
  t = await texte(lea.page);
  assert.ok(!t.includes('Session 11'), 'E-13 sans Session 11');
  assert.ok(avant(t, 'Récit de Léa', 'Session 6'), 'liste sans trou');
  await lea.page.screenshot({ path: '/tmp/e13-joueur-ferme.png' });
  await lea.page.goto(`/univers/${uid}`);
  await lea.page.getByRole('heading', { name: 'Derniers comptes-rendus' }).waitFor();
  await attendre(lea.page);
  t = await texte(lea.page);
  assert.ok(!t.includes('Session 11'), 'E-3 sans Session 11');
  for (const s of ['Récit de Léa', 'Session 6', 'Session 5', 'Session 4', 'Session 3'])
    assert.ok(t.includes(s), `${s}: les cinq lisibles, sans trou`);
  assert.ok(!t.includes('Session 2'));
  await lea.page.screenshot({ path: '/tmp/e3-derniers-joueur.png' });

  // the author of a closed report is not Léa; Antor (GM) still sees it
  await antor.goto(`/univers/${uid}/comptes-rendus`);
  await antor.getByRole('link', { name: rx('Session 11') }).waitFor();
});

test('E-9 : un compte-rendu porte « Campagne : <nom> » vers E-6, une autre fiche rien', opts, async () => {
  await antor.goto(`/univers/${uid}/fiche/${session11}`);
  await antor.getByRole('heading', { name: 'Session 11', level: 1 }).waitFor();
  const ligne = antor.getByText(/^Campagne :/);
  await ligne.waitFor();
  assert.equal((await ligne.innerText()).replace(/\s+/g, ' ').trim(), `Campagne : ${NOM}`);
  // under the title
  const yTitre = (await antor.getByRole('heading', { name: 'Session 11', level: 1 }).boundingBox()).y;
  assert.ok((await ligne.boundingBox()).y > yTitre);
  await antor.screenshot({ path: '/tmp/e9-campagne.png' });
  await ligne.getByRole('link', { name: rx(NOM) }).click();
  await antor.waitForURL(new RegExp(`/univers/${uid}/campagnes/${campId}$`));

  const lieu = await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: 'La crypte' });
  assert.equal(lieu.status, 201, JSON.stringify(lieu.body));
  await antor.goto(`/univers/${uid}/fiche/${lieu.body.id}`);
  await antor.getByRole('heading', { name: 'La crypte', level: 1 }).waitFor();
  await attendre(antor);
  assert.ok(!(await texte(antor)).includes('Campagne :'));
  await antor.screenshot({ path: '/tmp/e9-lieu.png' });

  // campaign unreadable: the line is absent without any message, the report stays readable
  await antor.route('**/api/univers/*/campagnes/*', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await antor.goto(`/univers/${uid}/fiche/${session11}`);
  await antor.getByRole('heading', { name: 'Session 11', level: 1 }).waitFor();
  await attendre(antor);
  const t = await texte(antor);
  assert.ok(!t.includes('Campagne :') && !t.includes('Impossible'));
  await antor.unrouteAll({ behavior: 'ignoreErrors' });
});

test('E-3 : chaque bloc échoue pour soi ; Réessayer ; chargement par bloc', opts, async () => {
  const page = antor;
  await page.route(`**/api/univers/${uid}/comptes-rendus*`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await page.goto(`/univers/${uid}`);
  await page.getByText('Impossible de charger ce bloc.').waitFor();
  await attendre(page);
  assert.equal(await page.getByText('Impossible de charger ce bloc.').count(), 1);
  let t = await texte(page);
  assert.ok(t.includes(NOM) && t.includes('Tâche 1'), 'les autres blocs restent');
  await page.screenshot({ path: '/tmp/e3-bloc-erreur.png' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.getByRole('button', { name: rxExact('Réessayer') }).click();
  await page.getByRole('link', { name: rx('Session 6') }).first().waitFor();
  assert.equal(await page.getByText('Impossible de charger ce bloc.').count(), 0);

  // tasks route fails: only Préparation fails
  await page.route('**/api/campagnes/*/taches', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await page.goto(`/univers/${uid}`);
  await page.getByText('Impossible de charger ce bloc.').waitFor();
  await attendre(page);
  assert.equal(await page.getByText('Impossible de charger ce bloc.').count(), 1);
  assert.ok((await texte(page)).includes('Session 6'));
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // loading is per block
  await page.route(`**/api/univers/${uid}/comptes-rendus*`, async (r: Any) => {
    await dormir(1500);
    await r.continue();
  });
  await page.goto(`/univers/${uid}`);
  await page.getByText('Chargement…').first().waitFor();
  t = await texte(page);
  await page.screenshot({ path: '/tmp/e3-bloc-chargement.png' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('E-13 : chargement, erreur + Réessayer, connexion perdue, univers sans rôle', opts, async () => {
  const page = antor;
  await page.route(`**/api/univers/${uid}/comptes-rendus*`, async (r: Any) => {
    await dormir(1500);
    await r.continue();
  });
  await page.goto(`/univers/${uid}/comptes-rendus`);
  await page.getByText('Chargement des comptes-rendus…').waitFor();
  await page.screenshot({ path: '/tmp/e13-chargement.png' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await attendre(page);

  let casse = true;
  await page.route(`**/api/univers/${uid}/comptes-rendus*`, (r: Any) => (casse ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
  await page.goto(`/univers/${uid}/comptes-rendus`);
  await page.getByText('Impossible de charger les comptes-rendus.').waitFor();
  await page.screenshot({ path: '/tmp/e13-erreur.png' });
  casse = false;
  await page.getByRole('button', { name: rxExact('Réessayer') }).click();
  await page.getByRole('link', { name: rx('Session 6') }).waitFor();
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await attendre(page);
  await page.context().setOffline(true);
  await page.getByText(/Connexion perdue/).waitFor({ timeout: 30000 });
  assert.ok((await texte(page)).includes('Session 6'), 'la liste chargée reste');
  await page.screenshot({ path: '/tmp/e13-hors-ligne.png' });
  await page.context().setOffline(false);

  // refus : an account with no role in the universe
  const mira = await connecte(browser, srv.base, 'Mira');
  await mira.page.goto(`/univers/${uid}/comptes-rendus`);
  await mira.page.getByText('Page introuvable.').waitFor();
  assert.ok(!(await texte(mira.page)).includes('Session'));
  await mira.page.screenshot({ path: '/tmp/e13-refus.png' });
  await mira.ctx.close();
});

test('E-13 contenu long : 100 puis « Charger la suite », échec de la suite, titre de 120 caractères', opts, async () => {
  const camp = await api(antor, 'POST', `/api/univers/${uid}/campagnes`, { nom: 'Pleine' });
  for (let i = 0; i < 100; i++) {
    const r = await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: camp.body.id, titre: `Lot ${String(i).padStart(3, '0')}` });
    assert.equal(r.status, 201);
  }
  const long = 'Titre long ' + 'x'.repeat(109);
  assert.equal((await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: camp.body.id, titre: long })).status, 201);
  await antor.goto(`/univers/${uid}/comptes-rendus`);
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).waitFor();
  assert.equal(await antor.locator('main li').count(), 100);
  assert.equal(await antor.getByRole('link', { name: rx('Titre long') }).count(), 1);
  await antor.screenshot({ path: '/tmp/e13-100.png' });

  await antor.route(`**/api/univers/${uid}/comptes-rendus?curseur=*`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
  await antor.getByText('Impossible de charger la suite.').waitFor();
  assert.equal(await antor.locator('main li').count(), 100, 'la liste chargée reste');
  await antor.screenshot({ path: '/tmp/e13-suite-echec.png' });
  await antor.unrouteAll({ behavior: 'ignoreErrors' });
  await antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
  await antor.waitForFunction(() => document.querySelectorAll('main li').length > 100);
  assert.equal(await antor.getByRole('button', { name: rxExact('Charger la suite') }).count(), 0);
  assert.equal(await antor.locator('main li').count(), 100 + 8 + 1 - 0 - 0, 'tous, sans doublon');
});
