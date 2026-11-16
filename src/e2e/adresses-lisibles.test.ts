// Review tests of kanevas-synchro-cles-adresses (B-101, P-22): the sheet screen opens at readable addresses and
// brings numeric and former addresses back to them without a history entry; a player's address stays as typed.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let uCle = '';
const fiches: Record<string, Any> = {};

async function api(page: Any, chemin: string, methode = 'GET', data?: Any) {
  const r = await page.request.fetch(srv.base + chemin, { method: methode, data });
  return { statut: r.status(), corps: await r.json().catch(() => null) };
}

describe('kanevas-synchro-cles-adresses, adresses lisibles', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_STUB: '1', KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = (await api(antor, '/api/univers')).corps;
    const u = us.find((x: Any) => x.nom === "Lame d'Ébène");
    U = u.id;
    uCle = u.cle;
    assert.ok(uCle && !/^\d+$/.test(uCle), 'l’univers porte une clé lisible');
    for (const q of ['Port-Sel', 'Sphères']) {
      const r = (await api(antor, `/api/univers/${U}/fiches?q=${encodeURIComponent(q)}`)).corps;
      for (const f of r.fiches) fiches[f.titre] = f;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const contexte = async (page: Any, largeur = 1280, th: 'light' | 'dark' = 'light') => {
    const ctx = await browser.newContext({ storageState: await page.context().storageState(), colorScheme: th, baseURL: srv.base, viewport: { width: largeur, height: 800 } });
    await ctx.addInitScript('window.__name = (f) => f;');
    return ctx;
  };

  test('un id numérique ouvre la fiche et l’adresse devient /univers/<u>/<type>/<nom> sans entrée d’historique', async () => {
    const f = (await api(antor, `/api/univers/${U}/fiches/${fiches['Port-Sel'].id}`)).corps;
    assert.match(f.cle, /^[a-z-]+:[a-z0-9_-]+$/, 'clé à deux parties');
    const ctx = await contexte(antor);
    const page = await ctx.newPage();
    await page.goto('/univers');
    const avant = await page.evaluate(() => history.length);
    await page.evaluate((u: string) => { history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')); }, `/univers/${U}/fiche/${f.id}`);
    await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    const [a, b] = f.cle.split(':');
    await page.waitForFunction((att: string) => location.pathname === att, `/univers/${uCle}/${a}/${b}`);
    assert.equal(await page.evaluate(() => history.length), avant + 1, 'une seule entrée ajoutée (le pushState du test)');
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, '/univers', 'retour arrière = lieu précédent');
    await ctx.close();
  });

  test('l’adresse lisible s’ouvre telle quelle, et la forme /fiche/<clé> d’une clé de type est corrigée', async () => {
    const f = (await api(antor, `/api/univers/${U}/fiches/${fiches['Port-Sel'].id}`)).corps;
    const [a, b] = f.cle.split(':');
    const ctx = await contexte(antor);
    const page = await ctx.newPage();
    await page.goto(`/univers/${uCle}/${a}/${b}`);
    await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, `/univers/${uCle}/${a}/${b}`);
    await page.goto(`/univers/${uCle}/fiche/${f.cle}`);
    await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await page.waitForFunction((att: string) => location.pathname === att, `/univers/${uCle}/${a}/${b}`);
    await ctx.close();
  });

  test('une clé hors des types s’ouvre et reste à /fiche/<clé> ; une clé sans « : » aussi', async () => {
    const id = fiches['Les Sphères'].id;
    for (const cle of ['zzz:hors-type', 'ancre-seule']) {
      const r = await api(antor, `/api/univers/${U}/fiches/${id}`, 'PATCH', { cle });
      assert.ok(r.statut < 300, `PATCH ${cle}: ${r.statut}`);
      const ctx = await contexte(antor);
      const page = await ctx.newPage();
      await page.goto(`/univers/${U}/fiche/${id}`);
      await page.getByRole('heading', { level: 1, name: 'Les Sphères', exact: true }).waitFor();
      await page.waitForFunction((att: string) => location.pathname === att, `/univers/${uCle}/fiche/${cle}`);
      await page.reload();
      await page.getByRole('heading', { level: 1, name: 'Les Sphères', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, `/univers/${uCle}/fiche/${cle}`);
      await ctx.close();
    }
  });

  test('une ancienne clé (PATCH {cle}) ouvre la fiche et l’adresse se corrige', async () => {
    const id = fiches['Port-Sel'].id;
    const avant = (await api(antor, `/api/univers/${U}/fiches/${id}`)).corps.cle;
    const [a] = avant.split(':');
    const r = await api(antor, `/api/univers/${U}/fiches/${id}`, 'PATCH', { cle: `${a}:port-neuf` });
    assert.ok(r.statut < 300, `PATCH ${r.statut}`);
    const ctx = await contexte(antor);
    const page = await ctx.newPage();
    await page.goto(`/univers/${uCle}/${avant.replace(':', '/')}`);
    await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await page.waitForFunction((att: string) => location.pathname === att, `/univers/${uCle}/${a}/port-neuf`);
    await ctx.close();
  });

  test('clé inconnue : « Page introuvable. », adresse inchangée', async () => {
    const ctx = await contexte(antor);
    const page = await ctx.newPage();
    await page.goto(`/univers/${uCle}/lieu/n-existe-pas`);
    await page.getByText('Page introuvable.').first().waitFor();
    assert.equal(new URL(page.url()).pathname, `/univers/${uCle}/lieu/n-existe-pas`);
    await ctx.close();
  });

  test('un joueur ouvert en navigation interne garde l’adresse numérique (son corps n’a pas de clé)', async () => {
    const lues = (await api(lea, `/api/univers/${U}/fiches?q=Port-Sel`)).corps.fiches;
    const cible = lues.find((f: Any) => f.titre === 'Port-Sel');
    assert.ok(cible, 'Léa lit Port-Sel');
    assert.equal((await api(lea, `/api/univers/${U}/fiches/${cible.id}`)).corps.cle, undefined, 'pas de cle dans le corps d’un joueur');
    const ctx = await contexte(lea);
    const page = await ctx.newPage();
    await page.goto('/univers');
    await page.evaluate((u: string) => { history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')); }, `/univers/${U}/fiche/${cible.id}`);
    await page.getByRole('heading', { level: 1, name: 'Port-Sel', exact: true }).waitFor();
    await page.waitForLoadState('networkidle'); // the replace, if any, would have happened with the load
    assert.equal(new URL(page.url()).pathname, `/univers/${U}/fiche/${cible.id}`);
    await ctx.close();
  });

  test('les liens de la barre latérale portent la clé de l’univers (clair 1280, sombre 390)', async () => {
    for (const [l, th] of [[1280, 'light'], [390, 'dark']] as const) {
      const ctx = await contexte(antor, l, th);
      const page = await ctx.newPage();
      await page.goto(`/univers/${U}/recherche`);
      await page.waitForFunction((c: string) => [...document.querySelectorAll('a[href^="/univers/"]')].some((a) => a.getAttribute('href')!.startsWith(`/univers/${c}/`)), uCle);
      const hrefs: string[] = await page.evaluate(() => [...document.querySelectorAll('a[href^="/univers/"]')].map((a) => a.getAttribute('href')!));
      const num = hrefs.filter((h) => new RegExp(`^/univers/${U}(/|$)`).test(h));
      assert.deepEqual(num, [], `liens numériques restants (${l}px): ${num.join(', ')}`);
      assert.ok(hrefs.some((h) => h === `/univers/${uCle}/recherche`), 'lien Recherche en clé');
      await page.screenshot({ path: `/tmp/adresses-barre-${th}-${l}.png` });
      await ctx.close();
    }
  });
});
