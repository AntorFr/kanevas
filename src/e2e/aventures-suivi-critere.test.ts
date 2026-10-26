// Browser proof of kanevas-scenarios-suivi-pivot (AD-127, AD-124 (4)): « Campagnes » left the sidebar, the old
// addresses answer « Page introuvable. », E-13 names an adventure only to who reads it, « Aventure supprimée »
// to the GM only. Adventures are made through the routes of the sheets. Real server in stub mode + Chromium.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = '';
let couronne = 0;
let acte2 = 0;

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

/** The E-13 row of a report, as text. */
const ligne = async (page: Any, titre: string): Promise<string> =>
  (await page.locator('main li').filter({ hasText: titre }).first().innerText()).replace(/\s+/g, ' ').trim();

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = await connecte(browser, srv.base, 'Léa');
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Pivot');
  await antor.getByRole('heading', { name: 'Pivot', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();

  const c = await api(antor, 'POST', `/api/univers/${uid}/fiches`, {
    type: 'aventure', sousType: 'Campagne', titre: 'La Couronne brisée', sections: [{ titre: 'Présentation', joueursLisent: true }],
  });
  couronne = c.body.id;
  await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${couronne}`, { statut: 'en_cours' });
  const s = await api(antor, 'POST', `/api/univers/${uid}/fiches`, {
    type: 'aventure', sousType: 'Scénario', titre: 'Acte II', parent: couronne, sections: [{ titre: 'Scénario', joueursLisent: false }],
  });
  acte2 = s.body.id;
  const r1 = await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: couronne, titre: 'Séance de la Couronne', texte: 'Texte.' });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  await new Promise((r) => setTimeout(r, 1100));
  const r2 = await api(antor, 'POST', `/api/univers/${uid}/comptes-rendus`, { campagneId: acte2, titre: 'Séance du scénario', texte: 'Texte.' });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('« Campagnes » a quitté la barre et les anciennes adresses répondent « Page introuvable. »', opts, async () => {
  for (const page of [antor, lea.page]) {
    await page.goto(`/univers/${uid}`);
    await page.getByRole('heading', { name: 'Campagnes en cours' }).waitFor();
    await attendre(page);
    assert.equal(await page.getByRole('link', { name: /^Campagnes$/ }).count(), 0, 'plus d\'entrée « Campagnes »');
    for (const chemin of ['campagnes', `campagnes/${couronne}`, `scenarios/${acte2}`, `campagnes/${couronne}/scenarios`]) {
      await page.goto(`/univers/${uid}/${chemin}`);
      await page.getByText('Page introuvable.').waitFor();
    }
  }
  await antor.screenshot({ path: '/tmp/pivot-introuvable.png' });
});

test('E-13 : « La Couronne brisée » en colonne à Antor ; « Acte II » (scénario fermé) à Antor, colonne vide à Léa', opts, async () => {
  await antor.goto(`/univers/${uid}/comptes-rendus`);
  await antor.getByRole('link', { name: /Séance de la Couronne/ }).waitFor();
  await attendre(antor);
  assert.match(await ligne(antor, 'Séance de la Couronne'), /Séance de la Couronne — La Couronne brisée/);
  assert.match(await ligne(antor, 'Séance du scénario'), /Séance du scénario — Acte II/);
  await antor.screenshot({ path: '/tmp/pivot-e13-antor.png' });

  await lea.page.goto(`/univers/${uid}/comptes-rendus`);
  await lea.page.getByRole('link', { name: /Séance de la Couronne/ }).waitFor();
  await attendre(lea.page);
  assert.match(await ligne(lea.page, 'Séance de la Couronne'), /Séance de la Couronne — La Couronne brisée/);
  const l = await ligne(lea.page, 'Séance du scénario');
  assert.ok(!l.includes('—') && !l.includes('Acte II —'), `colonne vide : ${l}`);
  assert.ok(!(await texte(lea.page)).includes('Acte II'), 'le titre du scénario fermé ne sort nulle part');
  await lea.page.screenshot({ path: '/tmp/pivot-e13-lea.png' });
});

test('« Aventure supprimée » : au MJ seul, Léa ne voit pas de différence entre fermée et supprimée', opts, async () => {
  assert.equal((await api(antor, 'DELETE', `/api/univers/${uid}/fiches/${acte2}`)).status, 204);
  await antor.goto(`/univers/${uid}/comptes-rendus`);
  await antor.getByRole('link', { name: /Séance du scénario/ }).waitFor();
  await attendre(antor);
  assert.match(await ligne(antor, 'Séance du scénario'), /Aventure supprimée/);
  await antor.screenshot({ path: '/tmp/pivot-e13-supprimee-mj.png' });

  await lea.page.goto(`/univers/${uid}/comptes-rendus`);
  await lea.page.getByRole('link', { name: /Séance du scénario/ }).waitFor();
  await attendre(lea.page);
  const l = await ligne(lea.page, 'Séance du scénario');
  assert.ok(!l.includes('Aventure supprimée') && !l.includes('—'), l);
  assert.ok(!(await texte(lea.page)).includes('Aventure supprimée'));
  await lea.page.screenshot({ path: '/tmp/pivot-e13-supprimee-lea.png' });

  // E-3 « Derniers comptes-rendus » says the same
  await antor.goto(`/univers/${uid}`);
  await antor.getByRole('heading', { name: 'Derniers comptes-rendus' }).waitFor();
  await attendre(antor);
  assert.ok((await texte(antor)).includes('Aventure supprimée'));
  await lea.page.goto(`/univers/${uid}`);
  await lea.page.getByRole('heading', { name: 'Derniers comptes-rendus' }).waitFor();
  await attendre(lea.page);
  assert.ok(!(await texte(lea.page)).includes('Aventure supprimée'));
});
