// Review of kanevas-relation-badge-pj-cible: E-9 shows the badge of a relation's target
// (PJ / PNJ / type label) and opens even when the answer carries no `charge`. Real server (stub) + Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, ligneRelation, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
let depart = 0;
let sectionId = 0;

async function api(method: string, url: string, data?: unknown): Promise<Any> {
  const r = await antor.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
const bloc = (page: Any) => section(page, 'Liens').getByRole('group', { name: 'Relations' });
async function ouvrir(): Promise<void> {
  await antor.goto(`/univers/${U}/fiche/${depart}`);
  await antor.getByRole('heading', { level: 1 }).waitFor();
  await attendre(antor);
  await bloc(antor).getByRole('link', { name: 'Léandre' }).waitFor();
}

describe('kanevas-relation-badge-pj-cible, E-9 badge de la cible', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    U = (await api('POST', '/api/univers', { nom: 'Badge' })).id;
    const f = (type: string, titre: string, charge?: object) =>
      api('POST', `/api/univers/${U}/fiches`, { type, titre, ...(charge ? { charge } : {}) });
    depart = (await f('lieu', 'Départ')).id;
    const pj = (await f('personnage', 'Léandre', { pj: true })).id;
    const pnj = (await f('personnage', 'Aldric', { pj: false })).id;
    const fac = (await f('faction', 'Lames Grises')).id;
    sectionId = (await api('POST', `/api/univers/${U}/fiches/${depart}/sections`, { titre: 'Liens', contenu: 'x' })).id;
    const rel = `/api/univers/${U}/fiches/${depart}/sections/${sectionId}/relations`;
    for (const [id, type] of [[pj, 'ami'], [pnj, 'maître'], [fac, 'membre']] as const) {
      await api('POST', rel, { cibleFicheId: id, type });
    }
  }, { timeout: 180000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('la fiche reliée à des personnages s’ouvre : PJ, PNJ et libellé du type', async () => {
    await ouvrir();
    await antor.screenshot({ path: '/tmp/badge-nominal.png' });
    assert.match(await ligneRelation(antor, 'ami', 'Léandre').innerText(), /\bPJ\b/);
    const pnj = await ligneRelation(antor, 'maître', 'Aldric').innerText();
    assert.match(pnj, /\bPNJ\b/);
    assert.doesNotMatch(pnj, /\bPJ\b/);
    const fac = await ligneRelation(antor, 'membre', 'Lames Grises').innerText();
    assert.match(fac, /Faction/);
    assert.doesNotMatch(fac, /\bPN?J\b/);
  });

  test('une réponse sans charge pour un personnage : la fiche s’ouvre, libellé du type, pas d’erreur', async () => {
    const erreurs: string[] = [];
    antor.on('pageerror', (e: Error) => erreurs.push(e.message));
    await antor.route('**/relations', async (route: Any) => {
      if (route.request().method() !== 'GET') return route.continue();
      const rep = await route.fetch();
      const corps = await rep.json();
      for (const r of corps.relations) delete r.cible.charge;
      await route.fulfill({ response: rep, json: corps });
    });
    await ouvrir();
    await antor.screenshot({ path: '/tmp/badge-sans-charge.png' });
    const l = await ligneRelation(antor, 'ami', 'Léandre').innerText();
    assert.match(l, /Personnage/);
    assert.doesNotMatch(l, /\bPN?J\b/);
    assert.deepEqual(erreurs, []);
    assert.equal(await antor.getByText(/erreur/i).count(), 0);
  });
});
