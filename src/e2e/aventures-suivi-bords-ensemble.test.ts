// Bords de `kanevas-scenarios-suivi` écrits depuis le besoin (docs/ecrans.md, E-9 « Comptes-rendus », E-9 refus, E-13) :
// 100 comptes-rendus puis « Charger la suite », plafond de 100 000 caractères du texte d'un compte-rendu, scénario fermé
// à une joueuse, CR d'une aventure supprimée. Vrai serveur en mode bouchon + Chromium piloté.
// Attendus en dur, tirés du besoin ; un rouge est un écart, il ne se corrige pas ici.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, rx, type Server, skipBrowser, startServer, texte } from './harnais.test.js';

async function appel(page: Any, methode: string, url: string, data?: unknown): Promise<{ status: number; body: Any; text: string }> {
  const r = await page.request.fetch(url, { method: methode, data, failOnStatusCode: false });
  const text = await r.text();
  let body: Any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* pas du JSON */
  }
  return { status: r.status(), body, text };
}

describe('kanevas-scenarios-suivi : bords des comptes-rendus et du refus', { skip: skipBrowser }, () => {
  let s: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let campagne: number;
  let scenario: number;

  before(async () => {
    s = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, s.base, 'antor')).page;
    lea = (await connecte(browser, s.base, 'Léa')).page;
    const c = await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Les Marches de Sel', sousType: 'Campagne', sections: [{ titre: 'Présentation' }] });
    assert.equal(c.status, 201, c.text);
    campagne = c.body.id;
    assert.equal((await appel(antor, 'PATCH', `/api/univers/1/fiches/${campagne}`, { statut: 'en_cours' })).status, 200);
    const f = await appel(antor, 'GET', `/api/univers/1/fiches/${campagne}`);
    assert.equal((await appel(antor, 'PATCH', `/api/univers/1/fiches/${campagne}/sections/${f.body.sections[0].id}`, { joueursLisent: true })).status, 200);
    const sc = await appel(antor, 'POST', '/api/univers/1/fiches', { type: 'aventure', titre: 'Acte fermé', sousType: 'Scénario', parent: campagne, sections: [{ titre: 'Scénario' }] });
    assert.equal(sc.status, 201, sc.text);
    scenario = sc.body.id;
  });
  after(async () => {
    await browser?.close();
    s?.stop();
  });

  test('bloc_comptes_rendus_101_cr_montre_100_puis_charger_la_suite_donne_le_dernier', async () => {
    // Casse si : le bloc charge tout d'un coup, ne pagine pas à 100, ou perd le plus ancien à la page suivante.
    for (let i = 1; i <= 101; i++) {
      const r = await appel(antor, 'POST', '/api/univers/1/comptes-rendus', { campagneId: campagne, titre: `Séance numéro ${i}`, texte: 'x' });
      assert.equal(r.status, 201, r.text);
    }
    await lea.goto(`/univers/1/fiche/${campagne}`);
    await lea.getByRole('heading', { name: /^Comptes-rendus/ }).waitFor();
    await lea.getByText('Séance numéro 101', { exact: true }).waitFor();
    const liens = lea.getByRole('link', { name: /^Séance numéro \d+$/ });
    assert.equal(await liens.count(), 100, 'cent lignes avant « Charger la suite »');
    assert.equal(await lea.getByText('Séance numéro 1', { exact: true }).count(), 0, 'le plus ancien arrive à la page suivante');
    await lea.screenshot({ path: '/tmp/suivi-cr-100.png', fullPage: true });
    await lea.getByRole('button', { name: 'Charger la suite', exact: true }).click();
    await lea.getByText('Séance numéro 1', { exact: true }).waitFor();
    assert.equal(await liens.count(), 101);
    assert.equal(await lea.getByRole('button', { name: 'Charger la suite', exact: true }).count(), 0, 'plus de suite');
  });

  test('cr_texte_de_100000_caracteres_accepte_100001_refuse_et_rien_n_est_cree', async () => {
    // Casse si : le plafond du texte d'un compte-rendu redevient 20 000, ou disparaît.
    const ok = await appel(lea, 'POST', '/api/univers/1/comptes-rendus', { campagneId: campagne, titre: 'Pile', texte: 'a'.repeat(100000) });
    assert.equal(ok.status, 201, ok.text.slice(0, 200));
    const trop = await appel(lea, 'POST', '/api/univers/1/comptes-rendus', { campagneId: campagne, titre: 'Trop long', texte: 'a'.repeat(100001) });
    assert.equal(trop.status, 400, trop.text.slice(0, 200));
    const liste = await appel(lea, 'GET', `/api/univers/1/comptes-rendus`);
    assert.ok(!/Trop long/.test(liste.text), 'un CR refusé a été créé');
  });

  test('cr_texte_trop_long_au_navigateur_dit_le_plafond_et_garde_la_saisie', async () => {
    // Casse si : la fenêtre « Nouveau compte-rendu » ferme ou perd le titre sur un texte de 100 001 caractères.
    await lea.goto(`/univers/1/fiche/${campagne}`);
    await lea.getByRole('button', { name: /^Nouveau compte-rendu/ }).first().click();
    const f = lea.getByRole('dialog');
    await f.getByLabel('Titre').fill('Texte énorme');
    await f.getByLabel(/^Texte/).fill('b'.repeat(100001));
    await f.getByRole('button', { name: 'Créer', exact: true }).click();
    await f.getByText(rx('100 000 caractères au plus')).first().waitFor();
    assert.equal(await f.getByLabel('Titre').inputValue(), 'Texte énorme');
    await lea.screenshot({ path: '/tmp/suivi-cr-plafond.png', fullPage: true });
  });

  test('scenario_sans_section_ouverte_est_introuvable_pour_lea_et_son_cr_ne_la_nomme_pas', async () => {
    // Casse si : la fiche d'un scénario fermé s'ouvre à une joueuse, ou son titre fuit par le CR.
    await lea.goto(`/univers/1/fiche/${scenario}`);
    await lea.getByText(rx('Page introuvable.')).waitFor();
    assert.ok(!/Acte fermé/.test(await texte(lea)), 'le titre du scénario fermé fuit');
    const cr = await appel(antor, 'POST', '/api/univers/1/comptes-rendus', { campagneId: scenario, titre: 'CR du scénario fermé', texte: 'x' });
    assert.equal(cr.status, 201, cr.text);
    const lu = await appel(lea, 'GET', `/api/univers/1/comptes-rendus`);
    assert.ok(!/Acte fermé/.test(lu.text), 'la liste des CR nomme un scénario fermé à Léa');
    await lea.goto('/univers/1/comptes-rendus');
    await lea.getByText('CR du scénario fermé').first().waitFor();
    assert.ok(!/Acte fermé/.test(await texte(lea)));
  });
});
