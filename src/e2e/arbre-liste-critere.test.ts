// Black-box tests of kanevas-arbre-liste (E-8 tree view), written from the task's exit criterion and
// docs/ecrans.md. World: the stub seed ("Lame d'Ébène"). Real server in stub mode + real Chromium;
// expected values are literals from the criterion.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-arbre-liste-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let urlLieux = '';
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}
async function liste(page: Any, nav: string): Promise<void> {
  await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: nav, exact: true }).click();
  await attendre(page);
}
const arbre = (page: Any) => page.getByRole('tree');
const noeud = (page: Any, titre: string) => arbre(page).getByRole('treeitem').filter({ hasText: titre });
async function titres(page: Any): Promise<string[]> {
  return (await arbre(page).getByRole('treeitem').locator('.titre-fiche').allInnerTexts()).map((s: string) => s.trim());
}
async function passerEnArbre(page: Any): Promise<void> {
  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await arbre(page).waitFor();
}
async function deplier(page: Any, titre: string): Promise<void> {
  const n = noeud(page, titre).first();
  await n.getByRole('button', { name: 'Déplier' }).click();
  await n.and(page.locator('[aria-expanded=true]')).waitFor();
  await page.getByText('Chargement…', { exact: true }).waitFor({ state: 'detached' });
  await attendre(page);
}

describe('kanevas-arbre-liste, E-8 arbre', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = us.find((u: Any) => u.nom === "Lame d'Ébène").id;
    const l = await api(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`);
    for (const f of l.fiches) ids[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor : grille par défaut, Arbre mémorisé après rechargement, Sphères › Port-Sel › Taverne', async () => {
    await antor.goto(`/univers/${U}`);
    await attendre(antor);
    await liste(antor, 'Lieux');
    urlLieux = new URL(antor.url()).pathname;
    assert.equal(await arbre(antor).count(), 0, 'grille par défaut');
    await passerEnArbre(antor);
    assert.equal(
      await antor.evaluate((u: number) => localStorage.getItem(`kanevas:vue-liste:${u}:lieu`), U),
      'arbre',
    );
    await antor.reload();
    await attendre(antor);
    await arbre(antor).waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Arbre', exact: true }).getAttribute('aria-pressed'), 'true');
    const racines = await titres(antor);
    assert.ok(racines.includes('Les Sphères'), racines.join('|'));
    assert.ok(!racines.includes('Port-Sel'), 'Port-Sel est sous Les Sphères pour Antor');
    await deplier(antor, 'Les Sphères');
    await deplier(antor, 'Port-Sel');
    const t = await titres(antor);
    assert.ok(t.includes('La Taverne du Kraken'), t.join('|'));
    assert.ok(t.includes('Le Repaire des contrebandiers'), t.join('|'));
    await antor.screenshot({ path: `${SHOTS}/antor-arbre.png` });
    // a level 3 row reads aria-level 3
    assert.equal(await noeud(antor, 'La Taverne du Kraken').getAttribute('aria-level'), '3');
  });

  test('Léa : Port-Sel racine sans « dans », quatre lieux dépliés, sans chevron superflu ni nombre', async () => {
    await lea.goto(`/univers/${U}`);
    await attendre(lea);
    await liste(lea, 'Lieux');
    await passerEnArbre(lea);
    const racinesLea = await titres(lea);
    assert.ok(racinesLea.includes('Port-Sel'), racinesLea.join('|'));
    assert.ok(!racinesLea.includes('Les Sphères'), 'Sphères fuit');
    const p = noeud(lea, 'Port-Sel');
    assert.ok(!(await p.innerText()).includes('dans'), 'pas de dans');
    assert.equal(await p.getAttribute('aria-expanded'), 'false');
    await deplier(lea, 'Port-Sel');
    const apres = await titres(lea);
    const i = apres.indexOf('Port-Sel');
    assert.deepEqual(apres.slice(i + 1, i + 5).sort(), [
      'La Taverne du Kraken',
      'Le Phare aux Sels',
      'Les Docks',
      'Quartier des Cordiers',
    ]);
    for (const n of ['La Taverne du Kraken', 'Le Phare aux Sels', 'Les Docks', 'Quartier des Cordiers']) {
      assert.equal(await noeud(lea, n).getByRole('button', { name: /Déplier|Replier/ }).count(), 0, `chevron superflu: ${n}`);
    }
    const texte = await arbre(lea).innerText();
    assert.ok(!texte.includes('Repaire'), 'Repaire fuit');
    assert.ok(!/\(\s*[0-9]+\s*\)/.test(texte), `nombre affiché: ${texte}`);
    await lea.screenshot({ path: `${SHOTS}/lea-arbre.png` });
  });

  test('flèche droite déplie, gauche replie, Entrée ouvre la fiche', async () => {
    await lea.reload();
    await attendre(lea);
    await arbre(lea).waitFor();
    const p = noeud(lea, 'Port-Sel');
    await p.focus();
    await lea.keyboard.press('ArrowRight');
    await noeud(lea, 'Les Docks').waitFor();
    assert.equal(await p.getAttribute('aria-expanded'), 'true');
    await p.focus();
    await lea.keyboard.press('ArrowLeft');
    assert.equal(await noeud(lea, 'Les Docks').count(), 0);
    assert.equal(await p.getAttribute('aria-expanded'), 'false');
    await p.focus();
    await lea.keyboard.press('Enter');
    await lea.waitForURL(new RegExp(`/fiche/${ids['Port-Sel']}$`));
  });

  test('événement rangé sous Port-Sel : racine de Événements « dans Port-Sel », absent des enfants de Port-Sel dans Lieux', async () => {
    const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'evenement', titre: 'Le Pillage des Docks' });
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${f.id}/sections`, { titre: 'Récit', contenu: 'Les docks brûlent.' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}`, { parent: ids['Port-Sel'] });
    await liste(lea, 'Événements');
    await passerEnArbre(lea);
    const n = noeud(lea, 'Le Pillage des Docks');
    assert.equal(await n.count(), 1);
    assert.ok((await n.innerText()).includes('dans Port-Sel'), await n.innerText());
    assert.equal(await n.getByRole('button', { name: /Déplier/ }).count(), 0);
    await lea.screenshot({ path: `${SHOTS}/lea-evenements.png` });
    // not among Port-Sel's children in Lieux
    await lea.goto(urlLieux);
    await attendre(lea);
    await arbre(lea).waitFor();
    await deplier(lea, 'Port-Sel');
    assert.ok(!(await titres(lea)).includes('Le Pillage des Docks'));
  });

  test('recherche dans le type : la grille, jamais l’arbre ; effacée, l’arbre revient', async () => {
    await lea.goto(urlLieux);
    await attendre(lea);
    await arbre(lea).waitFor();
    await lea.getByLabel(/^Chercher dans/).fill('Docks');
    await lea.keyboard.press('Enter');
    await lea.waitForURL(/q=Docks/);
    await arbre(lea).waitFor({ state: 'detached' });
    await attendre(lea);
    assert.equal(await arbre(lea).count(), 0);
    assert.ok((await lea.locator('main').innerText()).includes('Les Docks'));
    await lea.screenshot({ path: `${SHOTS}/lea-recherche.png` });
    await lea.getByRole('button', { name: 'Effacer la recherche' }).click();
    await arbre(lea).waitFor();
  });

  test('type désactivé : liste ouverte par son adresse, message, sans bouton de création', async () => {
    await api(antor, 'PUT', `/api/univers/${U}/types/lieu`, { etat: 'desactive' });
    const page = (await connecte(browser, srv.base, 'Antor')).page;
    await page.goto(urlLieux);
    await attendre(page);
    await page.getByText('Ce type est désactivé dans cet univers.').waitFor();
    assert.equal(await page.getByRole('button', { name: /^Nouveau lieu$/ }).count(), 0);
    await page.screenshot({ path: `${SHOTS}/desactive.png` });
  });
});
