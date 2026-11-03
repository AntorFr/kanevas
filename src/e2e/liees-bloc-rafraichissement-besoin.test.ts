// Whole-feature tests of kanevas-fiches-liees-bloc, state « rafraîchissement » of E-9 « Fiches liées » (B-64),
// written from docs/ecrans.md (E-9 states table and its criteria) only. Real server on the stub, real Chromium.
// Expected values are literals of the need.
//
// PLAN (need -> case -> proof; failure = what would turn the test red)
//  nominal   Port-Sel, toggle clicked, re-read held: the two previous lines stay, dimmed, toggle disabled;
//            once released: Suie « — Les Docks » joins (failure: content blanked, or controls left active during the re-read)
//  bords     a group of 56, « Afficher les 56 » held: five lines stay, button disabled; released: 50 more lines
//  échec     « Afficher les 56 » fails: the five previous lines stay, « Impossible de charger les fiches liées. » + « Réessayer »
//            (failure: lines lost, or no way to retry); « Réessayer » then reads again
//  exclusion while held, the block does not show « Chargement… » (that is the first read only)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-liees-rafraichissement-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(method: string, url: string, data?: unknown): Promise<Any> {
  const r = await antor.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/’/g, "'").trim();
const bloc = () => antor.getByRole('region', { name: /^Fiches liées$/ });
const titres = async (b: Any): Promise<string[]> => (await b.locator('li.ligne-liee a.titre-liee').allInnerTexts()).map(norm);
async function ouvrir(fid: number): Promise<Any> {
  await antor.goto(`/univers/${U}/fiche/${fid}`);
  const b = bloc();
  await b.waitFor();
  await b.getByText('Chargement…').waitFor({ state: 'detached' });
  return b;
}
/** Waits (bounded) until the condition holds, polling the page. */
async function jusque(cond: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await cond()) return;
    await antor.waitForTimeout(50);
  }
  assert.fail('condition jamais atteinte');
}
/** Buttons of the block that would answer a click (neither `disabled` nor `aria-disabled`), « Réessayer » aside. */
const boutonsActifs = (b: Any): Promise<number> =>
  b.locator('button').evaluateAll(
    (l: HTMLButtonElement[]) => l.filter((x) => !x.disabled && x.getAttribute('aria-disabled') !== 'true' && x.textContent !== 'Réessayer').length,
  );
/** Product of the opacities from the first line up to the block: < 1 when the content is dimmed. */
const opaciteDesLignes = (b: Any): Promise<number> =>
  b.locator('li.ligne-liee').first().evaluate((el: Element) => {
    let o = 1;
    for (let n: Element | null = el; n && n.tagName !== 'BODY'; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  });

describe('kanevas-fiches-liees-bloc, rafraîchissement du bloc « Fiches liées » (E-9)', { skip: skipBrowser }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const us = await api('GET', '/api/univers');
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    const p = await api('GET', `/api/univers/${U}/fiches?type=lieu`);
    for (const f of p.fiches) ids[f.titre] = f.id;
    const cite = await api('POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Cité des Cinquante-Six' });
    ids.cite = cite.id;
    for (let i = 1; i <= 56; i++) {
      const h = await api('POST', `/api/univers/${U}/fiches`, {
        type: 'personnage',
        titre: `Habitant ${String(i).padStart(2, '0')}`,
        charge: { pj: false },
        sections: [{ titre: 'Notes', contenu: 'x', joueursLisent: true }],
      });
      const d = await api('GET', `/api/univers/${U}/fiches/${h.id}`);
      await api('POST', `/api/univers/${U}/fiches/${h.id}/sections/${d.sections[0].id}/relations`, {
        cibleFicheId: cite.id,
        nature: 'se_situe',
      });
    }
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('bascule_en_cours_le_contenu_reste_estompe_les_commandes_desactivees_puis_suie_arrive', async () => {
    // failure: block emptied or « Chargement… » shown during the re-read; toggle still clickable; content not dimmed
    await antor.evaluate(() => localStorage.clear());
    const b = await ouvrir(ids['Port-Sel']);
    assert.deepEqual(await titres(b), ['Le Prieur masqué', 'Maître Aldric']);
    let liberer: () => void = () => {};
    const tenue = new Promise<void>((r) => (liberer = r));
    await antor.route(/\/fiches\/\d+\/liees\?.*descendants=1/, async (route: Any) => {
      await tenue;
      await route.continue();
    });
    await b.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    try {
      await jusque(async () => b.getByRole('checkbox', { name: 'sous-lieux compris' }).isDisabled());
      assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).isDisabled(), true);
      assert.deepEqual(await titres(b), ['Le Prieur masqué', 'Maître Aldric']);
      assert.equal(await b.getByText('Chargement…').count(), 0);
      assert.ok((await opaciteDesLignes(b)) < 1, 'le contenu précédent est estompé');
      await antor.screenshot({ path: `${SHOTS}/bascule-en-cours.png`, fullPage: true });
    } finally {
      liberer();
    }
    await b.getByText('Suie').waitFor();
    await antor.unroute(/\/fiches\/\d+\/liees\?.*descendants=1/);
    assert.deepEqual(await titres(b), ['Le Kraken des Cales', 'Le Prieur masqué', 'Maître Aldric', 'Suie']);
    assert.equal(await b.getByRole('checkbox', { name: 'sous-lieux compris' }).isDisabled(), false);
    await jusque(async () => (await opaciteDesLignes(b)) === 1);
    await antor.evaluate(() => localStorage.clear());
  });

  test('afficher_les_56_en_cours_les_cinq_lignes_restent_et_le_bouton_est_desactive', async () => {
    // failure: lines blanked during the re-read, or the button clickable twice
    const b = await ouvrir(ids.cite);
    assert.equal((await titres(b)).length, 5);
    let liberer: () => void = () => {};
    const tenue = new Promise<void>((r) => (liberer = r));
    await antor.route(/\/fiches\/\d+\/liees\?.*nature=/, async (route: Any) => {
      await tenue;
      await route.continue();
    });
    await b.getByRole('button', { name: 'Afficher les 56' }).click();
    try {
      // the label during the re-read is not specified (it reads « Chargement… » today): only that no « more » button answers a click
      await jusque(async () => (await boutonsActifs(b)) === 0 && (await b.getByRole('button', { name: 'Afficher les 56' }).count()) === 0);
      assert.equal((await titres(b)).length, 5);
    } finally {
      liberer();
    }
    await b.getByRole('button', { name: /^Afficher les \d+ suivants$/ }).waitFor();
    await antor.unroute(/\/fiches\/\d+\/liees\?.*nature=/);
    const n = (await titres(b)).length;
    assert.ok(n >= 50 && n < 56, `une page de 50 de plus : ${n} lignes`);
  });

  test('afficher_les_56_echoue_les_cinq_lignes_restent_avec_message_et_reessayer', async () => {
    // failure: lines lost on failure, message absent, « Réessayer » without effect
    const b = await ouvrir(ids.cite);
    await antor.route(/\/fiches\/\d+\/liees\?.*nature=/, (route: Any) => route.fulfill({ status: 500, body: '{}' }));
    await b.getByRole('button', { name: 'Afficher les 56' }).click();
    await b.getByText('Impossible de charger les fiches liées.').waitFor();
    assert.equal((await titres(b)).length, 5);
    await antor.screenshot({ path: `${SHOTS}/afficher-echoue.png`, fullPage: true });
    await antor.unroute(/\/fiches\/\d+\/liees\?.*nature=/);
    await b.getByRole('button', { name: 'Réessayer' }).click();
    await b.getByText('Impossible de charger les fiches liées.').waitFor({ state: 'detached' });
    assert.ok((await titres(b)).length >= 5);
  });
});
