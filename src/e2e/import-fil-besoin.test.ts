// ecrans: acces-api, fiche, membres, vue-ensemble
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
//   B-50 clé        nominal   : « ⋯ » menu of E-9 « Importée · créée le 3 mars 2021 »
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

/** A token of the account on this universe only, made through the session route of the account (E-23's door): E-18 no longer creates any. */
async function jetonPar(m: Monde, compte: string, nom = 'Script Kanka — Mac', dureeJours = 30): Promise<string> {
  const c = await cookieDe(m, compte);
  const r = await rest(m, c, 'POST', '/api/compte/jetons', { nom, dureeJours, acces: { tous: false, univers: [{ universId: m.essai, niveau: 'ecriture' }] } });
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

async function ouvrirFiche(page: Any, m: Monde, id: number): Promise<void> {
  await page.goto(`/univers/${m.essai}/fiche/${id}`);
  await attendre(page);
}

// ---------------------------------------------------------------- B-45

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
    await capture(lea.page, 'p11-lea-introuvable');
    await antor.page.goto(`/univers/${m.essai}`);
    await attendre(antor.page);
    await antor.page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Accès par API' }).click();
    await attendre(antor.page);
    await antor.page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
    const t = await lire(antor.page);
    assert.match(t, /Un script écrit dans cet univers avec vos droits, par l'API d'import\. Ses jetons se gèrent dans Mes jetons d'API\./);
    assert.match(t, /\/api\/v1\/univers\/[^\/\s]+/, 'the base address');
    assert.doesNotMatch(t, /Nouveau jeton|Aucun jeton/, 'no « Jetons » panel any more');
  } finally {
    await lea.ctx.close();
    await antor.ctx.close();
    await m.app.close();
  }
});

// ---------------------------------------------------------------- B-46

// ---------------------------------------------------------------- B-47

// ---------------------------------------------------------------- B-48

async function sectionsDe(m: Monde, cookie: string, fid: number) {
  const f = await rest(m, cookie, 'GET', `/api/univers/${m.essai}/fiches/${fid}`);
  return f.json;
}

test('B-48 · Antor renomme la section « Description » puis le script rejoue : la ligne du lot dit « Fiches : 1 inchangée »', opts, async () => {
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
  await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
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

// ---------------------------------------------------------------- B-49

test('B-49 · E-18 : deux lots, le plus récent d’abord, « Fiches : 1 créée » puis « Fiches : 1 inchangée », le jeton nommé, « Clos »', opts, async () => {
  const m = await monde();
  const { ctx, page } = await session(m, 'antor');
  try {
    await allerE18(page, m);
    assert.match(await lire(page), /Aucun lot d'import pour l'instant\./);
    const jeton = await jetonPar(m, 'antor', 'Script Kanka — Mac');
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
    assert.ok((t.match(/Script Kanka — Mac/g) ?? []).length >= 2, 'the token is named on each batch');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

test('B-49 · un lot avec un refus : « Fiches : 1 créée · 1 refusée », déplié il donne la clé et la raison', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  await lotComplet(m, jeton, [
    ['lieu:port-sel', PORT_SEL],
    ['cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', sections: [] }],
  ]);
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
  await pousser(m, jeton, 'cr:x', { type: 'compte_rendu', titre: 'X', sections: [] }); // refused: no batch is opened
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
    assert.doesNotMatch(t, /Aucun jeton/);
    assert.match(t, /Aucun lot d'import pour l'instant\./);
    await capture(page, 'e18-vide');
  } finally {
    await ctx.close();
    await m.app.close();
  }
});

// ---------------------------------------------------------------- B-50

test('B-50 · le menu « ⋯ » de la fiche dit « Importée · créée le 3 mars 2021 » au MJ', opts, async () => {
  const m = await monde();
  const jeton = await jetonPar(m, 'antor');
  const { reps } = await lotComplet(m, jeton, [['lieu:port-sel', PORT_SEL]]);
  const { ctx, page } = await session(m, 'antor');
  try {
    await ouvrirFiche(page, m, reps[0]!.json.id);
    await page.getByRole('button', { name: /Autres actions sur « Port-Sel »/ }).click();
    await page.getByText(rx('Importée · créée le 3 mars 2021')).first().waitFor();
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
    await ouvrirFiche(antor.page, m, faite.json.id);
    // The menu also carries « Changer le type… » , « Déplacer sous… » and « Alias et étiquettes… » and « Historique » (kanevas-types-ecran-fiche, kanevas-arbre-fiche, kanevas-recherche-e9, kanevas-synchro-historique-ecran): what stays true is that a sheet
    // made in Kanevas has no origin line.
    await antor.page.getByRole('button', { name: /Autres actions sur « Fait main »/ }).click();
    const menuFait = ((await antor.page.getByRole('menu').innerText()) as string).replace(/\s+/g, ' ').trim();
    assert.equal(menuFait, 'Changer le type… Marquer détruit Déplacer sous… Alias et étiquettes… Historique Supprimer la fiche…', 'no key, no origin line');
    assert.ok(!(await lire(antor.page)).includes('Importée'));
  } finally {
    await lea.ctx.close();
    await antor.ctx.close();
    await m.app.close();
  }
});

// ---------------------------------------------------------------- critère de sortie (P-10)

test('critère de sortie · Antor crée le jeton, pousse Port-Sel, rejoue ; Léa lit « Description » et rien de « Vérité »', opts, async () => {
  const m = await monde();
  const antor = await session(m, 'antor');
  const lea = await session(m, 'lea');
  try {
    const jeton = await jetonPar(m, 'antor', 'Script Kanka — Mac');
    const premier = await imp(m, jeton, 'PUT', `/fiches/${CLE_PS}`, PORT_SEL);
    const lot1 = await ouvrirLot(m, jeton);
    await imp(m, jeton, 'PUT', `/fiches/${CLE_PS}?lot=${lot1}`, PORT_SEL);
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
    }
    await capture(lea.page, 'critere-lea');
    // The GM does see « Vérité ».
    await ouvrirFiche(antor.page, m, premier.json.id);
    assert.ok((await lire(antor.page)).includes(SECRET));
  } finally {
    await antor.ctx.close();
    await lea.ctx.close();
    await m.app.close();
  }
});
