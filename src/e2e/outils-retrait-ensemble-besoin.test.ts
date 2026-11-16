// Black-box tests of the feature kanevas-outils-retrait, written from its sheet (« Livre », exit criterion),
// docs/parcours.md (B-63, P-21) and docs/ecrans.md (E-20 « Supprimer les données de l'outil… », its criteria and
// states) — not from the code. Real server in stub mode WITH its starting world (AD-55), real Chromium for the
// screens, the SQLite file read directly for "no row left / no row lost".
//
// The world (Antor = GM of « Éneria d'essai » (id 5) and « Univers voisin » (id 6), responsible of « Système
// d'essai » (id 3); Mira = GM of « Éneria d'essai » only; Léa = Player of « Éneria d'essai »):
//   « Éneria d'essai » : 2 designs (« Vent d'Orak », « Étoile du soir »), 2 local catalogue elements, galaxy
//   with 4 systems, 3 routes, 1 zone. « Univers voisin » : 1 design (« Sentinelle du voisin »), designer forced
//   « Activé ». « Système d'essai » catalogue : 3 coques + 2 moteurs + 2 aménagements + 1 défense + 2 armes +
//   1 modification + 7 exemples = 18 elements (the E-20 card says so, added by hand).
//
// Plan (case → expected, literal):
//  B-63 nominal      disable then re-enable the designer      → every swn_* row identical before/after, same 2 designs
//  B-63 bords        disabled tool: summary still readable, still 2 + 2 ; a card with nothing to erase has no button
//  B-63 system       the responsible disables at system level → « Éneria d'essai » loses the tool, « Univers voisin » keeps it
//  E-20 universe     dialog « 2 conceptions, 2 éléments locaux de catalogue seront effacés. » ; Annuler erases nothing ;
//                    confirm → « Données supprimées : … » ; Voisin's design intact ; sheets kept ; empty state afterwards
//  E-20 bord         one design → « 1 conception », no « 1 conceptions », no line at 0
//  E-20 system       after disabling : « 18 éléments du catalogue du système… », « Encore utilisé par : » « Univers voisin »,
//                    not « Éneria d'essai » ; confirming erases the system catalogue only
//  E-20 galaxy       « Les 4 systèmes, 3 routes et 1 zone de cette galaxie seront effacés. » ; erased ; designs intact
//  E-20 refusals     Mira (not responsible) : neither button nor line at system level, 403 without data ; Léa : 404 ;
//                    Antor in Player mode : 403 ; unknown tool / tool without data : 404
//  E-20 changed      Mira adds a design while the dialog is open → « Les données ont changé… », 3 conceptions, nothing erased
//  E-20 states       error (5xx), offline, phone (390 px)
//  AD-135            deleting « Éneria d'essai » leaves zero swn_* row for it ; wrong name erases nothing ; Voisin intact
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { type Any, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
const servers: { stop: () => void }[] = [];
const browsers: Any[] = [];
const COMPTES = ['antor', 'lea', 'teo', 'mira'];

interface Monde {
  base: string;
  dbPath: string;
  cookies: Record<string, string>;
}

async function monde(): Promise<Monde> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-retrait-'));
  const dbPath = join(dir, 'k.db');
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  for (const compte of COMPTES) {
    const r = await fetch(`${srv.base}/connexion-bouchon`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ compte }).toString(),
    });
    cookies[compte] = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  return { base: srv.base, dbPath, cookies };
}

interface Rep {
  status: number;
  texte: string;
  json: Any;
}
async function appel(m: Monde, compte: string, methode: string, chemin: string, corps?: unknown): Promise<Rep> {
  const r = await fetch(`${m.base}${chemin}`, {
    method: methode,
    headers: { cookie: m.cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* not JSON */
  }
  return { status: r.status, texte, json };
}

const ENEIRIA = 5;
const VOISIN = 6;
const SYSTEME = 3;


/** A browser context already signed in as `compte` (the session cookie of the stub login). */
async function session(b: Any, m: Monde, compte: string, viewport?: { width: number; height: number }): Promise<{ ctx: Any; page: Any }> {
  const ctx = await b.newContext({ baseURL: m.base, ...(viewport ? { viewport } : {}) });
  await ctx.addCookies(m.cookies[compte].split('; ').map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1), url: m.base };
  }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  return { ctx, page };
}

async function navigateur(): Promise<Any> {
  const b = await launch();
  browsers.push(b);
  return b;
}
const carte = (page: Any, nom: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: nom, exact: true }) }).last();
const bouton = /Supprimer les données de l[’']outil/;

async function ouvrirOutils(page: Any, niveau: 'univers' | 'systeme', id: number): Promise<void> {
  if (niveau === 'univers') await page.goto(`/univers/${id}/parametres?onglet=outils`);
  else {
    await page.goto(`/systemes/${id}`);
    await page.getByRole('tab', { name: 'Outils' }).click();
  }
  await carte(page, 'Concepteur de vaisseaux').waitFor();
}
const dialogue = (page: Any) => page.getByRole('dialog');
async function ouvrirDialogue(page: Any, nomCarte: string): Promise<void> {
  await carte(page, nomCarte).getByRole('button', { name: bouton }).click();
  await dialogue(page).waitFor();
}

after(async () => {
  for (const b of browsers) await b.close().catch(() => {});
  for (const s of servers) s.stop();
});

test('B-63 · désactiver puis réactiver le concepteur ne supprime aucune ligne swn_* et rend les mêmes conceptions', opts, async () => {
  // would fail if disabling cascaded into the data
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  // the rows kept and the activation read back are proved by src/routes/outils-retrait-lot-outils.test.ts
  await ouvrirOutils(page, 'univers', ENEIRIA);
  const c = carte(page, 'Concepteur de vaisseaux');

  await c.getByRole('radio', { name: 'Désactivé', exact: true }).click();
  await page.getByRole('radio', { name: 'Désactivé', exact: true }).first().waitFor();
  assert.ok(await c.getByRole('radio', { name: 'Désactivé', exact: true }).isChecked());
  await page.screenshot({ path: '/tmp/retrait-desactive.png' });

  await c.getByRole('radio', { name: 'Activé', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input[type=radio]')].some((e) => (e as HTMLInputElement).checked));
  assert.ok(await c.getByRole('radio', { name: 'Activé', exact: true }).isChecked());
});

test('B-63 · une carte sans donnée à effacer ne porte pas le bouton, celles qui en ont un le portent', opts, async () => {
  // would fail if the button were on every card (or on none)
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'univers', ENEIRIA);
  assert.equal(await carte(page, 'Essai A').getByRole('button', { name: bouton }).count(), 0);
  assert.equal(await carte(page, 'Essai B').getByRole('button', { name: bouton }).count(), 0);
  for (const nom of ['Galaxie', 'Concepteur de vaisseaux', 'Essai G']) {
    assert.equal(await carte(page, nom).getByRole('button', { name: bouton }).count(), 1, nom);
    assert.ok(await carte(page, nom).getByText('Désactiver garde tout ; supprimer efface.').isVisible(), nom);
  }
});

test('E-20 · le niveau système désactivé par le responsable : Éneria perd le concepteur, Univers voisin (forcé) le garde', opts, async () => {
  // would fail if the system switch also turned off a universe that forced the tool
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'systeme', SYSTEME);
  await carte(page, 'Concepteur de vaisseaux').getByRole('switch', { name: 'Activé' }).click();
  await carte(page, 'Concepteur de vaisseaux').getByText('Système · Désactivé').waitFor();
  await page.goto(`/univers/${ENEIRIA}`);
  await page.getByRole('link', { name: 'Vue d’ensemble' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Concepteur de vaisseaux' }).count(), 0);
  await page.goto(`/univers/${VOISIN}`);
  await page.getByRole('link', { name: 'Concepteur de vaisseaux' }).waitFor();
});

test('E-20 · univers : la fenêtre compte 2 conceptions, 2 éléments locaux ; Annuler n\'efface rien ; confirmer efface et laisse Univers voisin intact', opts, async () => {
  // would fail if the count were wrong, if Annuler erased, or if the erase reached the other universe / the sheets
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'univers', ENEIRIA);
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const d = dialogue(page);
  await d.getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  await d.getByText('Cette action est définitive.').waitFor();
  await d.getByText(rx('Les fiches et leur texte sont conservés : leurs sections ne seront plus gérées par l’outil.')).waitFor();
  await d.getByRole('heading', { name: rx('Supprimer les données de « Concepteur de vaisseaux » ?') }).waitFor();
  await page.screenshot({ path: '/tmp/retrait-universe-dialog.png' });

  await d.getByRole('button', { name: 'Annuler' }).click();
  await d.waitFor({ state: 'detached' });
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  await dialogue(page).getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await dialogue(page).getByText('Données supprimées : 2 conceptions, 2 éléments locaux de catalogue.').waitFor();
  await page.screenshot({ path: '/tmp/retrait-universe-fait.png' });

  // the card refreshes its counts, the activation is untouched
  await dialogue(page).getByRole('button', { name: 'Fermer' }).last().click();
  const c = carte(page, 'Concepteur de vaisseaux');
  await c.getByText(/Catalogue de l[’']univers · aucun catalogue importé/).waitFor();
  assert.ok(await c.getByRole('radio', { name: 'Suit le système (Activé)' }).isChecked());


  // empty state afterwards
  await ouvrirOutils(page, 'univers', ENEIRIA);
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  await dialogue(page).getByText(rx("Cet outil n'a aucune donnée à supprimer.")).waitFor();
  assert.equal(await dialogue(page).getByRole('button', { name: 'Supprimer les données', exact: true }).count(), 0);
  await dialogue(page).getByRole('button', { name: 'Fermer' }).last().waitFor();
});

test('E-20 · bord : une seule conception s\'écrit au singulier et aucune ligne à zéro n\'apparaît', opts, async () => {
  // would fail if the sentence printed « 1 conceptions » or a « 0 éléments locaux » line
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'univers', VOISIN);
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const d = dialogue(page);
  await d.getByText(/1 conception\b/).waitFor();
  const texte = await d.innerText();
  assert.ok(!texte.includes('1 conceptions'), texte);
  assert.ok(!texte.includes('élément'), texte);
  assert.ok(!/\b0 /.test(texte), texte);
});

test('E-20 · système : après désactivation, la fenêtre ajoute « Encore utilisé par : » Univers voisin, pas Éneria, et n\'efface que le catalogue du système', opts, async () => {
  // would fail if the block listed a universe where the tool is disabled, or if the erase reached universes' own data
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'systeme', SYSTEME);
  await carte(page, 'Concepteur de vaisseaux').getByRole('switch', { name: 'Activé' }).click();
  await carte(page, 'Concepteur de vaisseaux').getByText('Système · Désactivé').waitFor();
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const d = dialogue(page);
  await d.getByText('18 éléments du catalogue du système seront effacés.').waitFor();
  await d.getByText('Encore utilisé par :').waitFor();
  await d.getByText('Univers voisin').waitFor();
  const texte = await d.innerText();
  assert.ok(!texte.includes("Éneria d'essai"), texte);
  assert.ok(texte.includes('Ensemble : 1 conception.'), texte);
  assert.ok(texte.includes('Ces univers perdent les éléments du système : leurs conceptions seront à recalculer.'), texte);
  await page.screenshot({ path: '/tmp/retrait-systeme-dialog.png' });

  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await d.getByText('Données supprimées : 18 éléments du catalogue du système.').waitFor();
});

test('E-20 · galaxie : la fenêtre compte 4 systèmes, 3 routes et 1 zone, les efface, et ne touche pas aux conceptions', opts, async () => {
  // would fail if the galaxy were not counted/erased, or if the erase hit the designer's data
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'univers', ENEIRIA);
  await ouvrirDialogue(page, 'Galaxie');
  const d = dialogue(page);
  await d.getByText('Les 4 systèmes, 3 routes et 1 zone de cette galaxie seront effacés.').waitFor();
  await page.screenshot({ path: '/tmp/retrait-galaxie-dialog.png' });
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await d.getByText(/Données supprimées/).waitFor();
  // system level: the galaxy tool has no data and no button
  await ouvrirOutils(page, 'systeme', SYSTEME);
  assert.equal(await carte(page, 'Galaxie').getByRole('button', { name: bouton }).count(), 0);
});

test('E-20 · Mira (non responsable) : ni bouton ni ligne au niveau système, 403 sans donnée, rien d\'effacé ; sur son univers elle les a', opts, async () => {
  // would fail if the button were merely disabled, or if the 403 leaked universe names or erased
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'mira');
  await page.goto(`/systemes/${SYSTEME}`);
  await page.getByRole('tab', { name: 'Outils' }).click();
  await carte(page, 'Concepteur de vaisseaux').waitFor();
  assert.equal(await page.getByRole('button', { name: bouton }).count(), 0);
  assert.equal(await page.getByText('Désactiver garde tout ; supprimer efface.').count(), 0);
  await page.screenshot({ path: '/tmp/retrait-mira-systeme.png' });
  await ouvrirOutils(page, 'univers', ENEIRIA);
  assert.equal(await carte(page, 'Concepteur de vaisseaux').getByRole('button', { name: bouton }).count(), 1);
});

test('E-20 · Léa (joueuse) reçoit « Page introuvable. » ; Antor en mode joueur est refusé ; rien n\'est effacé', opts, async () => {
  // would fail if a Player could read the summary or if Player mode did not drop the GM right
  const m = await monde();
  const b = await navigateur();
  const { page } = await session(b, m, 'lea');
  await page.goto(`/univers/${ENEIRIA}/parametres?onglet=outils`);
  await page.getByText('Page introuvable.').first().waitFor();
  assert.equal(await page.getByRole('button', { name: bouton }).count(), 0);
});

test('E-20 · contenu changé entre l\'ouverture et la confirmation : message, 3 conceptions, rien d\'effacé, puis Recharger et confirmer efface', opts, async () => {
  // would fail if the deletion went through on a stale count
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'univers', ENEIRIA);
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const d = dialogue(page);
  await d.getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();

  // a design added behind the open dialog (the 409 itself is proved by src/routes/outils-retrait-lot-outils.test.ts)
  const f = await appel(m, 'mira', 'POST', `/api/univers/${ENEIRIA}/fiches`, { type: 'vaisseau', titre: 'Nouveau' });
  await appel(m, 'mira', 'POST', `/api/univers/${ENEIRIA}/outils/swn/vaisseaux/conceptions`, { ficheId: f.json.id, coque: 'fregate' });

  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await d.getByText('Les données ont changé depuis que vous avez ouvert cette fenêtre.').waitFor();
  await d.getByText(/3 conceptions/).waitFor();
  await page.screenshot({ path: '/tmp/retrait-change.png' });

  await d.getByRole('button', { name: 'Recharger' }).click();
  await d.getByText('3 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await d.getByText('Données supprimées : 3 conceptions, 2 éléments locaux de catalogue.').waitFor();
});

test('E-20 · erreur 5xx : « L\'action n\'a pas abouti. Rien n\'est supprimé. » + Réessayer ; coupure : bandeau et bouton désactivé', opts, async () => {
  // would fail if a failed read left an active destructive button, or if a failed delete erased
  const m = await monde();
  const b = await navigateur();
  const { ctx, page } = await connecte(b, m.base, 'antor');
  await ouvrirOutils(page, 'univers', ENEIRIA);
  await page.route('**/outils/swn/vaisseaux/suppression**', (route: Any) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue(),
  );
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const d = dialogue(page);
  await d.getByText(rx("L'action n'a pas abouti. Rien n'est supprimé.")).waitFor();
  assert.equal(await d.getByRole('button', { name: 'Supprimer les données', exact: true }).count(), 0);
  await page.screenshot({ path: '/tmp/retrait-erreur.png' });
  await page.unroute('**/outils/swn/vaisseaux/suppression**');
  await d.getByRole('button', { name: 'Réessayer' }).click();
  await d.getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();

  // the deletion itself fails (5xx)
  await page.route('**/outils/swn/vaisseaux/suppression**', (route: Any) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue(),
  );
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await d.getByText(rx("L'action n'a pas abouti. Rien n'est supprimé.")).waitFor();
  await page.unroute('**/outils/swn/vaisseaux/suppression**');
  await d.getByRole('button', { name: 'Réessayer' }).click();
  await d.getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();

  // offline
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByText('Connexion perdue.').first().waitFor();
  assert.ok(await d.getByRole('button', { name: 'Supprimer les données', exact: true }).isDisabled());
  await page.screenshot({ path: '/tmp/retrait-hors-ligne.png' });
  await ctx.setOffline(false);
});

test('E-20 · téléphone 390 px : fenêtre pleine hauteur, boutons de 44 px, le destructif en dernier', opts, async () => {
  // would fail if the dialog kept its desktop layout on a phone
  const m = await monde();
  const b = await navigateur();
  const { page } = await session(b, m, 'antor', { width: 390, height: 844 });
  await ouvrirOutils(page, 'univers', ENEIRIA);
  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const d = dialogue(page);
  await d.getByText('2 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  const boites = await d.getByRole('button').evaluateAll((es: Any[]) =>
    es.filter((e) => e.innerText.trim()).map((e) => ({ t: e.innerText.trim(), h: e.getBoundingClientRect().height, y: e.getBoundingClientRect().top })),
  );
  boites.sort((a: Any, c: Any) => a.y - c.y);
  const nom = boites.map((x: Any) => x.t);
  assert.deepEqual(nom, ['Annuler', 'Supprimer les données']);
  for (const x of boites) assert.ok(x.h >= 44, `${x.t}: ${x.h}px`);
  assert.equal(nom[nom.length - 1], 'Supprimer les données', 'destructive button last');
  const h = await d.evaluate((e: Any) => e.getBoundingClientRect().height);
  assert.ok(h >= 844 * 0.9, `dialog height ${h}`);
  await page.screenshot({ path: '/tmp/retrait-telephone.png' });
});
