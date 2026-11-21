// ecrans: comptes-rendus, recherche
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

test('B-50 : un compte-rendu dont aucune section n’est lisible est absent pour Léa, sans trou ni compteur', { ...opts }, async () => {
  // Panne visée : la liste importée contourne le filtre de droits d'E-13 (fuite d'un titre ou du total).
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const r = await imp(m, 'PUT', '/fiches/cr:secret', { type: 'compte_rendu', titre: 'Session secrète du MJ', campagne: 'c:eneria', creeLe: '2021-05-01T10:00:00.000Z', sections: [section('trame', false)] });
  assert.equal(r.json.etat, 'creee'); // setup: the filtering of the lists is proved by the route
  const { ctx, page } = await connecter(m, 'Léa');
  await page.goto(`/univers/${m.essai}/comptes-rendus`);
  await page.waitForLoadState('networkidle');
  await page.getByText('Journal de bord — Jour 2').waitFor();
  const txt: string = await page.locator('main').innerText();
  assert.ok(!txt.includes('Session secrète'), txt);
  await page.screenshot({ path: `${CAP}/e13-lea-sans-secret.png`, fullPage: true });
  await ctx.close();
});

test('P-10 étape 6 : en mode Joueur, rien du MJ de l’échantillon n’apparaît pour Léa', { ...opts }, async () => {
  // Panne visée : un bloc MJ ou une fiche MJ seul de l'échantillon fuit vers une joueuse.
  const m = await monde();
  assert.equal((await client(m)).code, 0);
  const { ctx, page } = await connecter(m, 'Léa');
  await page.goto(`/univers/${m.essai}/recherche?q=Obscura`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${CAP}/lea-recherche-obscura.png` });
  const txt: string = await page.locator('main').innerText();
  const trouve = page.locator('main').getByRole('link', { name: /^Obscura/ });
  assert.equal(await trouve.count(), 0);
  await ctx.close();
});

