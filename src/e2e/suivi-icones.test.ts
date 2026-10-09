// Black-box test of the icons of E-6 / E-13 (docs/charte.md, maquette e06): reports = notebook-pen
// (as the navigation), scenarios = file-text. Panne visée : FileText on reports, no icon on scenarios.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, connecte, creerUnivers, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let page: Any;
let uid = '';
let cid = 0;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  page = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(page, 'Icônes');
  await page.getByRole('heading', { name: 'Icônes', level: 1 }).waitFor();
  uid = new URL(page.url()).pathname.split('/').pop()!;
  const c = await (await page.request.post(`/api/univers/${uid}/campagnes`, { data: { nom: 'Camp ico' } })).json();
  cid = c.id;
  await page.request.post(`/api/campagnes/${cid}/scenarios`, { data: { titre: 'Scén ico' } });
  const r = await page.request.post(`/api/univers/${uid}/comptes-rendus`, { data: { campagneId: cid, titre: 'CR ico' } });
  assert.equal(r.status(), 201);
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

const icones = (loc: Any) => loc.locator('svg').evaluateAll((l: Element[]) => l.map((s) => s.getAttribute('class') ?? ''));

test('E-6 : scénario en file-text, compte-rendu en notebook-pen', opts, async () => {
  await page.goto(`/univers/${uid}/campagnes/${cid}`);
  const scen = page.getByRole('link', { name: /Scén ico/ });
  await scen.waitFor();
  assert.ok((await icones(scen)).some((c: string) => c.includes('lucide-file-text')), 'scénario');
  const cr = page.getByRole('link', { name: /CR ico/ });
  await cr.waitFor();
  const ic = await icones(cr);
  assert.ok(ic.some((c: string) => c.includes('lucide-notebook-pen')), 'compte-rendu');
  assert.ok(!ic.some((c: string) => c.includes('lucide-file-text')));
});

test('E-13 : lignes en notebook-pen', opts, async () => {
  await page.goto(`/univers/${uid}/comptes-rendus`);
  const cr = page.getByRole('link', { name: /CR ico/ });
  await cr.waitFor();
  const ic = await icones(cr);
  assert.ok(ic.some((c: string) => c.includes('lucide-notebook-pen')));
  assert.ok(!ic.some((c: string) => c.includes('lucide-file-text')));
});
