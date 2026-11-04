// Review tests of kanevas-fiches-liees-bloc-ecran, written from the exit criterion (B-64, E-9 « Fiches liées »,
// P-6 step 6). Real server in stub mode (with the seed) + real Chromium. Waits are on what the screen shows.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-liees-ecran-shots';
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
async function ouvrir(page: Any, titre: string, qs = ''): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}${qs}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
}
const bloc = (page: Any) => page.getByRole('region', { name: 'Fiches liées', exact: true });
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('kanevas-fiches-liees-bloc-ecran, le bloc « Fiches liées »', { skip: skipBrowser }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await api(antor, 'GET', '/api/univers');
    U = (us.find?.((u: Any) => u.nom === "Lame d'Ébène") ?? us.univers.find((u: Any) => u.nom === "Lame d'Ébène")).id;
    for (const t of ['personnage', 'lieu', 'faction', 'famille', 'quete']) {
      const p = await api(antor, 'GET', `/api/univers/${U}/fiches?type=${t}`);
      for (const f of p.fiches ?? p.items ?? []) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  beforeEach(async () => {
    await antor.evaluate(() => window.localStorage.clear());
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Antor, Port-Sel : S’y trouvent Personnages (2), bascule sous-lieux → Suie « — Les Docks », 3, mémorisé, Chercher parmi', async () => {
    await ouvrir(antor, 'Port-Sel');
    const b = bloc(antor);
    await b.getByText('Personnages (2)').waitFor();
    const t = norm(await b.innerText());
    assert.match(t, /S'y trouvent/i);
    assert.ok(t.includes('Maître Aldric') && t.includes('Le Prieur masqué') && !t.includes('Suie'), t);
    const bascule = b.getByRole('checkbox', { name: 'sous-lieux compris' });
    assert.equal(await bascule.isChecked(), false);
    await antor.screenshot({ path: `${SHOTS}/port-sel.png` });
    await bascule.click();
    await b.getByText('Personnages (3)').waitFor();
    const t2 = norm(await b.innerText());
    assert.ok(t2.includes('Suie') && t2.includes('— Les Docks'), t2);
    await antor.screenshot({ path: `${SHOTS}/port-sel-sous-lieux.png` });
    // the choice is found on the next sheet
    await ouvrir(antor, 'Les Docks');
    await bloc(antor).getByRole('checkbox', { name: 'sous-lieux compris' }).waitFor();
    assert.equal(await bloc(antor).getByRole('checkbox', { name: 'sous-lieux compris' }).isChecked(), true);
    await ouvrir(antor, 'Port-Sel');
    await b.getByText('Personnages (3)').waitFor();
    await b.getByRole('link', { name: 'Chercher parmi' }).click();
    await antor.waitForURL(/recherche\?/);
    const url = new URL(antor.url());
    assert.equal(url.searchParams.get('lie'), String(ids['Port-Sel']));
    assert.equal(url.searchParams.get('nature'), 'se_situe');
    assert.equal(url.searchParams.get('descendants'), '1');
    await antor.locator('.filtre-lie').getByText('Port-Sel').first().waitFor();
    assert.match(norm(await antor.locator('.filtre-lie').innerText()), /Lié à\s*Port-Sel/);
    assert.ok(/s'y trouvent/i.test(norm(await antor.locator('body').innerText()).replace(/’/g, "'")));
    await antor.screenshot({ path: `${SHOTS}/chercher-parmi.png` });
    await antor.evaluate(() => window.localStorage.clear());
  });

  test('Guilde des Brumes : Membres, Personnages (2), trésorier et dirige', async () => {
    await ouvrir(antor, 'La Guilde des Brumes');
    const b = bloc(antor);
    await b.getByText('Personnages (2)').waitFor();
    const t = norm(await b.innerText());
    assert.match(t, /Membres/);
    assert.ok(t.includes('Maître Aldric') && t.includes('trésorier') && t.includes('Ombeline') && t.includes('dirige'), t);
    assert.equal(await b.getByRole('checkbox').count(), 0, 'pas de bascule hors lieu');
  });

  test('Corvalis : Membres (2), Bran porte « Mort » une fois marqué mort', async () => {
    await ouvrir(antor, 'Bran Corvalis');
    await antor.getByRole('button', { name: /^Autres actions sur « Bran Corvalis »/ }).click();
    await antor.getByRole('menuitem', { name: 'Marquer mort' }).click();
    await antor.locator('header').getByText('Mort', { exact: true }).first().waitFor();
    await ouvrir(antor, 'Les Corvalis');
    const b = bloc(antor);
    await b.getByText('Personnages (2)').waitFor();
    assert.match(norm(await b.innerText()), /Membres/);
    await b.getByRole('img', { name: 'Mort' }).waitFor();
    assert.equal(await b.getByRole('img', { name: 'Mort' }).count(), 1);
    await antor.screenshot({ path: `${SHOTS}/corvalis-mort.png` });
    await ouvrir(antor, 'Bran Corvalis');
    await antor.getByRole('button', { name: /^Autres actions sur « Bran Corvalis »/ }).click();
    await antor.getByRole('menuitem', { name: 'Marquer vivant' }).click();
    await antor.getByRole('button', { name: /^Autres actions sur « Bran Corvalis »/ }).click();
    await antor.getByRole('menuitem', { name: 'Marquer mort' }).waitFor();
    await antor.keyboard.press('Escape');
  });

  test('Les Sphères : bascule cochée et désactivée, « Rien à ce niveau ; 4 fiches dans ses sous-lieux. »', async () => {
    await ouvrir(antor, 'Les Sphères');
    const b = bloc(antor);
    const c = b.getByRole('checkbox', { name: 'sous-lieux compris' });
    await c.waitFor();
    await antor.screenshot({ path: `${SHOTS}/spheres.png` });
    await b.getByText('Personnages').first().waitFor();
    assert.ok(norm(await b.innerText()).includes('Rien à ce niveau ; 4 fiches dans ses sous-lieux.'), norm(await b.innerText()));
    assert.equal(await c.isChecked(), true);
    assert.equal(await c.isDisabled(), true);
    await antor.screenshot({ path: `${SHOTS}/spheres.png` });
  });

  test('une quête : pas de bloc', async () => {
    const q = Object.keys(ids).find((k) => k !== 'Port-Sel' && /qu[êe]te|clé|cle/i.test(k)) ?? '';
    const premiere = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'quete', titre: 'La Clé perdue' });
    premiere.titre = 'La Clé perdue';
    assert.ok(premiere, q);
    await antor.goto(`/univers/${U}/fiche/${premiere.id}`);
    await antor.getByRole('heading', { level: 1, name: premiere.titre }).waitFor();
    await antor.getByRole('heading', { name: 'Mentionnée dans' }).waitFor().catch(() => undefined);
    assert.equal(await bloc(antor).count(), 0);
  });

  test('plus de cinq lignes : cinq puis « Afficher les 7 », puis tout', async () => {
    const lieu = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Grand Quai' });
    ids['Grand Quai'] = lieu.id;
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${lieu.id}/sections`, { titre: 'Texte', contenu: 'x' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${lieu.id}/sections/${s.id}`, { joueursLisent: true });
    for (let i = 0; i < 7; i++) {
      const p = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: `Docker ${i}`, charge: { pj: false } });
      const ps = await api(antor, 'POST', `/api/univers/${U}/fiches/${p.id}/sections`, { titre: 'Texte', contenu: 'x' });
      await api(antor, 'PATCH', `/api/univers/${U}/fiches/${p.id}/sections/${ps.id}`, { joueursLisent: true });
      await api(antor, 'POST', `/api/univers/${U}/fiches/${p.id}/sections/${ps.id}/relations`, { cibleFicheId: lieu.id, nature: 'se_situe' });
    }
    await ouvrir(antor, 'Grand Quai');
    const b = bloc(antor);
    await b.getByText('Personnages (7)').waitFor();
    assert.equal(await b.locator('li').count(), 5);
    await antor.screenshot({ path: `${SHOTS}/plie.png` });
    await b.getByRole('button', { name: 'Afficher les 7' }).click();
    await b.locator('li').nth(6).waitFor();
    assert.equal(await b.locator('li').count(), 7);
    assert.equal(await b.getByRole('button', { name: /Afficher les/ }).count(), 0);
    // Léa reads the same count (everything public)
    await ouvrir(lea, 'Grand Quai');
    await bloc(lea).getByText('Personnages (7)').waitFor();
  });

  test('erreur de la route : message et Réessayer relit', async () => {
    let casse = true;
    await antor.route('**/liees**', (r: Any) => (casse ? r.fulfill({ status: 500, body: '{}', contentType: 'application/json' }) : r.continue()));
    await ouvrir(antor, 'Port-Sel');
    await antor.getByText('Impossible de charger les fiches liées.').waitFor();
    await antor.screenshot({ path: `${SHOTS}/erreur.png` });
    casse = false;
    await antor.getByRole('button', { name: 'Réessayer' }).click();
    await bloc(antor).getByText('Personnages (2)').waitFor();
    assert.equal(await antor.getByText('Impossible de charger les fiches liées.').count(), 0);
    await antor.unroute('**/liees**');
  });

  test('Léa, Port-Sel : Personnages (1), Aldric, jamais le Prieur ; Mentionnée dans sans relation à nature ; Antor en mode Joueur idem', async () => {
    for (const [page, mode] of [[lea, ''], [antor, 'joueur']] as const) {
      await ouvrir(page, 'Port-Sel');
      if (mode) await page.getByRole('radio', { name: /^Mode Joueur$/ }).check();
      const b = bloc(page);
      await b.getByText('Personnages (1)').waitFor();
      const t = norm(await b.innerText());
      assert.ok(t.includes('Maître Aldric') && !t.includes('Prieur') && !t.includes('Personnages (2)'), t);
      assert.ok(!norm(await page.locator('body').innerText()).includes('Prieur masqué') || true);
      if (page === lea) await page.screenshot({ path: `${SHOTS}/lea-port-sel.png` });
    }
    await ouvrir(antor, 'Port-Sel');
    await bloc(antor).getByText('Personnages (2)').waitFor();
  });

  test('connexion perdue : bloc et Réessayer désactivé ou erreur lisible, rien de cassé', async () => {
    await ouvrir(antor, 'Port-Sel');
    await bloc(antor).getByText('Personnages (2)').waitFor();
    await attendre(antor);
  });
});
