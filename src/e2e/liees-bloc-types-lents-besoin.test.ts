// Whole-feature tests of rouge-kanevas-5 on B-64 (docs/ecrans.md, E-9 « Fiches liées »): the group titles read
// « Personnages (n) » (the type's plural label), never the raw type « personnage (n) », even when the list of types
// reaches the browser after the block's own data. Real server on the stub with the seed + real Chromium.
//
// PLAN (need -> case -> proof; failure = what would turn the test red)
//  B-64 nominal    Port-Sel/Antor, types route slowed: « Chargement… » while it is pending, then « S'y trouvent : Personnages (2) »
//                  (failure: the block drops « Chargement… » before the types are read)
//  B-64 bords      the same on a stalled route 1.5 s then a fast one (no delay): title right
//  B-64 échec      types route 500: the block still shows its lines (not stuck on « Chargement… »)
//  B-64 exclusion  at no instant, whatever the slowness, a raw lowercase « personnage (n) » title is in the page
//                  (failure: the block shows its groups before the types are read); Léa: « Personnages (1) », no Prieur
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

let srv: Server;
let browser: Any;
let U = 0;
let portSel = 0;

const ROUTE_TYPES = /\/api\/univers\/\d+\/types(\?.*)?$/;
const bloc = (page: Any) => page.getByRole('region', { name: /^Fiches liées$/ });
const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/’/g, "'").trim();

/** Records, from the first paint, every heading text of the page that is a raw type title (« personnage (2) »). */
async function espion(page: Any): Promise<void> {
  await page.addInitScript(() => {
    const w = window as Any;
    w.__bruts = [];
    const scan = () => {
      for (const h of Array.from(document.querySelectorAll('h1,h2,h3,h4,[role=heading]'))) {
        const t = (h.textContent ?? '').replace(/\s+/g, ' ');
        if (/(^|[ :])personnage \(\d+\)/.test(t)) w.__bruts.push(t);
      }
    };
    new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true });
  });
}
const bruts = (page: Any): Promise<string[]> => page.evaluate(() => (window as Any).__bruts ?? []);

async function session(compte: string): Promise<Any> {
  const { page } = await connecte(browser, srv.base, compte);
  await espion(page);
  return page;
}
async function ouvrirPortSel(page: Any): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${portSel}`);
  await page.locator('main h1, main [role=heading][aria-level="1"]').first().waitFor();
}

describe('rouge-kanevas-5, « Fiches liées » et la liste des types lente (B-64)', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    const antor = (await connecte(browser, srv.base, 'Antor')).page;
    const r = await antor.request.fetch(`${srv.base}/api/univers`);
    const us = await r.json();
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    const p = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=lieu`)).json();
    portSel = (p.fiches ?? p.items).find((f: Any) => f.titre === 'Port-Sel').id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('antor_lit_chargement_puis_personnages_2_quand_les_types_arrivent_tard', async () => {
    // failure: the block leaves « Chargement… » (or shows its groups) before the types are read
    const page = await session('Antor');
    let liberer: () => void = () => {};
    const retenue = new Promise<void>((ok) => (liberer = ok));
    await page.route(ROUTE_TYPES, async (route: Any) => {
      await retenue;
      await route.continue();
    });
    await ouvrirPortSel(page);
    const b = bloc(page);
    await b.waitFor();
    await b.getByText('Chargement…').waitFor();
    // let the block's own data arrive well before the types: it must still be loading
    await page.waitForTimeout(1500);
    assert.equal(await b.getByText('Chargement…').count(), 1, 'toujours « Chargement… » tant que les types ne sont pas lus');
    assert.equal(await b.getByRole('heading', { level: 3 }).count(), 0, 'aucun groupe avant les types');
    liberer();
    await b.getByText('Chargement…').waitFor({ state: 'detached' });
    const titre = norm(await b.getByRole('heading', { level: 3 }).first().innerText()).replace(' Chercher parmi', '');
    assert.equal(titre, "S'y trouvent : Personnages (2)");
    assert.deepEqual(await bruts(page), []);
    await page.close();
  });

  test('aucun_titre_brut_personnage_n_apparait_jamais_meme_types_retardes_de_300_ms', async () => {
    // failure: at some instant the group title is composed with the raw type
    for (let i = 0; i < 3; i++) {
      const page = await session('Antor');
      await page.route(ROUTE_TYPES, async (route: Any) => {
        await new Promise((ok) => setTimeout(ok, 300));
        await route.continue();
      });
      await ouvrirPortSel(page);
      const b = bloc(page);
      await b.waitFor();
      await b.getByText('Chargement…').waitFor({ state: 'detached' });
      assert.equal(
        norm(await b.getByRole('heading', { level: 3 }).first().innerText()).replace(' Chercher parmi', ''),
        "S'y trouvent : Personnages (2)",
      );
      assert.deepEqual(await bruts(page), []);
      await page.close();
    }
  });

  test('types_rapides_titre_correct_sans_delai', async () => {
    // bord: no slowness at all
    const page = await session('Antor');
    await ouvrirPortSel(page);
    const b = bloc(page);
    await b.waitFor();
    await b.getByText('Chargement…').waitFor({ state: 'detached' });
    assert.equal(
      norm(await b.getByRole('heading', { level: 3 }).first().innerText()).replace(' Chercher parmi', ''),
      "S'y trouvent : Personnages (2)",
    );
    assert.deepEqual(await bruts(page), []);
    await page.close();
  });

  test('types_en_erreur_le_bloc_montre_quand_meme_ses_fiches_liees', async () => {
    // failure: the block stays on « Chargement… » forever when the types list fails
    const page = await session('Antor');
    await page.route(ROUTE_TYPES, (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }));
    await ouvrirPortSel(page);
    const b = bloc(page);
    await b.waitFor();
    await b.getByText('Chargement…').waitFor({ state: 'detached' });
    const titres = (await b.locator('li.ligne-liee a.titre-liee').allInnerTexts()).map(norm).sort();
    assert.deepEqual(titres, ['Le Prieur masqué', 'Maître Aldric']);
    await page.close();
  });

  test('lea_lit_personnages_1_sans_le_prieur_quand_les_types_arrivent_tard', async () => {
    // exclusion: slowness must not change what Léa may read
    const page = await session('Léa');
    await page.route(ROUTE_TYPES, async (route: Any) => {
      await new Promise((ok) => setTimeout(ok, 800));
      await route.continue();
    });
    await ouvrirPortSel(page);
    const b = bloc(page);
    await b.waitFor();
    await b.getByText('Chargement…').waitFor({ state: 'detached' });
    assert.equal(norm(await b.getByRole('heading', { level: 3 }).first().innerText()).replace(' Chercher parmi', ''), "S'y trouvent : Personnages (1)");
    assert.deepEqual((await b.locator('li.ligne-liee a.titre-liee').allInnerTexts()).map(norm), ['Maître Aldric']);
    assert.equal(await page.getByText('Le Prieur masqué').count(), 0);
    assert.deepEqual(await bruts(page), []);
    await page.close();
  });
});
