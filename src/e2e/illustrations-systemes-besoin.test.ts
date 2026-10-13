// Feature-level tests of kanevas-illustrations, written from the need (docs/parcours.md B-30, B-31, B-29,
// docs/ecrans.md « Détail des écrans de `kanevas-illustrations` »), not from the code. Real server in stub
// mode WITH its starting world, real Chromium. Expected values are literals taken from the doc.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, startServer, texte, type Server } from './harnais.test.js';

const opts = { skip: undefined as string | false | undefined, timeout: 90000 };
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let srv: Server;
let browser: Any;
let antor: Any, lea: Any, teo: Any, mira: Any;
let U = 0; // Lame d'Ébène
let fiches: Record<string, number> = {};

async function api(page: Any, method: string, url: string, multipart?: { nom: string; buf: Buffer; mime: string }): Promise<{ statut: number; corps: string; entetes: Record<string, string> }> {
  const r = await page.request.fetch(srv.base + url, multipart ? { method, multipart: { fichier: { name: multipart.nom, mimeType: multipart.mime, buffer: multipart.buf } } } : { method });
  return { statut: r.status(), corps: await r.text(), entetes: r.headers() };
}
async function json(page: Any, url: string): Promise<Any> {
  const r = await api(page, 'GET', url);
  return JSON.parse(r.corps);
}
const carte = (page: Any, titre: string) => page.getByRole('link', { name: new RegExp(titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
async function grille(page: Any, type: string) {
  await page.goto(`/univers/${U}/fiches/${type}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
}

describe('kanevas-illustrations, besoin B-30 / B-31 / B-29', { timeout: 300000 }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    teo = (await connecte(browser, srv.base, 'Teo')).page;
    mira = (await connecte(browser, srv.base, 'Mira')).page;
    const univers = await json(antor, "/api/univers");
    U = (univers.univers ?? univers).find((u: Any) => u.nom === "Lame d'Ébène").id;
    const liste = await json(antor, `/api/univers/${U}/fiches?type=personnage`);
    for (const f of liste.fiches ?? liste) fiches[f.titre] = f.id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // --- B-30 ---
  test('B-30 nominal : Antor pose un portrait sur Maître Aldric, Léa le voit en grille et en tête de fiche', opts, async () => {
    assert.ok(fiches['Maître Aldric'], 'Maître Aldric du monde de départ');
    await antor.goto(`/univers/${U}/fiche/${fiches['Maître Aldric']}`);
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await attendre(antor);
    await antor.locator('input[type=file]').first().setInputFiles({ name: 'portrait-aldric.png', mimeType: 'image/png', buffer: PNG });
    await antor.getByText('Illustration de « Maître Aldric » ajoutée').first().waitFor();
    await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();

    await grille(lea, 'personnages');
    const imgs = carte(lea, 'Maître Aldric').locator('img');
    assert.equal(await imgs.count(), 1);
    await lea.goto(`/univers/${U}/fiche/${fiches['Maître Aldric']}`);
    await lea.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();
    const t = await texte(lea);
    assert.ok(!/Remplacer l'illustration|Retirer l'illustration|Ajouter une illustration/.test(t));
  });

  test('B-30 bords : une fiche sans illustration montre un repli « B » avec l’icône, jamais d’image cassée', opts, async () => {
    await grille(lea, 'personnages');
    const bran = carte(lea, 'Bran Corvalis');
    assert.equal(await bran.locator('img').count(), 0);
    assert.match(await bran.innerText(), /^B\b|\bB\b/);
  });

  test('B-30 bords : la fiche sans illustration garde l’en-tête d’avant pour Léa (pas de repli sur la fiche)', opts, async () => {
    await lea.goto(`/univers/${U}/fiche/${fiches['Bran Corvalis']}`);
    await lea.getByRole('heading', { level: 1, name: 'Bran Corvalis' }).waitFor();
    await attendre(lea);
    assert.equal(await lea.getByRole('img', { name: /Illustration de/ }).count(), 0);
  });

  test('B-30 échec : un PDF et un HTML nommé .png sont refusés, rien n’est écrit', opts, async () => {
    const aldric = fiches['Maître Aldric'];
    const avant = (await json(antor, `/api/univers/${U}/fiches/${aldric}`)).illustration;
    assert.ok(avant?.jeton);
    const pdf = await api(antor, 'PUT', `/api/univers/${U}/fiches/${aldric}/illustration`, { nom: 'plan.pdf', buf: Buffer.from('%PDF-1.4 hello'), mime: 'application/pdf' });
    assert.equal(pdf.statut, 400);
    assert.match(pdf.corps, /pas_une_image/);
    const html = await api(antor, 'PUT', `/api/univers/${U}/fiches/${aldric}/illustration`, { nom: 'image.png', buf: Buffer.from('<html><script>1</script></html>'), mime: 'image/png' });
    assert.equal(html.statut, 400);
    const vide = await api(antor, 'PUT', `/api/univers/${U}/fiches/${aldric}/illustration`, { nom: 'portrait.png', buf: Buffer.alloc(0), mime: 'image/png' });
    assert.equal(vide.statut, 400);
    assert.match(vide.corps, /fichier_vide/);
    const apres = (await json(antor, `/api/univers/${U}/fiches/${aldric}`)).illustration;
    assert.equal(apres.jeton, avant.jeton);
  });

  test('B-30 échec UI : « plan.pdf » dit « n’est pas une image » et l’illustration d’avant reste', opts, async () => {
    await antor.goto(`/univers/${U}/fiche/${fiches['Maître Aldric']}`);
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await attendre(antor);
    await antor.locator('input[type=file]').first().setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hello') });
    await antor.getByText(/« plan\.pdf » n['’]est pas une image\. Choisissez un PNG, un JPEG, un GIF ou un WebP\./).first().waitFor();
    assert.equal(await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).count(), 1);
  });

  test('B-30 exclusion : fiche invisible de Léa → 404 de corps identique à un identifiant inconnu', opts, async () => {
    const prieur = (await json(antor, `/api/univers/${U}/fiches?type=personnage`));
    const id = (prieur.fiches ?? prieur).find((f: Any) => f.titre === 'Le Prieur masqué').id;
    const lue = await api(lea, 'GET', `/api/univers/${U}/fiches/${id}/illustration`);
    const inconnue = await api(lea, 'GET', `/api/univers/${U}/fiches/999999/illustration`);
    assert.equal(lue.statut, 404);
    assert.equal(lue.corps, inconnue.corps);
    // and the MJ does see it
    assert.equal((await api(antor, 'GET', `/api/univers/${U}/fiches/${id}/illustration`)).statut, 200);
    // not in her grid
    await grille(lea, 'personnages');
    assert.equal(await lea.getByRole('link', { name: /Le Prieur masqué/ }).count(), 0);
    // PUT on an invisible fiche: 404, not 403
    const put = await api(lea, 'PUT', `/api/univers/${U}/fiches/${id}/illustration`, { nom: 'a.png', buf: PNG, mime: 'image/png' });
    assert.equal(put.statut, 404);
  });

  test('B-30 exclusion : Joueur voyant la fiche reçoit 403 à PUT et DELETE, rien ne change ; un compte hors univers 404', opts, async () => {
    const aldric = fiches['Maître Aldric'];
    const avant = (await json(antor, `/api/univers/${U}/fiches/${aldric}`)).illustration.jeton;
    assert.equal((await api(lea, 'PUT', `/api/univers/${U}/fiches/${aldric}/illustration`, { nom: 'a.png', buf: PNG, mime: 'image/png' })).statut, 403);
    assert.equal((await api(lea, 'DELETE', `/api/univers/${U}/fiches/${aldric}/illustration`)).statut, 403);
    assert.equal((await json(antor, `/api/univers/${U}/fiches/${aldric}`)).illustration.jeton, avant);
    assert.equal((await api(teo, 'GET', `/api/univers/${U}/fiches/${aldric}/illustration`)).statut, 404);
    assert.equal((await api(mira, 'GET', `/api/univers/${U}/fiches/${aldric}/illustration`)).statut, 404);
  });

  test('B-30 remplacer : le jeton change, la grille de Léa pointe vers la nouvelle adresse', opts, async () => {
    const aldric = fiches['Maître Aldric'];
    const avant = (await json(antor, `/api/univers/${U}/fiches/${aldric}`)).illustration.jeton;
    const r = await api(antor, 'PUT', `/api/univers/${U}/fiches/${aldric}/illustration`, { nom: 'b.png', buf: PNG, mime: 'image/png' });
    assert.equal(r.statut, 200);
    const apres = (await json(antor, `/api/univers/${U}/fiches/${aldric}`)).illustration.jeton;
    assert.notEqual(apres, avant);
    await grille(lea, 'personnages');
    const src = await carte(lea, 'Maître Aldric').locator('img').getAttribute('src');
    assert.ok(src?.endsWith(`?v=${apres}`), `src ${src}`);
    // old token = no longer cacheable as current
    const vieux = await api(lea, 'GET', `/api/univers/${U}/fiches/${aldric}/illustration?v=${avant}`);
    assert.match(vieux.entetes['cache-control'] ?? '', /no-store/);
    const frais = await api(lea, 'GET', `/api/univers/${U}/fiches/${aldric}/illustration?v=${apres}`);
    assert.match(frais.entetes['cache-control'] ?? '', /immutable/);
    assert.equal(frais.entetes['content-type'], 'image/png');
  });

  test('B-30 retirer : en-tête d’avant, repli en grille, ancienne adresse 404', opts, async () => {
    const aldric = fiches['Maître Aldric'];
    await antor.goto(`/univers/${U}/fiche/${aldric}`);
    await antor.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await attendre(antor);
    await antor.getByRole('button', { name: 'Retirer l’illustration' }).or(antor.getByRole('button', { name: "Retirer l'illustration" })).first().click();
    await antor.getByText(/Retirer l.illustration de « Maître Aldric » \? L.image sera perdue\./).waitFor();
    await antor.getByRole('button', { name: /^Retirer l.illustration$/ }).last().click();
    await antor.getByText('Illustration de « Maître Aldric » retirée').first().waitFor();
    assert.equal(await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).count(), 0);
    assert.equal((await api(lea, 'GET', `/api/univers/${U}/fiches/${aldric}/illustration`)).statut, 404);
    await grille(lea, 'personnages');
    assert.equal(await carte(lea, 'Maître Aldric').locator('img').count(), 0);
    // DELETE again is idempotent
    assert.equal((await api(antor, 'DELETE', `/api/univers/${U}/fiches/${aldric}/illustration`)).statut, 204);
  });

  test('B-30 bords : GIF et WebP acceptés, type fixé par le contenu et non par le nom', opts, async () => {
    const bran = fiches['Bran Corvalis'];
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const r = await api(antor, 'PUT', `/api/univers/${U}/fiches/${bran}/illustration`, { nom: 'x.png', buf: gif, mime: 'image/png' });
    assert.equal(r.statut, 200);
    const g = await api(lea, 'GET', `/api/univers/${U}/fiches/${bran}/illustration`);
    assert.equal(g.entetes['content-type'], 'image/gif');
    await api(antor, 'DELETE', `/api/univers/${U}/fiches/${bran}/illustration`);
  });

  // --- B-31 ---
  test('B-31 nominal : Antor ouvre « Systèmes de jeu » puis « CoF Mini » : fil d’Ariane et barre réduite', opts, async () => {
    await antor.goto('/');
    await attendre(antor);
    await antor.getByRole('link', { name: 'Systèmes de jeu' }).first().click();
    await antor.getByRole('heading', { level: 1, name: 'Systèmes de jeu' }).waitFor();
    await attendre(antor);
    await antor.getByRole('link', { name: /CoF Mini/ }).first().click();
    await antor.getByRole('heading', { level: 1, name: /CoF Mini/ }).waitFor();
    await attendre(antor);
    const t = await texte(antor);
    // the separator is an icon: the trail reads « Systèmes de jeu », then « CoF Mini »
    const fil = antor.getByRole('navigation', { name: /Fil d.Ariane/ });
    assert.deepEqual(((await fil.innerText()) as string).split('\n').map((x) => x.trim()).filter(Boolean), ['Systèmes de jeu', 'CoF Mini']);
    assert.equal(await antor.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Personnages' }).count(), 0);
    assert.match(antor.url(), /\/systemes\/\d+/);
    assert.match(t, /utilisé par 2 univers/i);
  });

  test('B-31 exclusion : Mira ne voit que Les Landes grises, jamais Lame d’Ébène, ni par l’API', opts, async () => {
    await mira.goto('/systemes');
    await mira.getByRole('heading', { level: 1, name: 'Systèmes de jeu' }).waitFor();
    await attendre(mira);
    const t = await texte(mira);
    assert.match(t, /CoF Mini/);
    assert.match(t, /Utilisé par 2 univers/);
    assert.match(t, /Les Landes grises/);
    assert.ok(!/Lame d'Ébène/.test(t));
    assert.ok(!/Cendres de Vaëlis/.test(t));
    const liste = await api(mira, 'GET', '/api/systemes');
    assert.ok(!/Lame d.Ébène/.test(liste.corps));
    const sid = JSON.parse(liste.corps).find((s: Any) => s.nom === 'CoF Mini').id;
    const un = await api(mira, 'GET', `/api/systemes/${sid}`);
    assert.equal(un.statut, 200);
    assert.ok(!/Lame d.Ébène/.test(un.corps));
    await mira.goto(`/systemes/${sid}`);
    await mira.getByRole('heading', { level: 1, name: /CoF Mini/ }).waitFor();
    await attendre(mira);
    assert.ok(!/Lame d'Ébène/.test(await texte(mira)));
  });

  test('B-31 exclusion : Teo (aucun univers rattaché) reçoit 404 identique à un inconnu, « Page introuvable. », liste vide', opts, async () => {
    const sid = JSON.parse((await api(antor, 'GET', '/api/systemes')).corps).find((s: Any) => s.nom === 'CoF Mini').id;
    const lu = await api(teo, 'GET', `/api/systemes/${sid}`);
    const inconnu = await api(teo, 'GET', '/api/systemes/999999');
    assert.equal(lu.statut, 404);
    assert.equal(lu.corps, inconnu.corps);
    await teo.goto(`/systemes/${sid}`);
    await teo.getByText('Page introuvable.').first().waitFor();
    await teo.getByRole('link', { name: 'Systèmes de jeu' }).first().waitFor();
    await teo.goto('/systemes');
    await teo.getByText('Aucun système de jeu pour l\'instant.').or(teo.getByText('Aucun système de jeu pour l’instant.')).first().waitFor();
    // write attempt: 404 not 403
    const post = await teo.request.fetch(`${srv.base}/api/systemes/${sid}/gabarits`, { method: 'POST', data: { type: 'creature', nom: 'Intrus', contenu: 'x' } });
    assert.equal(post.status(), 404);
  });

  test('B-31 droits : Léa lit CoF Mini en « Lecture seule » (Lame d’Ébène · Joueur), POST refusé 403, pas de gestes', opts, async () => {
    await lea.goto('/systemes');
    await lea.getByRole('heading', { level: 1, name: 'Systèmes de jeu' }).waitFor();
    await attendre(lea);
    const t = await texte(lea);
    assert.match(t, /CoF Mini/);
    assert.match(t, /Lecture seule/);
    assert.match(t, /Lame d'Ébène\s*·?\s*Joueur/);
    const sid = JSON.parse((await api(lea, 'GET', '/api/systemes')).corps)[0].id;
    await lea.goto(`/systemes/${sid}`);
    await lea.getByRole('heading', { level: 1, name: /CoF Mini/ }).waitFor();
    await attendre(lea);
    assert.equal(await lea.getByRole('button', { name: /^Ajouter une créature/ }).count(), 0);
    const post = await lea.request.fetch(`${srv.base}/api/systemes/${sid}/gabarits`, { method: 'POST', data: { type: 'creature', nom: 'Intrus', contenu: 'x' } });
    assert.equal(post.status(), 403);
  });

  test('B-31 bords : Antor MJ d’un système et Joueur de l’autre, « Lecture seule » sur le second seulement', opts, async () => {
    const liste = JSON.parse((await api(antor, 'GET', '/api/systemes')).corps);
    assert.equal(liste.length, 2);
    const cof = liste.find((s: Any) => s.nom === 'CoF Mini');
    const co = liste.find((s: Any) => s.nom === 'Chroniques Oubliées Fantasy');
    assert.equal(cof.peutEcrire, true);
    assert.equal(co.peutEcrire, false);
    await antor.goto('/systemes');
    await antor.getByRole('heading', { level: 1, name: 'Systèmes de jeu' }).waitFor();
    await attendre(antor);
    assert.equal(await antor.getByText('Lecture seule').count(), 1);
  });

  test('B-31 : l’ancienne adresse /univers/:id/systeme mène à /systemes/:sid', opts, async () => {
    await antor.goto(`/univers/${U}/systeme`);
    await antor.waitForURL(/\/systemes\/\d+/);
    await antor.getByRole('heading', { level: 1, name: /CoF Mini/ }).waitFor();
  });

  test('B-31 : le menu du sélecteur d’univers propose « Systèmes de jeu » et « Ouvrir le système » mène hors de l’univers', opts, async () => {
    await antor.goto(`/univers/${U}`);
    await attendre(antor);
    await antor.getByRole('link', { name: /Ouvrir le système/ }).or(antor.getByRole('button', { name: /Ouvrir le système/ })).first().click();
    await antor.waitForURL(/\/systemes\/\d+/);
    await antor.getByRole('heading', { level: 1, name: /CoF Mini/ }).waitFor();
    const fil = antor.getByRole('navigation', { name: /Fil d.Ariane/ });
    assert.deepEqual(((await fil.innerText()) as string).split('\n').map((x) => x.trim()).filter(Boolean), ['Systèmes de jeu', 'CoF Mini']);
  });

  test('B-31 : détacher l’univers fait disparaître CoF Mini de la liste de Léa et son adresse devient introuvable', opts, async () => {
    // Runs last among the systems tests: it changes the world.
    const sid = JSON.parse((await api(lea, 'GET', '/api/systemes')).corps)[0].id;
    const r = await antor.request.fetch(`${srv.base}/api/univers/${U}/systeme`, { method: 'PUT', data: { systemeId: null } });
    assert.ok(r.status() < 300, `detach status ${r.status()}`);
    assert.equal((await api(lea, 'GET', `/api/systemes/${sid}`)).statut, 404);
    await lea.goto(`/systemes/${sid}`);
    await lea.getByText('Page introuvable.').first().waitFor();
    assert.equal(JSON.parse((await api(lea, 'GET', '/api/systemes')).corps).length, 0);
  });

  // --- E-1 ---
  test('E-1 : Antor voit deux cartes (Lame d’Ébène, Les Cendres de Vaëlis) avec système et membres ; Teo l’état vide', opts, async () => {
    await antor.goto('/');
    await antor.getByRole('heading', { level: 1, name: 'Mes univers' }).waitFor();
    await attendre(antor);
    const t = await texte(antor);
    assert.match(t, /2 univers/);
    assert.match(t, /Chroniques Oubliées Fantasy/);
    assert.match(t, /2 membres/);
    const lame = antor.getByRole('link', { name: /Lame d.Ébène/ }).first();
    await lame.click();
    await attendre(antor);
    assert.match(antor.url(), new RegExp(`/univers/${U}`));
    await teo.goto('/');
    await teo.getByText(/Aucun univers pour l.instant\./).first().waitFor();
  });

  // --- B-29 ---
  test('B-29 erreur : la grille et E-16 disent leur échec et proposent « Réessayer »', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que mira$/i }).click();
    await attendre(page);
    await page.route('**/api/systemes', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await page.goto('/systemes');
    await page.getByText('Impossible de charger les systèmes de jeu.').waitFor();
    await page.getByRole('button', { name: 'Réessayer' }).waitFor();
    await page.unroute('**/api/systemes');
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await page.getByRole('link', { name: /CoF Mini/ }).first().waitFor();
    await ctx.close();
  });

  test('B-29 erreur : la liste d’un type dit « Impossible de charger les fiches. »', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
    await attendre(page);
    await page.route('**/api/univers/*/fiches?*', (r: Any) => r.fulfill({ status: 500, body: '{}' }));
    await page.goto(`/univers/${U}/fiches/personnages`);
    await page.getByText('Impossible de charger les fiches.').waitFor();
    await ctx.close();
  });

  test('B-29 refus : un type inconnu et un système inconnu disent « Page introuvable. »', opts, async () => {
    await lea.goto(`/univers/${U}/fiches/dragons`);
    await lea.getByText('Page introuvable.').first().waitFor();
    await lea.goto('/systemes/999999');
    await lea.getByText('Page introuvable.').first().waitFor();
  });

  test('B-29 contenu extrême : 390 px, la grille n’a pas de débordement horizontal', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
    await attendre(page);
    await grille(page, 'personnages');
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(deborde, false);
    await ctx.close();
  });
});
