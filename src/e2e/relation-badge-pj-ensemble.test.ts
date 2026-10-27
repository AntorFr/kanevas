// Black-box tests of kanevas-relation-badge-pj, from the need alone (Monsieur's "Livre" / "Précision"
// messages and docs/ecrans.md, E-9 bloc Relations): a sheet with a relation to a character opens, and
// the relation line carries « PJ » / « PNJ » of the target, the type label otherwise.
// Real server in stub mode + real Chromium.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, section, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const id: Record<string, number> = {};
let secSource = 0;
let erreursPage: string[] = [];

async function api(page: Any, method: string, url: string, data?: unknown, ok = true): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  if (ok) assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
const base = () => `/api/univers/${U}/fiches`;
async function fiche(type: string, titre: string, charge?: unknown, lisible = true): Promise<number> {
  const f = await api(antor, 'POST', base(), { type, titre, ...(charge ? { charge } : {}) });
  const s = await api(antor, 'POST', `${base()}/${f.id}/sections`, { titre: 'Résumé', contenu: 'x' });
  if (lisible) await api(antor, 'PATCH', `${base()}/${f.id}/sections/${s.id}`, { joueursLisent: true });
  return f.id;
}
const relier = (cible: number, type: string) =>
  api(antor, 'POST', `${base()}/${id.source}/sections/${secSource}/relations`, { cibleFicheId: cible, type });
async function ouvrir(page: Any): Promise<void> {
  erreursPage = [];
  page.on('pageerror', (e: Error) => erreursPage.push(e.message));
  await page.goto(`/univers/${U}/fiche/${id.source}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  await page.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
}
const bloc = (page: Any) => section(page, 'Apparence').getByRole('group', { name: 'Relations' });
const ligne = (page: Any, cible: string) => bloc(page).getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(cible) }) });

describe('kanevas-relation-badge-pj, E-9 badge de la cible', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    id.source = (await api(antor, 'POST', base(), { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).id;
    secSource = (await api(antor, 'POST', `${base()}/${id.source}/sections`, { titre: 'Apparence', contenu: 'Grand.' })).id;
    await api(antor, 'PATCH', `${base()}/${id.source}/sections/${secSource}`, { joueursLisent: true });
    id.pj = await fiche('personnage', 'Mira la Lame', { pj: true });
    id.pnj = await fiche('personnage', 'Gorbal le Forgeron', { pj: false });
    id.faction = await fiche('faction', 'Lames Grises');
    id.lieu = await fiche('lieu', 'Port-Sombre');
    id.cache = await fiche('personnage', 'Espion Secret', { pj: true }, false);
    await relier(id.pj, 'allié de');
    await relier(id.pnj, 'forgé par');
    await relier(id.faction, 'membre de');
    await relier(id.lieu, 'habite');
    await relier(id.cache, 'espionne');
  }, { timeout: 180000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('nominal : la fiche s’ouvre, PJ pour un PJ, PNJ pour un PNJ, libellé du type sinon (MJ)', async () => {
    await ouvrir(antor);
    assert.equal(erreursPage.length, 0, erreursPage.join(' | '));
    assert.ok((await ligne(antor, 'Mira la Lame').innerText()).includes('PJ'));
    assert.ok(!/PNJ/.test(await ligne(antor, 'Mira la Lame').innerText()));
    assert.ok((await ligne(antor, 'Gorbal le Forgeron').innerText()).includes('PNJ'));
    assert.ok((await ligne(antor, 'Lames Grises').innerText()).includes('Faction'));
    assert.ok((await ligne(antor, 'Port-Sombre').innerText()).includes('Lieu'));
    assert.ok(!/\bPJ\b|PNJ/.test(await ligne(antor, 'Lames Grises').innerText()));
    await antor.screenshot({ path: '/tmp/badge-pj-mj.png' });
  });

  test('route : cible personnage porte charge {pj} exactement, rien de plus', async () => {
    const lignes = await api(antor, 'GET', `${base()}/${id.source}/sections/${secSource}/relations`);
    const liste: Any[] = Array.isArray(lignes) ? lignes : (lignes.relations ?? lignes.items);
    assert.equal(liste.length, 5);
    const par = (t: string) => liste.find((r) => r.cible.titre === t).cible;
    assert.deepEqual(par('Mira la Lame').charge, { pj: true });
    assert.deepEqual(par('Gorbal le Forgeron').charge, { pj: false });
    for (const t of ['Lames Grises', 'Port-Sombre']) {
      const c = par(t);
      assert.ok(!c.charge || !('pj' in c.charge), `charge.pj sur une cible non personnage : ${t}`);
    }
  });

  test('exclusion : aucune autre donnée de la fiche cible (sections, contenu) dans la réponse', async () => {
    const brut = JSON.stringify(await api(antor, 'GET', `${base()}/${id.source}/sections/${secSource}/relations`));
    assert.ok(!brut.includes('Résumé'), brut);
    assert.ok(!/"contenu"/.test(brut), brut);
  });

  test('un joueur voit les mêmes badges, et la cible illisible est absente (ni ligne, ni PJ de trop)', async () => {
    await ouvrir(lea);
    assert.equal(erreursPage.length, 0, erreursPage.join(' | '));
    assert.ok((await ligne(lea, 'Mira la Lame').innerText()).includes('PJ'));
    assert.ok((await ligne(lea, 'Gorbal le Forgeron').innerText()).includes('PNJ'));
    assert.equal(await bloc(lea).getByRole('listitem').count(), 4);
    assert.equal(await lea.getByText('Espion Secret').count(), 0);
    const api_ = await api(lea, 'GET', `${base()}/${id.source}/sections/${secSource}/relations`);
    assert.ok(!JSON.stringify(api_).includes('Espion'));
    await lea.screenshot({ path: '/tmp/badge-pj-joueur.png' });
  });

  test('bord : un PNJ devenu PJ change de badge à la réouverture', async () => {
    await api(antor, 'POST', `${base()}/${id.pnj}/type`, { type: 'personnage', charge: { pj: true } });
    await ouvrir(antor);
    assert.ok((await ligne(antor, 'Gorbal le Forgeron').innerText()).includes('PJ'));
    assert.ok(!/PNJ/.test(await ligne(antor, 'Gorbal le Forgeron').innerText()));
  });

  test('bord : relier depuis le formulaire à un PJ montre PJ sur la nouvelle ligne', async () => {
    const nouveau = await fiche('personnage', 'Zéphyr Nouveau', { pj: true });
    await ouvrir(antor);
    const b = bloc(antor);
    await b.getByRole('button', { name: /^Relier à une fiche$/ }).click();
    await b.getByLabel('Type de relation').fill('rival de');
    await b.getByLabel('Chercher dans les personnages').fill('Zéphyr');
    await b.getByRole('button', { name: /^Chercher$/ }).click();
    await b.locator('button.choix-fiche').filter({ hasText: 'Zéphyr Nouveau' }).click();
    await b.getByRole('button', { name: /^Relier$/ }).click();
    await b.getByRole('link', { name: 'Zéphyr Nouveau' }).waitFor();
    assert.ok((await ligne(antor, 'Zéphyr Nouveau').innerText()).includes('PJ'));
    assert.ok(nouveau > 0);
  });

  test('échec : charge absente de la réponse, la fiche s’ouvre quand même, sans PJ ni PNJ inventé', async () => {
    await antor.route('**/sections/*/relations', async (route: Any) => {
      const rep = await route.fetch();
      const corps = await rep.json();
      const liste: Any[] = Array.isArray(corps) ? corps : (corps.relations ?? corps.items);
      for (const r of liste) delete r.cible.charge;
      await route.fulfill({ response: rep, json: Array.isArray(corps) ? liste : { ...corps, [corps.relations ? 'relations' : 'items']: liste } });
    });
    try {
      await ouvrir(antor);
      assert.equal(erreursPage.length, 0, erreursPage.join(' | '));
      await ligne(antor, 'Mira la Lame').waitFor();
      const t = await ligne(antor, 'Mira la Lame').innerText();
      assert.ok(!/\bPJ\b/.test(t) && !/PNJ/.test(t), t);
      assert.ok(t.includes('Personnage'), t);
      assert.ok((await ligne(antor, 'Lames Grises').innerText()).includes('Faction'));
      await antor.screenshot({ path: '/tmp/badge-pj-sans-charge.png' });
    } finally {
      await antor.unroute('**/sections/*/relations');
    }
  });
});
