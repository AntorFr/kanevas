// Black-box tests of kanevas-relation-badge-pj, from the triage "Livre" / "Critère de sortie" and
// docs/ecrans.md E-9 (Relations block: badge PJ or PNJ for a personnage target, type label otherwise).
// Real server in stub mode + real Chromium. Expected values are literal.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, ligneRelation, launch, section, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let hote = 0; // sheet carrying the relations
let secId = 0;
let cachee = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; corps: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  return { status: r.status(), corps: r.status() === 204 ? null : await r.json() };
}
const urlRel = () => `/api/univers/${U}/fiches/${hote}/sections/${secId}/relations`;
async function ouvrir(page: Any): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${hote}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  await page.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
}
const bloc = (page: Any) => section(page, 'Contacts').getByRole('group', { name: 'Relations' });

describe('kanevas-relation-badge-pj, besoin', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).corps.id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const f = async (type: string, titre: string, pj?: boolean) =>
      (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, ...(pj === undefined ? {} : { charge: { pj } }) })).corps.id as number;
    hote = await f('personnage', 'Capitaine Voss', false);
    const pjId = await f('personnage', 'Kara Ombrelame', true);
    const pnjId = await f('personnage', 'Maître Aldric', false);
    const facId = await f('faction', 'Lames Grises');
    cachee = await f('personnage', 'Spectre Caché', false);
    secId = (await api(antor, 'POST', `/api/univers/${U}/fiches/${hote}/sections`, { titre: 'Contacts', contenu: 'x' })).corps.id;
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${hote}/sections/${secId}`, { joueursLisent: true });
    // Targets readable by players: a section read by players on each, except the hidden one.
    for (const id of [pjId, pnjId, facId]) {
      const s = (await api(antor, 'POST', `/api/univers/${U}/fiches/${id}/sections`, { titre: 'Visible', contenu: 'x' })).corps.id;
      await api(antor, 'PATCH', `/api/univers/${U}/fiches/${id}/sections/${s}`, { joueursLisent: true });
    }
    await api(antor, 'POST', `/api/univers/${U}/fiches/${cachee}/sections`, { titre: 'Secret', contenu: 'x' });
    for (const [id, type] of [[pjId, 'allié de'], [pnjId, 'mentor de'], [facId, 'membre de'], [cachee, 'craint']] as const) {
      const r = await api(antor, 'POST', urlRel(), { cibleFicheId: id, type });
      assert.equal(r.status, 201);
    }
  }, { timeout: 180000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('route : la cible personnage porte charge {pj}, exactement, la cible faction n’en porte pas', async () => {
    const { status, corps } = await api(antor, 'GET', urlRel());
    assert.equal(status, 200);
    const par = (t: string) => corps.relations.find((r: Any) => r.type === t).cible;
    assert.deepEqual(par('allié de').charge, { pj: true });
    assert.deepEqual(par('mentor de').charge, { pj: false });
    assert.equal('charge' in par('membre de'), false);
    assert.equal(par('allié de').titre, 'Kara Ombrelame');
  });

  test('route : la cible ne livre rien de plus que le badge (aucune autre donnée de la fiche cible)', async () => {
    const { corps } = await api(antor, 'GET', urlRel());
    for (const r of corps.relations) {
      assert.deepEqual(Object.keys(r.cible).sort(), r.cible.type === 'personnage' ? ['charge', 'id', 'titre', 'type'] : ['id', 'titre', 'type']);
      if (r.cible.charge) assert.deepEqual(Object.keys(r.cible.charge), ['pj']);
    }
  });

  test('route : relier un personnage rend 201 avec charge {pj} dans la cible', async () => {
    const extra = (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: 'Nouvelle PJ', charge: { pj: true } })).corps.id;
    const r = await api(antor, 'POST', urlRel(), { cibleFicheId: extra, type: 'recrute' });
    assert.equal(r.status, 201);
    assert.deepEqual(r.corps.cible.charge, { pj: true });
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/relations/${r.corps.id}`);
  });

  test('route : Léa reçoit la charge des cibles qu’elle lit et aucune trace de la cible cachée', async () => {
    const { status, corps } = await api(lea, 'GET', urlRel());
    assert.equal(status, 200);
    const types = corps.relations.map((r: Any) => r.type).sort();
    assert.deepEqual(types, ['allié de', 'membre de', 'mentor de']);
    assert.deepEqual(corps.relations.find((r: Any) => r.type === 'allié de').cible.charge, { pj: true });
    assert.ok(!JSON.stringify(corps).includes('Spectre'));
  });

  test('écran : la fiche s’ouvre et la ligne porte PJ pour un PJ, PNJ pour un PNJ, le type pour une faction', async () => {
    await ouvrir(antor);
    const b = bloc(antor);
    await ligneRelation(antor, 'allié de', 'Kara Ombrelame').waitFor();
    const l = async (lien: string, cible: string) => (await ligneRelation(antor, lien, cible).innerText()).replace(/\s+/g, ' ');
    const pj = await l('allié de', 'Kara Ombrelame');
    assert.match(pj, /(^|\s)PJ(\s|$)/, pj);
    assert.doesNotMatch(pj, /PNJ/, pj);
    const pnj = await l('mentor de', 'Maître Aldric');
    assert.match(pnj, /(^|\s)PNJ(\s|$)/, pnj);
    assert.doesNotMatch(pnj, /(^|\s)PJ(\s|$)/, pnj);
    const fac = await l('membre de', 'Lames Grises');
    assert.match(fac, /Faction/, fac);
    assert.doesNotMatch(fac, /PJ|PNJ/, fac);
    assert.equal(await antor.getByRole('heading', { level: 1 }).innerText(), 'Capitaine Voss');
    assert.equal(await b.locator('.liste-relations > li').count(), 4);
    await antor.screenshot({ path: '/tmp/badge-pj-antor.png' });
  });

  test('écran : Léa, joueuse, voit les mêmes badges et pas la cible cachée', async () => {
    await ouvrir(lea);
    await ligneRelation(lea, 'allié de', 'Kara Ombrelame').waitFor();
    assert.match(await ligneRelation(lea, 'allié de', 'Kara Ombrelame').innerText(), /(^|\s)PJ(\s|$)/);
    assert.match(await ligneRelation(lea, 'mentor de', 'Maître Aldric').innerText(), /(^|\s)PNJ(\s|$)/);
    assert.equal(await lea.getByText('Spectre Caché').count(), 0);
    await lea.screenshot({ path: '/tmp/badge-pj-lea.png' });
  });

  test('écran : relier un personnage depuis le formulaire laisse la fiche ouverte avec son badge', async () => {
    await ouvrir(antor);
    const b = bloc(antor);
    await b.getByRole('button', { name: /^Relier à une fiche$/ }).click();
    await b.getByLabel('Type de relation').fill('rival de');
    await b.getByLabel('Type de fiche').selectOption({ label: 'Personnage' });
    await b.getByLabel('Chercher dans les personnages').fill('Kara');
    await b.getByRole('button', { name: /^Chercher$/ }).click();
    await b.locator('button.choix-fiche').filter({ hasText: 'Kara Ombrelame' }).click();
    await b.getByRole('button', { name: /^Relier$/ }).click();
    const ligne = ligneRelation(antor, 'rival de', 'Kara Ombrelame');
    await ligne.waitFor();
    assert.match(await ligne.innerText(), /(^|\s)PJ(\s|$)/);
    assert.equal(await antor.getByRole('heading', { level: 1 }).innerText(), 'Capitaine Voss');
  });

  test('échec : cible personnage sans charge dans la réponse, l’écran ne plante pas et montre le libellé du type', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, storageState: await antor.context().storageState() });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    const erreurs: string[] = [];
    p.on('pageerror', (e: Error) => erreurs.push(e.message));
    await p.route('**/sections/*/relations*', async (route: Any) => {
      if (route.request().method() !== 'GET') return route.continue();
      const rep = await route.fetch();
      const j = await rep.json();
      for (const r of j.relations) delete r.cible.charge;
      await route.fulfill({ response: rep, json: j });
    });
    await ouvrir(p);
    const ligne = ligneRelation(p, 'allié de', 'Kara Ombrelame');
    await ligne.waitFor();
    const t = (await ligne.innerText()).replace(/\s+/g, ' ');
    assert.match(t, /Personnage/, t);
    assert.doesNotMatch(t, /PJ|PNJ/, t);
    assert.equal(await p.getByRole('heading', { level: 1 }).innerText(), 'Capitaine Voss');
    assert.deepEqual(erreurs, []);
    await p.screenshot({ path: '/tmp/badge-pj-sans-charge.png' });
    await ctx.close();
  });
});
