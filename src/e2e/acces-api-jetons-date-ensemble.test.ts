// Independent acceptance tests of the E-18 tokens screen, written from the need only (docs/parcours.md
// B-45, B-46, P-11; docs/ecrans.md E-18): whatever day the suite is played, a token created for 30 days
// is shown « jamais » + « expire le <creation + 30 days> », a revoked one « Révoqué », a lapsed GM's one
// « Inactif », and only an expired one « Expiré ». The real server runs in stub mode (AD-55) in this
// process; the server clock (`app.horloge`) and the browser clock (`page.clock`) are the only things moved.
//
// PLAN DE TEST (besoin -> famille -> cas)
//  P-11 nominal    both clocks on 15 Mar 2027 12:00Z: Antor creates « Jeton horloge » (default duration): the row says
//                  « jamais » and « expire le 14 avr. 2027 », created « 15 mars 2027 », no « Expiré ».
//  P-11 bords      browser at +29 d 23 h: still « expire le 14 avr. 2027 », not « Expiré »; at +30 d 1 h: « Expiré ».
//  P-11 jour réel  both clocks real (no clock moved): a fresh token is never « Expiré », it says « jamais ».
//  B-46 révocation real clocks, after the fixed-clock tests above: « Révoquer » -> « Révoqué », the token gets 401.
//  B-46 inactif    Mira turned Joueuse: her row says « Inactif », not « Expiré », with real clocks.
//  exclusion       a token created while the server clock was moved never leaves it moved for the next test.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = join(process.cwd(), 'dist/public');
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { attendre, launch, skipBrowser } = await import('./harnais.test.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const T0 = new Date('2027-03-15T12:00:00.000Z');
const NOMS: Record<string, string> = { antor: 'Antor', mira: 'Mira' };

describe('E-18 jetons : dates et états indépendants du jour', { skip: skipBrowser }, () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let base = '';
  let essai = 0;
  let browser: Any;
  const cookies = new Map<string, string>();

  const session = async (compte: string, method: string, url: string, payload?: Record<string, unknown>) => {
    if (!cookies.has(compte)) {
      const r = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
      cookies.set(compte, `kanevas_session=${r.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, ...(payload ? { payload } : {}) });
    return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
  };

  async function ouvrir(compte: string) {
    const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: new RegExp(`^Se connecter en tant que ${NOMS[compte]}$`) }).click();
    await attendre(page);
    return { ctx, page };
  }
  async function e18(page: Any) {
    await page.goto(`/univers/${essai}/acces-api`);
    await page.getByRole('heading', { name: 'Accès par API', level: 1 }).waitFor();
  }
  async function creer(page: Any, nom: string): Promise<string> {
    await page.getByRole('button', { name: 'Nouveau jeton' }).click();
    const boite = page.getByRole('dialog', { name: 'Nouveau jeton' });
    await boite.getByRole('textbox', { name: /Nom/ }).fill(nom);
    await boite.getByRole('button', { name: 'Créer le jeton' }).click();
    await page.getByText('Il ne sera plus jamais affiché.').first().waitFor();
    const valeur = ((await page.locator('body').innerText()) as string).match(/kvs_[A-Za-z0-9_-]+/)?.[0];
    assert.ok(valeur, 'token shown once');
    return valeur;
  }
  const ligne = (page: Any, nom: string) => page.getByRole('listitem').filter({ hasText: nom }).first();

  before(async () => {
    app = await buildApp();
    assert.equal(semerBouchon(app.db), true);
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await app.close();
  });

  test('nominal : horloges au 15 mars 2027, jeton 30 jours -> « jamais », « expire le 14 avr. 2027 », pas « Expiré »', async () => {
    const { ctx, page } = await ouvrir('antor');
    try {
      app.horloge = () => T0;
      await page.clock.setFixedTime(T0);
      await e18(page);
      await creer(page, 'Jeton horloge');
      await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
      const l = ligne(page, 'Jeton horloge');
      await l.waitFor();
      const t = (await l.innerText()) as string;
      assert.match(t, /jamais/);
      assert.match(t, /expire le 14 avr\. 2027/);
      assert.match(t, /15 mars 2027/);
      assert.doesNotMatch(t, /Expiré/);
    } finally {
      app.horloge = () => new Date();
      await ctx.close();
    }
  });

  test('bords : à 29 j 23 h après la création le jeton court encore, à 30 j 1 h il est « Expiré »', async () => {
    const { ctx, page } = await ouvrir('antor');
    try {
      app.horloge = () => T0;
      await page.clock.setFixedTime(new Date(T0.getTime() + 29 * 86400_000 + 23 * 3600_000));
      await e18(page);
      let t = (await ligne(page, 'Jeton horloge').innerText()) as string;
      assert.match(t, /expire le 14 avr\. 2027/);
      assert.doesNotMatch(t, /Expiré/);
      await page.clock.setFixedTime(new Date(T0.getTime() + 30 * 86400_000 + 3600_000));
      await e18(page);
      t = (await ligne(page, 'Jeton horloge').innerText()) as string;
      assert.match(t, /Expiré/);
    } finally {
      app.horloge = () => new Date();
      await ctx.close();
    }
  });

  test('jour réel : jeton créé avec les horloges réelles -> « jamais », jamais « Expiré »', async () => {
    const { ctx, page } = await ouvrir('antor');
    try {
      await e18(page);
      await creer(page, 'Jeton du jour');
      await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
      const l = ligne(page, 'Jeton du jour');
      await l.waitFor();
      const t = (await l.innerText()) as string;
      assert.match(t, /jamais/);
      assert.match(t, /expire le/);
      assert.doesNotMatch(t, /Expiré/);
    } finally {
      await ctx.close();
    }
  });

  test('B-46 : « Révoquer » (horloges réelles, après les tests à horloge déplacée) -> « Révoqué », le jeton reçoit 401 sans lot', async () => {
    const { ctx, page } = await ouvrir('antor');
    try {
      await e18(page);
      const valeur = await creer(page, 'À révoquer');
      await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
      const l = ligne(page, 'À révoquer');
      await l.waitFor();
      const ok = await app.inject({ method: 'GET', url: `/api/import/v1/univers/${essai}`, headers: { authorization: `Bearer ${valeur}` } });
      assert.equal(ok.statusCode, 200);
      await l.hover();
      await l.getByRole('button', { name: /Révoquer/ }).click();
      const boite = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
      await boite.waitFor();
      assert.match(((await boite.innerText()) as string).replace(/\s+/g, ' '), /Révoquer « À révoquer » \? Le script/);
      await boite.getByRole('button', { name: 'Révoquer le jeton' }).click();
      await page.getByText('Jeton révoqué.').first().waitFor();
      await ligne(page, 'À révoquer').filter({ hasText: /Révoqué/ }).waitFor();
      assert.doesNotMatch((await ligne(page, 'À révoquer').innerText()) as string, /Expiré/);
      const lotsAvant = (app.db.prepare('SELECT count(*) AS n FROM lots_import').get() as { n: number }).n;
      const r = await app.inject({ method: 'POST', url: `/api/import/v1/univers/${essai}/lots`, headers: { authorization: `Bearer ${valeur}` } });
      assert.equal(r.statusCode, 401);
      assert.deepEqual(JSON.parse(r.body), { message: 'Jeton invalide.', code: 'jeton_invalide' });
      assert.equal((app.db.prepare('SELECT count(*) AS n FROM lots_import').get() as { n: number }).n, lotsAvant);
    } finally {
      await ctx.close();
    }
  });

  test('B-46 : le jeton de Mira passée Joueuse reste listé « Inactif », pas « Expiré »', async () => {
    assert.equal((await session('antor', 'POST', `/api/univers/${essai}/membres`, { username: 'mira', role: 'mj' })).status, 201);
    const c = await session('mira', 'POST', `/api/univers/${essai}/jetons`, { nom: 'Jeton de Mira', dureeJours: 30 });
    assert.equal(c.status, 201);
    const mira = (app.db.prepare("SELECT id FROM comptes WHERE username = 'mira'").get() as { id: number }).id;
    assert.equal((await session('antor', 'PATCH', `/api/univers/${essai}/membres/${mira}`, { role: 'joueur' })).status, 200);
    const { ctx, page } = await ouvrir('antor');
    try {
      await e18(page);
      const l = ligne(page, 'Jeton de Mira');
      await l.waitFor();
      const t = (await l.innerText()) as string;
      assert.match(t, /Inactif/);
      assert.doesNotMatch(t, /Expiré/);
    } finally {
      await ctx.close();
    }
  });
});
