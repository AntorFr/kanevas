// The « Fiches liées » block shows no group before the types of the universe are known (B-64, AD-120):
// the plural label must never fall back to the raw type (« personnage (2) ») while the list loads.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
let portSel = 0;

describe('kanevas-fiches-liees-bloc, types lus tardivement (B-64)', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await (await antor.request.fetch(`${srv.base}/api/univers`)).json();
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    const p = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=lieu`)).json();
    portSel = (p.fiches ?? p.items).find((f: Any) => f.titre === 'Port-Sel').id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('le_libelle_n_est_jamais_le_type_brut_pendant_que_les_types_chargent', async () => {
    // failure: a group « personnage (2) » is on screen before /types answers
    // the /types answer is held by a gate the test opens itself, not by a duration: the observation
    // can last as long as the pod needs
    let ouvrir: () => void = () => {};
    const porte = new Promise<void>((r) => {
      ouvrir = r;
    });
    let appelee: () => void = () => {};
    const requeteParties = new Promise<void>((r) => {
      appelee = r;
    });
    await antor.route(/\/api\/univers\/\d+\/types$/, async (route: Any) => {
      appelee();
      await porte;
      await route.continue();
    });
    try {
      const vus: string[] = [];
      await antor.goto(`/univers/${U}/fiche/${portSel}`);
      await requeteParties;
      const b = antor.getByRole('region', { name: /^Fiches liées$/ });
      await b.waitFor();
      for (let i = 0; i < 10; i++) {
        vus.push(await b.innerText());
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(vus.every((t) => !/personnage \(2\)/.test(t)), 'le type brut a été affiché');
      assert.ok(vus.every((t) => !/Personnages \(2\)/.test(t)), 'un groupe a été affiché avant les types');
      ouvrir();
      await b.getByText('Personnages (2)').waitFor();
    } finally {
      ouvrir();
      await antor.unroute(/\/api\/univers\/\d+\/types$/);
    }
  });

  test('le_bloc_se_montre_avec_le_type_brut_quand_les_types_ne_chargent_pas', async () => {
    // failure: the block stays on « Chargement… » forever when /types fails
    await antor.route(/\/api\/univers\/\d+\/types$/, (route: Any) => route.fulfill({ status: 500, body: '{}' }));
    await antor.goto(`/univers/${U}/fiche/${portSel}`);
    const b = antor.getByRole('region', { name: /^Fiches liées$/ });
    await b.getByText(/personnage \(2\)/).waitFor({ timeout: 8000 });
    await antor.unroute(/\/api\/univers\/\d+\/types$/);
  });
});
