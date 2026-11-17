// ecrans: acces-api, fiche, vue-ensemble
// Independent acceptance tests of kanevas-import-fil, written from the need only (docs/parcours.md
// B-45..B-50, P-10, P-11; docs/ecrans.md E-18, E-9 « Importée »; the criterion of the feature sheet).
// Every expected value is a literal taken from those documents. The product runs for real in stub mode
// (AD-55): real app, real SQLite, real Chromium; the only thing moved is the clock the tests may move
// (`app.horloge`, CLAUDE.md « Import API »).
//
// PLAN DE TEST (besoin -> famille -> cas)
//  B-45 nominal   E-18: Antor creates « Script Kanka — Mac » (30 j); shown once; row says « jamais »; value gone from
//                 screen and from the list API; the token opens GET /api/import/v1/univers/<id>.
//  B-45 bords     name empty -> « Erreur : le nom est obligatoire. »; name of 81 chars refused; duration 366 j refused;
//                 duration 1 an accepted.
//  B-45 exclusions Léa (Joueuse): E-18 « Page introuvable. », no sidebar item, no token created through the API;
//                 the token does not open a session route; the session cookie alone does not open the import API.
//  B-46 échec     revoked / expired (7 j + 1 s; 6 j 23 h still valid) / unknown / malformed header / MJ turned Joueuse
//                 -> 401 « Jeton invalide. », same body, no batch opened; another universe -> 404.
//  B-46 E-18      « Révoquer » dialog and toast, row « Révoqué »; Mira row « Inactif » once Joueuse.
//  B-47 nominal   PUT lieu:port-sel -> creee; replay -> inchangee; one single fiche; six types accepted; changed title -> mise_a_jour.
//  B-47 échec     compte_rendu without campaign -> 400 champ campagne, unknown type -> 400 champ type, nothing written.
//  B-48           section title / section content / section audience / fiche title changed in Kanevas then replay ->
//                 not overwritten, batch warns; the rest of the payload is written.
//  B-49           E-18 batches: « Fiches : 1 créée », « Fiches : 1 inchangée », refusals and warnings unfold with key and reason;
//                 empty states; a refused PUT without batch leaves no trace.
//  B-50           creeLe kept; E-9 menu « ⋯ » « Importée · créée le 3 mars 2021 » for the MJ only;
//                 no menu for a fiche without key; the key is not in Léa's read.
//  P-10 / critère Léa reads « Description » and nothing of « Vérité » (page, API, search).
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = join(process.cwd(), 'dist/public');
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { attendre, launch, rx, skipBrowser, texte } = await import('./harnais.test.js');
type App = Awaited<ReturnType<typeof buildApp>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
const UNIQUE = { message: 'Jeton invalide.', code: 'jeton_invalide' };

const PORT_SEL = {
  type: 'lieu',
  titre: 'Port-Sel',
  creeLe: '2021-03-03T10:00:00.000Z',
  sections: [
    { cle: 'description', titre: 'Description', contenu: 'Un port brumeux aux quais de sel.', joueursLisent: true, joueursEcrivent: false },
    { cle: 'verite', titre: 'Vérité', contenu: 'La Guilde des Brumes tient le port.', joueursLisent: false, joueursEcrivent: false },
  ],
};

interface Monde {
  app: App;
  base: string;
  essai: number;
  cookie: (compte: string) => Promise<{ cookie: string }>;
  api: (m: string, chemin: string, jeton: string | null, corps?: unknown) => Promise<{ status: number; json: Any }>;
  session: (compte: string, m: string, url: string, corps?: unknown) => Promise<{ status: number; json: Any }>;
  idCompte: (nom: string) => number;
  stop: () => Promise<void>;
}

async function monter(): Promise<Monde> {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const cookies = new Map<string, string>();
  const cookie = async (compte: string) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      const c = res.cookies.find((x) => x.name === 'kanevas_session');
      assert.ok(c, `no session for ${compte}`);
      cookies.set(compte, `kanevas_session=${c.value}`);
    }
    return { cookie: cookies.get(compte)! };
  };
  const rendre = (r: { statusCode: number; body: string }) => ({
    status: r.statusCode,
    json: r.body ? (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() : null,
  });
  const api = async (m: string, chemin: string, jeton: string | null, corps?: unknown) =>
    rendre(
      await app.inject({
        method: m as 'GET',
        url: `/api/import/v1/univers/${chemin}`,
        headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
        ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }),
      }),
    );
  const session = async (compte: string, m: string, url: string, corps?: unknown) =>
    rendre(
      await app.inject({
        method: m as 'GET',
        url,
        headers: await cookie(compte),
        ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }),
      }),
    );
  const idCompte = (nom: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(nom) as { id: number }).id;
  return { app, base, essai, cookie, api, session, idCompte, stop: () => app.close() };
}

/** Creates a token through the session route of the account (E-23's door, B-94), on this universe only, and returns its value. */
async function jetonDe(m: Monde, compte: string, nom = 'Script Kanka — Mac', dureeJours = 30, univers = m.essai): Promise<string> {
  const r = await m.session(compte, 'POST', '/api/compte/jetons', { nom, dureeJours, acces: { tous: false, univers: [{ universId: univers, niveau: 'ecriture' }] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.valeur as string;
}

async function lot(m: Monde, jeton: string): Promise<number> {
  const r = await m.api('POST', `${m.essai}/lots`, jeton);
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.json));
  return r.json.lotId as number;
}

const cle = (k: string) => encodeURIComponent(k);
const put = (m: Monde, jeton: string, k: string, corps: unknown, lotId?: number) =>
  m.api('PUT', `${m.essai}/fiches/${cle(k)}${lotId === undefined ? '' : `?lot=${lotId}`}`, jeton, corps);

/** Pushes `corps` as a batch of its own, closes it, returns the PUT answer and the closed report. */
async function pousserEnLot(m: Monde, jeton: string, k: string, corps: unknown) {
  const id = await lot(m, jeton);
  const r = await put(m, jeton, k, corps, id);
  const c = await m.api('POST', `${m.essai}/lots/${id}/clore`, jeton);
  assert.equal(c.status, 200, JSON.stringify(c.json));
  return { r, rapport: c.json, id };
}

const lots = async (m: Monde, compte = 'antor', univers = m.essai) => {
  const r = await m.session(compte, 'GET', `/api/univers/${univers}/lots`);
  assert.equal(r.status, 200);
  return (Array.isArray(r.json) ? r.json : (r.json.lots ?? [])) as Any[];
};
const nbLots = async (m: Monde) => (await lots(m)).length;

const fichesDe = async (m: Monde, compte: string, q = '') => {
  const r = await m.session(compte, 'GET', `/api/univers/${m.essai}/fiches${q}`);
  assert.equal(r.status, 200);
  return r.json.fiches as Any[];
};

describe('P-10 critère : Léa lit « Description » et rien de « Vérité »', () => {
  let m: Monde;
  before(async () => { m = await monter(); await pousserEnLot(m, JETON_BOUCHON, 'lieu:port-sel', PORT_SEL); });
  after(async () => { await m.stop(); });

  test('Chromium : Léa ouvre la fiche, lit Description, ne voit rien de Vérité ; capture', { skip: skipBrowser }, async () => {
    const browser = await launch();
    try {
      const ctx = await browser.newContext({ baseURL: m.base });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
      await attendre(page);
      const f = (await fichesDe(m, 'lea')).find((x) => x.titre === 'Port-Sel')!;
      await page.goto(`/univers/${m.essai}/fiche/${f.id}`);
      await page.getByRole('heading', { name: 'Port-Sel' }).first().waitFor();
      await attendre(page);
      const t = await texte(page);
      assert.match(t, /Description/);
      assert.match(t, /Un port brumeux aux quais de sel\./);
      assert.doesNotMatch(t, /Vérité/);
      assert.doesNotMatch(t, /Guilde des Brumes/);
      assert.doesNotMatch(t, /Importée/);
      await page.screenshot({ path: join(SHOTS, 'lea-port-sel.png'), fullPage: true });
      await ctx.close();
    } finally {
      await browser.close();
    }
  });
});

describe('B-50 clé et date d’origine', () => {
  let m: Monde;
  let fid: number;
  before(async () => {
    m = await monter();
    const { r } = await pousserEnLot(m, JETON_BOUCHON, 'lieu:port-sel', PORT_SEL);
    fid = r.json.id;
  });
  after(async () => { await m.stop(); });

  test('Chromium : le MJ lit « Importée · clé lieu:port-sel · créée le 3 mars 2021 » dans le menu ⋯ ; capture', { skip: skipBrowser }, async () => {
    const browser = await launch();
    try {
      const ctx = await browser.newContext({ baseURL: m.base });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
      await attendre(page);
      await page.goto(`/univers/${m.essai}/fiche/${fid}`);
      await page.getByRole('heading', { name: 'Port-Sel' }).first().waitFor();
      await attendre(page);
      await page.getByRole('button', { name: /Autres actions/ }).first().click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      const t = ((await menu.innerText()) as string).replace(/\s+/g, ' ').trim();
      // kanevas-types-ecran-fiche adds « Changer le type… », kanevas-recherche-e9 « Alias et étiquettes… »; the origin line stays.
      assert.equal(t, 'Changer le type… Marquer détruit Déplacer sous… Alias et étiquettes… Importée · créée le 3 mars 2021 Supprimer la fiche…');
      await page.screenshot({ path: join(SHOTS, 'antor-menu-importee.png') });
      // a fiche without origin key: no « ⋯ » menu at all (this slice)
      await ctx.close();
    } finally {
      await browser.close();
    }
  });

  test('Chromium : une fiche sans clé d’origine n’a pas de menu ⋯ ; Léa n’en a pas non plus', { skip: skipBrowser }, async () => {
    const lameId = (m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
    const sansCle = (await m.session('antor', 'GET', `/api/univers/${lameId}/fiches`)).json.fiches[0];
    const browser = await launch();
    try {
      for (const [compte, univers, id, titre] of [
        ['antor', lameId, sansCle.id, sansCle.titre],
        ['lea', m.essai, fid, 'Port-Sel'],
      ] as const) {
        const ctx = await browser.newContext({ baseURL: m.base });
        const page = await ctx.newPage();
        page.setDefaultTimeout(30000);
        await page.goto('/connexion-bouchon');
        await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${compte === 'lea' ? 'Léa' : 'Antor'}$`) }).click();
        await attendre(page);
        await page.goto(`/univers/${univers}/fiche/${id}`);
        await page.getByRole('heading', { name: rx(titre) }).first().waitFor();
        await attendre(page);
        const menus = page.getByRole('button', { name: /Autres actions sur la fiche|Autres actions de la fiche/ });
        assert.equal(await menus.count(), 0, `${compte}: unexpected ⋯ menu on the fiche header`);
        assert.doesNotMatch(await texte(page), /Importée|lieu:port-sel/);
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// E-18 « Accès par API » through the browser (B-45, B-46, B-49; P-11; P-10 steps 3, 5, 7, 10).
// ---------------------------------------------------------------------------------------------
const NOMS: Record<string, string> = { antor: 'Antor', lea: 'Léa', mira: 'Mira' };

async function ouvrirSession(browser: Any, m: Monde, compte: string) {
  const ctx = await browser.newContext({ baseURL: m.base, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto('/connexion-bouchon');
  await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${NOMS[compte]}$`) }).click();
  await attendre(page);
  return { ctx, page };
}

async function ouvrirE18(page: Any, m: Monde, univers = m.essai) {
  await page.goto(`/univers/${univers}/acces-api`);
  await page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
  await attendre(page);
}

// Same rendering as the screen's dates (`acces-api/format.ts`), escaped for a RegExp.
const jour = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/[.]/g, '\\.');

const ligne = (page: Any, texte_: string | RegExp) => page.getByRole('listitem').filter({ hasText: texte_ });

describe('E-18 Accès par API au navigateur', { skip: skipBrowser }, () => {
  let m: Monde;
  let browser: Any;
  before(async () => {
    m = await monter();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await m.stop();
  });
  // No test of the block leaves a server clock behind: the tokens of the next ones are created at the real date.
  afterEach(() => {
    m.app.horloge = () => new Date();
  });

  // Title kept (the screen inventory cites it): since E-18 lost its « Jetons » panel the test reads the introduction, the base address and the lots.
  test('P-11 / critère : Antor crée « Script Kanka — Mac », le jeton ne s’affiche qu’une fois, la ligne dit « jamais » et l’expiration', async () => {
    const debut = new Date();
    m.app.horloge = () => debut;
    try {
      const valeur = await jetonDe(m, 'antor');
      const { ctx, page } = await ouvrirSession(browser, m, 'antor');
      await ouvrirE18(page, m);
      const t0 = await texte(page);
      assert.match(t0, /Un script écrit dans cet univers avec vos droits, par l'API d'import\. Ses jetons se gèrent dans Mes jetons d'API\./);
      assert.equal(await page.getByRole('link', { name: 'Mes jetons d’API' }).getAttribute('href'), '/compte/jetons');
      assert.match(t0, /\/api\/v1\/univers\/[^\/\s]+/);
      assert.doesNotMatch(t0, /\/api\/import\/v1/);
      for (const absent of ['Nouveau jeton', 'Aucun jeton', 'Script Kanka — Mac']) assert.doesNotMatch(t0, new RegExp(absent), absent);
      assert.equal(await page.getByRole('heading', { name: 'Jetons', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /Nouveau jeton|Révoquer/ }).count(), 0);
      await page.screenshot({ path: join(SHOTS, 'e18-intro.png') });

      // The token works, once, with the script's call (the effect is proved by the route test): Port-Sel pushed, replayed; E-18 shows two batches.
      await m.api('GET', `${m.essai}`, valeur);
      await pousserEnLot(m, valeur, 'lieu:port-sel', PORT_SEL);
      await pousserEnLot(m, valeur, 'lieu:port-sel', PORT_SEL);
      await page.reload();
      await attendre(page);
      await page.getByText('Fiches : 1 inchangée').first().waitFor();
      const t1 = await texte(page);
      assert.match(t1, /Fiches : 1 créée/);
      assert.match(t1, /Fiches : 1 inchangée/);
      assert.ok(!/Fiches : 0 créée/.test(t1), 'a null count must be omitted');
      assert.match(t1, /Clos/);
      assert.ok(!t1.includes(valeur), 'the value is nowhere on the screen');
      await page.screenshot({ path: join(SHOTS, 'e18-lots.png'), fullPage: true });
      await ctx.close();
    } finally {
      m.app.horloge = () => new Date();
    }
  });

  test('B-49 : un refus et des avertissements se déplient avec la clé d’origine et la raison', async () => {
    const jeton = JETON_BOUCHON;
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);
    const id = await lot(m, jeton);
    await put(m, jeton, 'cr:seance-1', { type: 'compte_rendu', titre: 'Séance 1', sections: [] }, id);
    await put(m, jeton, 'monstre:gob', { type: 'monstre', titre: 'Gobelin', sections: [] }, id);
    await m.api('POST', `${m.essai}/lots/${id}/clore`, jeton);
    // warnings: human title of the section and of the fiche, then replay
    const f = (await fichesDe(m, 'antor')).find((x) => x.titre === 'Port-Sel')!;
    const sec = ((await m.session('antor', 'GET', `/api/univers/${m.essai}/fiches/${f.id}`)).json.sections as Any[]).find((s) => s.titre === 'Description')!;
    await m.session('antor', 'PATCH', `/api/univers/${m.essai}/fiches/${f.id}/sections/${sec.id}`, { titre: 'Aperçu' });
    m.app.db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Port-Sel-sur-Brume', f.id);
    await pousserEnLot(m, jeton, 'lieu:port-sel', PORT_SEL);

    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    const refus = page.getByRole('listitem').filter({ hasText: 'Fiches : 2 refusées' });
    await refus.first().waitFor();
    await refus.first().getByRole('button').first().click();
    await attendre(page);
    const t = await texte(page);
    assert.match(t, /2 refusées/);
    assert.match(t, /cr:seance-1/);
    assert.match(t, /campagne inconnue/);
    assert.match(t, /monstre:gob/);
    assert.match(t, /type « monstre » inconnu de Kanevas/);
    await page.screenshot({ path: join(SHOTS, 'e18-refus.png'), fullPage: true });

    const avert = page.getByRole('listitem').filter({ hasText: '2 avertissements' });
    await avert.first().waitFor();
    await avert.first().getByRole('button').first().click();
    await attendre(page);
    const t2 = await texte(page);
    assert.match(t2, /lieu:port-sel/);
    assert.match(t2, /titre modifié dans Kanevas : non écrasé/);
    assert.match(t2, /section « Aperçu » : titre modifié dans Kanevas : non écrasé/);
    await page.screenshot({ path: join(SHOTS, 'e18-avertissements.png'), fullPage: true });
    await ctx.close();
  });

  test('B-49 : un PUT refusé sans lot ne laisse aucune trace sur E-18', async () => {
    await put(m, JETON_BOUCHON, 'cr:sans-lot', { type: 'compte_rendu', titre: 'Sans lot', sections: [] }); // refused, no batch
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m);
    assert.doesNotMatch(await texte(page), /cr:sans-lot/);
    await ctx.close();
  });

  test('exclusion : Léa, Joueuse, lit « Page introuvable. » à l’adresse de E-18 et l’item n’est pas dans sa barre', async () => {
    const { ctx, page } = await ouvrirSession(browser, m, 'lea');
    await page.goto(`/univers/${m.essai}/acces-api`);
    await page.getByText('Page introuvable.').first().waitFor();
    await attendre(page);
    assert.equal(await page.getByRole('link', { name: 'Accès par API' }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Accès par API' }).count(), 0);
    await page.screenshot({ path: join(SHOTS, 'e18-lea.png') });
    await ctx.close();
  });

  // Title kept (the screen inventory cites it): the « Aucun jeton » line left with the panel.
  test('états vides : un univers sans jeton ni lot dit « Aucun jeton… » et « Aucun lot d’import pour l’instant. »', async () => {
    const cree = await m.session('antor', 'POST', '/api/univers', { nom: 'Univers vierge' });
    assert.equal(cree.status, 201, JSON.stringify(cree.json));
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await ouvrirE18(page, m, cree.json.id);
    const t = await texte(page);
    assert.doesNotMatch(t, /Aucun jeton/);
    assert.match(t, /Aucun lot d'import pour l'instant\./);
    await page.screenshot({ path: join(SHOTS, 'e18-vide.png') });
    await ctx.close();
  });

  test('barre : l’item « Accès par API » est dans la section Univers pour le MJ, et mène à E-18', async () => {
    const { ctx, page } = await ouvrirSession(browser, m, 'antor');
    await page.goto(`/univers/${m.essai}`);
    await attendre(page);
    await page.getByRole('link', { name: 'Accès par API' }).click();
    await page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
    await ctx.close();
  });
});
