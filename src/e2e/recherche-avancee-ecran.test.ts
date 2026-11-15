// Black-box tests of kanevas-fiches-liees-recherche-ecran, written from the exit criterion (B-65, P-17,
// E-17 "advanced search"): « Lié à » + « Par » + « sous-lieux compris » through the real screen.
// Real server in stub mode, real Chromium. Waits are on what the user sees (a row appearing or going
// away), never networkidle. Screenshots go to /tmp.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-recherche-avancee-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}

async function fiche(type: string, titre: string, publique = true): Promise<number> {
  const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, charge: type === 'personnage' ? { pj: false } : undefined });
  const base = `/api/univers/${U}/fiches/${f.id}/sections`;
  const s = await api(antor, 'POST', base, { titre: 'Texte', contenu: 'x' });
  if (publique) await api(antor, 'PATCH', `${base}/${s.id}`, { joueursLisent: true });
  const m = await api(antor, 'POST', base, { titre: 'Secret — MJ seul', contenu: 'y' });
  ids[titre] = f.id;
  ids[`${titre}#sec`] = s.id;
  ids[`${titre}#secret`] = m.id;
  return f.id;
}
async function relier(de: string, cible: string, nature: string | null, secret = false, qualificatif?: string) {
  const sec = ids[`${de}#${secret ? 'secret' : 'sec'}`];
  await api(antor, 'POST', `/api/univers/${U}/fiches/${ids[de]}/sections/${sec}/relations`,
    { cibleFicheId: ids[cible], nature, ...(qualificatif ? { qualificatif } : {}) });
}

const lignes = (page: Any) => page.locator('ul.resultats-recherche > li');
async function titres(page: Any): Promise<string[]> {
  return (await lignes(page).locator('a').evaluateAll((as: Any[]) => as.map((a) => (a.querySelector('.titre-recherche, .titre') ?? a).textContent))).map((t: string) => t.trim());
}
async function rows(page: Any): Promise<string[]> {
  return (await lignes(page).allInnerTexts()).map((t: string) => t.replace(/\s+/g, ' ').trim());
}
async function ouvrir(page: Any, qs: string): Promise<void> {
  await page.goto(`/univers/${U}/recherche${qs}`);
  await page.getByRole('heading', { name: 'Recherche', level: 1 }).waitFor();
}
const volet = (page: Any) => page.getByText('Recherche avancée', { exact: true });
const par = (page: Any) => page.getByLabel('Par', { exact: true });
const sousLieux = (page: Any) => page.getByLabel('sous-lieux compris');

describe('kanevas-fiches-liees-recherche-ecran, E-17 recherche avancée', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await api(antor, 'POST', '/api/univers', { nom: 'Brumes' })).id;
    await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    await fiche('lieu', 'Port-Sel');
    await fiche('lieu', 'Les Docks');
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${ids['Les Docks']}`, { parent: ids['Port-Sel'] });
    await fiche('lieu', 'Crypte secrète', false);
    await fiche('personnage', 'Aldric');
    await fiche('personnage', 'Le Prieur');
    await fiche('personnage', 'Suie');
    await fiche('faction', 'La Guilde des Brumes');
    await fiche('objet', "Rapport secret de l'amirauté");
    await relier('Aldric', 'Port-Sel', 'se_situe');
    await relier('Le Prieur', 'Port-Sel', 'se_situe', true);
    await relier('Suie', 'Les Docks', 'se_situe');
    await relier('La Guilde des Brumes', 'Port-Sel', null, false, 'rôde');
    await relier("Rapport secret de l'amirauté", 'Port-Sel', null, false, 'cité');
    await relier('Aldric', 'Crypte secrète', 'se_situe');
  }, { timeout: 180000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor : Port-Sel, s’y trouvent, sous-lieux compris, Personnage → Aldric, Le Prieur, Suie (via Les Docks) ; sans la case Suie disparaît', async () => {
    // Fails if the address does not reach the list, or the descendants flag is ignored.
    await ouvrir(antor, '');
    await volet(antor).click();
    await antor.getByLabel('Lié à').fill('Port');
    await antor.getByRole('button', { name: /Port-Sel/ }).click();
    await antor.getByRole('button', { name: 'Retirer la fiche liée' }).waitFor();
    await par(antor).selectOption({ label: "s'y trouvent" });
    await sousLieux(antor).check();
    await antor.getByRole('button', { name: 'Personnages' }).click();
    await antor.getByRole('link', { name: /Suie/ }).waitFor();
    assert.deepEqual((await rows(antor)).map((r) => r.replace(/ .*$/, '')), ['Aldric', 'Le', 'Suie']);
    const r = await rows(antor);
    assert.ok(r[2]!.includes('Les Docks'), r[2]);
    assert.ok(!r[0]!.includes('Les Docks'));
    assert.match(antor.url(), /lie=\d+/);
    assert.match(antor.url(), /nature=se_situe/);
    assert.match(antor.url(), /descendants=1/);
    assert.match(antor.url(), /type=personnage/);
    await antor.screenshot({ path: `${SHOTS}/antor-sous-lieux.png` });
    await sousLieux(antor).uncheck();
    await antor.getByRole('link', { name: /Suie/ }).waitFor({ state: 'detached' });
    assert.equal((await rows(antor)).length, 2);
    assert.ok(!antor.url().includes('descendants'));
  });

  test('sans filtre de type, « toute relation » ajoute La Guilde des Brumes et le Rapport secret', async () => {
    await ouvrir(antor, `?lie=${ids['Port-Sel']}`);
    await antor.getByRole('link', { name: /Rapport secret/ }).waitFor();
    const t = (await rows(antor)).map((r) => r.split(' ')[0]);
    assert.equal(t.length, 4, t.join(','));
    assert.ok((await rows(antor)).some((r) => r.startsWith('La Guilde des Brumes')));
    assert.equal(await par(antor).inputValue(), '');
  });

  test('l’adresse se rouvre telle quelle : volet ouvert, pastille, case cochée', async () => {
    await ouvrir(antor, `?lie=${ids['Port-Sel']}&nature=se_situe&descendants=1&type=personnage`);
    await antor.getByRole('link', { name: /Suie/ }).waitFor();
    assert.ok(await antor.locator('details.recherche-avancee').evaluate((d: Any) => d.open));
    assert.equal(await antor.getByText('Port-Sel').first().isVisible(), true);
    assert.equal(await sousLieux(antor).isChecked(), true);
    assert.equal(await par(antor).inputValue(), 'se_situe');
    assert.equal((await rows(antor)).length, 3);
  });

  test('changer la fiche choisie pour une personne retire la case et la nature qui ne s’applique plus', async () => {
    // Fails if a stale nature/descendants stays in the address after the target is no longer a place.
    await ouvrir(antor, `?lie=${ids['Port-Sel']}&nature=se_situe&descendants=1`);
    await antor.getByRole('link', { name: /Suie/ }).waitFor();
    await antor.getByRole('button', { name: 'Retirer la fiche liée' }).click();
    await antor.getByLabel('Lié à').fill('Aldric');
    await antor.getByRole('button', { name: /Aldric/ }).click();
    await antor.getByRole('button', { name: 'Retirer la fiche liée' }).waitFor();
    await sousLieux(antor).waitFor({ state: 'detached' });
    await antor.waitForFunction(() => !location.search.includes('descendants') && !location.search.includes('nature='));
    assert.match(antor.url(), new RegExp(`lie=${ids['Aldric']}`));
  });

  test('adresse avec nature inconnue ou descendants sur une personne : nettoyée', async () => {
    await ouvrir(antor, `?lie=${ids['Aldric']}&nature=n_importe_quoi&descendants=1`);
    await antor.waitForFunction(() => !location.search.includes('descendants') && !location.search.includes('nature='));
    assert.equal(await sousLieux(antor).count(), 0);
  });

  test('« Par » propose cinq natures au plus, et seulement celles qui visent le type de la cible', async () => {
    await ouvrir(antor, `?lie=${ids['Port-Sel']}`);
    await par(antor).waitFor();
    await antor.waitForFunction(() => (document.querySelectorAll('select option').length > 1));
    const opts: string[] = await par(antor).locator('option').allInnerTexts();
    assert.equal(opts[0], 'toute relation');
    assert.ok(opts.length - 1 <= 5, opts.join('|'));
    assert.ok(opts.includes("s'y trouvent"));
    assert.ok(!opts.includes('membres'), 'membres vise une faction, pas un lieu');
  });

  test('Léa : même adresse → Aldric et Suie seulement ; « Lié à » ne propose pas la crypte cachée', async () => {
    // Fails if the picker or the list leaks a sheet or a secret relation Léa cannot read.
    await ouvrir(lea, `?lie=${ids['Port-Sel']}&nature=se_situe&descendants=1&type=personnage`);
    await lea.getByRole('link', { name: /Suie/ }).waitFor();
    assert.deepEqual((await rows(lea)).map((r) => r.split(' ')[0]), ['Aldric', 'Suie']);
    await lea.getByRole('button', { name: 'Retirer la fiche liée' }).click();
    await lea.getByLabel('Lié à').fill('Crypte');
    await lea.getByText('Aucune fiche.').waitFor();
    assert.equal(await lea.getByRole('button', { name: /Crypte/ }).count(), 0);
    await lea.screenshot({ path: `${SHOTS}/lea-picker-vide.png` });
  });

  test('Léa : ?lie= sur une fiche qu’elle ne lit pas → « Fiche introuvable » et « Aucune fiche liée pour ces critères. »', async () => {
    await ouvrir(lea, `?lie=${ids['Crypte secrète']}`);
    await lea.getByText('Aucune fiche liée pour ces critères.').waitFor();
    assert.ok(await lea.getByText('Fiche introuvable').isVisible());
    assert.ok(!(await lea.locator('body').innerText()).includes('Crypte'));
    await lea.screenshot({ path: `${SHOTS}/lea-introuvable.png` });
  });

  test('recherche sans mot quand « Lié à » est posé ; sans « Lié à » ni mot, l’état de départ', async () => {
    await ouvrir(antor, '');
    await antor.getByText('Cherchez un nom, un alias ou un mot.').first().waitFor();
    assert.equal(await lignes(antor).count(), 0);
    await ouvrir(antor, `?lie=${ids['Les Docks']}`);
    await antor.getByRole('link', { name: /Suie/ }).waitFor();
    assert.equal(await lignes(antor).count(), 1);
  });

  test('pastille de 120 caractères : coupée à l’écran, entière dans l’infobulle', async () => {
    const long = 'L'.repeat(60) + ' ' + 'M'.repeat(59);
    assert.equal(long.length, 120);
    await fiche('lieu', long);
    await ouvrir(antor, `?lie=${ids[long]}`);
    const pastille = antor.locator('.pastille-lie');
    await pastille.waitFor();
    await antor.getByText('Aucune fiche liée', { exact: false }).waitFor();
    assert.equal(await pastille.getAttribute('title'), long);
    const { sw, cw } = await pastille.evaluate((p: Any) => ({ sw: p.scrollWidth, cw: p.clientWidth }));
    const texteSpan = await pastille.locator('span').nth(0).evaluate((s: Any) => ({ sw: s.scrollWidth, cw: s.clientWidth }));
    assert.ok(texteSpan.sw > texteSpan.cw || sw > cw, 'la pastille doit couper le long titre');
    const doc = await antor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(doc, 'pas de débordement horizontal de la page');
    await antor.screenshot({ path: `${SHOTS}/pastille-120.png` });
  });

  test('erreur du serveur sur la liste : message et « Réessayer » rétablit le résultat', async () => {
    await ouvrir(antor, '');
    await antor.route(`**/api/univers/${U}/fiches?*lie=*`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await antor.goto(`/univers/${U}/recherche?lie=${ids['Port-Sel']}`);
    await antor.getByText('La recherche n’a pas abouti.').waitFor();
    await antor.unroute(`**/api/univers/${U}/fiches?*lie=*`);
    await antor.getByRole('button', { name: 'Réessayer' }).first().click();
    await antor.getByRole('link', { name: /Aldric/ }).waitFor();
  });
});
