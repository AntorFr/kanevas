// Black-box tests of kanevas-import-reprise, written from the need (docs/parcours.md B-47 to B-50, P-10;
// docs/ecrans.md E-13, E-7; the feature's critère de sortie), not from the code.
// The real app runs in this process in stub mode (in-memory SQLite) and is driven over HTTP, by the
// repository's test client (`src/bouchon/client-import.ts`, run as the command the README gives) and by a
// real Chromium (Playwright). Captures go to $REPRISE_CAPTURES (default /tmp/reprise-captures), outside the tree.
//
// TEST PLAN (need → cases; every expectation is a literal written from the docs)
//   P-10 / critère  nominal   : the client pushes the sample into « Essai Kanka » with the Jeton du bouchon:
//                               15 fiches (4 adventure sheets among them), 3 fichiers, 3 relations created, 0 refusal
//                               (ARCHITECTURE « Échantillon de reprise »)
//                   rejeu     : « Fiches : 0 créée », 15 inchangées, nothing created in any other nature, no new row
//   B-50 / E-13     nominal   : the three journals sent out of order (3 Mar, 10 Feb, 18 Apr 2021) read 18 Apr, 3 Mar, 10 Feb
//                               on screen, the line shows the origin date
//                   bords     : a journal without origin date (created now) comes first; one from 2020 comes last
//                   exclusion : a journal whose every section is closed to players is absent for Léa, total does not count it
//   B-47 CR         échec     : compte-rendu with an unknown campaign → refused with « campagne inconnue : … », not created,
//                               batch shows 1 refusal with key and reason (B-49); client exits non-zero (refus.json)
//   B-47 relations  nominal   : creee then inchangee; unknown target → ignoree + warning; unknown source fiche → 404
//   exclusions      : no token → 401, a token of another universe → 404; closed batch → 409 lot_clos; the routes of
//                     campaigns and scenarios answer 404 (AD-127)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

const opts = { skip: skipBrowser };
const CAP = process.env.REPRISE_CAPTURES ?? '/tmp/reprise-captures';
const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';

let browser: Any;
before(async () => {
  mkdirSync(CAP, { recursive: true });
  if (!skipBrowser) browser = await launch();
});
const ouverts: Array<{ close: () => Promise<unknown> }> = [];
after(async () => {
  await browser?.close();
  for (const a of ouverts) await a.close().catch(() => {});
});

interface Monde {
  base: string;
  essai: number;
  api: string;
}

async function monde(): Promise<Monde> {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db), 'the stub world is seeded');
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as { port: number };
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  const base = `http://127.0.0.1:${addr.port}`;
  return { base, essai, api: `${base}/api/import/v1/univers/${essai}` };
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

/** Runs the README's command: `npm run import:echantillon -- <url> <universId> <jeton> [json]` (async: the app lives in this process). */
function client(m: Monde, json?: string): Promise<{ code: number | null; out: string }> {
  const args = ['--import', 'tsx', 'src/bouchon/client-import.ts', m.base, String(m.essai), JETON];
  if (json) args.push(json);
  return new Promise((resolve) => {
    const p = spawn('node', args);
    let out = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.stderr.on('data', (d) => (out += String(d)));
    p.on('close', (code) => resolve({ code, out }));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function imp(m: Monde, methode: string, chemin: string, corps?: unknown, jeton: string | null = JETON): Promise<{ status: number; json: Any }> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (jeton) h.authorization = `Bearer ${jeton}`;
  const r = await fetch(`${m.api}${chemin}`, { method: methode, headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const t = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(t);
  } catch {
    json = t;
  }
  return { status: r.status, json };
}

async function session(m: Monde, cookie: string, chemin: string, methode = 'GET', corps?: unknown): Promise<{ status: number; json: Any }> {
  const r = await fetch(`${m.base}/api${chemin}`, {
    method: methode,
    headers: { cookie, 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  let json: Any = null;
  try {
    json = JSON.parse(t);
  } catch {
    json = t;
  }
  return { status: r.status, json };
}

const section = (contenu: string, lisent = true) => ({ cle: 'description', titre: 'Description', contenu, joueursLisent: lisent, joueursEcrivent: false });

async function connecter(m: Monde, compte: string): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({ baseURL: m.base });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte}$`, 'i') }).click();
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

test('P-10 : le client pousse l’échantillon dans Essai Kanka, rejoué il ne crée plus rien', async () => {
  // Panne visée : le lot ne compte pas par nature, ou le rejeu crée des doublons.
  const m = await monde();
  const antor = await cookieDe(m, 'antor');
  const premier = await client(m);
  assert.equal(premier.code, 0, premier.out);
  const lots = (await session(m, antor, `/univers/${m.essai}/lots`)).json as Any[];
  assert.equal(lots.length, 1);
  const c = lots[0].compteurs;
  assert.deepEqual(
    [c.fiches.creees, c.fichiers.creees, c.relations.creees],
    [15, 3, 3],
  );
  assert.deepEqual(
    [c.fiches.refusees, c.fichiers.refusees, c.relations.refusees],
    [0, 0, 0],
  );
  assert.equal(lots[0].campagnes, undefined);
  assert.equal(lots[0].compteurs.scenarios, undefined);
  assert.equal(lots[0].refus.length, 0);
  assert.equal(lots[0].avertissements, 1);

  const avant = (await session(m, antor, `/univers/${m.essai}/fiches?type=compte_rendu`)).json.fiches.length;
  const second = await client(m);
  assert.equal(second.code, 0, second.out);
  assert.match(second.out, /Fiches : 0 créée/);
  const lots2 = (await session(m, antor, `/univers/${m.essai}/lots`)).json as Any[];
  const d = lots2[0].compteurs;
  assert.deepEqual([d.fiches.creees, d.fichiers.creees, d.relations.creees], [0, 0, 0]);
  assert.deepEqual([d.fiches.inchangees, d.fichiers.inchangees, d.relations.inchangees], [15, 3, 3]);
  assert.equal((await session(m, antor, `/univers/${m.essai}/fiches?type=aventure`)).json.fiches.length, 4);
  assert.equal((await session(m, antor, `/univers/${m.essai}/fiches?type=compte_rendu`)).json.fiches.length, avant);
  assert.equal((await session(m, antor, `/univers/${m.essai}/comptes-rendus`)).json.total, 3);
});

test('E-13 : les comptes-rendus importés se rangent à leur date d’origine, du plus récent au plus ancien', { ...opts }, async () => {
  // Panne visée : E-13 range par date d'import (ordre d'envoi : 3 mars, 10 février, 18 avril) au lieu de la date d'origine.
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const { ctx, page } = await connecter(m, 'antor');
  await page.goto(`/univers/${m.essai}/comptes-rendus`);
  await page.waitForLoadState('networkidle');
  await page.getByText('Journal de bord — Jour 2').waitFor();
  const txt: string = await page.locator('main').innerText();
  const i2 = txt.indexOf('Journal de bord — Jour 2');
  const i1 = txt.indexOf('Journal de bord — Jour 1');
  const i0 = txt.indexOf('Journal de bord — Jour 0');
  assert.ok(i2 >= 0 && i2 < i1 && i1 < i0, `ordre attendu Jour 2 (18 avril), Jour 1 (3 mars), Jour 0 (10 février) :\n${txt}`);
  assert.match(txt, /18 avr(\.|il) 2021/);
  assert.match(txt, /3 mars 2021/);
  assert.match(txt, /10 f(é|e)vr(\.|ier) 2021/);
  assert.match(txt, /Éneria/);
  await page.screenshot({ path: `${CAP}/e13-ordre-origine.png`, fullPage: true });
  await ctx.close();
});

test('B-50 : sans date d’origine un compte-rendu vaut sa date de création, une date de 2020 passe après 2021', async () => {
  // Panne visée : creeLe absent/ancien mal traité (date nulle, tri inversé).
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const antor = await cookieDe(m, 'antor');
  const sans = await imp(m, 'PUT', '/fiches/cr:sans-date', { type: 'compte_rendu', titre: 'Sans date', campagne: 'c:eneria', sections: [section('x')] });
  assert.equal(sans.status, 200, JSON.stringify(sans.json));
  assert.equal(sans.json.etat, 'creee');
  const vieux = await imp(m, 'PUT', '/fiches/cr:vieux', { type: 'compte_rendu', titre: 'Vieux journal', campagne: 'c:eneria', creeLe: '2020-06-01T10:00:00.000Z', sections: [section('x')] });
  assert.equal(vieux.json.etat, 'creee');
  const liste = (await session(m, antor, `/univers/${m.essai}/comptes-rendus`)).json;
  assert.deepEqual(
    liste.comptesRendus.map((x: Any) => x.titre),
    ['Sans date', 'Journal de bord — Jour 2', 'Journal de bord — Jour 1', 'Journal de bord — Jour 0', 'Vieux journal'],
  );
  assert.equal(liste.comptesRendus[4].creeLe, '2020-06-01T10:00:00.000Z');
  assert.equal(liste.comptesRendus[1].creeLe, '2021-04-18T12:00:00.000Z');
  assert.equal(liste.comptesRendus[1].campagneNom, 'Éneria');
});

test('B-50 : un compte-rendu dont aucune section n’est lisible est absent pour Léa, sans trou ni compteur', { ...opts }, async () => {
  // Panne visée : la liste importée contourne le filtre de droits d'E-13 (fuite d'un titre ou du total).
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const r = await imp(m, 'PUT', '/fiches/cr:secret', { type: 'compte_rendu', titre: 'Session secrète du MJ', campagne: 'c:eneria', creeLe: '2021-05-01T10:00:00.000Z', sections: [section('trame', false)] });
  assert.equal(r.json.etat, 'creee');
  const antor = await cookieDe(m, 'antor');
  const lea = await cookieDe(m, 'lea');
  assert.equal((await session(m, antor, `/univers/${m.essai}/comptes-rendus`)).json.total, 4);
  const l = (await session(m, lea, `/univers/${m.essai}/comptes-rendus`)).json;
  assert.equal(l.total, 3);
  assert.deepEqual(l.comptesRendus.map((x: Any) => x.titre), ['Journal de bord — Jour 2', 'Journal de bord — Jour 1', 'Journal de bord — Jour 0']);
  const { ctx, page } = await connecter(m, 'Léa');
  await page.goto(`/univers/${m.essai}/comptes-rendus`);
  await page.waitForLoadState('networkidle');
  await page.getByText('Journal de bord — Jour 2').waitFor();
  const txt: string = await page.locator('main').innerText();
  assert.ok(!txt.includes('Session secrète'), txt);
  await page.screenshot({ path: `${CAP}/e13-lea-sans-secret.png`, fullPage: true });
  await ctx.close();
});

test('B-47 : un compte-rendu d’une campagne absente est refusé avec la raison, rien n’est créé', async () => {
  // Panne visée : la fiche est créée sans campagne, ou le refus n'est pas dit dans le lot.
  const m = await monde();
  const antor = await cookieDe(m, 'antor');
  const r = await client(m, 'src/bouchon/echantillon/refus.json');
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /campagne inconnue : c:absente/);
  const lots = (await session(m, antor, `/univers/${m.essai}/lots`)).json as Any[];
  assert.equal(lots[0].compteurs.fiches.refusees, 1);
  assert.equal(lots[0].compteurs.fiches.creees, 0);
  assert.deepEqual(lots[0].refus.map((x: Any) => [x.cle, x.raison]), [['cr:campagne-absente', 'campagne inconnue : c:absente']]);
  assert.equal((await session(m, antor, `/univers/${m.essai}/comptes-rendus`)).json.total, 0);
  // par l'API, un compte-rendu sans campagne du tout est refusé de même (400 sur le champ)
  const sans = await imp(m, 'PUT', '/fiches/cr:orphelin', { type: 'compte_rendu', titre: 'Orphelin', sections: [section('x')] });
  assert.equal(sans.status, 400);
  assert.equal(sans.json.code, 'invalide');
  assert.equal(sans.json.champ, 'campagne');
  assert.equal((await session(m, antor, `/univers/${m.essai}/comptes-rendus`)).json.total, 0);
});

test('B-47 : une relation se crée, ne change pas au rejeu, vers une cible inconnue elle est ignorée avec un avertissement', async () => {
  // Panne visée : relation en double au rejeu, ou cible inconnue qui fait échouer ou qui invente une fiche.
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const entree = { section: 'description', cible: 'objet:dalle-de-donnees', type: 'garde' };
  const a = await imp(m, 'POST', '/fiches/lieu:eneria/relations', [entree]);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(a.json[0].etat, 'creee');
  const b = await imp(m, 'POST', '/fiches/lieu:eneria/relations', [entree]);
  assert.equal(b.json[0].etat, 'inchangee');
  const c = await imp(m, 'POST', '/fiches/lieu:eneria/relations', [{ ...entree, cible: 'lieu:introuvable' }]);
  assert.equal(c.json[0].etat, 'ignoree');
  assert.ok(c.json[0].avertissements.length >= 1);
  const d = await imp(m, 'POST', '/fiches/lieu:inconnue/relations', [entree]);
  assert.equal(d.status, 404);
  const e = await imp(m, 'POST', '/fiches/lieu:eneria/relations', [{ ...entree, cible: 'lieu:eneria' }]);
  assert.equal(e.json[0].etat, 'refusee');
  assert.equal(e.json[0].code, 'auto_relation');
});

test('P-10 étape 6 : en mode Joueur, rien du MJ de l’échantillon n’apparaît pour Léa', { ...opts }, async () => {
  // Panne visée : un bloc MJ ou une fiche MJ seul de l'échantillon fuit vers une joueuse.
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const lea = await cookieDe(m, 'lea');
  const fiches = (await session(m, lea, `/univers/${m.essai}/fiches?type=faction`)).json.fiches as Any[];
  assert.ok(!fiches.some((f) => f.titre === 'Obscura'), 'Obscura (tout en MJ) est cachée à Léa');
  const ev = (await session(m, lea, `/univers/${m.essai}/fiches?type=evenement`)).json.fiches as Any[];
  assert.ok(!ev.some((f) => f.titre === 'Ascension des Vael’Khor'));
  const lieux = (await session(m, lea, `/univers/${m.essai}/fiches?type=lieu`)).json.fiches as Any[];
  assert.ok(lieux.some((f) => f.titre === 'Éneria Prime'));
  const { ctx, page } = await connecter(m, 'Léa');
  await page.goto(`/univers/${m.essai}/recherche?q=Obscura`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${CAP}/lea-recherche-obscura.png` });
  const txt: string = await page.locator('main').innerText();
  const trouve = page.locator('main').getByRole('link', { name: /^Obscura/ });
  assert.equal(await trouve.count(), 0);
  await ctx.close();
});

test('exclusions : l’API de reprise refuse sans jeton, d’un autre univers, sur un lot clos ; les routes des campagnes et scénarios sont retirées', async () => {
  // Panne visée : une route oublie la garde du jeton (B-48 protège l'import) ; une ancienne route survit.
  const m = await monde();
  const corps = { type: 'lieu', titre: 'X', sections: [section('x')] };
  const sans = await imp(m, 'PUT', '/fiches/lieu:x', corps, null);
  assert.equal(sans.status, 401);
  assert.equal(sans.json.code, 'jeton_invalide');
  const faux = await imp(m, 'PUT', '/fiches/lieu:x', corps, 'kvs_pasbon');
  assert.equal(faux.status, 401);
  const ailleurs = await fetch(`${m.base}/api/import/v1/univers/${m.essai + 1}/fiches/lieu:x`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
  assert.equal(ailleurs.status, 404);
  const antor = await cookieDe(m, 'antor');
  assert.equal(((await session(m, antor, `/univers/${m.essai}/fiches?type=lieu`)).json.fiches as Any[]).length, 0);
  const lot = await imp(m, 'POST', '/lots');
  assert.equal(lot.status, 201);
  assert.equal((await imp(m, 'POST', `/lots/${lot.json.lotId}/clore`)).status, 200);
  const clos = await imp(m, 'PUT', `/fiches/lieu:x?lot=${lot.json.lotId}`, corps);
  assert.equal(clos.status, 409);
  assert.equal(clos.json.code, 'lot_clos');
  for (const chemin of ['/campagnes/c:x', '/campagnes/c:x/scenarios/s:y', '/scenarios/s:y']) {
    const retire = await imp(m, 'PUT', chemin, { nom: 'X', titre: 'X', statut: 'active' });
    assert.equal(retire.status, 404, chemin);
  }
});
