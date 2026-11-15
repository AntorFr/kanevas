import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { type Any, attendre, attendreAbsent, attendreTexte, attendreVisible, launch, playwright, skipBrowser } from './harnais.test.js';

// The harness's own test (AD-harnais-1): `attendre` waits for a delayed response and the
// delayed render that follows it, and names the sign that stays when a request never ends.

const PAGE = `<!doctype html><html><body><main id="m">pret</main>
<button id="lent" onclick="fetch('/lent').then(r => r.text()).then(t => { const c = document.createElement('p'); c.setAttribute('role', 'status'); c.textContent = 'Chargement…'; document.body.append(c); setTimeout(() => { c.remove(); document.getElementById('m').textContent = t; }, 400); })">lent</button>
<button id="infini" onclick="fetch('/infini')">infini</button>
<button id="occupe" onclick="document.getElementById('m').setAttribute('aria-busy','true')">occupe</button>
<button id="xhr" onclick="const x = new XMLHttpRequest(); x.open('GET', '/lent'); x.onload = () => { document.getElementById('m').textContent = 'xhr:' + x.responseText; }; x.send()">xhr</button>
<button id="charge" onclick="const c = document.createElement('p'); c.setAttribute('role', 'status'); c.textContent = 'Chargement de la liste…'; document.body.append(c)">charge</button>
<button id="ailleurs" onclick="fetch('http://127.0.0.1:9/autre-origine').catch(() => {})">ailleurs</button>
</body></html>`;

describe('harnais : attendre', { skip: skipBrowser }, () => {
  let srv: Server;
  let base = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;
  const ouverts: Any[] = [];

  before(async () => {
    srv = createServer((req, res) => {
      if (req.url === '/lent') {
        setTimeout(() => res.end('resultat'), 600);
      } else if (req.url === '/infini') {
        ouverts.push(res); // never answered
      } else {
        res.setHeader('content-type', 'text/html');
        res.end(PAGE);
      }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    for (const r of ouverts) r.destroy();
    srv.close();
    srv.closeAllConnections();
  });

  async function page(): Promise<Any> {
    const ctx = await browser.newContext({ baseURL: base });
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    await p.goto('/');
    return p;
  }

  test('rend la main après la réponse retardée et le rendu retardé qui la suit', async () => {
    const p = await page();
    await p.click('#lent');
    await attendre(p);
    assert.equal(await p.locator('#m').textContent(), 'resultat');
  });

  test("'networkidle' d'un appel direct exécute attendre", async () => {
    const p = await page();
    await p.click('#lent');
    await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('#m').textContent(), 'resultat');
  });

  test('une requête qui ne se termine jamais fait échouer en nommant le compteur', async () => {
    const p = await page();
    await p.click('#infini');
    await assert.rejects(attendre(p), /1 requête\(s\) fetch\/XHR en vol/);
  });

  test("un élément aria-busy fait échouer en nommant l'élément occupé", async () => {
    const p = await page();
    await p.click('#occupe');
    await assert.rejects(attendre(p), /aria-busy="true"/);
  });

  test("une requête d'une autre origine n'est pas comptée", async () => {
    const p = await page();
    await p.click('#ailleurs');
    await attendre(p);
  });

  test('les aides attendent le résultat visible', async () => {
    const p = await page();
    await p.click('#lent');
    await attendreTexte(p, 'resultat');
    await attendreVisible(p.locator('#m'));
    await p.evaluate(() => document.getElementById('lent')?.remove());
    await attendreAbsent(p.locator('#lent'));
  });

  test('une requête XHR de même origine est attendue', async () => {
    const p = await page();
    await p.click('#xhr');
    await attendre(p);
    assert.equal(await p.locator('#m').textContent(), 'xhr:resultat');
  });

  test('un role=status « Chargement… » visible fait échouer en le nommant', async () => {
    const p = await page();
    await p.click('#charge');
    await assert.rejects(attendre(p), /Chargement de la liste/);
  });

  test("une navigation pendant l'attente ne fait pas échouer attendre", async () => {
    const p = await page();
    await p.click('#lent');
    const attente = attendre(p);
    await p.goto('/?autre=2');
    await attente;
    assert.match(p.url(), /autre=2/);
  });

  test('un navigateur lancé par chromium.launch directement est équipé aussi', async () => {
    const chromium = playwright.chromium;
    const b = await chromium.launch({ args: ['--no-sandbox'] });
    try {
      const ctx = await b.newContext({ baseURL: base });
      const p = await ctx.newPage();
      p.setDefaultTimeout(8000);
      await p.goto('/');
      await p.click('#lent');
      await p.waitForLoadState('networkidle');
      assert.equal(await p.locator('#m').textContent(), 'resultat');
    } finally {
      await b.close();
    }
  });

  test("une page ouverte par la page (popup) est équipée", async () => {
    const p = await page();
    const [pop] = await Promise.all([p.context().waitForEvent('page'), p.evaluate(() => window.open('/', '_blank'))]);
    await pop.waitForLoadState('domcontentloaded');
    await pop.click('#lent');
    await pop.waitForLoadState('networkidle');
    assert.equal(await pop.locator('#m').textContent(), 'resultat');
  });
});
