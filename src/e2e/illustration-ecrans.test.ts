// Black-box tests of kanevas-il-illustration-ecrans, written from docs/ecrans.md « Détail des écrans de
// `kanevas-illustrations` » (E-8 grille, E-9 en-tête, § Critères), not from the code. Real server in stub
// mode WITH its starting world (illustrations, « La Fresque effacée », failure rule) + real Chromium.
// Expected values are literals from the doc. Screenshots go to /tmp. The tests share one server, in order.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rxExact, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-illustration-shots';
const DEMO = new URL('../bouchon/demo/', import.meta.url).pathname;
const opts = { skip: skipBrowser, timeout: 90000 };
let srv: Server;
let browser: Any;
let antor: Any, lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function api(page: Any, method: string, url: string): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method });
  return { statut: r.status(), corps: await r.text(), entetes: r.headers() };
}
async function grille(page: Any, nav: string): Promise<void> {
  await page.goto(`/univers/${U}/fiches/${nav}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  await page.waitForTimeout(300);
}
async function fiche(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
  await attendre(page);
}
const carte = (page: Any, titre: string) => page.locator('a.carte', { has: page.locator('.titre', { hasText: rxExact(titre) }) });
async function photo(page: Any, nom: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}
async function modeMJ(page: Any): Promise<void> {
  const r = page.getByRole('radio', { name: /Mode MJ|^MJ$/ });
  if ((await r.count()) > 0 && !(await r.first().isChecked())) await r.first().check();
}
const toast = (page: Any, t: string) => page.getByText(t).first().waitFor();

describe('kanevas-il-illustration-ecrans, E-8 grille et E-9 en-tête', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    const us = await (await antor.request.fetch(srv.base + '/api/univers')).json();
    U = (us.univers ?? us).find((u: Any) => u.nom === "Lame d'Ébène").id;
    for (const t of ['personnage', 'lieu', 'faction']) {
      const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=${t}`)).json();
      for (const f of r.fiches) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Léa : fiche invisible → illustration 404 au corps d’un inconnu, absente de sa grille', opts, async () => {
    const lue = await api(lea, 'GET', `/api/univers/${U}/fiches/${ids['Le Prieur masqué']}/illustration`);
    const inconnue = await api(lea, 'GET', `/api/univers/${U}/fiches/999999/illustration`);
    assert.equal(lue.statut, 404);
    assert.equal(lue.corps, inconnue.corps);
    await grille(lea, 'personnages');
    assert.equal(await carte(lea, 'Le Prieur masqué').count(), 0);
    assert.equal(await carte(lea, 'Maître Aldric').count(), 1);
  });

  test('grille : portrait en carte, repli « B » pour Bran, images lazy au jeton, ordre alphabétique', opts, async () => {
    await grille(lea, 'personnages');
    const img = carte(lea, 'Léa Brisefer').locator('img');
    assert.equal(await img.count(), 1);
    assert.equal(await img.getAttribute('alt'), '');
    assert.equal(await img.getAttribute('loading'), 'lazy');
    assert.match((await img.getAttribute('src')) ?? '', /\/illustration\?v=.+/);
    const bran = carte(lea, 'Bran Corvalis');
    assert.equal(await bran.locator('img').count(), 0);
    assert.equal((await bran.locator('.initiale').innerText()).trim(), 'B');
    assert.equal(await carte(lea, 'Dame Ombeline de Val-Fortin').locator('.initiale').count(), 0);
    const titres = (await lea.locator('a.carte .titre').allInnerTexts()) as string[];
    const tries = [...titres].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    assert.deepEqual(titres, tries);
    assert.match(await carte(lea, 'Léa Brisefer').innerText(), /PJ/);
    assert.match(await carte(lea, 'Bran Corvalis').innerText(), /PNJ/);
    await photo(lea, 'grille-bureau');
  });

  test('repli : l’initiale écarte l’article (« Rue des Cordiers » → R ; « Le Pendu Joyeux » illustré)', opts, async () => {
    await grille(lea, 'lieux');
    assert.equal((await carte(lea, 'Rue des Cordiers').locator('.initiale').innerText()).trim(), 'R');
  });

  test('image absente du disque : la carte montre le repli, la fiche « Image indisponible. »', opts, async () => {
    await grille(lea, 'lieux');
    const c = carte(lea, 'La Fresque effacée');
    await c.locator('.initiale').waitFor();
    assert.equal((await c.locator('.initiale').innerText()).trim(), 'F');
    await fiche(lea, 'La Fresque effacée');
    await lea.getByText('Image indisponible.').waitFor();
    assert.equal(await lea.getByRole('button', { name: /Remplacer|Retirer/ }).count(), 0);
    await photo(lea, 'fiche-indisponible-lea');
    await fiche(antor, 'La Fresque effacée');
    await modeMJ(antor);
    await antor.getByText('Image indisponible.').waitFor();
    await antor.getByRole('button', { name: 'Remplacer l’illustration' }).waitFor();
    await antor.getByRole('button', { name: 'Retirer l’illustration' }).waitFor();
  });

  test('Antor ajoute un portrait à Aldric : Envoi… puis image à gauche et toast ; Léa le voit en grille', opts, async () => {
    await fiche(antor, 'Maître Aldric');
    await modeMJ(antor);
    assert.equal(await antor.getByRole('img', { name: /Illustration de/ }).count(), 0);
    await antor.getByText('Visible de tous ceux qui voient la fiche.').waitFor({ state: 'attached' });
    await photo(antor, 'entete-sans-illustration-mj');
    await antor.locator('header input[type=file]').setInputFiles(`${DEMO}portrait-ambre.png`);
    await toast(antor, 'Illustration de « Maître Aldric » ajoutée');
    await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();
    await photo(antor, 'entete-illustree-mj');
    await grille(lea, 'personnages');
    assert.equal(await carte(lea, 'Maître Aldric').locator('img').count(), 1);
    await fiche(lea, 'Maître Aldric');
    await lea.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();
    assert.equal(await lea.getByRole('button', { name: /Remplacer|Retirer|Ajouter une illustration/ }).count(), 0);
    await photo(lea, 'entete-illustree-joueur');
  });

  test('remplacement : le jeton change, Léa voit la nouvelle adresse', opts, async () => {
    await grille(lea, 'personnages');
    const avant = await carte(lea, 'Maître Aldric').locator('img').getAttribute('src');
    await fiche(antor, 'Maître Aldric');
    await modeMJ(antor);
    await antor.locator('header input[type=file]').setInputFiles(`${DEMO}blason-cendre.png`);
    await toast(antor, 'Illustration de « Maître Aldric » remplacée');
    await grille(lea, 'personnages');
    const apres = await carte(lea, 'Maître Aldric').locator('img').getAttribute('src');
    assert.notEqual(apres, avant);
  });

  test('plan.pdf et fichier vide : messages en ligne, illustration d’avant gardée', opts, async () => {
    await fiche(antor, 'Maître Aldric');
    await modeMJ(antor);
    await antor.locator('header input[type=file]').setInputFiles(`${DEMO}plan.pdf`);
    await antor.getByText('« plan.pdf » n’est pas une image. Choisissez un PNG, un JPEG, un GIF ou un WebP.'.replace(/’/g, '’')).waitFor();
    await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();
    await photo(antor, 'echec-pas-une-image');
    await antor.getByRole('button', { name: 'Ignorer' }).click();
    await antor.locator('header input[type=file]').setInputFiles(`${DEMO}vide.png`);
    await antor.getByText('« vide.png » est vide.').waitFor();
    assert.equal(await antor.getByRole('button', { name: 'Réessayer' }).count(), 0);
    await antor.getByRole('button', { name: 'Ignorer' }).click();
    assert.equal(await antor.getByText('« vide.png » est vide.').count(), 0);
    await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();
  });

  test('mode Joueur : l’illustration sans aucun geste ; Léa : PUT refusé 403', opts, async () => {
    await fiche(antor, 'Maître Aldric');
    await antor.getByRole('radio', { name: /Mode Joueur|^Joueur$/ }).check();
    await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).waitFor();
    assert.equal(await antor.getByRole('button', { name: /Remplacer|Retirer/ }).count(), 0);
    const put = await lea.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Maître Aldric']}/illustration`, {
      method: 'PUT',
      multipart: { fichier: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('x') } },
    });
    assert.equal(put.status(), 403);
  });

  test('retrait en échec (fiche « échec ») : confirmation fermée, message, image gardée ; Réessayer relance', opts, async () => {
    await fiche(antor, "Le Portrait de l'échec");
    await modeMJ(antor);
    await antor.getByRole('button', { name: 'Retirer l’illustration' }).click();
    await antor.getByText("Retirer l’illustration de « Le Portrait de l'échec » ? L’image sera perdue.".replace("'", /'/.source)).waitFor().catch(async () => {
      await antor.getByText(/Retirer l.illustration de « Le Portrait de l.échec » \? L.image sera perdue\./).waitFor();
    });
    await antor.getByRole('group', { name: 'Retirer l’illustration' }).getByRole('button', { name: 'Retirer l’illustration' }).click();
    await antor.getByText('L’action n’a pas abouti. Réessayez.').waitFor();
    assert.equal(await antor.getByRole('group', { name: 'Retirer l’illustration' }).count(), 0);
    await antor.getByRole('img', { name: /Illustration de/ }).waitFor();
    await photo(antor, 'echec-retrait');
    await antor.getByRole('button', { name: 'Réessayer' }).click();
    await antor.getByText('L’action n’a pas abouti. Réessayez.').waitFor();
    await antor.getByRole('button', { name: 'Ignorer' }).click();
    assert.equal(await antor.getByText('L’action n’a pas abouti. Réessayez.').count(), 0);
    await grille(lea, 'personnages');
    assert.equal(await carte(lea, "Le Portrait de l'échec").locator('img').count(), 1);
  });

  test('retrait confirmé : en-tête d’avant, carte au repli, ancienne adresse 404', opts, async () => {
    await fiche(antor, 'Maître Aldric');
    await modeMJ(antor);
    const src = await antor.getByRole('img', { name: 'Illustration de « Maître Aldric »' }).getAttribute('src');
    await antor.getByRole('button', { name: 'Retirer l’illustration' }).click();
    await antor.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await antor.getByRole('img', { name: /Illustration de/ }).count(), 1);
    await antor.getByRole('button', { name: 'Retirer l’illustration' }).click();
    await antor.getByRole('group', { name: 'Retirer l’illustration' }).getByRole('button', { name: 'Retirer l’illustration' }).click();
    await toast(antor, 'Illustration de « Maître Aldric » retirée');
    assert.equal(await antor.getByRole('img', { name: /Illustration de/ }).count(), 0);
    await antor.getByRole('button', { name: 'Ajouter une illustration' }).waitFor();
    assert.equal((await api(antor, 'GET', src)).statut, 404);
    await grille(lea, 'personnages');
    assert.equal((await carte(lea, 'Maître Aldric').locator('.initiale').innerText()).trim(), 'M');
  });

  test('téléphone 390 px : deux colonnes, rien ne déborde, en-tête illustré à gauche du titre', opts, async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    await p.goto('/connexion-bouchon');
    await p.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
    await p.waitForLoadState('networkidle');
    await grille(p, 'personnages');
    const boites = (await p.locator('a.carte').evaluateAll((els: Element[]) => els.map((e) => e.getBoundingClientRect().left))) as number[];
    assert.equal(new Set(boites.map((x) => Math.round(x))).size, 2);
    assert.ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await photo(p, 'grille-telephone');
    await fiche(p, 'Léa Brisefer');
    const ill = await p.getByRole('img', { name: 'Illustration de « Léa Brisefer »' }).boundingBox();
    const h1 = await p.getByRole('heading', { level: 1 }).boundingBox();
    assert.ok(ill && h1 && ill.x + ill.width <= h1.x + 1, 'illustration at the left of the title');
    await photo(p, 'fiche-telephone');
    await ctx.close();
  });

  test('grille : titre de 120 caractères sur deux lignes au plus, infobulle', opts, async () => {
    const long = 'Z'.repeat(5) + ' mot'.repeat(28);
    const r = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches`, { method: 'POST', data: { type: 'objet', titre: long.slice(0, 120) } });
    assert.ok(r.status() < 300);
    await grille(lea, 'objets').catch(() => undefined);
    await grille(antor, 'objets');
    const t = antor.locator('a.carte .titre').first();
    assert.equal(await t.getAttribute('title'), long.slice(0, 120));
    const h = await t.evaluate((e: HTMLElement) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) }));
    assert.ok(h.h <= h.lh * 2 + 1, `title height ${h.h} for line-height ${h.lh}`);
    await photo(antor, 'titre-long');
  });

  test('texte de la page sans erreur de chargement', opts, async () => {
    await grille(lea, 'personnages');
    assert.ok(!(await texte(lea)).includes('Impossible de charger'));
  });
});
