// Black-box tests of kanevas-outils-cadre, written from the need (the feature sheet's « Livre » and
// exit criterion, docs/parcours.md B-57 to B-60 and P-17, docs/ecrans.md E-20 and « What
// `kanevas-outils-cadre` builds of E-20 »), never from the code. The stub server runs WITH its starting
// data: « Système d'essai » (#3: Antor GM and responsible, Mira GM; Léa and Roxane players) attached to
// « Éneria d'essai » (#5) and « Univers voisin » (#6, Antor alone), « Système ancien » (#4, no stored
// responsible, « Univers ancien » #7, Mira GM), « Essai Kanka » (#4 universe, no game system).
//
// TEST PLAN (one state, played in order: each test starts from what the previous ones left)
//   dependance      : Essai B refuses to enable while Essai A is off (« Essai B demande Essai A : activez-le
//                     d'abord. », switch unchanged); once A is on, B enables; A then refuses to go off
//                     under B (« … désactivez-le d'abord. »)
//   visibilite      : A « MJ seul » → Léa has no entry, her request of the tool's address answers like an
//                     unknown address (status and body), its screen reads « Page introuvable. »; « MJ et
//                     joueurs » → she has the entry and the screen
//   reglage         : « Pas de charges de carburant » « Système · Oui » then « Univers · Non »; the other
//                     universe of the system still reads the system value
//   forcer          : universe « Activé » for Univers voisin, then off at the system: Éneria loses entry and
//                     address, Univers voisin keeps them; universe « Désactivé » while the system enables
//   bornes          : numeric settings accept their bounds, refuse just beyond; a stale setting conflicts
//   mira            : not responsible: values, no switch / checkbox / « Remplacer » / « Transférer », the
//                     line « Seul le responsable… »; a write at system level is refused; « Système ancien »
//                     (no responsible stored): Mira acts
//   etats           : offline disables writes; a failed save returns to the previous value
//   telephone       : 390 px, no horizontal scroll, 44 px targets
//   chargement      : the code of Essai A is requested by nobody before the screen opens, never by Léa when
//                     the tool is « MJ seul »
//   garde           : Léa, a stranger and the instance admin never get the tab, its addresses or its API
//   transfert       : Antor transfers to Mira; she acts at the system, he no more, he keeps the universe
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  attendre,
  connecte,
  launch,
  rx,
  skipBrowser,
  startServer,
} from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let mira: Any;
let ctxAntor: Any;
let ctxLea: Any;
const CAPTURES = process.env.KANEVAS_CAPTURES ?? '';

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' }); // the starting data are the fixture
  browser = await launch();
  ({ ctx: ctxAntor, page: antor } = await connecte(browser, srv.base, 'Antor'));
  ({ ctx: ctxLea, page: lea } = await connecte(browser, srv.base, 'Léa'));
  mira = (await connecte(browser, srv.base, 'Mira')).page;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

// --- helpers --------------------------------------------------------------------------------------

const SYS = 3;
const ENERIA = 5;
const VOISIN = 6;
const ANCIEN = 4;
const carte = (p: Any, titre: string) => p.getByRole('region', { name: titre, exact: true });
const barre = (p: Any) => p.getByRole('complementary', { name: 'Barre latérale' });
const PAS_TROUVE = 'Page introuvable.';

async function photo(p: Any, nom: string): Promise<void> {
  if (CAPTURES) await p.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true });
}

/** The response to the next write on a path, armed BEFORE the gesture (never a delay, never networkidle). */
async function ecrire(p: Any, chemin: RegExp, geste: () => Promise<void>, methode = 'PUT'): Promise<Any> {
  const reponse = p.waitForResponse((r: Any) => r.request().method() === methode && chemin.test(new URL(r.url()).pathname));
  await geste();
  return reponse;
}

async function api(p: Any, methode: string, url: string, corps?: unknown): Promise<{ status: number; texte: string }> {
  return p.evaluate(
    async ([m, u, c]: [string, string, unknown]) => {
      const r = await fetch(u, {
        method: m,
        headers: c === undefined ? {} : { 'content-type': 'application/json' },
        body: c === undefined ? undefined : JSON.stringify(c),
      });
      return { status: r.status, texte: await r.text() };
    },
    [methode, url, corps] as [string, string, unknown],
  );
}

async function ouvrirSysteme(p: Any, id = SYS): Promise<void> {
  await p.goto(`/systemes/${id}`);
  await p.getByRole('tab', { name: 'Outils' }).click();
  await p.getByRole('heading', { name: 'Essai A', level: 2 }).waitFor();
}

async function ouvrirUnivers(p: Any, id = ENERIA): Promise<void> {
  await p.goto(`/univers/${id}/parametres?onglet=outils`);
  await p.getByRole('heading', { name: 'Essai A', level: 2 }).waitFor();
}

/** What the bar of a universe offers under « Outils », once the entries answered. */
async function entreesBarre(p: Any, id = ENERIA): Promise<string[]> {
  const reponse = p.waitForResponse((r: Any) => new URL(r.url()).pathname === `/api/univers/${id}/outils/entrees`);
  await p.goto(`/univers/${id}`);
  await reponse;
  await attendre(p);
  await barre(p).getByRole('link', { name: 'Vue d’ensemble' }).waitFor();
  return barre(p).getByRole('link').evaluateAll((l: Any[]) =>
    l.filter((a) => /\/outils\//.test(a.getAttribute('href') ?? '')).map((a) => (a.textContent ?? '').trim()),
  );
}

const sysActivation = (p: Any, outil: 'a' | 'b' | 'g', active: boolean, id = SYS) =>
  api(p, 'PUT', `/api/systemes/${id}/outils/essai/${outil}/activation`, { active });

// --- dependances ------------------------------------------------------------------------------------

test('dependance : Essai B refuse de s’activer tant qu’Essai A est désactivé, l’interrupteur reste', opts, async () => {
  // Fails if the guard of dependencies is removed: B would switch on.
  await ouvrirSysteme(antor);
  const B = carte(antor, 'Essai B');
  assert.equal(await B.getByRole('switch').getAttribute('aria-checked'), 'false');
  await B.getByRole('switch').click();
  await B.getByText(rx('Essai B demande Essai A : activez-le d’abord.')).waitFor();
  assert.equal(await B.getByRole('switch').getAttribute('aria-checked'), 'false');
  await photo(antor, 'dependance-refus');
  await antor.reload();
  await antor.getByRole('tab', { name: 'Outils' }).click();
  await carte(antor, 'Essai B').getByRole('switch').waitFor();
  assert.equal(await carte(antor, 'Essai B').getByRole('switch').getAttribute('aria-checked'), 'false');
});

test('dependance : le type et le module de chaque outil sont dits, le réglage d’univers seul n’a pas de ligne système', opts, async () => {
  await ouvrirSysteme(antor);
  await carte(antor, 'Essai A').getByText('Carte dynamique · essai').waitFor();
  await carte(antor, 'Essai B').getByText('Aide de jeu · essai').waitFor();
  await carte(antor, 'Essai G').getByText('Générateur · essai').waitFor();
  assert.equal(await carte(antor, 'Essai G').getByText(rx('Marge d’essai')).count(), 0);
  await ouvrirUnivers(antor);
  await carte(antor, 'Essai G').getByText(rx('Marge d’essai')).waitFor();
});

test('dependance : A activé au système puis B ; A refuse de s’éteindre sous B ; B éteint, A s’éteint', opts, async () => {
  await ouvrirSysteme(antor);
  const A = carte(antor, 'Essai A');
  await ecrire(antor, /\/api\/systemes\/3\/outils\/essai\/a\/activation$/, () => A.getByRole('switch').click());
  await antor.reload();
  await antor.getByRole('tab', { name: 'Outils' }).click();
  await carte(antor, 'Essai A').getByText(rx('Système · Activé')).waitFor();
  assert.equal(await carte(antor, 'Essai A').getByRole('switch').getAttribute('aria-checked'), 'true');
  await photo(antor, 'systeme-a-active');
  // B can follow
  const B = carte(antor, 'Essai B');
  await ecrire(antor, /\/essai\/b\/activation$/, () => B.getByRole('switch').click());
  await B.getByText(rx('Système · Activé')).waitFor();
  // A cannot go off under B
  await ecrire(antor, /\/essai\/a\/activation$/, () => carte(antor, 'Essai A').getByRole('switch').click());
  await carte(antor, 'Essai A').getByText(rx('Essai B demande Essai A : désactivez-le d’abord.')).waitFor();
  assert.equal(await carte(antor, 'Essai A').getByRole('switch').getAttribute('aria-checked'), 'true');
  // B off, then A stays on (the state the next tests need)
  await ecrire(antor, /\/essai\/b\/activation$/, () => carte(antor, 'Essai B').getByRole('switch').click());
  await carte(antor, 'Essai B').getByText(rx('Système · Désactivé')).waitFor();
});

// --- visibilite ---------------------------------------------------------------------------------------

test('visibilite : A « MJ seul » → Léa sans entrée, même réponse qu’une adresse inconnue, écran « Page introuvable. »', opts, async () => {
  // Fails if the visibility filter of the bar, the description route or the screen is dropped.
  await ouvrirSysteme(antor);
  const A = carte(antor, 'Essai A');
  await ecrire(antor, /\/essai\/a\/visibilite$/, () => A.getByRole('checkbox', { name: 'Joueurs', exact: true }).click());
  await antor.reload();
  await antor.getByRole('tab', { name: 'Outils' }).click();
  assert.equal(await carte(antor, 'Essai A').getByRole('checkbox', { name: 'Joueurs', exact: true }).isChecked(), false);
  assert.equal(await carte(antor, 'Essai A').getByRole('checkbox', { name: 'MJ', exact: true }).isChecked(), true);

  assert.deepEqual(await entreesBarre(lea), []);
  assert.equal(await barre(lea).getByText('Outils', { exact: true }).count(), 0);
  await photo(lea, 'lea-barre-mj-seul');

  const cachee = await api(lea, 'GET', `/api/univers/${ENERIA}/outils/essai/a/description`);
  const inconnue = await api(lea, 'GET', `/api/univers/${ENERIA}/outils/essai/zzz/description`);
  assert.equal(cachee.status, 404);
  assert.deepEqual(cachee, inconnue, 'a hidden tool answers byte for byte like an unknown address');
  const chemin = await api(lea, 'GET', `/api/univers/${ENERIA}/outils/essai/a/inexistante`);
  const chemin2 = await api(lea, 'GET', `/api/univers/${ENERIA}/outils/essai/zzz/inexistante`);
  assert.deepEqual(chemin, chemin2);

  await lea.goto(`/univers/${ENERIA}/outils/essai/a`);
  await lea.getByText(PAS_TROUVE).first().waitFor();
  await photo(lea, 'lea-adresse-mj-seul');

  // Antor, GM, has the entry and the description
  assert.deepEqual(await entreesBarre(antor), ['Essai A']);
  assert.equal((await api(antor, 'GET', `/api/univers/${ENERIA}/outils/essai/a/description`)).status, 200);
});

test('visibilite : « MJ et joueurs » → Léa a l’entrée et l’écran de l’outil', opts, async () => {
  await ouvrirSysteme(antor);
  await ecrire(antor, /\/essai\/a\/visibilite$/, () =>
    carte(antor, 'Essai A').getByRole('checkbox', { name: 'Joueurs', exact: true }).click(),
  );
  assert.deepEqual(await entreesBarre(lea), ['Essai A']);
  await barre(lea).getByText('Outils', { exact: true }).waitFor();
  await barre(lea).getByRole('link', { name: 'Essai A' }).click();
  await lea.getByRole('heading', { name: 'Essai A' }).waitFor();
  await lea.getByText('Une carte pour éprouver le cadre des outils.').waitFor();
  assert.match(await lea.locator('main').innerText(), /Pas de charges de carburant[\s:]*Non/);
  assert.equal(new URL(lea.url()).pathname, `/univers/${ENERIA}/outils/essai/a`);
  await photo(lea, 'lea-ecran-outil');
});

test('visibilite : la barre d’Antor se rafraîchit sans recharger quand il désactive l’outil dans l’univers, Léa perd l’entrée', opts, async () => {
  await ouvrirUnivers(antor);
  const barreAvant = await barre(antor).getByRole('link', { name: 'Essai A' }).count();
  assert.equal(barreAvant, 1);
  const A = carte(antor, 'Essai A');
  await ecrire(antor, /\/univers\/5\/outils\/essai\/a\/activation$/, () => A.getByRole('radio', { name: 'Désactivé', exact: true }).click());
  try {
    await barre(antor).getByRole('link', { name: 'Essai A' }).waitFor({ state: 'detached' });
    await photo(antor, 'univers-desactive');
    assert.deepEqual(await entreesBarre(lea), [], 'Léa loses the entry when the universe turns it off');
  } finally {
    await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: null });
  }
  // back to following: the entry returns, and the bar of the open page follows
  await ouvrirUnivers(antor);
  assert.deepEqual(await entreesBarre(lea), ['Essai A']);
});

// --- reglage ------------------------------------------------------------------------------------------

test('reglage : « Système · Oui » puis « Univers · Non », l’autre univers lit encore le système', opts, async () => {
  await ouvrirSysteme(antor);
  const A = carte(antor, 'Essai A');
  await A.getByRole('button', { name: 'Remplacer' }).click();
  await A.getByLabel(rx('Pas de charges de carburant')).selectOption({ label: 'Oui' });
  await ecrire(antor, /\/systemes\/3\/outils\/essai\/a\/reglages$/, () => A.getByRole('button', { name: 'Enregistrer' }).click());
  await A.getByText(rx('Système · Oui')).waitFor();
  await photo(antor, 'reglage-systeme-oui');

  await ouvrirUnivers(antor);
  const U = carte(antor, 'Essai A');
  await U.getByText(rx('Système · Oui')).waitFor();
  await U.getByRole('button', { name: /Remplacer pour l.univers/ }).click();
  await U.getByLabel(rx('Pas de charges de carburant')).selectOption({ label: 'Non' });
  await ecrire(antor, /\/univers\/5\/outils\/essai\/a\/reglages$/, () => U.getByRole('button', { name: 'Enregistrer' }).click());
  await U.getByText(rx('Univers · Non')).waitFor();
  await U.getByRole('button', { name: 'Revenir à la valeur du système' }).waitFor();
  await photo(antor, 'reglage-univers-non');

  // the tool's own screen, for the overriding universe and the one that follows
  await antor.goto(`/univers/${ENERIA}/outils/essai/a`);
  await antor.getByRole('heading', { name: 'Essai A' }).waitFor();
  assert.match(await antor.locator('main').innerText(), /Pas de charges de carburant[\s:]*Non/);
  await antor.goto(`/univers/${VOISIN}/outils/essai/a`);
  await antor.getByRole('heading', { name: 'Essai A' }).waitFor();
  assert.match(await antor.locator('main').innerText(), /Pas de charges de carburant[\s:]*Oui/);
  await photo(antor, 'ecran-outil-voisin');
});

test('reglage : l’écran d’Essai A dit « Pas de charges de carburant : Non » avec son origine « Univers · Non »', opts, async () => {
  // docs/ecrans.md, « Tool screen of the trial module »: the setting, its value and its origin.
  await antor.goto(`/univers/${ENERIA}/outils/essai/a`);
  await antor.getByRole('heading', { name: 'Essai A' }).waitFor();
  await antor.getByText(rx('Pas de charges de carburant')).waitFor();
  const texte = await antor.locator('main').innerText();
  assert.match(texte, /Pas de charges de carburant : Non/);
  assert.match(texte, /Univers · Non/);
  await antor.goto(`/univers/${VOISIN}/outils/essai/a`);
  await antor.getByText(rx('Pas de charges de carburant')).waitFor();
  assert.match(await antor.locator('main').innerText(), /Pas de charges de carburant : Oui[\s\S]*Système · Oui/);
});

// --- forcer ---------------------------------------------------------------------------------------------

test('forcer : « Activé » pour Univers voisin puis éteint au système : Éneria perd entrée et adresse, Univers voisin les garde', opts, async () => {
  await ouvrirUnivers(antor, VOISIN);
  await ecrire(antor, /\/univers\/6\/outils\/essai\/a\/activation$/, () =>
    carte(antor, 'Essai A').getByRole('radio', { name: 'Activé', exact: true }).click(),
  );
  assert.equal(await carte(antor, 'Essai A').getByRole('radio', { name: 'Activé', exact: true }).isChecked(), true);
  await ouvrirSysteme(antor);
  await ecrire(antor, /\/systemes\/3\/outils\/essai\/a\/activation$/, () =>
    carte(antor, 'Essai A').getByRole('switch').click(),
  );
  await carte(antor, 'Essai A').getByText(rx('Système · Désactivé')).waitFor();
  await photo(antor, 'systeme-a-eteint');
  try {

  assert.deepEqual(await entreesBarre(lea, ENERIA), []);
  assert.deepEqual(await entreesBarre(antor, ENERIA), []);
  assert.equal((await api(antor, 'GET', `/api/univers/${ENERIA}/outils/essai/a/description`)).status, 404);
  await antor.goto(`/univers/${ENERIA}/outils/essai/a`);
  await antor.getByText(PAS_TROUVE).first().waitFor();

  assert.deepEqual(await entreesBarre(antor, VOISIN), ['Essai A']);
  assert.equal((await api(antor, 'GET', `/api/univers/${VOISIN}/outils/essai/a/description`)).status, 200);
  await antor.goto(`/univers/${VOISIN}/outils/essai/a`);
  await antor.getByRole('heading', { name: 'Essai A' }).waitFor();
  } finally {
    await sysActivation(antor, 'a', true); // the system on again: Éneria follows it
  }
  assert.deepEqual(await entreesBarre(lea, ENERIA), ['Essai A']);
});

test('forcer : « Désactivé » pour l’univers alors que le système active → Léa perd l’entrée, l’autre univers non', opts, async () => {
  await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: false });
  try {
    assert.deepEqual(await entreesBarre(lea, ENERIA), []);
    assert.deepEqual(await entreesBarre(antor, VOISIN), ['Essai A'], 'the other universe is untouched');
  } finally {
    await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: null });
  }
});

test('forcer : l’origine d’une activation forcée par l’univers se lit « Univers · désactivé » puis « Univers · activé »', opts, async () => {
  await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: false });
  try {
    await ouvrirUnivers(antor);
    await carte(antor, 'Essai A').getByText(/Univers · désactivé/i).waitFor({ timeout: 5000 });
    await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: true });
    await ouvrirUnivers(antor);
    await carte(antor, 'Essai A').getByText(/Univers · activé/i).waitFor({ timeout: 5000 });
  } finally {
    await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: null });
  }
});

// --- bornes des réglages -----------------------------------------------------------------------------

/** Writes a number in a setting's field of a card and returns the status of the save, or null when none was sent. */
async function saisir(p: Any, region: Any, libelle: RegExp, ouvrir: RegExp, valeur: string): Promise<number | null> {
  const bouton = region.getByRole('button', { name: ouvrir });
  if ((await bouton.count()) > 0) await bouton.first().click();
  await region.getByLabel(libelle).fill(valeur);
  const reponse = p
    .waitForResponse((r: Any) => r.request().method() === 'PUT' && /\/reglages$/.test(new URL(r.url()).pathname), { timeout: 4000 })
    .then((r: Any) => r.status())
    .catch(() => null);
  await region.getByRole('button', { name: 'Enregistrer' }).click();
  return reponse;
}

test('bornes : « Marge d’essai » (0 à 100) accepte 0 et 100, refuse 101 et -1 sans rien écrire', opts, async () => {
  await sysActivation(antor, 'g', true);
  await ouvrirUnivers(antor);
  const G = () => carte(antor, 'Essai G');
  const lib = rx('Marge d’essai');
  const ouvrir = /Remplacer pour l.univers/;
  assert.equal(await saisir(antor, G(), lib, ouvrir, '100'), 204);
  await G().getByText(rx('Univers · 100')).waitFor();
  assert.equal(await saisir(antor, G(), lib, ouvrir, '0'), 204);
  await G().getByText(rx('Univers · 0')).waitFor();
  const trop = await saisir(antor, G(), lib, ouvrir, '101');
  assert.ok(trop === null || (trop >= 400 && trop < 500), `101 refused, got ${trop}`);
  const moins = await saisir(antor, G(), lib, ouvrir, '-1');
  assert.ok(moins === null || (moins >= 400 && moins < 500), `-1 refused, got ${moins}`);
  await photo(antor, 'marge-refus');
  await antor.reload();
  await antor.getByRole('heading', { name: 'Essai G', level: 2 }).waitFor();
  await G().getByText(rx('Univers · 0')).waitFor();
  assert.equal(await G().getByText(rx('Univers · 101')).count() + (await G().getByText(rx('Univers · -1')).count()), 0);
});

test('bornes : « Portée d’essai » (réglage commun, 1 à 6) accepte 6, refuse 7 et 0', opts, async () => {
  await ouvrirSysteme(antor);
  const C = () => antor.getByRole('region', { name: /Réglages communs · essai/ });
  const lib = rx('Portée d’essai');
  assert.equal(await saisir(antor, C(), lib, /^Remplacer$/, '6'), 204);
  await C().getByText(rx('Système · 6')).waitFor();
  const sept = await saisir(antor, C(), lib, /^Remplacer$/, '7');
  assert.ok(sept === null || (sept >= 400 && sept < 500), `7 refused, got ${sept}`);
  const zero = await saisir(antor, C(), lib, /^Remplacer$/, '0');
  assert.ok(zero === null || (zero >= 400 && zero < 500), `0 refused, got ${zero}`);
  await antor.reload();
  await antor.getByRole('tab', { name: 'Outils' }).click();
  await C().getByText(rx('Système · 6')).waitFor();
});

test('bornes : un réglage changé par un autre MJ depuis l’ouverture → « Ce réglage a changé depuis que vous l’avez ouvert. » et « Recharger »', opts, async () => {
  await ouvrirUnivers(antor);
  const G = () => carte(antor, 'Essai G');
  await G().getByRole('button', { name: /Remplacer pour l.univers/ }).click();
  await G().getByLabel(rx('Marge d’essai')).fill('42');
  // Mira, the other GM of the universe, changes it meanwhile
  await ouvrirUnivers(mira);
  const GM = () => carte(mira, 'Essai G');
  assert.equal(await saisir(mira, GM(), rx('Marge d’essai'), /Remplacer pour l.univers/, '30'), 204);
  await GM().getByText(rx('Univers · 30')).waitFor();
  await G().getByRole('button', { name: 'Enregistrer' }).click();
  await G().getByText(rx('Ce réglage a changé depuis que vous l’avez ouvert.')).waitFor();
  await G().getByRole('button', { name: 'Recharger' }).click();
  await G().getByText(rx('Univers · 30')).waitFor();
  await photo(antor, 'reglage-conflit');
});

// --- Mira ------------------------------------------------------------------------------------------------

test('mira : MJ rattachée non responsable lit outils et valeurs, sans interrupteur, case, « Remplacer » ni « Transférer »', opts, async () => {
  await ouvrirSysteme(mira);
  const texte = await mira.locator('main').innerText();
  assert.match(texte, /Responsable : antor/i);
  assert.match(texte, /Seul le responsable du système règle ces valeurs\./);
  assert.match(texte, /Essai A[\s\S]*Système · Activé/);
  assert.match(texte, /Pas de charges de carburant[\s\S]*Système · Oui/);
  assert.equal(await mira.getByRole('switch').count(), 0);
  assert.equal(await mira.getByRole('checkbox').count(), 0);
  assert.equal(await mira.getByRole('button', { name: /Remplacer|Transférer|Activer|Importer|Supprimer/ }).count(), 0);
  await photo(mira, 'mira-lecture-seule');
});

test('mira : une écriture au système par Mira est refusée et ne change rien', opts, async () => {
  const r = await api(mira, 'PUT', `/api/systemes/${SYS}/outils/essai/a/activation`, { active: false });
  assert.ok(r.status >= 400 && r.status < 500, `refused, got ${r.status}`);
  const v = await api(mira, 'PUT', `/api/systemes/${SYS}/outils/essai/a/visibilite`, { joueur: false });
  assert.ok(v.status >= 400 && v.status < 500, `refused, got ${v.status}`);
  const t = await api(mira, 'POST', `/api/systemes/${SYS}/responsable`, { compteId: 4 });
  assert.ok(t.status >= 400 && t.status < 500, `refused, got ${t.status}`);
  await ouvrirSysteme(antor);
  assert.equal(await carte(antor, 'Essai A').getByRole('switch').getAttribute('aria-checked'), 'true');
  assert.equal(await carte(antor, 'Essai A').getByRole('checkbox', { name: 'Joueurs', exact: true }).isChecked(), true);
  assert.match(await antor.locator('main').innerText(), /Responsable : vous/);
});

test('mira : dans son univers elle règle encore l’outil (écriture d’univers de tout MJ)', opts, async () => {
  await ouvrirUnivers(mira);
  assert.ok((await carte(mira, 'Essai A').getByRole('radio').count()) >= 3);
  const r = await api(mira, 'PUT', `/api/univers/${ENERIA}/outils/essai/b/activation`, { active: null });
  assert.equal(r.status, 204);
});

test('mira : sur « Système ancien » (sans responsable stocké) elle a l’interrupteur, comme responsable', opts, async () => {
  await ouvrirSysteme(mira, ANCIEN);
  await mira.getByText('Aucun responsable : tout MJ d’un univers rattaché agit').or(mira.getByText(rx('Aucun responsable : tout MJ d’un univers rattaché agit'))).first().waitFor();
  const A = carte(mira, 'Essai A');
  assert.equal(await A.getByRole('switch').count(), 1);
  assert.equal(await mira.getByRole('switch').count(), 3);
  await ecrire(mira, /\/systemes\/4\/outils\/essai\/a\/activation$/, () => A.getByRole('switch').click());
  await A.getByText(rx('Système · Activé')).waitFor();
  await photo(mira, 'systeme-ancien-mira');
  assert.equal(await mira.getByRole('button', { name: 'Transférer la responsabilité' }).count(), 1);
  assert.doesNotMatch(await mira.locator('main').innerText(), /Seul le responsable du système règle ces valeurs\./);
});

test('mira : Système ancien, transférer sans autre MJ → « Aucun autre MJ d’un univers de ce système. », « Fermer » seul', opts, async () => {
  await mira.getByRole('button', { name: 'Transférer la responsabilité' }).click();
  const d = mira.getByRole('alertdialog').or(mira.getByRole('dialog'));
  await d.getByText(rx('Aucun autre MJ d’un univers de ce système.')).waitFor();
  assert.equal(await d.getByRole('button', { name: 'Transférer', exact: true }).count(), 0);
  await d.getByRole('button', { name: 'Fermer' }).click();
  await d.waitFor({ state: 'detached' });
});

// --- états ------------------------------------------------------------------------------------------------

test('etats : hors ligne, « Connexion perdue. » et toute commande d’écriture désactivée', opts, async () => {
  await ouvrirSysteme(antor);
  await ctxAntor.setOffline(true);
  try {
    await antor.getByText(rx('Connexion perdue.')).first().waitFor();
    const A = carte(antor, 'Essai A');
    assert.equal(await A.getByRole('switch').isDisabled(), true);
    assert.equal(await A.getByRole('checkbox', { name: 'MJ', exact: true }).isDisabled(), true);
    assert.equal(await A.getByRole('button', { name: 'Remplacer' }).isDisabled(), true);
    await photo(antor, 'hors-ligne');
  } finally {
    await ctxAntor.setOffline(false);
  }
});

test('etats : un enregistrement qui échoue rend la valeur d’avant, « Enregistrement impossible. » et « Réessayer »', opts, async () => {
  await ouvrirSysteme(antor);
  await antor.route(/\/api\/systemes\/3\/outils\/essai\/a\/visibilite$/, (route: Any) => route.abort());
  const A = carte(antor, 'Essai A');
  const avant = await A.getByRole('checkbox', { name: 'MJ', exact: true }).isChecked();
  assert.equal(avant, true);
  await A.getByRole('checkbox', { name: 'MJ', exact: true }).click();
  await A.getByText(rx('Enregistrement impossible.')).waitFor();
  await A.getByRole('button', { name: 'Réessayer' }).waitFor();
  assert.equal(await A.getByRole('checkbox', { name: 'MJ', exact: true }).isChecked(), true);
  await photo(antor, 'enregistrement-impossible');
  await antor.unroute(/\/api\/systemes\/3\/outils\/essai\/a\/visibilite$/);
  await antor.reload();
  await antor.getByRole('tab', { name: 'Outils' }).click();
  assert.equal(await carte(antor, 'Essai A').getByRole('checkbox', { name: 'MJ', exact: true }).isChecked(), true);
});

test('etats : le chargement échoué du panneau dit « Impossible de charger les outils. » avec « Réessayer »', opts, async () => {
  await antor.route(/\/api\/systemes\/3\/outils$/, (route: Any) => route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }));
  await antor.goto(`/systemes/${SYS}`);
  await antor.getByRole('tab', { name: 'Outils' }).click();
  await antor.getByText(rx('Impossible de charger les outils.')).waitFor();
  await antor.unroute(/\/api\/systemes\/3\/outils$/);
  await antor.getByRole('button', { name: 'Réessayer' }).click();
  await antor.getByRole('heading', { name: 'Essai A', level: 2 }).waitFor();
});

test('etats : univers sans système de jeu → onglet Outils « Cet univers n’a pas de système de jeu. »', opts, async () => {
  await antor.goto('/univers/4/parametres');
  await antor.getByRole('tab', { name: 'Outils' }).click();
  await antor.getByText(rx('Cet univers n’a pas de système de jeu.')).waitFor();
  assert.equal(await antor.getByRole('switch').count(), 0);
});

// --- téléphone ---------------------------------------------------------------------------------------------

test('telephone : à 390 px une carte tient en une colonne sans défilement horizontal, cibles de 44 px', opts, async () => {
  const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 }, storageState: await ctxAntor.storageState() });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  try {
    await ouvrirSysteme(p);
    const dep = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(dep <= 0, `horizontal overflow of ${dep}px`);
    const A = carte(p, 'Essai A');
    const sw = await A.getByRole('switch').boundingBox();
    assert.ok(sw && sw.height >= 44, `switch height ${sw?.height}`);
    for (const nom of ['MJ', 'Joueurs']) {
      const box = await A.getByRole('checkbox', { name: nom, exact: true }).evaluate((e: Any) => {
        const l = (e.closest('label') ?? e).getBoundingClientRect();
        return { h: l.height, w: l.width };
      });
      assert.ok(box.h >= 44, `checkbox « ${nom} » target height ${box.h}`);
    }
    await photo(p, 'telephone-390');
    await ouvrirUnivers(p);
    const dep2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(dep2 <= 0, `horizontal overflow on the universe tab: ${dep2}px`);
  } finally {
    await ctx.close();
  }
});

// --- chargement du code de l'outil ------------------------------------------------------------------------

const CODE_A = /\/assets\/a-[\w-]+\.js$/; // the lazy chunk the build names after the tool (positive control below)

function espion(p: Any): { vus: string[] } {
  const vus: string[] = [];
  p.on('request', (r: Any) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/assets/') && u.pathname.endsWith('.js')) vus.push(u.pathname);
  });
  return { vus };
}

test('chargement : le code d’Essai A n’est demandé par personne avant l’écran de l’outil, jamais par Léa quand il est « MJ seul »', opts, async () => {
  // Antor (positive control): the chunk of Essai A is fetched when the screen opens, not before.
  const ctx = await browser.newContext({ baseURL: srv.base, storageState: await ctxAntor.storageState() });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  const s = espion(p);
  try {
    assert.ok((await entreesBarre(p)).includes('Essai A')); // universe home: bar loaded, entry shown
    await attendre(p);
    assert.equal(s.vus.filter((u) => CODE_A.test(u)).length, 0, 'not requested by the universe home or the bar');
    await ouvrirUnivers(p);
    assert.equal(s.vus.filter((u) => CODE_A.test(u)).length, 0, 'not requested by E-20 either');
    await p.goto(`/univers/${ENERIA}`);
    await attendre(p);
    await barre(p).getByRole('link', { name: 'Essai A' }).click();
    await p.getByRole('heading', { name: 'Essai A' }).waitFor();
    await p.getByText(rx('Pas de charges de carburant')).waitFor();
    assert.equal(s.vus.filter((u) => CODE_A.test(u)).length, 1, 'the chunk arrives when the screen opens');
  } finally {
    await ctx.close();
  }

  // Léa while the tool is « MJ seul »: the screen's address never asks for the code
  await api(antor, 'PUT', `/api/systemes/${SYS}/outils/essai/a/visibilite`, { joueur: false });
  const ctxL = await browser.newContext({ baseURL: srv.base, storageState: await ctxLea.storageState() });
  const l = await ctxL.newPage();
  l.setDefaultTimeout(30000);
  const sl = espion(l);
  try {
    const desc = l.waitForResponse((r: Any) => /\/outils\/essai\/a\/description$/.test(new URL(r.url()).pathname));
    await l.goto(`/univers/${ENERIA}/outils/essai/a`);
    assert.equal((await desc).status(), 404);
    await l.getByText(PAS_TROUVE).first().waitFor();
    await attendre(l);
    assert.equal(sl.vus.filter((u) => CODE_A.test(u)).length, 0, 'Léa never fetched the code of a hidden tool');
    await photo(l, 'chargement-lea-mj-seul');
  } finally {
    await ctxL.close();
    await api(antor, 'PUT', `/api/systemes/${SYS}/outils/essai/a/visibilite`, { joueur: true });
  }
});

// --- gardes ------------------------------------------------------------------------------------------------

test('garde : Léa (Joueuse) n’a pas l’onglet, ni son adresse, ni son API, aux deux niveaux', opts, async () => {
  await lea.goto(`/univers/${ENERIA}/parametres?onglet=outils`);
  await lea.getByText(PAS_TROUVE).first().waitFor();
  assert.equal(await lea.getByRole('tab', { name: 'Outils' }).count(), 0);
  await lea.goto(`/systemes/${SYS}`);
  await lea.getByRole('heading', { name: "Système d'essai", level: 1 }).waitFor();
  assert.equal(await lea.getByRole('tab', { name: 'Outils' }).count(), 0);
  await lea.goto(`/systemes/${SYS}?onglet=outils`);
  await lea.getByRole('heading', { name: "Système d'essai", level: 1 }).waitFor();
  assert.equal(await lea.getByRole('heading', { name: 'Essai A', level: 2 }).count(), 0);
  assert.equal(await lea.getByRole('switch').count(), 0);
  await photo(lea, 'lea-systeme-sans-onglet');
  for (const [m, u, c] of [
    ['GET', `/api/univers/${ENERIA}/outils`],
    ['GET', `/api/systemes/${SYS}/outils`],
    ['GET', `/api/systemes/${SYS}/responsable`],
    ['PUT', `/api/univers/${ENERIA}/outils/essai/a/activation`, { active: true }],
    ['PUT', `/api/systemes/${SYS}/outils/essai/a/activation`, { active: false }],
  ] as [string, string, unknown?][]) {
    const r = await api(lea, m, u, c);
    assert.ok(r.status === 404 || r.status === 403, `${m} ${u}: ${r.status}`);
  }
  // Léa did not change anything
  await ouvrirSysteme(antor);
  assert.equal(await carte(antor, 'Essai A').getByRole('switch').getAttribute('aria-checked'), 'true');
});

test('garde : un compte sans univers rattaché et l’admin de l’instance ne voient pas le système d’essai', opts, async () => {
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  const admin = (await connecte(browser, srv.base, 'Admin')).page;
  for (const p of [teo, admin]) {
    for (const u of [`/api/systemes/${SYS}/outils`, `/api/systemes/${SYS}/responsable`, `/api/univers/${ENERIA}/outils`, `/api/univers/${ENERIA}/outils/entrees`]) {
      const r = await api(p, 'GET', u);
      assert.equal(r.status, 404, `${u}: ${r.status}`);
    }
    assert.equal((await api(p, 'PUT', `/api/systemes/${SYS}/outils/essai/a/activation`, { active: false })).status, 404);
  }
});

test('garde : sans session, l’API des outils ne répond pas', opts, async () => {
  const r = await fetch(`${srv.base}/api/univers/${ENERIA}/outils/entrees`, { redirect: 'manual' });
  assert.equal(r.status, 401);
  const w = await fetch(`${srv.base}/api/systemes/${SYS}/outils/essai/a/activation`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{"active":false}',
    redirect: 'manual',
  });
  assert.equal(w.status, 401);
});

// --- transfert (dernier : il retire des droits à Antor) --------------------------------------------------

test('transfert : le dialogue liste les MJ des univers rattachés (jamais Antor), avec la phrase, « Annuler » ne change rien', opts, async () => {
  await ouvrirSysteme(antor);
  await antor.getByText(/Responsable : vous/).waitFor();
  await antor.getByRole('button', { name: 'Transférer la responsabilité' }).click();
  const d = antor.getByRole('alertdialog').or(antor.getByRole('dialog'));
  await d.getByText(/mira pourra activer les outils et régler le système ; vous gardez vos droits de MJ\./i).waitFor();
  const choix = await d.getByRole('radio').evaluateAll((l: Any[]) => l.map((e) => (e.closest('label')?.textContent ?? '').trim()));
  assert.deepEqual(choix, ['mira']);
  await photo(antor, 'transfert-dialogue');
  await d.getByRole('button', { name: 'Annuler' }).click();
  await d.waitFor({ state: 'detached' });
  await antor.getByText(/Responsable : vous/).waitFor();
  assert.equal(await carte(antor, 'Essai A').getByRole('switch').count(), 1);
});

test('transfert : Antor transfère à Mira ; elle a l’interrupteur au système, lui non, il garde ses gestes d’univers', opts, async () => {
  await ouvrirSysteme(antor);
  await antor.getByRole('button', { name: 'Transférer la responsabilité' }).click();
  const d = antor.getByRole('alertdialog').or(antor.getByRole('dialog'));
  await d.getByRole('radio').check();
  await ecrire(antor, /\/api\/systemes\/3\/responsable$/, () => d.getByRole('button', { name: 'Transférer', exact: true }).click(), 'POST');
  await antor.getByText(/Responsable : mira/i).waitFor();
  await antor.getByRole('heading', { name: 'Essai A', level: 2 }).waitFor();
  assert.equal(await antor.getByRole('switch').count(), 0);
  assert.equal(await antor.getByRole('checkbox').count(), 0);
  assert.equal(await antor.getByRole('button', { name: /Transférer|Remplacer/ }).count(), 0);
  assert.match(await antor.locator('main').innerText(), /Seul le responsable du système règle ces valeurs\./);
  await photo(antor, 'apres-transfert-antor');

  await ouvrirSysteme(mira);
  await mira.getByText(/Responsable : vous/).waitFor();
  assert.equal(await mira.getByRole('switch').count(), 3);
  await photo(mira, 'apres-transfert-mira');
  // Mira really writes at the system now; Antor's write is refused
  const avantG = await carte(mira, 'Essai G').getByRole('switch').getAttribute('aria-checked');
  const ok = await ecrire(mira, /\/essai\/g\/activation$/, () => carte(mira, 'Essai G').getByRole('switch').click());
  assert.equal(ok.status(), 204);
  await mira.reload();
  await mira.getByRole('tab', { name: 'Outils' }).click();
  assert.equal(await carte(mira, 'Essai G').getByRole('switch').getAttribute('aria-checked'), avantG === 'true' ? 'false' : 'true');
  const refus = await api(antor, 'PUT', `/api/systemes/${SYS}/outils/essai/g/activation`, { active: avantG !== 'true' });
  assert.ok(refus.status >= 400 && refus.status < 500, `refused, got ${refus.status}`);

  // Antor, still GM of both universes, keeps his universe-level gestures
  await ouvrirUnivers(antor);
  assert.ok((await carte(antor, 'Essai A').getByRole('radio').count()) >= 3);
  const r = await api(antor, 'PUT', `/api/univers/${ENERIA}/outils/essai/a/visibilite`, { joueur: false });
  assert.equal(r.status, 204);
  assert.ok(!(await entreesBarre(lea, ENERIA)).includes('Essai A'));
});

test('transfert : une cible qui n’est pas MJ d’un univers de ce système est refusée, le responsable ne bouge pas', opts, async () => {
  // Mira, now responsible, tries to hand over to Léa (a Player): refused, the responsible does not move.
  const r = await api(mira, 'POST', `/api/systemes/${SYS}/responsable`, { compteId: 2 });
  assert.ok(r.status >= 400 && r.status < 500, `refused, got ${r.status}`);
  await ouvrirSysteme(mira);
  await mira.getByText(/Responsable : vous/).waitFor();
});
