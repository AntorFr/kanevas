// ecrans: jetons
// Screen tests of kanevas-synchro-jetons, written from the feature sheet (critère de sortie), docs/ecrans.md (E-23, E-5)
// and docs/parcours.md (P-25), not from the code. Stub world with the seed. Screenshots: /tmp/cap-jetons-besoin (outside the tree).
// The effects (403 lecture_seule, 401 jeton_invalide, rights) are proved at their doors in src/routes/jetons-ensemble-besoin.test.ts;
// here: the nominal of each gesture, and what the screen shows.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, type Any } from './harnais.test.ts';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
type Server = { base: string; stop: () => void };

const SHOTS = '/tmp/cap-jetons-besoin';

describe('E-23 et E-5 : Léa crée un jeton lecture, l\'admin le révoque, le MJ ne le voit pas', { skip: skipBrowser, timeout: 400000 }, () => {
  let srv: Server;
  let browser: Any;
  before(async () => {
    const app = await buildApp();
    assert.ok(semerBouchon(app.db));
    await app.listen({ host: '127.0.0.1', port: 0 });
    srv = { base: `http://127.0.0.1:${(app.server.address() as { port: number }).port}`, stop: () => void app.close() };
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  it('parcours P-25 : création, valeur montrée une fois, GET 200 / PUT 403, E-5 révoque, 401, le MJ ne voit rien', async () => {
    const lea = await connecte(browser, srv.base, 'léa');
    const page = lea.page;
    await page.goto('/compte/jetons');
    await page.getByRole('heading', { name: /Mes jetons d.API/ }).waitFor();
    await page.getByRole('button', { name: 'Créer un jeton' }).first().click();
    await page.getByLabel('Nom').fill('Agent de Léa');
    await page.getByText(/Une liste d.univers/).first().click();
    // « Lame d'Ébène » at « Lecture »
    const ligne = page.getByRole('list', { name: 'Accès par univers' }).getByRole('listitem').filter({ hasText: /Lame d.Ébène/ });
    await ligne.getByRole('radio', { name: 'Lecture', exact: true }).click();
    const reponse = page.waitForResponse((r: Any) => r.url().includes('/api/compte/jetons') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Créer le jeton' }).click();
    const rep = await reponse;
    assert.equal(rep.status(), 201);
    const valeur: string = (await rep.json()).valeur;
    assert.match(valeur, /^kvs_/);
    await page.getByText(valeur).waitFor();
    await page.getByText('Il ne sera plus affiché.').waitFor();
    await page.screenshot({ path: `${SHOTS}/valeur.png`, fullPage: true });
    await page.getByRole('button', { name: /J.ai copié le jeton/ }).click();
    await page.getByText('Agent de Léa').first().waitFor();
    assert.equal(await page.getByText(valeur).count(), 0, 'la valeur ne reste pas affichée');
    await page.getByText(/Lame d'Ébène : lecture/).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/liste-lea.png`, fullPage: true });

    // the token at its door
    const us = (await (await page.request.get('/api/univers')).json()) as Any;
    const lame = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id as number;
    const h = { authorization: `Bearer ${valeur}` };
    assert.equal((await fetch(`${srv.base}/api/v1/univers/${lame}`, { headers: h })).status, 200);
    const put = await fetch(`${srv.base}/api/v1/univers/${lame}/fiches/lieu:x`, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: '{"type":"lieu","titre":"X","sections":[]}' });
    assert.equal(put.status, 403);
    assert.equal(((await put.json()) as Any).code, 'lecture_seule');

    // the GM sees nothing of it: E-18 (batches only) and his own E-23
    const antor = await connecte(browser, srv.base, 'antor');
    await antor.page.goto('/compte/jetons');
    await antor.page.getByRole('heading', { name: /Mes jetons d/ }).waitFor();
    assert.equal(await antor.page.getByText('Agent de Léa').count(), 0, 'le MJ ne voit pas le jeton de Léa');
    await antor.page.goto(`/univers/${lame}/acces-api`);
    await antor.page.getByRole('heading', { name: 'Accès par API' }).waitFor();
    assert.equal(await antor.page.getByText('Agent de Léa').count(), 0, 'E-18 ne liste plus de jeton');
    assert.equal(await antor.page.getByRole('button', { name: 'Révoquer' }).count(), 0, 'aucun geste de révocation pour le MJ');

    // the instance admin: E-5
    const admin = await connecte(browser, srv.base, 'admin');
    await admin.page.goto('/administration');
    await admin.page.getByText(/Jetons d.API/).first().waitFor();
    const ligneAdmin = admin.page.locator('tr, li, div', { hasText: 'Agent de Léa' }).last();
    await ligneAdmin.waitFor();
    assert.equal(await admin.page.getByText(valeur).count(), 0, 'la valeur n\'est jamais montrée sur E-5');
    await admin.page.screenshot({ path: `${SHOTS}/e5.png`, fullPage: true });
    await ligneAdmin.getByRole('button', { name: 'Révoquer' }).first().click();
    const rev = admin.page.waitForResponse((r: Any) => r.url().includes('/api/instance/jetons/') && r.request().method() === 'DELETE');
    await admin.page.getByRole('button', { name: 'Révoquer le jeton' }).click();
    assert.equal((await rev).status(), 200);
    await admin.page.getByText('Révoqué').first().waitFor();

    const apres = await fetch(`${srv.base}/api/v1/univers/${lame}`, { headers: h });
    assert.equal(apres.status, 401);
    assert.equal(((await apres.json()) as Any).code, 'jeton_invalide');

    // Léa reads « Révoqué par l'admin »
    await page.goto('/compte/jetons');
    await page.getByText(/Révoqué par l.admin/).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/revoque-par-admin.png`, fullPage: true });
  });

  it('E-23 état vide : un compte sans jeton lit « Aucun jeton. »', async () => {
    const mira = await connecte(browser, srv.base, 'mira');
    await mira.page.goto('/compte/jetons');
    await mira.page.getByText('Aucun jeton.').waitFor();
    await mira.page.screenshot({ path: `${SHOTS}/vide.png`, fullPage: true });
  });
});
