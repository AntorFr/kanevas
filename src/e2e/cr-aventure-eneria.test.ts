// ecrans: fiche
// Screen test of the Éneria case (kanevas-cr-aventure-import-eneria, P-10): a campaign with two scenarios and two session
// reports; the GM files the first under scenario A from its sheet (dialog « Changer d’aventure… »), the second is moved under
// scenario B by an import replay. The effects (id, relation, link, counters) are proved at their doors
// (src/routes/import-cr-aventure-ecriture.test.ts, src/routes/compte-rendu-changer-aventure.test.ts); here only what the GM sees.
// Real server in stub mode + real Chromium; the import is posted through the stub token, off screen.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

async function importer(method: string, chemin: string, corps: unknown): Promise<Any> {
  const r = await fetch(`${srv.base}/api/import/v1/univers/${U}${chemin}`, {
    method,
    headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const txt = await r.text();
  assert.ok(r.status < 300, `${method} ${chemin} -> ${r.status}: ${txt}`);
  return JSON.parse(txt);
}
const section = (contenu: string) => [{ cle: 'texte', titre: 'Récit', contenu, joueursLisent: true }];
const aventure = (titre: string, sousType: string, parent?: string) => ({ type: 'aventure', titre, sousType, ...(parent ? { parent } : {}), sections: section('Présentation.') });
const compteRendu = (titre: string, campagne: string) => ({ type: 'compte_rendu', titre, campagne, creeLe: '2021-03-03T20:00:00Z', sections: section('Séance.') });

async function ouvrir(p: Any, cle: string, titre: string): Promise<void> {
  await p.goto(`/univers/${U}/fiche/${ids[cle]}`);
  await p.getByRole('heading', { name: titre, level: 1 }).waitFor();
}
const bloc = (p: Any) => p.locator('.suivi-liste');

describe('kanevas-cr-aventure-import-eneria, P-10 le cas Éneria', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const liste = await (await antor.request.get(`${srv.base}/api/univers`)).json();
    U = liste.find((u: Any) => u.nom === 'Essai Kanka').id;
    for (const [cle, titre, sous] of [['c:eneria', 'Éneria', 'Campagne'], ['s:a', 'Scénario A', 'Scénario'], ['s:b', 'Scénario B', 'Scénario']]) {
      ids[cle] = (await importer('PUT', `/fiches/${encodeURIComponent(cle)}`, aventure(titre, sous, cle === 'c:eneria' ? undefined : 'c:eneria'))).id;
    }
    ids['cr:1'] = (await importer('PUT', '/fiches/cr%3A1', compteRendu('Séance du sceau', 'c:eneria'))).id;
    ids['cr:2'] = (await importer('PUT', '/fiches/cr%3A2', compteRendu('Séance du pont', 'c:eneria'))).id;
    ids['lieu:port'] = (await importer('PUT', '/fiches/lieu%3Aport', {
      type: 'lieu', titre: 'Port d’Éneria', sections: section(`Vu pendant [[${ids['cr:2']}|la séance du pont]].`),
    })).id;
    await importer('POST', '/fiches/cr%3A2/relations', [{ section: 'texte', cible: 'lieu:port', type: 'voisin' }]);
    await antor.goto(`/univers/${U}`);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('un compte rendu rangé sous A par l’écran, un autre sous B par l’import : chaque page liste le sien, la campagne les deux', async () => {
    await ouvrir(antor, 'cr:1', 'Séance du sceau');
    await antor.getByRole('button', { name: 'Changer d’aventure…' }).click();
    const d = antor.getByRole('dialog');
    await d.getByRole('radio', { name: /Scénario A/ }).check();
    await d.getByRole('button', { name: 'Changer d’aventure', exact: true }).click();
    await d.waitFor({ state: 'detached' });
    await antor.locator('.ligne-campagne').getByText('Scénario A').waitFor();

    const r = await importer('PUT', '/fiches/cr%3A2', compteRendu('Séance du pont', 's:b'));
    assert.equal(r.etat, 'mise_a_jour');

    await ouvrir(antor, 's:a', 'Scénario A');
    await bloc(antor).getByRole('link', { name: 'Séance du sceau' }).waitFor();
    assert.equal(await bloc(antor).getByRole('link', { name: 'Séance du pont' }).count(), 0);

    await ouvrir(antor, 's:b', 'Scénario B');
    await bloc(antor).getByRole('link', { name: 'Séance du pont' }).waitFor();
    assert.equal(await bloc(antor).getByRole('link', { name: 'Séance du sceau' }).count(), 0);

    await ouvrir(antor, 'c:eneria', 'Éneria');
    const lignes = bloc(antor).locator('.ligne-compte-rendu');
    await lignes.filter({ hasText: 'Séance du sceau' }).getByRole('link', { name: 'Scénario A' }).waitFor();
    await lignes.filter({ hasText: 'Séance du pont' }).getByRole('link', { name: 'Scénario B' }).waitFor();
    assert.equal(await lignes.count(), 2);
  });

  test('le compte rendu déplacé par l’import garde son lien et sa relation à l’écran', async () => {
    await ouvrir(antor, 'cr:2', 'Séance du pont');
    await antor.getByText('Port d’Éneria').first().waitFor();
    await ouvrir(antor, 'lieu:port', 'Port d’Éneria');
    await antor.getByRole('link', { name: 'la séance du pont' }).waitFor();
  });
});
