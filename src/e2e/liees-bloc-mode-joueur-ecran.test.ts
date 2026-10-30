// Whole-feature complement of kanevas-fiches-liees-bloc (B-64, P-6 step 6): what a PLAYER reads in the
// block « Fiches liées » on screen — Léa, and the GM switched to player mode ("he reads like Léa", docs/ecrans.md E-9).
// Written from docs/ecrans.md (E-9 « Fiches liées », criteria "Léa, Joueuse" and "the GM in player mode on Port-Sel")
// and docs/parcours.md (B-64). Real server on the stub with the seed + real Chromium. Literal expectations.
//
// PLAN (need -> case -> proof; failure = what would turn the test red)
//  B-64 nominal    Antor in Joueur mode on Port-Sel: « Personnages (1) », Aldric only (failure: the mode is ignored by the block)
//                  back to MJ mode: « Personnages (2) » with the Prieur (failure: the block stays stuck on the player's read)
//  B-64 bords      Léa ticks « sous-lieux compris » on Port-Sel: Aldric + Suie « — Les Docks », 2 (failure: the descent leaks or loses)
//  B-64 exclusions Léa, with the toggle on: the Prieur is nowhere, the text of the page does not carry « Prieur »
//  B-64 bords      Léa at 360 px: the block does not overflow the screen sideways
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-liees-bloc-joueur-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let portSel = 0;

const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/’/g, "'").trim();
const bloc = (page: Any) => page.getByRole('region', { name: /^Fiches liées$/ });
async function ouvrirPortSel(page: Any): Promise<Any> {
  await page.goto(`/univers/${U}/fiche/${portSel}`);
  const b = bloc(page);
  await b.waitFor();
  await b.getByText('Chargement…').waitFor({ state: 'detached' });
  return b;
}
const titres = async (b: Any): Promise<string[]> => (await b.locator('li.ligne-liee a.titre-liee').allInnerTexts()).map(norm);
const entete = async (b: Any): Promise<string> =>
  norm(await b.getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3 }).innerText()).replace(' Chercher parmi', '');

describe('kanevas-fiches-liees-bloc, le bloc lu par un joueur (B-64)', { skip: skipBrowser }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const r = await antor.request.fetch(`${srv.base}/api/univers`);
    const us = await r.json();
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    const l = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=lieu`)).json();
    portSel = (l.fiches ?? l.items).find((f: Any) => f.titre === 'Port-Sel').id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('mj_en_mode_joueur_lit_comme_lea_puis_retrouve_le_prieur_en_mode_mj', async () => {
    // failure: the block ignores the display mode (the Prieur or « Personnages (2) » stays in player mode)
    await antor.evaluate(() => localStorage.clear());
    await antor.goto(`/univers/${U}/fiche/${portSel}`);
    await bloc(antor).waitFor();
    await antor.getByRole('radio', { name: /Mode Joueur/ }).click();
    const b = bloc(antor);
    await b.getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3, name: /Personnages \(1\)/ }).waitFor();
    assert.equal(await entete(b), "S'y trouvent : Personnages (1)");
    assert.deepEqual(await titres(b), ['Maître Aldric']);
    assert.equal(await antor.getByText('Le Prieur masqué').count(), 0);
    await antor.screenshot({ path: `${SHOTS}/antor-mode-joueur.png`, fullPage: true });
    await antor.getByRole('radio', { name: /Mode MJ/ }).click();
    await bloc(antor).getByRole('region', { name: "S'y trouvent" }).getByRole('heading', { level: 3, name: /Personnages \(2\)/ }).waitFor();
    assert.deepEqual(await titres(bloc(antor)), ['Le Prieur masqué', 'Maître Aldric']);
  });

  test('lea_coche_sous_lieux_compris_lit_aldric_et_suie_sans_le_prieur', async () => {
    // failure: the descent shows or counts a sheet Léa cannot read, or drops Suie
    await lea.evaluate(() => localStorage.clear());
    const b = await ouvrirPortSel(lea);
    assert.equal(await entete(b), "S'y trouvent : Personnages (1)");
    await b.getByRole('checkbox', { name: 'sous-lieux compris' }).click();
    await b.getByText('Suie').waitFor();
    assert.match(await entete(b), /^S'y trouvent : Personnages \(2\)/);
    const t = await titres(b);
    assert.ok(t.includes('Maître Aldric') && t.includes('Suie'), t.join(' | '));
    assert.ok(!t.includes('Le Prieur masqué'), t.join(' | '));
    assert.match(norm(await b.innerText()), /Suie.*— Les Docks/);
    assert.equal(await lea.getByText('Prieur').count(), 0, 'le Prieur masqué ne se lit nulle part sur la page de Léa');
    await lea.screenshot({ path: `${SHOTS}/lea-sous-lieux.png`, fullPage: true });
  });

  test('lea_sur_telephone_le_bloc_ne_deborde_pas_de_l_ecran', async () => {
    // failure: a line of the block pushes the page wider than the 360 px screen
    await lea.setViewportSize({ width: 360, height: 780 });
    try {
      const b = await ouvrirPortSel(lea);
      await b.getByText('Maître Aldric').waitFor();
      const { scroll, vue } = await lea.evaluate(() => ({ scroll: document.documentElement.scrollWidth, vue: window.innerWidth }));
      assert.ok(scroll <= vue, `scrollWidth ${scroll} > largeur ${vue}`);
      const box = (await b.boundingBox())!;
      assert.ok(box.x >= 0 && box.x + box.width <= 360 + 1, `bloc hors écran : x=${box.x} w=${box.width}`);
      await lea.screenshot({ path: `${SHOTS}/lea-360.png`, fullPage: true });
    } finally {
      await lea.setViewportSize({ width: 1280, height: 800 });
    }
  });
});
