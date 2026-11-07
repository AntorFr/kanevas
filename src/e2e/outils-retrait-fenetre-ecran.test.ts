// Black-box tests of the E-20 deletion window (kanevas-outils-retrait-fenetre), written from the exit criterion and
// docs/ecrans.md, never from the code. The stub server runs WITH its starting data: « Éneria d'essai » #5 (Antor and
// Mira GM, Léa player; 2 designs, 2 local catalogue elements, the galaxy: 4 systems, 3 routes, 1 zone), « Univers
// voisin » #6 (Antor; forces the designer, 1 design), « Système d'essai » #3, « Univers ancien » #7 (Mira GM).
//
// TEST PLAN (one state, played in order; destructive gestures come last)
//   garde        : Mira on E-14 of her universe has the button and its line, not on E-15; Léa has none and the routes refuse
//   vide         : « Essai G » (no data): the window says it has nothing to delete, no « sections » line
//   lecture      : desactivation keeps every swn row (counts unchanged), then the window reads the sentence + sections line
//   telephone    : 360 px, full-height sheet, no horizontal scroll, 44 px targets
//   erreurs      : 5xx → « Réessayer » rereads then asks again; offline; role withdrawn (403); cut during deletion
//   changement   : a design added by a second context → « Les données ont changé… », new count, nothing erased
//   univers      : confirm → result, list empty, ship sheets exist, the neighbour's design intact, event fired
//   systeme      : Encore utilisé par lists the neighbour only once Éneria no longer follows
//   galaxie      : no button on E-15, 404 on the system route; E-14 sentence, galaxy gone
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let mira: Any;
let ctxAntor: Any;
const CAPTURES = process.env.KANEVAS_CAPTURES ?? '';
const SYS = 3, ENERIA = 5, VOISIN = 6, ANCIEN = 7;
const CONCEPTEUR = 'Concepteur de vaisseaux';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  ({ ctx: ctxAntor, page: antor } = await connecte(browser, srv.base, 'Antor'));
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  mira = (await connecte(browser, srv.base, 'Mira')).page;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const carte = (p: Any, titre: string) => p.getByRole('region', { name: titre, exact: true });
const fenetre = (p: Any) => p.getByRole('dialog');
async function photo(p: Any, nom: string) {
  if (CAPTURES) await p.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true });
}
async function api(p: Any, methode: string, url: string, corps?: unknown): Promise<{ status: number; json: Any; texte: string }> {
  return p.evaluate(async ([m, u, c]: [string, string, unknown]) => {
    const r = await fetch(u, { method: m, headers: c === undefined ? {} : { 'content-type': 'application/json' }, body: c === undefined ? undefined : JSON.stringify(c) });
    const texte = await r.text();
    let json: unknown = null;
    try { json = JSON.parse(texte); } catch { /* html */ }
    return { status: r.status, json, texte };
  }, [methode, url, corps] as [string, string, unknown]);
}
const resume = async (p: Any, url: string) => (await api(p, 'GET', url)).json as Any;
const lignes = (r: Any) => Object.fromEntries(r.efface.map((l: Any) => [l.cle, l.nombre]));
const urlU = (id: number, cle = 'swn/vaisseaux') => `/api/univers/${id}/outils/${cle}/suppression`;
const urlS = (id: number, cle = 'swn/vaisseaux') => `/api/systemes/${id}/outils/${cle}/suppression`;

async function ouvrirUnivers(p: Any, id = ENERIA) {
  await p.goto(`/univers/${id}/parametres?onglet=outils`);
  await carte(p, CONCEPTEUR).waitFor();
}
async function ouvrirSysteme(p: Any, id = SYS) {
  await p.goto(`/systemes/${id}`);
  await p.getByRole('tab', { name: 'Outils' }).click();
  await carte(p, CONCEPTEUR).waitFor();
}
const bouton = (p: Any, titre = CONCEPTEUR) => carte(p, titre).getByRole('button', { name: 'Supprimer les données de l’outil…' });
async function ouvrirFenetre(p: Any, titre = CONCEPTEUR) {
  const lecture = p.waitForResponse((r: Any) => r.request().method() === 'GET' && /\/suppression$/.test(new URL(r.url()).pathname));
  await bouton(p, titre).click();
  await lecture;
  await fenetre(p).waitFor();
}
const confirmer = (p: Any) => fenetre(p).getByRole('button', { name: 'Supprimer les données', exact: true });
const fermerFenetre = async (p: Any) => { await fenetre(p).getByRole('button', { name: /^(Annuler|Fermer)$/ }).first().click(); await fenetre(p).waitFor({ state: 'detached' }); };

// --- garde -------------------------------------------------------------------------------------------

test('garde : Mira a le bouton et sa ligne sur E-14 de son univers, ni l’un ni l’autre sur E-15 (absents du DOM)', opts, async () => {
  // Fails if the button is shown for who may not delete at the system level, or hidden for a GM of a universe.
  await ouvrirUnivers(mira, ANCIEN).catch(async () => { await mira.goto(`/univers/${ANCIEN}/parametres?onglet=outils`); });
  // Univers ancien follows « Système ancien », which has the tools off; E-14 of Éneria is the one Mira GMs with data.
  await ouvrirUnivers(mira, ENERIA);
  await bouton(mira).waitFor();
  await carte(mira, CONCEPTEUR).getByText('Désactiver garde tout ; supprimer efface.').waitFor();
  await ouvrirSysteme(mira);
  assert.equal(await bouton(mira).count(), 0);
  assert.equal(await carte(mira, CONCEPTEUR).getByText('Désactiver garde tout ; supprimer efface.').count(), 0);
  await photo(mira, 'garde-mira-e15');
});

test('garde : Léa n’a ni bouton ni ligne, et les routes de suppression la refusent comme une adresse inconnue', opts, async () => {
  const inconnue = await api(lea, 'GET', `/api/univers/${ENERIA}/outils/swn/zzz/suppression`);
  const r = await api(lea, 'GET', urlU(ENERIA));
  assert.equal(r.status, 404);
  assert.equal(r.texte, inconnue.texte);
  const w = await api(lea, 'POST', urlU(ENERIA), { vu: [] });
  assert.equal(w.status, 404);
  assert.equal(((await resume(antor, urlU(ENERIA))).efface as Any[]).length, 2, 'Léa deleted nothing');
  await lea.goto(`/univers/${ENERIA}/parametres?onglet=outils`);
  await lea.getByText('Page introuvable.').first().waitFor();
  assert.equal(await lea.getByRole('button', { name: 'Supprimer les données de l’outil…' }).count(), 0);
});

// --- vide --------------------------------------------------------------------------------------------

test('vide : un outil sans donnée ouvre « Cet outil n’a aucune donnée à supprimer. », sans ligne des sections', opts, async () => {
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor, 'Essai G');
  await fenetre(antor).getByText('Cet outil n’a aucune donnée à supprimer.').waitFor();
  assert.equal(await confirmer(antor).count(), 0, 'nothing to confirm');
  assert.equal(await fenetre(antor).getByText(rx('Les fiches et leur texte sont conservés')).count(), 0);
  await photo(antor, 'vide-essai-g');
  await fermerFenetre(antor);
});

// --- lecture / desactivation ----------------------------------------------------------------------------

test('lecture : désactiver garde tout, puis la fenêtre dit les 2 conceptions, 2 éléments locaux et la ligne des sections', opts, async () => {
  const avant = await resume(antor, urlU(ENERIA));
  assert.deepEqual(lignes(avant), { conceptions: 2, catalogue: 2 });
  await ouvrirUnivers(antor);
  const off = antor.waitForResponse((r: Any) => r.request().method() === 'PUT' && /\/swn\/vaisseaux\/activation$/.test(r.url()));
  await carte(antor, CONCEPTEUR).getByRole('radio', { name: 'Désactivé', exact: true }).check();
  assert.equal((await off).status(), 204);
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 2, catalogue: 2 }, 'disabling loses no row');
  const suit = antor.waitForResponse((r: Any) => r.request().method() === 'PUT' && /\/swn\/vaisseaux\/activation$/.test(r.url()));
  await carte(antor, CONCEPTEUR).getByRole('radio', { name: /^Suit le système/ }).check();
  assert.equal((await suit).status(), 204);
  await ouvrirFenetre(antor);
  await fenetre(antor).getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  await fenetre(antor).getByText('Les fiches et leur texte sont conservés : leurs sections ne seront plus gérées par l’outil.').waitFor();
  assert.equal(await fenetre(antor).getByText('Encore utilisé par :').count(), 0, 'universe level has no « Encore utilisé par »');
  await photo(antor, 'lecture-univers-1280');
  await fermerFenetre(antor);
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 2, catalogue: 2 }, 'cancel erases nothing');
});

// --- telephone ------------------------------------------------------------------------------------------

test('charte : pastille trash-2 en danger, largeur d’au plus 440 px, « Annuler » avant l’action danger (bureau et 360 px)', opts, async () => {
  const mesure = async () => {
    const f = fenetre(antor);
    const larg = (await f.boundingBox()).width;
    const pastille = await f.locator('.ic-fenetre').evaluate((e: Any) => {
      const c = getComputedStyle(e);
      const d = document.createElement('i');
      document.body.append(d);
      d.style.color = 'var(--danger)';
      const danger = getComputedStyle(d).color;
      d.style.color = 'var(--danger-fond)';
      const dangerFond = getComputedStyle(d).color;
      d.remove();
      return { w: e.getBoundingClientRect().width, fond: c.backgroundColor, couleur: c.color, danger, dangerFond, icone: e.querySelector('svg')?.getAttribute('class') ?? '' };
    });
    const a = await f.getByRole('button', { name: 'Annuler', exact: true }).boundingBox();
    const d = await confirmer(antor).boundingBox();
    return { larg, pastille, a, d };
  };
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor);
  await fenetre(antor).getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  const b = await mesure();
  assert.ok(b.larg <= 440.5, `desktop width ${b.larg}`);
  assert.equal(b.pastille.w, 36);
  assert.equal(b.pastille.fond, b.pastille.dangerFond);
  assert.equal(b.pastille.couleur, b.pastille.danger);
  assert.match(b.pastille.icone, /trash-2/);
  assert.ok(b.a.x < b.d.x, `desktop: Annuler (${b.a.x}) must be left of the danger action (${b.d.x})`);
  await fermerFenetre(antor);
  await antor.setViewportSize({ width: 360, height: 740 });
  try {
    await ouvrirUnivers(antor);
    await ouvrirFenetre(antor);
    await fenetre(antor).getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
    const t = await mesure();
    assert.equal(t.pastille.fond, t.pastille.dangerFond);
    assert.ok(t.a.y < t.d.y, `phone: Annuler (${t.a.y}) must be above the danger action (${t.d.y})`);
    await fermerFenetre(antor);
  } finally {
    await antor.setViewportSize({ width: 1280, height: 720 });
  }
});

test('telephone : à 360 px la fenêtre est une feuille pleine hauteur, sans défilement horizontal, cibles de 44 px', opts, async () => {
  await antor.setViewportSize({ width: 360, height: 740 });
  try {
    await ouvrirUnivers(antor);
    await ouvrirFenetre(antor);
    await fenetre(antor).getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
    const m = await antor.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.sw <= m.cw, `horizontal scroll ${m.sw} > ${m.cw}`);
    const boite = await fenetre(antor).boundingBox();
    assert.ok(boite.width >= 359 && boite.height >= 700, `sheet ${boite.width}x${boite.height}`);
    for (const nom of ['Supprimer les données', 'Annuler']) {
      const b = await fenetre(antor).getByRole('button', { name: nom, exact: true }).boundingBox();
      assert.ok(b.height >= 43.5, `${nom} is ${b.height}px high`);
    }
    await photo(antor, 'lecture-univers-360');
    await fermerFenetre(antor);
  } finally {
    await antor.setViewportSize({ width: 1280, height: 720 });
  }
});

// --- erreurs ---------------------------------------------------------------------------------------------

test('erreurs : un 5xx à la lecture donne « L’action n’a pas abouti. Rien n’est supprimé. », Réessayer relit puis redemande', opts, async () => {
  await ouvrirUnivers(antor);
  let n = 0;
  await antor.route(/\/outils\/swn\/vaisseaux\/suppression$/, (route: Any) => {
    if (route.request().method() === 'GET' && n++ === 0) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' });
    return route.continue();
  });
  try {
    await bouton(antor).click();
    await fenetre(antor).getByText('L’action n’a pas abouti. Rien n’est supprimé.').waitFor();
    assert.equal(await confirmer(antor).count(), 0);
    await photo(antor, 'erreur-5xx');
    await fenetre(antor).getByRole('button', { name: 'Réessayer' }).click();
    await fenetre(antor).getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
    assert.equal(n, 2, 'one read per attempt');
    await fermerFenetre(antor);
  } finally { await antor.unroute(/\/outils\/swn\/vaisseaux\/suppression$/); }
});

test('erreurs : un 5xx à la suppression ne supprime rien ; un rôle retiré (403) dit « Vous ne pouvez plus supprimer ces données. »', opts, async () => {
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor);
  const motif = /\/outils\/swn\/vaisseaux\/suppression$/;
  await antor.route(motif, (route: Any) => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue());
  await confirmer(antor).click();
  await fenetre(antor).getByText('L’action n’a pas abouti. Rien n’est supprimé.').waitFor();
  await antor.unroute(motif);
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 2, catalogue: 2 });
  await fermerFenetre(antor);
  await ouvrirFenetre(antor);
  await antor.route(motif, (route: Any) => route.request().method() === 'POST'
    ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"x"}' }) : route.continue());
  await confirmer(antor).click();
  await fenetre(antor).getByText('Vous ne pouvez plus supprimer ces données.').waitFor();
  await antor.unroute(motif);
  assert.equal(await confirmer(antor).count(), 0);
  await photo(antor, 'erreur-refus');
  await fermerFenetre(antor);
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 2, catalogue: 2 });
});

test('erreurs : une coupure pendant la suppression dit « Connexion perdue pendant la suppression. » ; le bouton lit « Suppression… » et la fenêtre reste', opts, async () => {
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor);
  const motif = /\/outils\/swn\/vaisseaux\/suppression$/;
  let liberer!: () => void;
  const porte = new Promise<void>((r) => { liberer = r; });
  await antor.route(motif, async (route: Any) => {
    if (route.request().method() !== 'POST') return route.continue();
    await porte;
    return route.abort('connectionreset');
  });
  await confirmer(antor).click();
  await fenetre(antor).getByRole('button', { name: 'Suppression…' }).waitFor();
  await antor.keyboard.press('Escape');
  assert.equal(await fenetre(antor).count(), 1, 'the window does not close during the deletion');
  liberer();
  await fenetre(antor).getByText(rx('Connexion perdue pendant la suppression.')).waitFor();
  await antor.unroute(motif);
  await photo(antor, 'erreur-coupure');
  await fermerFenetre(antor);
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 2, catalogue: 2 });
});

test('erreurs : hors ligne, « Connexion perdue. » et le bouton de confirmation est désactivé', opts, async () => {
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor);
  await ctxAntor.setOffline(true);
  try {
    await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
    await fenetre(antor).getByText('Connexion perdue.').first().waitFor();
    assert.equal(await confirmer(antor).isDisabled(), true);
    await photo(antor, 'erreur-hors-ligne');
  } finally {
    await ctxAntor.setOffline(false);
  }
  await antor.reload();
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 2, catalogue: 2 });
});

// --- changement concurrent ----------------------------------------------------------------------------

test('changement : une conception ajoutée pendant que la fenêtre est ouverte → « Les données ont changé… », nouveau compte, rien d’effacé', opts, async () => {
  // Fails if the confirmation deletes what the user did not see (the `vu` of the POST is not checked).
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor);
  await fenetre(antor).getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  const f = await api(antor, 'POST', `/api/univers/${ENERIA}/fiches`, { type: 'vaisseau', titre: 'Concurrente' });
  assert.equal(f.status, 201, f.texte);
  const c = await api(antor, 'POST', `/api/univers/${ENERIA}/outils/swn/vaisseaux/conceptions`, { ficheId: f.json.id, coque: 'eclaireur' });
  assert.equal(c.status, 201, c.texte);
  await confirmer(antor).click();
  await fenetre(antor).getByText('Les données ont changé depuis que vous avez ouvert cette fenêtre.').waitFor();
  await fenetre(antor).getByText('3 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  assert.deepEqual(lignes(await resume(antor, urlU(ENERIA))), { conceptions: 3, catalogue: 2 }, 'nothing was erased');
  await photo(antor, 'changement');
  await fermerFenetre(antor);
});

// --- univers -----------------------------------------------------------------------------------------------

test('univers : confirmer efface, dit le résultat, vide la liste, garde les fiches et la conception du voisin ; l’événement part', opts, async () => {
  await ouvrirUnivers(antor);
  await antor.evaluate(() => { (window as Any).__modifies = 0; window.addEventListener('kanevas:outils-modifies', () => { (window as Any).__modifies++; }); });
  await ouvrirFenetre(antor);
  await fenetre(antor).getByText('3 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  const fiches = (await api(antor, 'GET', `/api/univers/${ENERIA}/fiches`)).json;
  const nbFiches = (Array.isArray(fiches) ? fiches : fiches.fiches).length;
  const reponse = antor.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/suppression$/.test(r.url()));
  await confirmer(antor).click();
  assert.equal((await reponse).status(), 200);
  await fenetre(antor).getByText('Données supprimées : 3 conceptions, 2 éléments locaux de catalogue.').waitFor();
  assert.equal(await antor.evaluate(() => (window as Any).__modifies), 1);
  await photo(antor, 'resultat-univers');
  await fermerFenetre(antor);
  const liste = await api(antor, 'GET', `/api/univers/${ENERIA}/outils/swn/vaisseaux/conceptions`);
  assert.equal(liste.status, 200);
  assert.equal((Array.isArray(liste.json) ? liste.json : liste.json.conceptions).length, 0);
  const apres = (await api(antor, 'GET', `/api/univers/${ENERIA}/fiches`)).json;
  assert.equal((Array.isArray(apres) ? apres : apres.fiches).length, nbFiches, 'ship sheets still exist');
  assert.deepEqual(lignes(await resume(antor, urlU(VOISIN))), { conceptions: 1 }, 'the neighbour is intact');
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor);
  await fenetre(antor).getByText('Cet outil n’a aucune donnée à supprimer.').waitFor();
  await fermerFenetre(antor);
});

// --- systeme -----------------------------------------------------------------------------------------------

test('systeme : « Encore utilisé par : » ajoute Univers voisin et pas Éneria, qui ne suit plus (désactivé d’abord au système)', opts, async () => {
  const avant = await resume(antor, urlS(SYS));
  assert.ok(avant.encoreUtilise.univers.some((u: Any) => u.id === VOISIN));
  await ouvrirSysteme(antor);
  const off = antor.waitForResponse((r: Any) => r.request().method() === 'PUT' && /systemes\/3\/outils\/swn\/vaisseaux\/activation$/.test(r.url()));
  await carte(antor, CONCEPTEUR).getByRole('switch').click();
  assert.equal((await off).status(), 204);
  await ouvrirFenetre(antor);
  const f = fenetre(antor);
  await f.getByText('Encore utilisé par :').waitFor();
  await f.getByText('Univers voisin', { exact: true }).waitFor();
  assert.equal(await f.getByText(rx('Éneria d’essai'), { exact: false }).count(), 0);
  assert.match(await f.innerText(), /éléments du catalogue du système/);
  await photo(antor, 'systeme-encore-utilise');
  await fermerFenetre(antor);
});

test('contenu long : 14 000 conceptions s’écrivent « 14 000 » (espace fine) et 8 univers donnent six noms puis « … et 2 autres »', opts, async () => {
  const motif = /\/systemes\/3\/outils\/swn\/vaisseaux\/suppression$/;
  await antor.route(motif, (route: Any) => route.request().method() !== 'GET' ? route.continue() : route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      outil: { cle: 'swn/vaisseaux', libelle: CONCEPTEUR }, niveau: 'systeme', total: 18,
      efface: [{ cle: 'catalogue', singulier: 'élément du catalogue du système', pluriel: 'éléments du catalogue du système', nombre: 18 }],
      sectionsGerees: 0,
      encoreUtilise: {
        univers: Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, nom: `Monde ${i + 1}` })),
        lignes: [{ cle: 'conceptions', singulier: 'conception', pluriel: 'conceptions', nombre: 14000 }],
      },
    }),
  }));
  try {
    await ouvrirSysteme(antor);
    await ouvrirFenetre(antor);
    const f = fenetre(antor);
    await f.getByText('… et 2 autres').waitFor();
    assert.equal(await f.getByText(/^Monde \d$/).count(), 6);
    assert.match(await f.innerText(), /14\u202f000 conceptions/);
    await photo(antor, 'contenu-long');
    await fermerFenetre(antor);
  } finally { await antor.unroute(motif); }
});

// --- galaxie -----------------------------------------------------------------------------------------------

test('galaxie : sur E-15 ni bouton ni ligne et la route de système répond 404 ; sur E-14 la phrase et la galaxie disparaît', opts, async () => {
  await ouvrirSysteme(antor);
  await antor.getByRole('region', { name: 'Galaxie', exact: true }).waitFor();
  assert.equal(await bouton(antor, 'Galaxie').count(), 0);
  assert.equal(await carte(antor, 'Galaxie').getByText('Désactiver garde tout ; supprimer efface.').count(), 0);
  assert.equal((await api(antor, 'GET', urlS(SYS, 'swn/galaxie'))).status, 404);
  assert.equal((await api(antor, 'POST', urlS(SYS, 'swn/galaxie'), { vu: [] })).status, 404);
  await ouvrirUnivers(antor);
  await ouvrirFenetre(antor, 'Galaxie');
  await fenetre(antor).getByText('Les 4 systèmes, 3 routes et 1 zone de cette galaxie seront effacés.').waitFor();
  await photo(antor, 'galaxie');
  await confirmer(antor).click();
  await fenetre(antor).getByText('Données supprimées : 4 systèmes, 3 routes, 1 zone.').waitFor();
  await fermerFenetre(antor);
  const apres = await api(antor, 'GET', `/api/univers/${ENERIA}/outils/swn/galaxie`);
  assert.ok(apres.status === 404 || JSON.stringify(apres.json).includes('"systemes":[]') || !apres.texte.includes('systemes'), apres.texte.slice(0, 200));
});
