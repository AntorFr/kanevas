// Feature-level complements for kanevas-import-arbre (B-35, P-12, P-10; E-8 tree, E-9 trail and « Contient »; AD-99, AD-104),
// written from docs/parcours.md and docs/ecrans.md only (section « Ce que `kanevas-import-arbre` construit »).
// Cases that arbre-ensemble-besoin.test.ts leaves open: an unreadable ancestor in the middle of the trail,
// « Contient » and the tree paging for a reader who cannot see everything, and an
// import replay seen in the tree. Real server in stub mode, real Chromium. Expected values are literals.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const SHOTS = '/tmp/kanevas-arbre-complements-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0; // Lame d'Ébène
let E = 0; // Essai Kanka
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function importer(method: string, chemin: string, corps?: unknown): Promise<{ status: number; corps: Any }> {
  const r = await fetch(`${srv.base}/api/import/v1/univers/${E}${chemin}`, {
    method,
    headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  return { status: r.status, corps: t ? JSON.parse(t) : null };
}
async function ouvrir(page: Any, univers: number, id: number, titre: string): Promise<void> {
  await page.goto(`/univers/${univers}/fiche/${id}`);
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
  await attendre(page);
}
const fil = (page: Any) => page.getByRole('navigation', { name: /Fil d.Ariane/i }).first();
async function filTexte(page: Any): Promise<string> {
  return (await fil(page).innerText()).replace(/\s*\n\s*/g, ' › ').replace(/\s+/g, ' ').replace(/^\S › /, '').trim();
}
const arbre = (page: Any) => page.getByRole('tree');
const noeud = (page: Any, titre: string) => arbre(page).getByRole('treeitem').filter({ hasText: titre });
async function titres(page: Any): Promise<string[]> {
  return (await arbre(page).getByRole('treeitem').locator('.titre-fiche').allInnerTexts()).map((s: string) => s.trim());
}
async function ouvrirListe(page: Any, univers: number, nav: string): Promise<void> {
  await page.goto(`/univers/${univers}`);
  await attendre(page);
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: nav, exact: true }).click();
  await attendre(page);
}
async function enArbre(page: Any): Promise<void> {
  const b = page.getByRole('button', { name: 'Arbre', exact: true });
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  await arbre(page).waitFor();
  await attendre(page);
}
/** A lieu a player reads (one section read by players) or, with lisible=false, a lieu no player reads. */
async function lieu(univers: number, titre: string, lisible: boolean): Promise<number> {
  const f = await api(antor, 'POST', `/api/univers/${univers}/fiches`, { type: 'lieu', titre });
  if (lisible) {
    const s = await api(antor, 'POST', `/api/univers/${univers}/fiches/${f.id}/sections`, { titre: 'Description', contenu: 'Un lieu.' });
    await api(antor, 'PATCH', `/api/univers/${univers}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
  }
  return f.id;
}
const ranger = (fid: number, parent: number | null) => api(antor, 'PATCH', `/api/univers/${U}/fiches/${fid}`, { parent });

describe('kanevas-import-arbre, compléments d’ensemble', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    E = us.find((u: Any) => u.nom === 'Essai Kanka').id;
    const l = await api(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    for (const f of l.fiches) ids[f.titre] = f.id;
    const s = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Sphères`);
    for (const f of s.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // P-12 étape 2, B-35 « un ancêtre illisible est sauté ». Panne : le fil s'arrête au premier ancêtre illisible,
  // ou le nomme, ou perd l'ancêtre lisible au-dessus.
  test('B-35 : Les Sphères (illisible) rangée sous Le Grand Vide (lisible), Léa lit « Lame d’Ébène › Lieux › Le Grand Vide › Port-Sel »', async () => {
    const vide = await lieu(U, 'Le Grand Vide', true);
    await ranger(ids['Les Sphères']!, vide);
    await ouvrir(lea, U, ids['Port-Sel']!, 'Port-Sel');
    assert.equal(await filTexte(lea), "Lame d'Ébène › Lieux › Le Grand Vide › Port-Sel");
    assert.ok(!(await lea.locator('body').innerText()).includes('Sphères'), 'Les Sphères fuit chez Léa');
    await lea.screenshot({ path: `${SHOTS}/lea-grand-vide.png` });
    await ouvrir(antor, U, ids['Port-Sel']!, 'Port-Sel');
    assert.equal(await filTexte(antor), "Lame d'Ébène › Lieux › Le Grand Vide › Les Sphères › Port-Sel");
  });

  // B-35 « un enfant illisible absent, sans compteur » + E-9 « 50 puis Afficher les N suivants (N = ce que la page
  // suivante compte, jamais un total) ». Panne : la page compte les enfants cachés, ou N les inclut.
  test('B-35 bord : 55 enfants lisibles et 10 cachés, Léa voit 50 puis « Afficher les 5 suivants », jamais un caché', async () => {
    const parent = await lieu(U, 'Archipel des Mille', true);
    for (let i = 1; i <= 55; i++) await ranger(await lieu(U, `Îlot ${String(i).padStart(2, '0')}`, true), parent);
    for (let i = 1; i <= 10; i++) await ranger(await lieu(U, `Récif secret ${i}`, false), parent);
    await ouvrir(lea, U, parent, 'Archipel des Mille');
    await lea.getByRole('heading', { name: 'Contient' }).waitFor();
    const lire = async () => (await lea.locator('main').innerText()) as string;
    const comptes = async () => (await lire()).match(/Îlot \d\d/g)?.length ?? 0;
    assert.equal(await comptes(), 50);
    const suite = lea.getByRole('button', { name: 'Afficher les 5 suivants' });
    await suite.waitFor();
    assert.ok(!(await lire()).includes('Récif'), 'un enfant caché paraît');
    await lea.screenshot({ path: `${SHOTS}/lea-contient-50.png` });
    await suite.click();
    await lea.getByText('Îlot 55', { exact: true }).waitFor();
    assert.equal(await comptes(), 55);
    assert.ok(!(await lire()).includes('Récif'), 'un enfant caché paraît après la suite');
    assert.equal(await lea.getByRole('button', { name: /Afficher les \d+ suivants/ }).count(), 0);
    // Antor, qui lit tout, y voit les 10 autres
    await ouvrir(antor, U, parent, 'Archipel des Mille');
    await antor.getByRole('heading', { name: 'Contient' }).waitFor();
    assert.ok((await antor.locator('main').innerText()).includes('Îlot 01'));
    const plus = antor.getByRole('button', { name: /Afficher les \d+ suivants/ });
    await plus.click();
    await antor.getByText('Récif secret 10', { exact: true }).waitFor();
  });

  // E-8 contenu long : « 201 lieux : 100 racines puis la suite ». Panne : tout est chargé d'un coup, ou la suite manque.
  test('E-8 bord : plus de 100 racines, l’arbre en montre 100 puis « Charger la suite » amène les autres', async () => {
    for (let i = 1; i <= 105; i++) await lieu(U, `Racine ${String(i).padStart(3, '0')}`, true);
    await ouvrirListe(lea, U, 'Lieux');
    await enArbre(lea);
    assert.equal((await titres(lea)).length, 100);
    const suite = lea.getByRole('button', { name: 'Charger la suite' });
    await suite.waitFor();
    await lea.screenshot({ path: `${SHOTS}/lea-racines-100.png` });
    await suite.click();
    await noeud(lea, 'Racine 105').waitFor();
    const t = await titres(lea);
    assert.ok(t.length > 100, `${t.length} racines`);
    for (const n of ['Racine 001', 'Racine 100', 'Racine 105', 'Port-Sel']) assert.ok(t.includes(n), `absent : ${n}`);
    assert.ok(!t.includes('Les Sphères'), 'Les Sphères fuit dans l’arbre de Léa');
    assert.equal(await lea.getByRole('button', { name: 'Charger la suite' }).count(), 0);
  });

  // AD-104 : « le rejeu qui le pose se voit dans l'arbre ». Panne : le parent posé au rejeu n'apparaît pas dans l'arbre.
  test('AD-104 : import d’un enfant dont la cible manque, racine dans l’arbre ; la cible arrive, le rejeu l’y range', async () => {
    const lot1 = (await importer('POST', '/lots')).corps.lotId;
    const enfant = await importer('PUT', `/fiches/${encodeURIComponent('lieu:calanque-test')}?lot=${lot1}`, {
      type: 'lieu', titre: 'Calanque Test', sections: [], parent: 'lieu:cap-test',
    });
    assert.equal(enfant.status, 200);
    await ouvrirListe(antor, E, 'Lieux');
    await enArbre(antor);
    assert.ok((await titres(antor)).includes('Calanque Test'), 'Calanque Test absente des racines');
    assert.equal(await noeud(antor, 'Calanque Test').getByRole('button', { name: 'Déplier' }).count(), 0);

    const lot2 = (await importer('POST', '/lots')).corps.lotId;
    assert.equal((await importer('PUT', `/fiches/${encodeURIComponent('lieu:cap-test')}?lot=${lot2}`, { type: 'lieu', titre: 'Cap Test', sections: [] })).status, 200);
    const rejeu = await importer('PUT', `/fiches/${encodeURIComponent('lieu:calanque-test')}?lot=${lot2}`, {
      type: 'lieu', titre: 'Calanque Test', sections: [], parent: 'lieu:cap-test',
    });
    assert.equal(rejeu.status, 200);
    await antor.reload();
    await attendre(antor);
    await arbre(antor).waitFor();
    const racines = await titres(antor);
    assert.ok(racines.includes('Cap Test'), racines.join('|'));
    assert.ok(!racines.includes('Calanque Test'), 'Calanque Test reste une racine après le rejeu');
    const cap = noeud(antor, 'Cap Test').first();
    await cap.getByRole('button', { name: 'Déplier' }).click();
    await noeud(antor, 'Calanque Test').waitFor();
    assert.equal(await noeud(antor, 'Calanque Test').getAttribute('aria-level'), '2');
    await antor.screenshot({ path: `${SHOTS}/antor-rejeu-arbre.png` });
  });
});
