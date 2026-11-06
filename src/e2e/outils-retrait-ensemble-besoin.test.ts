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
import Database from 'better-sqlite3';
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
const resume = (niveau: 'univers' | 'systeme', id: number, outil = 'vaisseaux', suite = '') =>
  `/api/${niveau === 'univers' ? 'univers' : 'systemes'}/${id}/outils/swn/${outil}/suppression${suite}`;

/** Reads the SQLite file of the running server (read only). */
function lireBase<T>(m: Monde, corps: (db: Any) => T): T {
  const db = new Database(m.dbPath, { readonly: true });
  try {
    return corps(db);
  } finally {
    db.close();
  }
}
/** Every row of every swn_* table, as one string: equal strings = no row lost, none changed. */
function toutesLesLignes(m: Monde): string {
  return lireBase(m, (db) => {
    const tables = db.prepare("select name from sqlite_master where type='table' and name like 'swn\\_%' escape '\\' order by name").all();
    return tables.map((t: Any) => `${t.name}=${JSON.stringify(db.prepare(`select * from ${t.name} order by rowid`).all())}`).join('\n');
  });
}
/** Rows of the swn_* tables carrying `univers_id` = id. */
function lignesDeLUnivers(m: Monde, id: number): Record<string, number> {
  return lireBase(m, (db) => {
    const res: Record<string, number> = {};
    for (const t of db.prepare("select name from sqlite_master where type='table' and name like 'swn\\_%' escape '\\'").all()) {
      const cols = db.prepare(`pragma table_info(${t.name})`).all().map((c: Any) => c.name);
      if (cols.includes('univers_id')) res[t.name] = db.prepare(`select count(*) n from ${t.name} where univers_id = ?`).get(id).n;
    }
    return res;
  });
}
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const titresConceptions = (m: Monde, id: number): string[] =>
  lireBase(m, (db) =>
    db.prepare('select f.titre t from swn_conceptions c join fiches f on f.id = c.fiche_id where c.univers_id = ? order by f.titre').all(id).map((r: Any) => r.t),
  );
const lignesCatalogueSysteme = (m: Monde): number =>
  lireBase(m, (db) => {
    let n = 0;
    for (const t of db.prepare("select name from sqlite_master where type='table' and name like 'swn\\_catalogue\\_%' escape '\\' and name != 'swn_catalogue_retraits'").all())
      n += db.prepare(`select count(*) n from ${t.name} where systeme_id = 3 and univers_id is null`).get().n;
    return n;
  });

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
const reponseEcriture = (page: Any, chemin: string) =>
  page.waitForResponse((r: Any) => ['PUT', 'POST', 'PATCH'].includes(r.request().method()) && r.url().includes(chemin));

after(async () => {
  for (const b of browsers) await b.close().catch(() => {});
  for (const s of servers) s.stop();
});

test('B-63 · désactiver puis réactiver le concepteur ne supprime aucune ligne swn_* et rend les mêmes conceptions', opts, async () => {
  // would fail if disabling cascaded into the data
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  const avant = toutesLesLignes(m);
  assert.deepEqual(titresConceptions(m, ENEIRIA), ["Vent d'Orak", 'Étoile du soir'].sort());
  await ouvrirOutils(page, 'univers', ENEIRIA);
  const c = carte(page, 'Concepteur de vaisseaux');

  let rep = reponseEcriture(page, `/api/univers/${ENEIRIA}/outils`);
  await c.getByRole('radio', { name: 'Désactivé', exact: true }).click();
  assert.ok((await rep).ok());
  await page.getByRole('radio', { name: 'Désactivé', exact: true }).first().waitFor();
  assert.equal(toutesLesLignes(m), avant, 'disabled: every swn_* row is identical');
  const vue = await appel(m, 'antor', 'GET', `/api/univers/${ENEIRIA}/outils`);
  assert.equal(vue.json.outils.find((o: Any) => o.cle === 'swn/vaisseaux').effectif.active, false);

  // bord: the tool is disabled, the data are still there and still countable
  const r = await appel(m, 'antor', 'GET', resume('univers', ENEIRIA));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.efface.map((l: Any) => [l.cle, l.nombre]), [['conceptions', 2], ['catalogue', 2]]);
  await page.screenshot({ path: '/tmp/retrait-desactive.png' });

  rep = reponseEcriture(page, `/api/univers/${ENEIRIA}/outils`);
  await c.getByRole('radio', { name: 'Activé', exact: true }).click();
  assert.ok((await rep).ok());
  assert.equal(toutesLesLignes(m), avant, 're-enabled: every swn_* row is identical');
  assert.deepEqual(titresConceptions(m, ENEIRIA), ["Vent d'Orak", 'Étoile du soir'].sort());
  const vue2 = await appel(m, 'antor', 'GET', `/api/univers/${ENEIRIA}/outils`);
  assert.equal(vue2.json.outils.find((o: Any) => o.cle === 'swn/vaisseaux').effectif.active, true);
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
  const r404 = await appel(m, 'antor', 'GET', resume('univers', ENEIRIA, 'inconnu'));
  assert.equal(r404.status, 404);
  const sansDonnee = await appel(m, 'antor', 'GET', `/api/univers/${ENEIRIA}/outils/essai/a/suppression`);
  assert.equal(sansDonnee.status, 404);
});

test('E-20 · le niveau système désactivé par le responsable : Éneria perd le concepteur, Univers voisin (forcé) le garde', opts, async () => {
  // would fail if the system switch also turned off a universe that forced the tool
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'antor');
  const avant = toutesLesLignes(m);
  await ouvrirOutils(page, 'systeme', SYSTEME);
  const rep = reponseEcriture(page, `/api/systemes/${SYSTEME}/outils`);
  await carte(page, 'Concepteur de vaisseaux').getByRole('switch', { name: 'Activé' }).click();
  assert.ok((await rep).ok());
  await carte(page, 'Concepteur de vaisseaux').getByText('Système · Désactivé').waitFor();
  const eneria = (await appel(m, 'antor', 'GET', `/api/univers/${ENEIRIA}/outils`)).json.outils.find((o: Any) => o.cle === 'swn/vaisseaux');
  const voisin = (await appel(m, 'antor', 'GET', `/api/univers/${VOISIN}/outils`)).json.outils.find((o: Any) => o.cle === 'swn/vaisseaux');
  assert.equal(eneria.effectif.active, false);
  assert.equal(voisin.effectif.active, true);
  assert.equal(toutesLesLignes(m), avant, 'disabling at system level erases nothing');
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
  const avant = toutesLesLignes(m);
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
  assert.equal(toutesLesLignes(m), avant, 'Annuler erases nothing');

  await ouvrirDialogue(page, 'Concepteur de vaisseaux');
  const rep = reponseEcriture(page, resume('univers', ENEIRIA));
  await dialogue(page).getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  assert.ok((await rep).ok());
  await dialogue(page).getByText('Données supprimées : 2 conceptions, 2 éléments locaux de catalogue.').waitFor();
  await page.screenshot({ path: '/tmp/retrait-universe-fait.png' });

  assert.deepEqual(titresConceptions(m, ENEIRIA), []);
  assert.equal(total(lignesDeLUnivers(m, ENEIRIA)) > 0, true, 'the galaxy is another tool: it stays'); // 8 galaxy rows
  assert.deepEqual(titresConceptions(m, VOISIN), ['Sentinelle du voisin']);
  assert.equal(lignesCatalogueSysteme(m), 18, "the system's catalogue is not touched by a universe-level erase");
  const fiches = lireBase(m, (db) => db.prepare("select titre from fiches where univers_id = ? and type = 'vaisseau' order by titre").all(ENEIRIA).map((r: Any) => r.titre));
  assert.ok(fiches.includes("Vent d'Orak") && fiches.includes('Étoile du soir'), fiches.join('|'));

  // the card refreshes its counts, the activation is untouched
  await dialogue(page).getByRole('button', { name: 'Fermer' }).last().click();
  const c = carte(page, 'Concepteur de vaisseaux');
  await c.getByText(/Catalogue de l[’']univers · aucun catalogue importé/).waitFor();
  assert.ok(await c.getByRole('radio', { name: 'Suit le système (Activé)' }).isChecked());

  // the two ship sheets are still there, « Caractéristiques » as ordinary text, no banner
  const ficheId = lireBase(m, (db) => db.prepare("select id from fiches where titre = ?").get("Vent d'Orak").id);
  await page.goto(`/univers/${ENEIRIA}/fiche/${ficheId}`);
  await page.getByText('Caractéristiques').first().waitFor();
  assert.equal(await page.getByText(/Outil désactivé/).count(), 0);

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
  const rep0 = reponseEcriture(page, `/api/systemes/${SYSTEME}/outils`);
  await carte(page, 'Concepteur de vaisseaux').getByRole('switch', { name: 'Activé' }).click();
  await rep0;
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

  const rep = reponseEcriture(page, resume('systeme', SYSTEME));
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  assert.ok((await rep).ok());
  await d.getByText('Données supprimées : 18 éléments du catalogue du système.').waitFor();
  assert.equal(lignesCatalogueSysteme(m), 0);
  assert.deepEqual(titresConceptions(m, ENEIRIA), ["Vent d'Orak", 'Étoile du soir'].sort());
  assert.deepEqual(titresConceptions(m, VOISIN), ['Sentinelle du voisin']);
  const locaux = lireBase(m, (db) => db.prepare('select count(*) n from swn_catalogue_armes where univers_id = ?').get(ENEIRIA).n);
  assert.equal(locaux, 1, "« Lance d'essai » stays: the system level never erases a universe's element");
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
  const rep = reponseEcriture(page, resume('univers', ENEIRIA, 'galaxie'));
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  assert.ok((await rep).ok());
  await d.getByText(/Données supprimées/).waitFor();
  const l = lignesDeLUnivers(m, ENEIRIA);
  assert.deepEqual([l.swn_galaxies, l.swn_systemes, l.swn_routes, l.swn_zones], [0, 0, 0, 0]);
  assert.deepEqual(titresConceptions(m, ENEIRIA), ["Vent d'Orak", 'Étoile du soir'].sort());
  const cartes = await appel(m, 'antor', 'GET', `/api/univers/${ENEIRIA}/cartes`);
  assert.ok(!cartes.texte.includes("Galaxie d'essai"), cartes.texte);
  // system level: the galaxy tool has no data and no button
  await ouvrirOutils(page, 'systeme', SYSTEME);
  assert.equal(await carte(page, 'Galaxie').getByRole('button', { name: bouton }).count(), 0);
  assert.equal((await appel(m, 'antor', 'GET', resume('systeme', SYSTEME, 'galaxie'))).status, 404);
});

test('E-20 · Mira (non responsable) : ni bouton ni ligne au niveau système, 403 sans donnée, rien d\'effacé ; sur son univers elle les a', opts, async () => {
  // would fail if the button were merely disabled, or if the 403 leaked universe names or erased
  const m = await monde();
  const b = await navigateur();
  const { page } = await connecte(b, m.base, 'mira');
  const avant = toutesLesLignes(m);
  await page.goto(`/systemes/${SYSTEME}`);
  await page.getByRole('tab', { name: 'Outils' }).click();
  await carte(page, 'Concepteur de vaisseaux').waitFor();
  assert.equal(await page.getByRole('button', { name: bouton }).count(), 0);
  assert.equal(await page.getByText('Désactiver garde tout ; supprimer efface.').count(), 0);
  await page.screenshot({ path: '/tmp/retrait-mira-systeme.png' });
  const get = await appel(m, 'mira', 'GET', resume('systeme', SYSTEME));
  assert.equal(get.status, 403);
  assert.ok(!get.texte.includes('Univers voisin'), get.texte);
  assert.ok(!get.texte.includes('18'), get.texte);
  const post = await appel(m, 'mira', 'POST', resume('systeme', SYSTEME), { vu: [{ cle: 'catalogue', nombre: 18 }] });
  assert.equal(post.status, 403);
  assert.equal(toutesLesLignes(m), avant);
  await ouvrirOutils(page, 'univers', ENEIRIA);
  assert.equal(await carte(page, 'Concepteur de vaisseaux').getByRole('button', { name: bouton }).count(), 1);
});

test('E-20 · Léa (joueuse) reçoit « Page introuvable. » ; Antor en mode joueur est refusé ; rien n\'est effacé', opts, async () => {
  // would fail if a Player could read the summary or if Player mode did not drop the GM right
  const m = await monde();
  const b = await navigateur();
  const avant = toutesLesLignes(m);
  for (const [niveau, id] of [['univers', ENEIRIA], ['systeme', SYSTEME]] as const) {
    const g = await appel(m, 'lea', 'GET', resume(niveau, id));
    assert.equal(g.status, 404, niveau);
    assert.ok(g.texte.includes('Page introuvable.'));
    const p = await appel(m, 'lea', 'POST', resume(niveau, id), { vu: [] });
    assert.equal(p.status, 404, niveau);
  }
  const gj = await appel(m, 'antor', 'GET', resume('univers', ENEIRIA, 'vaisseaux', '?mode=joueur'));
  assert.equal(gj.status, 403);
  const pj = await appel(m, 'antor', 'POST', resume('univers', ENEIRIA, 'vaisseaux', '?mode=joueur'), { vu: [{ cle: 'conceptions', nombre: 2 }, { cle: 'catalogue', nombre: 2 }] });
  assert.equal(pj.status, 403);
  const teo = await appel(m, 'teo', 'GET', resume('univers', ENEIRIA));
  assert.equal(teo.status, 404);
  assert.equal(toutesLesLignes(m), avant);
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

  const f = await appel(m, 'mira', 'POST', `/api/univers/${ENEIRIA}/fiches`, { type: 'vaisseau', titre: 'Nouveau' });
  assert.equal(f.status, 201, f.texte);
  const c = await appel(m, 'mira', 'POST', `/api/univers/${ENEIRIA}/outils/swn/vaisseaux/conceptions`, { ficheId: f.json.id, coque: 'fregate' });
  assert.equal(c.status, 201, c.texte);

  const avant = toutesLesLignes(m);
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  await d.getByText('Les données ont changé depuis que vous avez ouvert cette fenêtre.').waitFor();
  await d.getByText(/3 conceptions/).waitFor();
  await page.screenshot({ path: '/tmp/retrait-change.png' });
  assert.equal(toutesLesLignes(m), avant, 'nothing erased');
  assert.equal(titresConceptions(m, ENEIRIA).length, 3);

  await d.getByRole('button', { name: 'Recharger' }).click();
  await d.getByText('3 conceptions, 2 éléments locaux de catalogue seront effacés.').waitFor();
  assert.equal(titresConceptions(m, ENEIRIA).length, 3, 'Recharger erases nothing');
  const rep = reponseEcriture(page, resume('univers', ENEIRIA));
  await d.getByRole('button', { name: 'Supprimer les données', exact: true }).click();
  assert.ok((await rep).ok());
  await d.getByText('Données supprimées : 3 conceptions, 2 éléments locaux de catalogue.').waitFor();
  assert.equal(titresConceptions(m, ENEIRIA).length, 0);
});

test('E-20 · la requête de suppression sur un décompte périmé est refusée 409 contenu_change et n\'efface rien', opts, async () => {
  // would fail if the server trusted the client's `vu` without recounting
  const m = await monde();
  const avant = toutesLesLignes(m);
  const r = await appel(m, 'antor', 'POST', resume('univers', ENEIRIA), { vu: [{ cle: 'conceptions', nombre: 1 }, { cle: 'catalogue', nombre: 2 }] });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'contenu_change');
  assert.equal(toutesLesLignes(m), avant);
  const ok = await appel(m, 'antor', 'POST', resume('univers', ENEIRIA), { vu: [{ cle: 'conceptions', nombre: 2 }, { cle: 'catalogue', nombre: 2 }] });
  assert.ok(ok.status >= 200 && ok.status < 300, ok.texte);
  assert.deepEqual(titresConceptions(m, ENEIRIA), []);
});

test('E-20 · erreur 5xx : « L\'action n\'a pas abouti. Rien n\'est supprimé. » + Réessayer ; coupure : bandeau et bouton désactivé', opts, async () => {
  // would fail if a failed read left an active destructive button, or if a failed delete erased
  const m = await monde();
  const b = await navigateur();
  const { ctx, page } = await connecte(b, m.base, 'antor');
  const avant = toutesLesLignes(m);
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
  assert.equal(toutesLesLignes(m), avant);
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

test('AD-135 · supprimer l\'univers « Éneria d\'essai » ne laisse aucune ligne swn_* pour lui ; un mauvais nom n\'efface rien ; Univers voisin intact', opts, async () => {
  // would fail if the universe deletion left tool rows behind (or crashed on the module rows' references)
  const m = await monde();
  assert.ok(total(lignesDeLUnivers(m, ENEIRIA)) > 0);
  const avant = toutesLesLignes(m);
  const mauvais = await appel(m, 'antor', 'DELETE', `/api/univers/${ENEIRIA}`, { nom: 'Autre' });
  assert.equal(mauvais.status, 400);
  assert.equal(toutesLesLignes(m), avant);
  const ok = await appel(m, 'antor', 'DELETE', `/api/univers/${ENEIRIA}`, { nom: "Éneria d'essai" });
  assert.equal(ok.status, 204, ok.texte);
  const reste = lignesDeLUnivers(m, ENEIRIA);
  assert.equal(total(reste), 0, JSON.stringify(reste));
  assert.deepEqual(titresConceptions(m, VOISIN), ['Sentinelle du voisin']);
  assert.equal(lignesCatalogueSysteme(m), 18, "the system's catalogue outlives the universe");
});
