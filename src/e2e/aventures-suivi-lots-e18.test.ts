// E-18 « Lots d'import » after kanevas-scenarios-suivi, at the browser: a batch that imports a campaign and its
// scenario (both sheets of type aventure) counts them in « Fiches » and shows no « Campagnes » nor « Scénarios » line.
//
// TEST PLAN
//   B-61 (compteurs)  nominal : 2 aventures importées dans un lot → la ligne du lot dit « Fiches : 2 créées »
//   exclusion         : aucune mention « Campagnes » ni « Scénarios » dans le bloc « Lots d'import », lot replié ou déplié
//   bord              : un lot vide (aucune écriture) n'invente pas de ligne « Campagnes : 0 »
//   B-61 (routes)     : PUT …/campagnes/x et …/scenarios/x répondent 404 avec le jeton valide
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JETON_BOUCHON } from '../bouchon/depart.js';
import { type Any, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let uid = 0;
let base = '';
const h = { authorization: `Bearer ${JETON_BOUCHON}`, 'content-type': 'application/json' };

before(async () => {
  if (skipBrowser) return;
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  const us = await (await antor.request.get('/api/univers')).json();
  uid = us.find((u: Any) => u.nom === 'Essai Kanka').id;
  base = `${srv.base}/api/import/v1/univers/${uid}`;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

test('lot_d_aventures_compte_deux_fiches_et_aucune_ligne_campagnes_ni_scenarios', opts, async () => {
  const lot = (await (await fetch(`${base}/lots`, { method: 'POST', headers: h })).json()).lotId;
  const put = (cle: string, body: unknown) =>
    fetch(`${base}/fiches/${encodeURIComponent(cle)}?lot=${lot}`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
  const a = await put('campagne:brumes', { type: 'aventure', sousType: 'Campagne', titre: 'Les Brumes', sections: [{ cle: 'pres', titre: 'Présentation', contenu: 'Une brume.' }] });
  assert.equal(a.status, 200);
  const b = await put('scenario:acte-1', { type: 'aventure', sousType: 'Scénario', titre: 'Acte I', parent: 'campagne:brumes', sections: [{ cle: 'sc', titre: 'Scénario', contenu: 'Le début.' }] });
  assert.equal(b.status, 200);
  assert.equal((await fetch(`${base}/lots/${lot}/clore`, { method: 'POST', headers: h })).status, 200);

  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  const tete = antor.locator('.lot-tete', { hasText: 'Fiches : 2 créées' }).first();
  await tete.waitFor();
  const bloc = antor.locator('section', { has: antor.getByRole('heading', { name: 'Lots d’import' }) }).first();
  assert.doesNotMatch(await bloc.innerText(), /Campagnes|Scénarios/);
  await tete.click();
  assert.doesNotMatch(await bloc.innerText(), /Campagnes|Scénarios/);
});

test('lot_vide_n_a_pas_de_ligne_campagnes', opts, async () => {
  const lot = (await (await fetch(`${base}/lots`, { method: 'POST', headers: h })).json()).lotId;
  assert.equal((await fetch(`${base}/lots/${lot}/clore`, { method: 'POST', headers: h })).status, 200);
  await antor.goto(`/univers/${uid}/acces-api`);
  await antor.getByRole('heading', { name: 'Lots d’import' }).waitFor();
  await antor.locator('.lot-tete').first().waitFor();
  const texte = await antor.locator('main').innerText();
  assert.doesNotMatch(texte, /Campagnes :|Scénarios :/);
});

test('routes_d_import_des_campagnes_et_scenarios_repondent_404_au_jeton_valide', opts, async () => {
  for (const chemin of ['campagnes/x', 'scenarios/x']) {
    const r = await fetch(`${base}/${chemin}`, { method: 'PUT', headers: h, body: JSON.stringify({ nom: 'x', titre: 'x', statut: 'active' }) });
    assert.equal(r.status, 404, chemin);
  }
});
