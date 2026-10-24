// Black-box tests of kanevas-recherche-e9 (E-9 header "Aussi appelée…", label pills and the box
// « Alias et étiquettes… »), written from the task's exit criterion and docs/ecrans.md.
// Real server in stub mode + real Chromium; expected values are literals from the doc.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-e9-etiquetage-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let PORT = '';

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function fiche(page: Any): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${PORT}`);
  await page.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
  await attendre(page);
}
async function ouvrirBoite(page: Any): Promise<void> {
  await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  await page.getByRole('menuitem', { name: 'Alias et étiquettes…' }).click();
  await page.getByRole('dialog').waitFor();
}
const entete = (page: Any) => page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) }).first();
async function ajoute(page: Any, champ: string, v: string): Promise<void> {
  const c = page.getByRole('dialog').getByLabel(champ, { exact: true });
  await c.fill(v);
  await c.press('Enter');
}

describe('kanevas-recherche-e9, E-9 alias et étiquettes', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const p = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Port-Sel' });
    PORT = p.id;
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${PORT}/sections`, { titre: 'Aperçu', contenu: 'Un port.' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${PORT}/sections/${s.id}`, { joueursLisent: true });
    await api(antor, 'PUT', `/api/univers/${U}/fiches/${PORT}/etiquetage`, { alias: ['Salport', 'Port-aux-Sels'], etiquettes: [] });
    // Another sheet carries the label the box must complete.
    const autre = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Cap Brume' });
    const sa = await api(antor, 'POST', `/api/univers/${U}/fiches/${autre.id}/sections`, { titre: 'Aperçu', contenu: 'Un cap.' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${autre.id}/sections/${sa.id}`, { joueursLisent: true });
    await api(antor, 'PUT', `/api/univers/${U}/fiches/${autre.id}/etiquetage`, { alias: [], etiquettes: ['Côte des Brumes'] });
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('critère : ajout complété, toast, en-tête, ignoré en autre casse, retrait ; Léa et mode Joueur', async () => {
    await fiche(antor);
    const t0 = await entete(antor).innerText();
    assert.ok(/Aussi appelée (Salport, Port-aux-Sels|Port-aux-Sels, Salport)/.test(t0), t0);
    await ouvrirBoite(antor);
    // completion offers the universe's label
    const options = await antor.locator('datalist option').evaluateAll((o: Any[]) => o.map((x) => x.value));
    assert.deepEqual(options, ['Côte des Brumes']);
    await ajoute(antor, 'Alias', 'Salport-sur-Mer');
    await ajoute(antor, 'Étiquettes', 'Côte des Brumes');
    await antor.screenshot({ path: `${SHOTS}/boite.png` });
    await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
    await antor.getByText('Alias et étiquettes enregistrés.').waitFor();
    await attendre(antor);
    const t = await entete(antor).innerText();
    // The order of the list is the API's (sorted, AD-118): the criterion's wording order is a gap, not tested.
    const l1 = (/Aussi appelée (.*)/.exec(t)?.[1] ?? '').split(', ').sort();
    assert.deepEqual(l1, ['Port-aux-Sels', 'Salport', 'Salport-sur-Mer'], t);
    assert.equal(await antor.getByRole('link', { name: 'Côte des Brumes' }).count(), 1);
    await antor.screenshot({ path: `${SHOTS}/entete.png` });

    // retire un alias, ajoute le même en autre casse : ignoré
    await ouvrirBoite(antor);
    await antor.getByRole('button', { name: 'Retirer « Salport »' }).click();
    await ajoute(antor, 'Alias', 'SALPORT-SUR-MER');
    assert.equal(await antor.getByRole('dialog').getByRole('button', { name: /^Retirer « /i }).count(), 3); // 2 alias + 1 label
    // The first save's toast may still be on screen: wait for this save's own response, then for a toast (the last one).
    const enregistre = antor.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/etiquetage'));
    await antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
    assert.equal((await enregistre).status(), 200);
    await antor.getByText('Alias et étiquettes enregistrés.').last().waitFor();
    await attendre(antor);
    await antor.waitForFunction(() => !document.body.innerText.includes('Aussi appelée Port-aux-Sels, Salport, '));
    const t2 = await entete(antor).innerText();
    assert.equal(/Aussi appelée (.*)/.exec(t2)?.[1], 'Port-aux-Sels, Salport-sur-Mer', t2);
    assert.ok(!t2.includes('SALPORT'));

    // Léa: voit alias et pastille, pas l'entrée ; la pastille ouvre E-17 filtrée
    await fiche(lea);
    assert.equal(/Aussi appelée (.*)/.exec(await entete(lea).innerText())?.[1], 'Port-aux-Sels, Salport-sur-Mer');
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    await lea.getByRole('link', { name: 'Côte des Brumes' }).click();
    await lea.waitForURL(/recherche\?etiquette=C%C3%B4te%20des%20Brumes/);
    await lea.getByRole('heading', { level: 1, name: 'Recherche' }).waitFor();
    await lea.waitForTimeout(800);
    await attendre(lea);
    await lea.screenshot({ path: `${SHOTS}/lea-e17.png` });
    const res = await lea.locator('main').innerText();
    assert.ok(res.includes('Port-Sel') && res.includes('Cap Brume'), res);

    // Antor en mode Joueur: pas d'entrée, la pastille garde le mode
    await fiche(antor);
    await antor.getByLabel('Mode Joueur').check();
    await attendre(antor);
    assert.equal(await antor.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    const href = await antor.getByRole('link', { name: 'Côte des Brumes' }).getAttribute('href');
    assert.ok(href?.endsWith('?etiquette=C%C3%B4te%20des%20Brumes&mode=joueur'), href);
  });

  test('le 21e alias est refusé : « Erreur : 20 alias au plus. », rien n’est enregistré', async () => {
    await fiche(antor);
    await ouvrirBoite(antor);
    // 2 already there; add 18 more -> 20
    for (let i = 1; i <= 18; i++) await ajoute(antor, 'Alias', `Nom ${i}`);
    await ajoute(antor, 'Alias', 'Un de trop');
    assert.ok((await antor.getByRole('dialog').innerText()).includes('Erreur : 20 alias au plus.'));
    await antor.screenshot({ path: `${SHOTS}/21e.png` });
    await antor.getByRole('button', { name: 'Annuler' }).click();
    await attendre(antor);
    const f = await api(antor, 'GET', `/api/univers/${U}/fiches/${PORT}`);
    assert.equal(f.alias.length, 2);
  });

  test('un alias de 121 caractères est refusé sans envoi : « Erreur : 120 caractères au plus. »', async () => {
    await fiche(antor);
    await ouvrirBoite(antor);
    await ajoute(antor, 'Alias', 'x'.repeat(121));
    assert.ok((await antor.getByRole('dialog').innerText()).includes('Erreur : 120 caractères au plus.'));
    await ajoute(antor, 'Étiquettes', 'y'.repeat(41));
    assert.ok((await antor.getByRole('dialog').innerText()).includes('Erreur : 40 caractères au plus.'));
  });
});
