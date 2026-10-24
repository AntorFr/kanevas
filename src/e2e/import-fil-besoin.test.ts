// Black-box tests of kanevas-import-fil, written from the need (docs/parcours.md B-45 to B-50, P-10, P-11;
// docs/ecrans.md E-18 and the « Importée » line of E-9; the feature's critère de sortie), not from the code.
// The real app runs in this process in stub mode on an in-memory SQLite (so the test can move the server
// clock, `app.horloge`, as the critère asks) and is driven over HTTP and by a real Chromium (Playwright).
// Captures go to $IMPORT_FIL_CAPTURES (default /tmp/import-fil-captures), outside the tree.
//
// TEST PLAN (need → cases; every expectation is a literal written from the docs)
//   B-45 jeton      nominal   : Antor creates « Script Kanka — Mac » on E-18, 30 days: shown once, Échap does not close,
//                               then the line says « jamais » and « expire le 11 nov. 2026 », the value is nowhere
//                               bords     : empty name refused on screen; durations 7 d / 1 an on screen; 81-char name,
//                               0 and 366 days refused by the service
//                               exclusion : token useless in another universe (404), on session routes, cookie useless on the import API;
//                               Léa: « Page introuvable. » and no sidebar item
//   B-46 refus      nominal   : revoke on screen (confirmation) → « Révoqué », next call 401, no batch
//                               bords     : 6 d 23 h valid, 7 d 1 h expired (« Expiré »); no / unknown / malformed token → the same 401
//                               échec     : MJ demoted → 401 + « Inactif »; another MJ revokes
//   B-47 idempotence nominal  : creee, then inchangee, one sheet; every one of the six types; changed content → mise_a_jour
//                               échec     : compte_rendu without campaign → 400 champ campagne, unknown type → 400 champ type, nothing written; bad title / key → 400
//   B-48 protection nominal   : section title, section content, section audience, sheet title changed in Kanevas → not overwritten
//                               and named in the batch; the rest is written
//   B-49 lots       nominal   : two batches on E-18, counters per nature, refusals unfolded with key and reason
//                               bords     : empty states, « En cours », « Abandonné »
//   B-50 clé        nominal   : « ⋯ » menu of E-9 « Importée · clé lieu:port-sel · créée le 3 mars 2021 »
//                               exclusion : Léa never receives the key; a sheet made in Kanevas has no such line
//   P-10 / critère  : the whole sequence of the critère de sortie, Léa reads « Description » and nothing of « Vérité »
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, rx, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

const opts = { skip: skipBrowser };
const CAP = process.env.IMPORT_FIL_CAPTURES ?? '/tmp/import-fil-captures';
const T0 = Date.parse('2026-10-12T10:00:00Z');
const JOUR = 86400_000;
const SECRET = 'sous-main de la Guilde';
const TOKEN_RE = /kvs_[A-Za-z0-9_-]{43}/;

let browser: Any;
before(async () => {
  mkdirSync(CAP, { recursive: true });
  if (!skipBrowser) browser = await launch();
});
// A failing test must not leave its server listening: every world is closed here.
const ouverts: Array<{ close: () => Promise<unknown> }> = [];
after(async () => {
  await browser?.close();
  for (const a of ouverts) await a.close().catch(() => {});
});

interface Monde {
  app: Awaited<ReturnType<typeof buildApp>>;
  base: string;
  essai: number;
  maintenant: () => number;
  regler: (t: number) => void;
}

async function monde(): Promise<Monde> {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the stub world is seeded');
  let t = T0;
  app.horloge = () => new Date(t);
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as { port: number };
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  return { app, base: `http://127.0.0.1:${addr.port}`, essai, maintenant: () => t, regler: (v) => (t = v) };
}

async function cookieDe(m: Monde, compte: string): Promise<string> {
  const r = await fetch(`${m.base}/connexion-bouchon`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `compte=${compte}`,
  });
  const c = /kanevas_session=[^;]+/.exec(r.headers.get('set-cookie') ?? '');
  assert.ok(c, 'session cookie');
  return c[0];
}

/** A call of the import API with a Bearer token (and an optional JSON body). */
async function imp(m: Monde, jeton: string | null, methode: string, chemin: string, corps?: unknown, univers = m.essai) {
  const headers: Record<string, string> = {};
  if (jeton !== null) headers.authorization = `Bearer ${jeton}`;
  if (corps !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${m.base}/api/import/v1/univers/${univers}${chemin}`, {
    method: methode,
    headers,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const txt = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(txt);
  } catch {
    /* not JSON */
  }
  return { statut: r.status, json, txt };
}

/** A call of the session API, as a stub account. */
async function rest(m: Monde, cookie: string, methode: string, chemin: string, corps?: unknown) {
  const headers: Record<string, string> = { cookie };
  if (corps !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${m.base}${chemin}`, { method: methode, headers, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const txt = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(txt);
  } catch {
    /* not JSON */
  }
  return { statut: r.status, json, txt };
}

/** A token made by the service, for tests that are not about the screen. */
async function jetonPar(m: Monde, compte: string, nom = 'Script Kanka — Mac', dureeJours = 30): Promise<string> {
  const c = await cookieDe(m, compte);
  const r = await rest(m, c, 'POST', `/api/univers/${m.essai}/jetons`, { nom, dureeJours });
  assert.equal(r.statut, 201, r.txt);
  return r.json.valeur;
}

const PORT_SEL = {
  type: 'lieu',
  titre: 'Port-Sel',
  creeLe: '2021-03-03T12:00:00Z',
  sections: [
    { cle: 'description', titre: 'Description', contenu: 'Un port de sel gris sous les brumes.', joueursLisent: true, joueursEcrivent: false },
    { cle: 'verite', titre: 'Vérité', contenu: `Le phare cache un ${SECRET}.`, joueursLisent: false, joueursEcrivent: false },
  ],
};
const CLE_PS = encodeURIComponent('lieu:port-sel');

async function ouvrirLot(m: Monde, jeton: string): Promise<number> {
  const r = await imp(m, jeton, 'POST', '/lots');
  assert.equal(r.statut, 201, r.txt);
  return r.json.lotId;
}
async function pousser(m: Monde, jeton: string, cle: string, corps: unknown, lot?: number) {
  return imp(m, jeton, 'PUT', `/fiches/${encodeURIComponent(cle)}${lot === undefined ? '' : `?lot=${lot}`}`, corps);
}
/** One whole batch: open, push, close. Returns the PUT answers and the closing report. */
async function lotComplet(m: Monde, jeton: string, fiches: [string, unknown][]) {
  const lot = await ouvrirLot(m, jeton);
  const reps = [];
  for (const [cle, corps] of fiches) reps.push(await pousser(m, jeton, cle, corps, lot));
  const clos = await imp(m, jeton, 'POST', `/lots/${lot}/clore`);
  assert.equal(clos.statut, 200, clos.txt);
  return { lot, reps, rapport: clos.json };
}

/** A browser context signed in as a stub account, its clock fixed on the server's. */
async function session(m: Monde, compte: string): Promise<{ ctx: Any; page: Any; reponses: string[] }> {
  const ctx = await browser.newContext({ baseURL: m.base, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.clock.setFixedTime(new Date(m.maintenant()));
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const reponses: string[] = [];
  page.on('response', async (r: Any) => {
    try {
      if (r.url().includes('/api/')) reponses.push(`${r.url()}\n${await r.text()}`);
    } catch {
      /* body gone */
    }
  });
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte === 'lea' ? 'Léa' : compte}$`, 'i') }).click();
  await attendre(page);
  return { ctx, page, reponses };
}

const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/’/g, "'");
async function lire(page: Any): Promise<string> {
  return norm(await page.locator('body').innerText());
}
async function allerE18(page: Any, m: Monde): Promise<void> {
  await page.goto(`/univers/${m.essai}/acces-api`);
  await attendre(page);
}
async function capture(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${CAP}/${nom}.png`, fullPage: true });
}

/** Creates a token on E-18 as the signed-in GM; returns its value (read in the box), box closed. */
async function creerJetonEcran(page: Any, m: Monde, nom: string, duree?: string): Promise<string> {
  await allerE18(page, m);
  await page.getByRole('button', { name: /Nouveau jeton/ }).first().click();
  const boite = page.getByRole('dialog');
  await boite.getByLabel('Nom').fill(nom);
  if (duree) await boite.getByText(duree, { exact: true }).click();
  await boite.getByRole('button', { name: 'Créer le jeton' }).click();
  await boite.getByText(rx("Il ne sera plus jamais affiché.")).waitFor();
  const valeur: string = await boite.evaluate((el: Element) => {
    const champs = Array.from(el.querySelectorAll('input,textarea')).map((i) => (i as HTMLInputElement).value);
    return ((el.textContent ?? '') + ' ' + champs.join(' ')).match(/kvs_[A-Za-z0-9_-]{43}/)?.[0] ?? '';
  });
  assert.match(valeur, TOKEN_RE);
  await boite.getByRole('button', { name: rx("J'ai copié le jeton") }).click();
  await boite.waitFor({ state: 'detached' });
  await attendre(page);
  return valeur;
}

function ligne(page: Any, nom: string): Any {
  return page.locator('li, tr').filter({ hasText: nom }).first();
}
async function ouvrirFiche(page: Any, m: Monde, id: number): Promise<void> {
  await page.goto(`/univers/${m.essai}/fiche/${id}`);
  await attendre(page);
}

// ---------------------------------------------------------------- B-45

test('B-45 · Antor crée le jeton sur E-18 : montré une fois, puis nom, « jamais » et l’expiration à 30 jours, la valeur nulle part', opts, async () => {
  const m = await monde();
  const { ctx, page, reponses } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    await page.getByRole('button', { name: /Nouveau jeton/ }).first().click();
    const boite = page.getByRole('dialog');
    await boite.getByLabel('Nom').fill('Script Kanka — Mac');
    await boite.getByRole('button', { name: 'Créer le jeton' }).click();
    await boite.getByText(rx('Il ne sera plus jamais affiché.')).waitFor();
    await capture(page, 'b45-jeton-montre');
    const texteBoite = norm(await boite.innerText());
    assert.match(texteBoite, /Rangez-le dans la configuration de votre script/);
    const valeur: string = await boite.evaluate((el: Element) =>
      ((el.textContent ?? '') + ' ' + Array.from(el.querySelectorAll('input,textarea')).map((i) => (i as HTMLInputElement).value).join(' ')).match(/kvs_[A-Za-z0-9_-]{43}/)?.[0] ?? '');
    assert.match(valeur, TOKEN_RE, 'the token is shown in the box');
    // Only the button closes the box while the token is shown.
    await page.keyboard.press('Escape');
    assert.equal(await boite.isVisible(), true, 'Échap does not close the box');
    await boite.getByRole('button', { name: rx("J'ai copié le jeton") }).click();
    await boite.waitFor({ state: 'detached' });
    await attendre(page);
    await capture(page, 'b45-liste-apres');
    const t = await lire(page);
    assert.match(t, /Script Kanka — Mac/);
    assert.match(t, /jamais/);
    assert.match(t, /expire le 11 nov\. 2026/);
    assert.ok(!t.includes(valeur), 'the value is no longer on screen');
    await page.reload();
    await attendre(page);
    assert.ok(!(await lire(page)).includes(valeur), 'nor after a reload');
    // …nor in any answer of the API, the listing included.
    const liste = await rest(m, await cookieDe(m, 'antor'), 'GET', `/api/univers/${m.essai}/jetons`);
    assert.ok(!liste.txt.includes(valeur), 'the listing never carries the value');
    assert.ok(!reponses.slice(reponses.findIndex((r) => r.includes(valeur)) + 1).some((r) => r.includes(valeur)), 'no later answer carries it');
    // And it works.
    assert.equal((await imp(m, valeur, 'GET', '')).statut, 200);
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-45 bords · la durée par défaut est 30 jours, 7 jours et 1 an se choisissent, un nom vide est refusé', opts, async () => {
  const m = await monde();
  const { ctx, page } = await session(m, 'antor');
  try {
    await creerJetonEcran(page, m, 'Court', '7 jours');
    await creerJetonEcran(page, m, 'Long', '1 an');
    await allerE18(page, m);
    const t = await lire(page);
    assert.match(norm(await ligne(page, 'Court').innerText()), /expire le 19 oct\. 2026/);
    assert.match(norm(await ligne(page, 'Long').innerText()), /expire le 12 oct\. 2027/);
    assert.ok(t.includes('Jeton du bouchon'));
    // Empty name.
    await page.getByRole('button', { name: /Nouveau jeton/ }).first().click();
    const boite = page.getByRole('dialog');
    await boite.getByRole('button', { name: 'Créer le jeton' }).click();
    await boite.getByText(rx('Erreur : le nom est obligatoire.')).waitFor();
    await capture(page, 'b45-nom-vide');
    assert.ok(!TOKEN_RE.test(norm(await boite.innerText())), 'no token shown');
    const jetons = await rest(m, await cookieDe(m, 'antor'), 'GET', `/api/univers/${m.essai}/jetons`);
    assert.equal(jetons.json.length, 3, 'bouchon + Court + Long, nothing half-created');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-45 bords · le service refuse un nom de 81 caractères, 0 jour et plus d’un an ; accepte 80 caractères et 365 jours', async () => {
  const m = await monde();
  const c = await cookieDe(m, 'antor');
  const cree = (nom: string, dureeJours: number) => rest(m, c, 'POST', `/api/univers/${m.essai}/jetons`, { nom, dureeJours });
  assert.equal((await cree('a'.repeat(80), 30)).statut, 201);
  assert.equal((await cree('a'.repeat(81), 30)).statut, 400);
  assert.equal((await cree('', 30)).statut, 400);
  assert.equal((await cree('x', 0)).statut, 400);
  assert.equal((await cree('x', 366)).statut, 400);
  assert.equal((await cree('x', 365)).statut, 201);
  await m.app.close();
});

test('B-45 exclusions · le jeton n’agit pas dans un autre univers, ni sur les routes de session ; le cookie n’ouvre pas l’API d’import', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const lame = (m.app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Lame d'Ébène") as { id: number }).id;
  assert.equal((await imp(m, jeton, 'GET', '', undefined, lame)).statut, 404, 'another universe');
  assert.equal((await imp(m, jeton, 'POST', '/lots', undefined, lame)).statut, 404);
  assert.equal((await pousser({ ...m, essai: lame } as Monde, jeton, 'lieu:x', PORT_SEL)).statut, 404);
  const surSession = await fetch(`${m.base}/api/univers/${m.essai}/fiches`, { headers: { authorization: `Bearer ${jeton}` }, redirect: 'manual' });
  assert.notEqual(surSession.status, 200, 'a Bearer token opens no session route');
  const cookie = await cookieDe(m, 'antor');
  const r = await fetch(`${m.base}/api/import/v1/univers/${m.essai}`, { headers: { cookie } });
  assert.equal(r.status, 401, 'the cookie is ignored by the import scope');
  assert.deepEqual(await r.json(), { message: 'Jeton invalide.', code: 'jeton_invalide' });
  const lotsLame = await rest(m, cookie, 'GET', `/api/univers/${lame}/lots`);
  assert.deepEqual(lotsLame.json, [], 'nothing opened in the other universe');
  await m.app.close();
});

test('B-45 / P-11 refus · Léa (Joueuse) lit « Page introuvable. » sur E-18 et n’a pas l’item ; Antor l’a sous « Univers »', opts, async () => {
  const m = await monde();
  const lea = await session(m, 'lea');
  const antor = await session(m, 'antor');
  try {
    await lea.page.goto(`/univers/${m.essai}`);
    await attendre(lea.page);
    const barre = lea.page.getByRole('complementary', { name: 'Barre latérale' });
    assert.equal(await barre.getByRole('link', { name: 'Accès par API' }).count(), 0, 'no item for a player');
    await allerE18(lea.page, m);
    assert.match(await lire(lea.page), /Page introuvable\./);
    assert.ok(!(await lire(lea.page)).includes('Nouveau jeton'));
    await capture(lea.page, 'p11-lea-introuvable');
    const jetons = await rest(m, await cookieDe(m, 'lea'), 'GET', `/api/univers/${m.essai}/jetons`);
    assert.notEqual(jetons.statut, 200, 'a player lists no token');
    const cree = await rest(m, await cookieDe(m, 'lea'), 'POST', `/api/univers/${m.essai}/jetons`, { nom: 'x', dureeJours: 30 });
    assert.notEqual(cree.statut, 201, 'a player creates no token');
    assert.ok(!TOKEN_RE.test(cree.txt));
    assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM jetons_api').get() as { n: number }).n, 1, 'only the seeded stub token exists');
    await antor.page.goto(`/univers/${m.essai}`);
    await attendre(antor.page);
    await antor.page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Accès par API' }).click();
    await attendre(antor.page);
    await antor.page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
    const t = await lire(antor.page);
    assert.match(t, /Un jeton permet à un script d'écrire dans cet univers avec vos droits, par l'API d'import\./);
    assert.ok(t.includes(`/api/import/v1/univers/${m.essai}`), 'the base address');
  } finally {
    await lea.ctx.close();
    await antor.ctx.close();
    await m.app.close();
  }
});

// ---------------------------------------------------------------- B-46

test('B-46 · révoquer sur E-18 (confirmation, « Révoqué »), puis l’appel reçoit 401 et aucun lot n’apparaît', opts, async () => {
  const m = await monde();
  const { ctx, page } = await session(m, 'antor');
  try {
    const jeton = await creerJetonEcran(page, m, 'Script Kanka — Mac');
    assert.equal((await imp(m, jeton, 'GET', '')).statut, 200);
    await allerE18(page, m);
    await ligne(page, 'Script Kanka — Mac').getByRole('button', { name: /Révoquer/ }).click();
    const boite = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await boite.waitFor();
    assert.match(norm(await boite.innerText()), /Révoquer « Script Kanka — Mac » \?\s+Le script qui l'utilise ne pourra plus rien écrire\./);
    await capture(page, 'b46-confirmation');
    await boite.getByRole('button', { name: 'Révoquer le jeton' }).click();
    await page.getByText(rx('Jeton révoqué.')).first().waitFor();
    await attendre(page);
    // The toast shows before the list is reloaded: wait for the badge instead of reading the row once.
    await ligne(page, 'Script Kanka — Mac').getByText('Révoqué', { exact: true }).waitFor();
    assert.match(norm(await ligne(page, 'Script Kanka — Mac').innerText()), /Révoqué/);
    const r = await imp(m, jeton, 'POST', '/lots');
    assert.equal(r.statut, 401);
    assert.deepEqual(r.json, { message: 'Jeton invalide.', code: 'jeton_invalide' });
    assert.equal((await pousser(m, jeton, 'lieu:port-sel', PORT_SEL)).statut, 401);
    await allerE18(page, m);
    assert.match(await lire(page), /Aucun lot d'import pour l'instant\./);
    const fiches = await rest(m, await cookieDe(m, 'antor'), 'GET', `/api/univers/${m.essai}/fiches?type=lieu`);
    assert.ok(!fiches.txt.includes('Port-Sel'), 'nothing written');
    await capture(page, 'b46-revoque');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-46 bords · un jeton de 7 jours vaut à 6 j 23 h, reçoit 401 à 7 j 1 h, et la ligne dit « Expiré »', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor', 'Court', 7);
  m.regler(T0 + 6 * JOUR + 23 * 3600_000);
  assert.equal((await imp(m, jeton, 'GET', '')).statut, 200);
  m.regler(T0 + 7 * JOUR + 3600_000);
  const r = await imp(m, jeton, 'POST', '/lots');
  assert.equal(r.statut, 401);
  assert.equal((await pousser(m, jeton, 'lieu:port-sel', PORT_SEL)).statut, 401);
  const { ctx, page } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    assert.match(norm(await ligne(page, 'Court').innerText()), /Expiré/);
    assert.match(await lire(page), /Aucun lot d'import pour l'instant\./, 'a refusal opens no batch');
    await capture(page, 'b46-expire');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-46 échec · jeton absent, inconnu ou mal formé : toujours le même 401, rien n’est écrit, aucun lot', async () => {
  const m = await monde();
  const UNIQUE = { message: 'Jeton invalide.', code: 'jeton_invalide' };
  for (const jeton of [null, 'kvs_inconnu', '', 'x'.repeat(300)]) {
    for (const [methode, chemin, corps] of [
      ['GET', '', undefined],
      ['POST', '/lots', undefined],
      ['PUT', `/fiches/${CLE_PS}`, PORT_SEL],
    ] as [string, string, unknown][]) {
      const r = await imp(m, jeton, methode, chemin, corps);
      assert.equal(r.statut, 401, `${methode} ${chemin} with ${jeton}`);
      assert.deepEqual(r.json, UNIQUE);
    }
  }
  const mal = await fetch(`${m.base}/api/import/v1/univers/${m.essai}`, { headers: { authorization: 'Basic abcdef' } });
  assert.equal(mal.status, 401);
  const c = await cookieDe(m, 'antor');
  assert.deepEqual((await rest(m, c, 'GET', `/api/univers/${m.essai}/lots`)).json, []);
  assert.ok(!(await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches?type=lieu`)).txt.includes('Port-Sel'));
  await m.app.close();
});

test('B-46 échec · Mira, ajoutée MJ puis passée Joueuse par Antor : son jeton reçoit 401, la ligne dit « Inactif », celui d’Antor vaut encore', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const mira = await session(m, 'mira');
  try {
    const jetonAntor = await creerJetonEcran(antor.page, m, 'Script Kanka — Mac');
    await antor.page.goto(`/univers/${m.essai}/membres`);
    await attendre(antor.page);
    await antor.page.getByLabel('Identifiant du compte').fill('mira');
    await antor.page.getByLabel('Rôle', { exact: true }).selectOption({ label: 'MJ' });
    await antor.page.getByRole('button', { name: /^Ajouter$/ }).click();
    await attendre(antor.page);
    const jetonMira = await creerJetonEcran(mira.page, m, 'Jeton de Mira');
    assert.equal((await imp(m, jetonMira, 'GET', '')).statut, 200, 'while she is GM');
    // Arm the wait for the role change's response before the gesture: the API call below must see it saved.
    const roleEnregistre = antor.page.waitForResponse((r: Any) => r.request().method() === 'PATCH' && r.url().includes('/membres/'));
    await antor.page.getByLabel('Rôle de mira').selectOption({ label: 'Joueur' });
    assert.equal((await roleEnregistre).status(), 200);
    await attendre(antor.page);
    const r = await imp(m, jetonMira, 'POST', '/lots');
    assert.equal(r.statut, 401);
    assert.deepEqual(r.json, { message: 'Jeton invalide.', code: 'jeton_invalide' });
    assert.equal((await pousser(m, jetonMira, 'lieu:port-sel', PORT_SEL)).statut, 401);
    assert.equal((await imp(m, jetonAntor, 'GET', '')).statut, 200, 'Antor’s token is untouched');
    await allerE18(antor.page, m);
    assert.match(norm(await ligne(antor.page, 'Jeton de Mira').innerText()), /Inactif/);
    assert.match(await lire(antor.page), /Aucun lot d'import pour l'instant\./);
    await capture(antor.page, 'b46-inactif');
    await allerE18(mira.page, m);
    assert.match(await lire(mira.page), /Page introuvable\./, 'Mira, now a player, no longer sees E-18');
  } finally {
    await antor.ctx.close();
    await mira.ctx.close();
    await m.app.close();
  }
});

test('B-46 · un autre MJ voit le jeton d’Antor, le révoque, et Antor reçoit 401 ; le dernier usage n’est plus « jamais »', opts, async () => {
  const m = await monde();
  const cAntor = await cookieDe(m, 'antor');
  const r = await rest(m, cAntor, 'POST', `/api/univers/${m.essai}/membres`, { username: 'mira', role: 'mj' });
  assert.equal(r.statut, 201, r.txt);
  const jeton = await jetonPar(m, 'antor', 'Script Kanka — Mac');
  assert.equal((await imp(m, jeton, 'GET', '')).statut, 200);
  const mira = await session(m, 'mira');
  try {
    await allerE18(mira.page, m);
    const l = ligne(mira.page, 'Script Kanka — Mac');
    const txt = norm(await l.innerText());
    assert.match(txt, /antor/);
    assert.ok(!/dernier usage\s*:?\s*jamais/i.test(txt) && !/jamais/.test(txt), `used once: ${txt}`);
    await l.getByRole('button', { name: /Révoquer/ }).click();
    await mira.page.getByRole('button', { name: 'Révoquer le jeton' }).click();
    await mira.page.getByText(rx('Jeton révoqué.')).first().waitFor();
    assert.equal((await imp(m, jeton, 'GET', '')).statut, 401);
  } finally {
    await mira.ctx.close();
    await m.app.close();
  }
});

// ---------------------------------------------------------------- B-47

test('B-47 · Port-Sel : creee, rejoué inchangee, une seule fiche, avec ses deux sections', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const a = await pousser(m, jeton, 'lieu:port-sel', PORT_SEL);
  assert.equal(a.statut, 200, a.txt);
  assert.equal(a.json.etat, 'creee');
  const b = await pousser(m, jeton, 'lieu:port-sel', PORT_SEL);
  assert.equal(b.statut, 200);
  assert.equal(b.json.etat, 'inchangee');
  assert.equal(b.json.id, a.json.id, 'same sheet');
  const c = await cookieDe(m, 'antor');
  const liste = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches?type=lieu`);
  assert.equal(liste.txt.split('Port-Sel').length - 1, 1, 'exactly one Port-Sel');
  const fiche = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${a.json.id}`);
  assert.equal(fiche.json.titre ?? fiche.json.fiche?.titre, 'Port-Sel');
  assert.ok(fiche.txt.includes('Description') && fiche.txt.includes('Vérité'));
  await m.app.close();
});

test('B-47 · les six types existants sont créés puis rejoués sans doublon', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const c = await cookieDe(m, 'antor');
  for (const [type, titre] of [
    ['personnage', 'Aldric le Gris'],
    ['lieu', 'Port-Sel'],
    ['faction', 'Guilde des Brumes'],
    ['objet', 'Sceptre de sel'],
    ['evenement', 'La Grande Marée'],
    ['quete', 'Retrouver le phare'],
  ]) {
    const corps = { type, titre, sections: [{ cle: 's', titre: 'Notes', contenu: 'x', joueursLisent: true, joueursEcrivent: false }] };
    assert.equal((await pousser(m, jeton, `${type}:k`, corps)).json.etat, 'creee', type);
    assert.equal((await pousser(m, jeton, `${type}:k`, corps)).json.etat, 'inchangee', type);
    const liste = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches?type=${type}`);
    assert.equal(liste.txt.split(titre).length - 1, 1, `${type}: one sheet «${titre}»`);
  }
  await m.app.close();
});

test('B-47 · le script change un contenu : mise_a_jour, le texte change, rejeu inchangee', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  await pousser(m, jeton, 'lieu:port-sel', PORT_SEL);
  const v2 = structuredClone(PORT_SEL);
  v2.sections[0]!.contenu = 'Un port de sel blanc, désormais.';
  const r = await pousser(m, jeton, 'lieu:port-sel', v2);
  assert.equal(r.json.etat, 'mise_a_jour');
  const c = await cookieDe(m, 'antor');
  const fiche = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${r.json.id}`);
  assert.ok(fiche.txt.includes('Un port de sel blanc, désormais.'));
  assert.ok(!fiche.txt.includes('Un port de sel gris'));
  assert.equal((await pousser(m, jeton, 'lieu:port-sel', v2)).json.etat, 'inchangee');
  await m.app.close();
});

test('B-47 échec · un compte_rendu sans campagne reçoit 400 (champ campagne), un type inconnu 400 (champ type), et rien n’est écrit', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const c = await cookieDe(m, 'antor');
  const avant = (await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches`)).txt;
  for (const [cle, type] of [['cr:seance-1', 'compte_rendu'], ['monstre:k', 'monstre']]) {
    const r = await pousser(m, jeton, cle, { type, titre: 'Séance 1', sections: [] });
    assert.equal(r.statut, 400, `${type}: ${r.txt}`);
    assert.equal(r.json.champ, type === 'compte_rendu' ? 'campagne' : 'type');
    assert.equal(r.json.code, 'invalide');
  }
  assert.equal((await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches`)).txt, avant, 'nothing written');
  assert.equal((await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches?q=${encodeURIComponent('Séance 1')}`)).txt.includes('Séance 1'), false);
  await m.app.close();
});

test('B-47 échec · titre vide ou trop long, clé vide, trop longue ou avec « | » : 400 et rien d’écrit', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const c = await cookieDe(m, 'antor');
  const avant = (await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches`)).txt;
  const r1 = await pousser(m, jeton, 'lieu:x', { ...PORT_SEL, titre: '' });
  assert.equal(r1.statut, 400);
  assert.equal(r1.json.champ, 'titre');
  assert.equal((await pousser(m, jeton, 'lieu:x', { ...PORT_SEL, titre: 'T'.repeat(121) })).statut, 400, '121 characters');
  assert.equal((await pousser(m, jeton, 'lieu|x', PORT_SEL)).statut, 400, 'key with |');
  assert.equal((await pousser(m, jeton, 'lieu]x', PORT_SEL)).statut, 400, 'key with ]');
  assert.equal((await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches`)).txt, avant, 'nothing written');
  assert.equal((await pousser(m, jeton, 'lieu:x', { ...PORT_SEL, titre: 'T'.repeat(120) })).json.etat, 'creee', 'a title of 120 characters passes');
  await m.app.close();
});

test('B-47 bords · une clé d’origine de 1, 100, 150 et 200 caractères est acceptée, une de 201 reçoit 400', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  for (const n of [1, 100, 150, 200]) {
    const r = await pousser(m, jeton, 'k'.repeat(n), { ...PORT_SEL, titre: `Clé de ${n}` });
    assert.equal(r.statut, 200, `key of ${n} characters: ${r.txt.slice(0, 120)}`);
    assert.equal(r.json.etat, 'creee');
  }
  const trop = await pousser(m, jeton, 'k'.repeat(201), PORT_SEL);
  assert.equal(trop.statut, 400, `key of 201 characters: ${trop.txt.slice(0, 120)}`);
  await m.app.close();
});

test('B-47 · lots : ouvrir deux fois rend le même lot ouvert, le lire, le clore rend le rapport', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const a = await ouvrirLot(m, jeton);
  const b = await imp(m, jeton, 'POST', '/lots');
  assert.equal(b.json.lotId, a, 'same open batch for the same token');
  await pousser(m, jeton, 'lieu:port-sel', PORT_SEL, a);
  const clos = await imp(m, jeton, 'POST', `/lots/${a}/clore`);
  assert.equal(clos.statut, 200);
  assert.equal(clos.json.compteurs.fiches.creees, 1);
  assert.equal(clos.json.compteurs.fiches.inchangees, 0);
  assert.equal((await imp(m, jeton, 'GET', `/lots/${a}`)).statut, 200);
  assert.equal((await imp(m, jeton, 'GET', '/lots/99999')).statut, 404);
  await m.app.close();
});

// ---------------------------------------------------------------- B-48

async function sectionsDe(m: Monde, cookie: string, fid: number) {
  const f = await rest(m, cookie, 'GET', `/api/univers/${m.essai}/fiches/${fid}`);
  return f.json;
}

test('B-48 · Antor renomme la section « Description » puis le script rejoue : le titre n’est pas écrasé et le lot le dit', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const c = await cookieDe(m, 'antor');
  const un = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json.id;
  const fiche = await sectionsDe(m, c, fid);
  const sid = JSON.stringify(fiche).match(/"id":(\d+),"titre":"Description"/)?.[1] ?? JSON.stringify(fiche).match(/"titre":"Description"[^}]*?"id":(\d+)/)?.[1];
  assert.ok(sid, `section id found in ${JSON.stringify(fiche).slice(0, 300)}`);
  const ren = await rest(m, c, 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${sid}`, { titre: 'Aspect du port' });
  assert.equal(ren.statut, 200, ren.txt);
  const deux = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  assert.match((deux.reps[0]!.json.etat as string), /inchangee|mise_a_jour/);
  const apres = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${fid}`);
  assert.ok(apres.txt.includes('Aspect du port'), 'Antor’s title stays');
  assert.ok(!apres.txt.includes('"titre":"Description"'), 'the import did not put « Description » back');
  const rapport = JSON.stringify(deux.rapport);
  assert.match(rapport, /lieu:port-sel/);
  assert.match(rapport, /titre modifié dans Kanevas : non écrasé/);
  assert.match(rapport, /section « Aspect du port »|section « Description »/);
  const { ctx, page } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    await page.getByText(rx('Fiches : 1 inchangée')).first().waitFor();
    await page.locator('details, [aria-expanded]').filter({ hasText: /Fiches : 1/ }).first().click().catch(() => {});
    await capture(page, 'b48-section-non-ecrasee');
  } finally {
    await ctx.close();
  }
  await m.app.close();
});

test('B-48 · le titre de la fiche changé en base puis rejoué : pas écrasé, le lot le dit, le reste est écrit', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const un = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json.id;
  m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Port-Sel-sur-Brume', fid);
  const v2 = structuredClone(PORT_SEL);
  v2.sections[1]!.contenu = `Le phare cache un ${SECRET}, et une cale.`;
  const deux = await lotComplet(m, jeton, [['lieu:port-sel', v2]]);
  assert.equal(deux.reps[0]!.json.etat, 'mise_a_jour', 'the rest is written');
  const c = await cookieDe(m, 'antor');
  const apres = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${fid}`);
  assert.ok(apres.txt.includes('Port-Sel-sur-Brume'), 'title kept');
  assert.ok(apres.txt.includes('et une cale.'), 'the other change is written');
  const rapport = JSON.stringify(deux.rapport);
  assert.match(rapport, /lieu:port-sel/);
  assert.match(rapport, /titre/);
  assert.match(rapport, /non écrasé/);
  const trois = await lotComplet(m, jeton, [['lieu:port-sel', v2]]);
  assert.equal(trois.reps[0]!.json.etat, 'inchangee');
  assert.ok((await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${fid}`)).txt.includes('Port-Sel-sur-Brume'));
  await m.app.close();
});

test('B-48 · le contenu et l’audience d’une section changés dans Kanevas ne sont pas écrasés par le rejeu', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const c = await cookieDe(m, 'antor');
  const un = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const fid = un.reps[0]!.json.id;
  const lignes = m.app.db.prepare('SELECT id, titre FROM sections WHERE fiche_id = ?').all(fid) as { id: number; titre: string }[];
  const desc = lignes.find((s) => s.titre === 'Description')!.id;
  const ver = lignes.find((s) => s.titre === 'Vérité')!.id;
  const lue = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}`);
  const w = await rest(m, c, 'PUT', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}/contenu`, { contenu: 'Texte de Léa et d’Antor.', version: lue.json.version });
  assert.equal(w.statut, 200, w.txt);
  const p = await rest(m, c, 'PATCH', `/api/univers/${m.essai}/fiches/${fid}/sections/${ver}`, { joueursLisent: true });
  assert.equal(p.statut, 200, p.txt);
  const deux = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const apres = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${desc}`);
  assert.ok(apres.txt.includes('Texte de Léa et d’Antor.'), 'human content stays');
  assert.ok(!apres.txt.includes('Un port de sel gris'));
  const v = await rest(m, c, 'GET', `/api/univers/${m.essai}/fiches/${fid}/sections/${ver}`);
  assert.equal(v.json.audience.joueursLisent, true, 'human audience stays');
  const rapport = JSON.stringify(deux.rapport);
  assert.match(rapport, /Description/);
  assert.match(rapport, /Vérité/);
  assert.match(rapport, /non écrasée/);
  await m.app.close();
});

// ---------------------------------------------------------------- B-49

test('B-49 · E-18 : deux lots, le plus récent d’abord, « Fiches : 1 créée » puis « Fiches : 1 inchangée », le jeton nommé, « Clos »', opts, async () => {
  const m = await monde();
  const { ctx, page } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    assert.match(await lire(page), /Aucun lot d'import pour l'instant\./);
    const jeton = await creerJetonEcran(page, m, 'Script Kanka — Mac');
    await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
    m.regler(T0 + 3600_000);
    await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
    await allerE18(page, m);
    const t = await lire(page);
    await capture(page, 'b49-deux-lots');
    const i1 = t.indexOf('Fiches : 1 inchangée');
    const i2 = t.indexOf('Fiches : 1 créée');
    assert.ok(i1 > 0 && i2 > 0, t);
    assert.ok(i1 < i2, 'the most recent batch first');
    assert.ok(!/Aucun lot d'import/.test(t));
    assert.ok((t.match(/Clos/g) ?? []).length >= 2, 'both closed');
    assert.ok((t.match(/Script Kanka — Mac/g) ?? []).length >= 3, 'the token is named on each batch (list + 2 batches)');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-49 · un lot avec un refus : « Fiches : 1 créée · 1 refusée », déplié il donne la clé et la raison', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const { rapport } = await lotComplet(m, jeton, [
    ['lieu:port-sel', PORT_SEL],
    ['cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', sections: [] }],
  ]);
  assert.equal(rapport.compteurs.fiches.creees, 1);
  assert.equal(rapport.compteurs.fiches.refusees, 1);
  assert.equal(rapport.compteurs.fiches.inchangees, 0);
  const { ctx, page } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    const t = await lire(page);
    assert.match(t, /Fiches : 1 créée · 1 refusée/);
    await page.getByText(rx('Fiches : 1 créée')).first().click();
    await page.getByText(rx('cr:seance-1')).first().waitFor();
    const d = await lire(page);
    assert.match(d, /1 refusée/);
    assert.match(d, /cr:seance-1/);
    assert.match(d, /campagne inconnue/);
    await capture(page, 'b49-refus-deplie');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-49 bords · un lot ouvert est « En cours », ouvert depuis plus de 24 h sans écriture il est « Abandonné » ; un refus sans lot ne laisse pas de trace', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const sansLot = await pousser(m, jeton, 'cr:x', { type: 'compte_rendu', titre: 'X', sections: [] });
  assert.equal(sansLot.statut, 400);
  const { ctx, page } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    assert.match(await lire(page), /Aucun lot d'import pour l'instant\./, 'a refusal without a batch leaves no trace');
    await ouvrirLot(m, jeton);
    await allerE18(page, m);
    assert.match(await lire(page), /En cours/);
    await capture(page, 'b49-en-cours');
    m.regler(T0 + 25 * 3600_000);
    await ctx.clock.setFixedTime(new Date(m.maintenant()));
    await allerE18(page, m);
    const t = await lire(page);
    assert.match(t, /Abandonné/);
    assert.ok(!/En cours/.test(t));
    await capture(page, 'b49-abandonne');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-49 · E-18 d’un univers sans jeton ni lot : les deux textes vides', opts, async () => {
  const m = await monde();
  const { ctx, page } = await session(m, 'antor');
  try {
    const c = await cookieDe(m, 'antor');
    const nu = await rest(m, c, 'POST', '/api/univers', { nom: 'Vide' });
    assert.equal(nu.statut, 201, nu.txt);
    await page.goto(`/univers/${nu.json.id}/acces-api`);
    await attendre(page);
    const t = await lire(page);
    assert.match(t, /Aucun jeton\. Créez-en un pour qu'un script écrive dans cet univers\./);
    assert.match(t, /Aucun lot d'import pour l'instant\./);
    await capture(page, 'e18-vide');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

// ---------------------------------------------------------------- B-50

test('B-50 · le menu « ⋯ » de la fiche dit « Importée · clé lieu:port-sel · créée le 3 mars 2021 » au MJ', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const { reps } = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const { ctx, page } = await session(m, 'antor');
  try {
    await ouvrirFiche(page, m, reps[0]!.json.id);
    await page.getByRole('button', { name: /Autres actions sur « Port-Sel »/ }).click();
    await page.getByText(rx('Importée · clé lieu:port-sel · créée le 3 mars 2021')).first().waitFor();
    await capture(page, 'b50-menu');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-50 exclusions · Léa ne voit ni menu ni clé, aucune réponse qu’elle reçoit ne porte la clé ; une fiche faite dans Kanevas n’a pas la ligne', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const { reps } = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const c = await cookieDe(m, 'antor');
  const faite = await rest(m, c, 'POST', `/api/univers/${m.essai}/fiches`, { type: 'lieu', titre: 'Fait main' });
  assert.equal(faite.statut, 201, faite.txt);
  const lea = await session(m, 'lea');
  const antor = await session(m, 'antor');
  try {
    await ouvrirFiche(lea.page, m, reps[0]!.json.id);
    const t = await lire(lea.page);
    assert.ok(t.includes('Port-Sel'));
    assert.ok(!t.includes('lieu:port-sel') && !t.includes('Importée'));
    assert.equal(await lea.page.getByRole('button', { name: /Autres actions sur « Port-Sel »/ }).count(), 0);
    assert.ok(!lea.reponses.some((r) => r.includes('lieu:port-sel')), 'the key never reaches a player');
    await ouvrirFiche(antor.page, m, faite.json.id);
    // The menu also carries « Changer le type… » , « Déplacer sous… » and « Alias et étiquettes… » (kanevas-types-ecran-fiche, kanevas-arbre-fiche, kanevas-recherche-e9): what stays true is that a sheet
    // made in Kanevas has no origin line.
    await antor.page.getByRole('button', { name: /Autres actions sur « Fait main »/ }).click();
    const menuFait = ((await antor.page.getByRole('menu').innerText()) as string).replace(/\s+/g, ' ').trim();
    assert.equal(menuFait, 'Changer le type… Déplacer sous… Alias et étiquettes… Supprimer la fiche…', 'no key, no origin line');
    assert.ok(!(await lire(antor.page)).includes('Importée'));
  } finally {
    await lea.ctx.close();
    await antor.ctx.close();
    await m.app.close();
  }
});

test('B-50 · la date d’origine reste celle du premier import au rejeu', async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const un = await pousser(m, jeton, 'lieu:port-sel', PORT_SEL);
  const f = (id: number) => m.app.db.prepare('SELECT cree_le FROM fiches WHERE id = ?').get(id) as { cree_le: string | number };
  const avant = f(un.json.id).cree_le;
  m.regler(T0 + 5 * JOUR);
  await pousser(m, jeton, 'lieu:port-sel', PORT_SEL);
  assert.equal(f(un.json.id).cree_le, avant);
  assert.match(String(avant), /2021-03-03/, 'creeLe is the sheet’s creation date');
  await m.app.close();
});

// ---------------------------------------------------------------- critère de sortie (P-10)

test('critère de sortie · Antor crée le jeton, pousse Port-Sel, rejoue ; Léa lit « Description » et rien de « Vérité »', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    const jeton = await creerJetonEcran(antor.page, m, 'Script Kanka — Mac');
    const premier = await imp(m, jeton, 'PUT', `/fiches/${CLE_PS}`, PORT_SEL);
    assert.equal(premier.statut, 200, premier.txt);
    assert.equal(premier.json.etat, 'creee');
    const lot1 = await ouvrirLot(m, jeton);
    const rejoue = await imp(m, jeton, 'PUT', `/fiches/${CLE_PS}?lot=${lot1}`, PORT_SEL);
    assert.equal(rejoue.json.etat, 'inchangee');
    await imp(m, jeton, 'POST', `/lots/${lot1}/clore`);
    await allerE18(antor.page, m);
    await capture(antor.page, 'critere-e18');
    assert.match(await lire(antor.page), /Fiches : 1 inchangée/);

    await ouvrirFiche(lea.page, m, premier.json.id);
    await lea.page.getByRole('region', { name: rx('Description') }).waitFor();
    const t = await lire(lea.page);
    const html = await lea.page.content();
    assert.ok(t.includes('Un port de sel gris sous les brumes.'));
    for (const secret of ['Vérité', SECRET]) {
      assert.ok(!t.includes(secret) && !html.includes(secret), `« ${secret} » is nowhere on Léa's page`);
      assert.ok(!lea.reponses.some((r) => r.includes(secret)), `« ${secret} » is in no answer Léa received`);
    }
    await capture(lea.page, 'critere-lea');
    // Search and lists, over the session API as Léa.
    const cl = await cookieDe(m, 'lea');
    const rech = await rest(m, cl, 'GET', `/api/univers/${m.essai}/fiches?q=${encodeURIComponent('sous-main')}`);
    assert.ok(!rech.txt.includes('Port-Sel'), 'a word only in « Vérité » finds nothing for Léa');
    const rech2 = await rest(m, cl, 'GET', `/api/univers/${m.essai}/fiches?q=${encodeURIComponent('brumes')}`);
    assert.ok(rech2.txt.includes('Port-Sel'), 'a word of « Description » does');
    // The GM does see « Vérité ».
    await ouvrirFiche(antor.page, m, premier.json.id);
    assert.ok((await lire(antor.page)).includes(SECRET));
  } finally {
    await antor.ctx.close();
    await lea.ctx.close();
    await m.app.close();
  }
});

test('critère de sortie · le jeton du bouchon d’Antor agit dans « Essai Kanka », univers semé avec Antor MJ et Léa Joueuse', async () => {
  const m = await monde();
  const { JETON_BOUCHON } = await import('../bouchon/depart.js');
  const r = await imp(m, JETON_BOUCHON, 'GET', '');
  assert.equal(r.statut, 200, r.txt);
  assert.equal(r.json.univers.nom, 'Essai Kanka');
  assert.equal(r.json.compte.username, 'antor');
  const ca = await cookieDe(m, 'antor');
  const membres = await rest(m, ca, 'GET', `/api/univers/${m.essai}/membres`);
  assert.match(JSON.stringify(membres.json), /antor/);
  assert.match(JSON.stringify(membres.json), /lea/);
  assert.equal((await pousser(m, JETON_BOUCHON, 'lieu:port-sel', PORT_SEL)).json.etat, 'creee');
  await m.app.close();
});
