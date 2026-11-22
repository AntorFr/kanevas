// ecrans: accueil, assistant, battlemap-assets, cartes, outil
// Ensemble screen tests of kanevas-battlemap-assistant written from the need (fiche exit criterion, P-26 step 4, P-27 step 3,
// docs/ecrans.md « E-12, E-26, E-27, E-28 — detail of kanevas-battlemap-assistant »), not from the code. Real server in stub
// mode (the assistant's AD-78 script), real Chromium. Effects have their door tests in
// src/outils/battlemap/assistant-ensemble-besoin.test.ts; here only what the user sees.
//
// TEST PLAN
//   E-12 -> E-28 : Antor asks « Compose une cantine de 20×14 avec une cuisine et une réserve » → the answer names « cuisine » and
//                  says « cachée aux joueurs », one block « Carte « Cantine » composée » + « Ouvrir » → E-28 titled « Cantine »
//   E-12 -> E-27 : « dix décors de station abandonnée » → block « Lot préparé : 10 assets » + « À lancer par vous. » → E-27 « Préparé »
//   E-12 -> E-26 : the assistant's direction → block « Direction artistique modifiée » → E-26 with « Texte modifié par l’assistant »
//                  + « Annuler » → « Texte précédent rétabli. »
//   joueuse      : Léa asking for a map / a lot / a direction → no block; E-26, E-27, E-28 targets read « Page introuvable. »
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

describe('E-12 · E-26 · E-27 · E-28 : l’assistant de la battle map au navigateur', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let lea: Any;
  let uid = 0;
  const racine = () => `/univers/${uid}/outils/battlemap`;
  const panneau = (p: Any) => p.getByRole('complementary', { name: /Kanevas — assistant/ });
  const champ = (p: Any) => panneau(p).getByRole('textbox', { name: 'Demander à Kanevas' });

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  async function ouvrir(p: Any, url: string) {
    await p.goto(url);
    await attendre(p);
    if ((await panneau(p).count()) === 0) await p.getByRole('button', { name: 'Demander à Kanevas' }).click();
    await champ(p).waitFor();
  }
  /** Sends the request and waits for the server's answer to that very call before reading the screen. */
  async function demander(p: Any, q: string) {
    await champ(p).fill(q);
    const reponse = p.waitForResponse((r: Any) => r.url().includes('/assistant/messages') && r.request().method() === 'POST');
    await panneau(p).getByRole('button', { name: 'Envoyer' }).click();
    assert.equal((await reponse).status(), 200);
  }

  it('E-12 → E-28 : la cantine — réponse qui nomme « cuisine », un seul bloc, « Ouvrir » mène à la carte « Cantine »', async () => {
    await ouvrir(antor, `${racine()}/assets`);
    await demander(antor, 'Compose une cantine de 20×14 avec une cuisine et une réserve');
    await panneau(antor).getByText(/Il manque un asset de cuisine/).waitFor();
    await panneau(antor).getByText(/cachée aux joueurs/).waitFor();
    await panneau(antor).getByText('Carte « Cantine » composée', { exact: true }).waitFor();
    assert.equal(await panneau(antor).getByText('Carte « Cantine » composée', { exact: true }).count(), 1);
    await panneau(antor).getByRole('link', { name: /Ouvrir/ }).click();
    await antor.waitForURL(/\/outils\/battlemap\/cartes\/\d+/);
    await antor.getByText('Cantine', { exact: true }).first().waitFor();
    assert.equal(await antor.getByText('Page introuvable.').count(), 0);
  });

  it('E-12 → E-27 : « dix décors » — bloc « Lot préparé : 10 assets » et « À lancer par vous. », E-27 montre « Préparé »', async () => {
    await ouvrir(antor, `${racine()}/assets`);
    await demander(antor, 'Je voudrais dix décors de station abandonnée');
    await panneau(antor).getByText('Lot préparé : 10 assets').waitFor();
    await panneau(antor).getByText('À lancer par vous.').waitFor();
    await panneau(antor).getByRole('link', { name: /Ouvrir/ }).last().click();
    await antor.getByText('Préparé', { exact: true }).waitFor();
    assert.equal(await antor.getByText('Page introuvable.').count(), 0);
  });

  it('E-12 → E-26 : la direction — bloc « Direction artistique modifiée », bannière « Texte modifié par l’assistant », « Annuler » rétablit', async () => {
    await ouvrir(antor, `${racine()}/assets`);
    await demander(antor, 'Propose une direction artistique pour cet univers.');
    await panneau(antor).getByText('Direction artistique modifiée').waitFor();
    await panneau(antor).getByRole('link', { name: /Ouvrir/ }).last().click();
    const bandeau = antor.getByRole('status').filter({ hasText: 'Texte modifié par l’assistant' });
    await bandeau.waitFor();
    assert.match(await antor.getByRole('textbox', { name: 'Style', exact: true }).inputValue(), /Palette chaude et sobre/);
    const rep = antor.waitForResponse((r: Any) => r.url().includes('/direction/annuler'));
    await bandeau.getByRole('button', { name: 'Annuler la modification de l’assistant' }).click();
    assert.equal((await rep).status(), 200);
    await antor.getByText('Texte précédent rétabli.').waitFor();
    await bandeau.waitFor({ state: 'detached' });
    assert.equal(await antor.getByRole('textbox', { name: 'Style', exact: true }).inputValue(), 'Peinture à plat, couleurs franches, vue de dessus, contours nets.');
  });

  it('joueuse : Léa demande une carte, un lot, une direction — aucun bloc ; E-26, E-27 et E-28 lui sont « Page introuvable. »', async () => {
    await ouvrir(lea, `${racine()}/assets`);
    for (const q of ['Compose une cantine de 20×14 avec une cuisine', 'Je voudrais dix décors de station abandonnée', 'Propose une direction artistique pour cet univers.']) {
      await demander(lea, q);
    }
    for (const bloc of ['Carte « Cantine » composée', 'Lot préparé', 'Direction artistique modifiée']) {
      assert.equal(await panneau(lea).getByText(bloc).count(), 0, bloc);
    }
    for (const url of [`${racine()}/assets?onglet=direction`, `${racine()}/cartes/2`]) {
      await lea.goto(url);
      await attendre(lea);
      await lea.getByText('Page introuvable.').first().waitFor();
    }
  });
});
