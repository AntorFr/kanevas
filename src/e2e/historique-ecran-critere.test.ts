// ecrans: historique, fiche
// E-24 « Historique de l’univers » (P-26), written from the task's exit criterion: the three lines, the restoration and its
// toast, the stale refusal with « Recharger », the sheet's ⋯ entry, the player's absence, the deleted sheet read-only, offline.
// The effects (rows, rights, codes) are proved by `src/routes/historique.test.ts`; here only what the GM sees.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, attendreTransitions, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = process.env.CAPTURES_DIR ?? '/tmp/kanevas-e24-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let ctxAntor: Any;
let lea: Any;
let U = 0;
let PORT = 0;
let SECTION = 0;
let VERSION = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
const versionCourante = async () => (await api(antor, 'GET', `/api/univers/${U}/fiches/${PORT}/sections/${SECTION}`)).version as number;
const ecrire = async (contenu: string) => {
  VERSION = await versionCourante();
  const r = await api(antor, 'PUT', `/api/univers/${U}/fiches/${PORT}/sections/${SECTION}/contenu`, { contenu, version: VERSION });
  VERSION = r.version;
};
const historique = (page: Any, requete = '') => page.goto(`/univers/${U}/historique${requete}`);
const lignes = (page: Any) => page.getByRole('list', { name: 'Modifications de l’univers' }).getByRole('listitem');
const tete = (page: Any) => page.getByRole('heading', { level: 1, name: 'Historique' });

describe('kanevas-synchro-historique-ecran, E-24', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    antor = a.page;
    ctxAntor = a.ctx;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const port = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Port-Sel' });
    PORT = port.id;
    const cap = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Cap Brume' });
    const cote = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Côte des Brumes' });
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${PORT}/sections`, { titre: 'Aperçu', contenu: 'Un petit port.' });
    SECTION = s.id;
    VERSION = s.version;
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${PORT}/sections/${SECTION}`, { joueursLisent: true });
    const rel = await api(antor, 'POST', `/api/univers/${U}/fiches/${PORT}/sections/${SECTION}/relations`, { cibleFicheId: cap.id, qualificatif: 'voisin' });
    // The three gestures of the criterion, in this order.
    await ecrire('Un grand port, ses quais et ses phares.');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${PORT}`, { parent: cote.id });
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/relations/${rel.id}`);
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    await srv?.stop();
  });

  test('le MJ voit les trois lignes avec date, compte et origine ; la barre porte l’entrée', async () => {
    await historique(antor);
    await tete(antor).waitFor();
    await lignes(antor).first().waitFor();
    const texte = await antor.getByRole('list', { name: 'Modifications de l’univers' }).innerText();
    assert.match(texte, /Section « .* » réécrite/);
    assert.match(texte, /Fiche déplacée/);
    assert.match(texte, /Relation vers lieu:cap-brume retirée/);
    assert.match(texte, /antor/);
    assert.match(texte, /écran/);
    assert.match(texte, /\d{2}\/\d{2}\/\d{4}/);
    assert.ok(await antor.getByRole('link', { name: 'Historique' }).first().isVisible());
    await antor.screenshot({ path: `${SHOTS}/liste-1280.png`, fullPage: true });
    await antor.setViewportSize({ width: 360, height: 780 });
    await antor.screenshot({ path: `${SHOTS}/liste-360.png`, fullPage: true });
    await antor.setViewportSize({ width: 1280, height: 800 });
  });

  test('« Restaurer cette version » : confirmation (focus sur Annuler), toast, ligne en tête, ancien texte rendu', async () => {
    let avant = 0;
    await historique(antor);
    await lignes(antor).first().waitFor();
    avant = await lignes(antor).count();
    await lignes(antor).filter({ hasText: /Section « .* » réécrite/ }).locator('a.ligne-historique-detail').first().click();
    await antor.getByRole('button', { name: 'Restaurer cette version' }).waitFor();
    assert.match(await antor.locator('body').innerText(), /Un petit port\./);
    await antor.screenshot({ path: `${SHOTS}/detail-1280.png`, fullPage: true });
    await antor.getByRole('button', { name: 'Restaurer cette version' }).click();
    const dlg = antor.getByRole('alertdialog');
    await dlg.waitFor();
    assert.equal(await antor.evaluate(() => document.activeElement?.textContent?.trim()), 'Annuler');
    await attendreTransitions(antor);
    await antor.screenshot({ path: `${SHOTS}/confirmation.png` });
    await dlg.getByRole('button', { name: 'Restaurer cette version' }).click();
    await antor.getByText('Version restaurée').waitFor();
    await dlg.waitFor({ state: 'detached' });
    await antor.waitForFunction(() => !location.search.includes('ligne='));
    await lignes(antor).first().waitFor();
    assert.match(await lignes(antor).first().innerText(), /Section « .* » réécrite/);
    assert.equal(await lignes(antor).count(), avant + 1);
    assert.match(JSON.stringify(await api(antor, 'GET', `/api/univers/${U}/fiches/${PORT}/sections/${SECTION}`)), /Un petit port\./);
  });

  test('une section changée depuis l’affichage : « La fiche a changé depuis l’affichage. » et « Recharger »', async () => {
    await ecrire('Un port de pêche.');
    await historique(antor);
    await lignes(antor).first().waitFor();
    await lignes(antor).filter({ hasText: /Section « .* » réécrite/ }).first().locator('a.ligne-historique-detail').click();
    await antor.getByRole('button', { name: 'Restaurer cette version' }).waitFor();
    await ecrire('Un port, encore autre.'); // behind the screen's back
    await antor.getByRole('button', { name: 'Restaurer cette version' }).click();
    await antor.getByRole('alertdialog').getByRole('button', { name: 'Restaurer cette version' }).click();
    await antor.getByText('La fiche a changé depuis l’affichage.').waitFor();
    await antor.getByRole('button', { name: 'Recharger' }).waitFor();
    await antor.screenshot({ path: `${SHOTS}/refus.png`, fullPage: true });
    await antor.getByRole('button', { name: 'Recharger' }).click();
    await antor.getByText('La fiche a changé depuis l’affichage.').waitFor({ state: 'detached' });
  });

  test('connexion coupée : le bouton de restauration est désactivé', async () => {
    await historique(antor);
    await lignes(antor).first().waitFor();
    await lignes(antor).filter({ hasText: /Section « .* » réécrite/ }).first().locator('a.ligne-historique-detail').click();
    const bouton = antor.getByRole('button', { name: 'Restaurer cette version' });
    await bouton.waitFor();
    await ctxAntor.setOffline(true);
    await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
    try {
      await antor.getByText(/Connexion perdue/).waitFor();
      await antor.screenshot({ path: `${SHOTS}/hors-ligne.png`, fullPage: true });
      assert.ok(await bouton.isDisabled());
    } finally {
      await ctxAntor.setOffline(false);
    }
  });

  test('le menu ⋯ d’une fiche ouvre l’historique filtré sur elle', async () => {
    await antor.goto(`/univers/${U}/fiche/${PORT}`);
    await antor.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await attendre(antor);
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Historique' }).click();
    await tete(antor).waitFor();
    assert.match(antor.url(), new RegExp(`/historique\\?fiche=${PORT}$`));
    await lignes(antor).first().waitFor();
    assert.ok((await antor.getByRole('button', { name: 'Port-Sel' }).count()) > 0, 'le filtre nomme la fiche');
    const texte = await antor.getByRole('list', { name: 'Modifications de l’univers' }).innerText();
    assert.doesNotMatch(texte, /Cap Brume/);
  });

  test('une joueuse n’a ni l’entrée de la barre ni celle du menu ; l’adresse forcée répond « Page introuvable. »', async () => {
    await lea.goto(`/univers/${U}/fiche/${PORT}`);
    await lea.getByRole('heading', { level: 1, name: 'Port-Sel' }).waitFor();
    await attendre(lea);
    assert.equal(await lea.getByRole('link', { name: 'Historique' }).count(), 0);
    const menu = lea.getByRole('button', { name: /^Autres actions sur/ });
    if ((await menu.count()) > 0) {
      await menu.first().click();
      assert.equal(await lea.getByRole('menuitem', { name: 'Historique' }).count(), 0);
      await lea.keyboard.press('Escape');
    }
    await historique(lea);
    await lea.getByText('Page introuvable.').waitFor();
    assert.equal(await lea.getByRole('list', { name: 'Modifications de l’univers' }).count(), 0);
  });

  test('une fiche supprimée : ses sections en lecture seule, sans bouton, texte copiable', async () => {
    const e = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Éphémère' });
    await api(antor, 'POST', `/api/univers/${U}/fiches/${e.id}/sections`, { titre: 'Notes', contenu: 'Texte **source** à garder.' });
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${e.id}`);
    await historique(antor);
    await lignes(antor).first().waitFor();
    await lignes(antor).filter({ hasText: 'Fiche supprimée' }).first().locator('a.ligne-historique-detail').click();
    await antor.getByText('Texte **source** à garder.').waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Restaurer cette version' }).count(), 0);
    assert.equal(await antor.locator('.page-historique textarea, .page-historique input').count(), 0, 'rien à écrire');
    await antor.screenshot({ path: `${SHOTS}/supprimee.png`, fullPage: true });
    await antor.setViewportSize({ width: 360, height: 780 });
    await antor.screenshot({ path: `${SHOTS}/supprimee-360.png`, fullPage: true });
    await antor.setViewportSize({ width: 1280, height: 800 });
  });

  test('un filtre sans résultat : l’état vide', async () => {
    await historique(antor, '?action=supprimee&qui=c:999999');
    await antor.getByText('Aucune modification dans cette période.').waitFor();
  });
});
