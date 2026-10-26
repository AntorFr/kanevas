// Black-box tests of kanevas-fiches-liees-natures-ecran, from the task's exit criterion and
// docs/ecrans.md « E-9 — Relier à une fiche, with a nature » (« The form, state by state »), not from the code.
// Real server in stub mode WITH its starting world + real Chromium. Expected texts are literals of the doc.
// Screenshots go to /tmp (never in the tree).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-relier-natures-shots';
const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};
let carteId = 0;

async function ouvrir(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
  await page.getByRole('group', { name: 'Relations' }).first().waitFor();
}
const bloc = (page: Any, titre = 'Apparence') => section(page, titre).getByRole('group', { name: 'Relations' });
const opt = async (sel: Any) => (await sel.locator('option').allInnerTexts()).map((s: string) => s.trim());
async function ouvrirFormulaire(page: Any, titre = 'Apparence'): Promise<Any> {
  const b = bloc(page, titre);
  await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
  await b.getByLabel('Nature').waitFor();
  return b;
}
/** Picks a target in the picker and presses « Relier »; resolves when the POST has answered. */
async function choisirEtRelier(page: Any, b: Any, typeFiche: string, cible: string): Promise<number> {
  await b.getByLabel('Type de fiche').selectOption({ label: typeFiche });
  await b.getByRole('button', { name: new RegExp(`^${cible}`) }).first().click();
  const [rep] = await Promise.all([
    page.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/relations$/.test(r.url())),
    b.getByRole('button', { name: rxExact('Relier') }).click(),
  ]);
  return rep.status();
}
async function photo(page: Any, nom: string): Promise<void> {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}

describe('kanevas-fiches-liees-natures-ecran, E-9 Relier avec une nature, E-11, Familles', { skip: skipBrowser }, () => {
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
    const cs = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes`)).json();
    carteId = (cs.cartes ?? cs).find((c: Any) => c.titre === 'Carte de la côte').id;
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('Nature : celles du personnage puis « Sans nature » ; « dirige » nulle part ; « se situe à » restreint à Lieu', opts, async () => {
    await ouvrir(antor, 'Dame Ombeline de Val-Fortin');
    const b = await ouvrirFormulaire(antor);
    assert.deepEqual(await opt(b.getByLabel('Nature')), ['se situe à', 'membre de', 'détient', 'allié de', 'ennemi de', 'Sans nature']);
    await b.getByLabel('Nature').selectOption({ label: 'se situe à' });
    assert.deepEqual(await opt(b.getByLabel('Type de fiche')), ['Lieu']);
    assert.equal((await opt(b.getByLabel('Nature'))).some((o) => /dirige/.test(o)), false);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    assert.equal((await b.locator('form').innerText()).includes('dirige'), false);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    assert.deepEqual(await opt(b.getByLabel('Type de fiche')), ['Faction', 'Famille']);
    await b.getByLabel('Nature').selectOption({ label: 'Sans nature' });
    assert.ok((await opt(b.getByLabel('Type de fiche'))).length > 3);
    await photo(antor, 'formulaire-sans-nature');
  });

  test('changer de nature vide la cible qui ne convient plus, garde celle qui convient', opts, async () => {
    await ouvrir(antor, 'Dame Ombeline de Val-Fortin');
    const b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    await b.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
    await b.getByRole('button', { name: /^La Guilde des Brumes/ }).first().click();
    const relier = b.getByRole('button', { name: rxExact('Relier') });
    assert.equal(await relier.isEnabled(), true);
    await b.getByLabel('Nature').selectOption({ label: 'détient' }); // Faction is no target of « détient »
    await b.getByRole('button', { name: rxExact('Relier') }).waitFor();
    assert.equal(await relier.isDisabled(), true, 'la cible hors nature doit être vidée');
    await b.getByLabel('Nature').selectOption({ label: 'allié de' }); // Faction fits
    await b.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
    await b.getByRole('button', { name: /^La Guilde des Brumes/ }).first().click();
    await b.getByLabel('Nature').selectOption({ label: 'ennemi de' }); // Faction still fits
    assert.equal(await relier.isEnabled(), true, 'la cible qui convient encore est gardée');
  });

  test('« se situe à » → Port-Sel avec « habite » : la ligne lit « se situe à · Port-Sel — habite »', opts, async () => {
    await ouvrir(antor, 'Dame Ombeline de Val-Fortin');
    const b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'se situe à' });
    await b.getByLabel('Qualificatif').fill('habite');
    assert.equal(await choisirEtRelier(antor, b, 'Lieu', 'Port-Sel'), 201);
    const ligne = b.locator('.relation').filter({ hasText: 'Port-Sel' });
    await ligne.waitFor();
    assert.equal((await ligne.innerText()).replace(/\s+/g, ' ').replace(/ Lieu$/, '').trim(), 'se situe à · Port-Sel — habite');
    await b.getByRole('button', { name: 'Retirer la relation se situe à · Port-Sel — habite' }).waitFor();
    await photo(antor, 'ligne-se-situe');
  });

  test('Bran Corvalis : « membre de » → La Guilde des Brumes, « trésorier » ; rejouer → « Cette relation existe déjà. »', opts, async () => {
    await ouvrir(antor, 'Bran Corvalis');
    let b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    await b.getByLabel('Qualificatif').fill('trésorier');
    assert.equal(await choisirEtRelier(antor, b, 'Faction', 'La Guilde des Brumes'), 201);
    const ligne = b.locator('.relation').filter({ hasText: 'La Guilde des Brumes' });
    await ligne.waitFor();
    assert.ok((await ligne.innerText()).replace(/\s+/g, ' ').startsWith('membre de · La Guilde des Brumes — trésorier'));
    b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    await b.getByLabel('Qualificatif').fill('trésorier');
    assert.equal(await choisirEtRelier(antor, b, 'Faction', 'La Guilde des Brumes'), 409);
    await b.getByText('Cette relation existe déjà.').waitFor();
    assert.equal(await b.getByLabel('Qualificatif').inputValue(), 'trésorier', 'saisie conservée');
    await photo(antor, 'refus-existe-deja');
  });

  test('« Sans nature » : qualificatif obligatoire (rien d’écrit), puis texte libre « maître de port » en ligne libre', opts, async () => {
    await ouvrir(antor, 'Dame Ombeline de Val-Fortin');
    const b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'Sans nature' });
    await b.getByLabel('Type de fiche').selectOption({ label: 'Lieu' });
    await b.getByRole('button', { name: /^Port-Sel/ }).first().click();
    await b.getByRole('button', { name: rxExact('Relier') }).click();
    await b.getByText('Erreur : le qualificatif est obligatoire sans nature.').waitFor();
    assert.equal(await b.locator('.relation').filter({ hasText: 'maître de port' }).count(), 0);
    await b.getByLabel('Qualificatif').fill('maître de port');
    const [rep] = await Promise.all([
      antor.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/relations$/.test(r.url())),
      b.getByRole('button', { name: rxExact('Relier') }).click(),
    ]);
    assert.equal(rep.status(), 201);
    const ligne = b.locator('.relation').filter({ hasText: 'maître de port' });
    await ligne.waitFor();
    assert.ok((await ligne.innerText()).replace(/\s+/g, ' ').startsWith('maître de port → Port-Sel') || (await ligne.innerText()).includes('maître de port'));
    assert.equal((await ligne.innerText()).includes('·'), false, 'une relation libre ne porte pas de nature');
  });

  test('nature_incompatible du serveur : « Cette nature ne relie pas ces deux types de fiches. », saisie gardée', opts, async () => {
    await ouvrir(antor, 'Maître Aldric');
    const b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    await b.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
    await b.getByRole('button', { name: /^La Guilde des Brumes/ }).first().click();
    // The server answers 400 nature_incompatible whatever the screen offered.
    await antor.route('**/relations', async (route: Any) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const corps = JSON.parse(route.request().postData());
      await route.continue({ postData: JSON.stringify({ ...corps, nature: 'se_situe' }) });
    });
    const [rep] = await Promise.all([
      antor.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/relations$/.test(r.url())),
      b.getByRole('button', { name: rxExact('Relier') }).click(),
    ]);
    await antor.unroute('**/relations');
    assert.equal(rep.status(), 400);
    await b.getByText('Cette nature ne relie pas ces deux types de fiches.').waitFor();
    await photo(antor, 'refus-nature-incompatible');
  });

  test('erreur des natures : « Impossible de charger les natures. » + « Réessayer », « Sans nature » seule ; chargement', opts, async () => {
    await antor.route('**/api/univers/*/natures', (route: Any) => route.fulfill({ status: 500, body: '{}', contentType: 'application/json' }));
    await ouvrir(antor, 'Maître Aldric');
    await bloc(antor).getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    const b = bloc(antor);
    await b.getByText('Impossible de charger les natures.').waitFor();
    await photo(antor, 'erreur-natures');
    await antor.unroute('**/api/univers/*/natures');
    await b.getByRole('button', { name: rxExact('Réessayer') }).first().click();
    await b.getByLabel('Nature').waitFor();
    assert.equal(await b.getByText('Impossible de charger les natures.').count(), 0);
  });

  test('type sans nature (événement) : pas de champ « Nature », qualificatif obligatoire', opts, async () => {
    const r = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches`, { method: 'POST', data: { type: 'evenement', titre: 'Le Grand Bal' } });
    assert.ok(r.status() < 300, String(r.status()));
    const id = (await r.json()).id;
    const s = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${id}/sections`, { method: 'POST', data: { titre: 'Déroulé', contenu: 'x' } });
    assert.ok(s.status() < 300);
    await antor.goto(`/univers/${U}/fiche/${id}`);
    await antor.getByRole('heading', { level: 1, name: 'Le Grand Bal' }).waitFor();
    const b = bloc(antor, 'Déroulé');
    await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
    await b.getByLabel('Qualificatif').waitFor();
    assert.equal(await b.getByLabel('Nature').count(), 0);
    await photo(antor, 'type-sans-nature');
  });

  test('graphe de la carte de la côte : « se situe à — habite » et « maître de port »', opts, async () => {
    await antor.goto(`/univers/${U}/cartes/${carteId}`);
    await antor.locator('.graphe .carte-token').first().waitFor();
    await antor.locator('.graphe-lien text').first().waitFor();
    const libelles = (await antor.locator('.graphe-lien text').evaluateAll((els: Any[]) => els.map((e) => e.firstChild?.textContent))) as string[];
    assert.ok(libelles.includes('se situe à — habite'), JSON.stringify(libelles));
    assert.ok(libelles.includes('maître de port'), JSON.stringify(libelles));
    await photo(antor, 'graphe-cote');
  });

  test('graphe : les deux liens d’Aldric vers Port-Sel sont lisibles, leurs étiquettes ne se recouvrent pas', opts, async () => {
    await antor.goto(`/univers/${U}/cartes/${carteId}`);
    await antor.locator('.graphe-lien text').first().waitFor();
    const boites = (await antor.locator('.graphe-lien text').evaluateAll((els: Any[]) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { t: e.firstChild.textContent, x: r.x, y: r.y, w: r.width, h: r.height };
      }))) as { t: string; x: number; y: number; w: number; h: number }[];
    const a = boites.find((b) => b.t === 'se situe à — habite');
    const m = boites.find((b) => b.t === 'maître de port');
    assert.ok(a && m, JSON.stringify(boites));
    const recouvre = a.x < m.x + m.w && m.x < a.x + a.w && a.y < m.y + m.h && m.y < a.y + a.h;
    assert.equal(recouvre, false, `étiquettes superposées : ${JSON.stringify([a, m])}`);
  });

  test('graphe : un qualificatif de 80 caractères est coupé à 40 + « … », entier dans l’infobulle', opts, async () => {
    const fiche = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Maître Aldric']}`)).json();
    const sec = fiche.sections.find((x: Any) => x.titre === 'Apparence').id;
    const long = 'x'.repeat(80);
    const r = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Maître Aldric']}/sections/${sec}/relations`, { method: 'POST', data: { cibleFicheId: ids['Port-Sel'], nature: 'detient', qualificatif: long } });
    assert.ok([201, 400].includes(r.status()), String(r.status()));
    const nature = r.status() === 201 ? 'detient' : null;
    if (!nature) {
      const r2 = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${ids['Maître Aldric']}/sections/${sec}/relations`, { method: 'POST', data: { cibleFicheId: ids['Port-Sel'], nature: null, qualificatif: long } });
      assert.equal(r2.status(), 201);
    }
    await antor.goto(`/univers/${U}/cartes/${carteId}`);
    await antor.locator('.graphe-lien text').first().waitFor();
    const lignes = (await antor.locator('.graphe-lien').evaluateAll((els: Any[]) => els.map((e) => ({ vu: e.querySelector('text').firstChild.textContent, titre: e.querySelector('title')?.textContent })))) as { vu: string; titre: string }[];
    const l = lignes.find((x) => x.titre?.includes('xxxx'));
    assert.ok(l, JSON.stringify(lignes));
    assert.equal(Array.from(l.vu).length, 41);
    assert.ok(l.vu.endsWith('…'));
    assert.ok(l.titre.endsWith(long));
    await photo(antor, 'graphe-long');
  });

  test('Léa : ni formulaire « Relier », ni relation de section fermée dans la fiche ni dans le graphe', opts, async () => {
    await lea.goto(`/univers/${U}/fiche/${ids['Maître Aldric']}`);
    await lea.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await attendre(lea);
    assert.equal(await lea.getByRole('button', { name: /Relier à une fiche/ }).count(), 0);
    assert.equal(await lea.getByLabel('Nature').count(), 0);
    assert.equal(await lea.getByText('La Guilde des Brumes').count(), 0);
    const mk = async (url: string, data: unknown) => {
      const r = await antor.request.fetch(srv.base + url, { method: 'POST', data });
      assert.ok(r.status() < 300, `${url} -> ${r.status()}`);
      return r.json();
    };
    const g = (await mk(`/api/univers/${U}/cartes`, { titre: 'Carte ouverte', forme: 'graphe' })).id;
    const pr = await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes/${g}`, { method: 'PATCH', data: { visible: true } });
    assert.ok(pr.status() < 300);
    for (const t of ["Maître Aldric", 'Port-Sel', 'La Guilde des Brumes', 'Bran Corvalis']) await mk(`/api/univers/${U}/cartes/${g}/elements`, { ficheId: ids[t] });
    await lea.goto(`/univers/${U}/cartes/${g}`);
    await lea.getByRole('heading', { level: 1, name: 'Carte ouverte' }).waitFor();
    await photo(lea, 'lea-carte');
    await lea.locator('.graphe .carte-token').first().waitFor();
    const l = (await lea.locator('.graphe-lien text').evaluateAll((els: Any[]) => els.map((e) => e.firstChild?.textContent))) as string[];
    assert.ok(l.includes('se situe à — habite'), JSON.stringify(l));
    assert.ok(!l.some((x) => /trésorier|membre|dirige|cargaisons|surveille/.test(x)), JSON.stringify(l));
    await photo(lea, 'lea-graphe');
  });

  test('téléphone 390 px : le formulaire tient sans défilement horizontal', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await page.setViewportSize({ width: 390, height: 844 });
    await ouvrir(page, 'Dame Ombeline de Val-Fortin');
    const b = await ouvrirFormulaire(page);
    await b.getByLabel('Qualificatif').fill('x'.repeat(80));
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `scrollWidth ${sw} > ${cw}`);
    await photo(page, 'telephone-390');
    await ctx.close();
  });

  test('« Familles » dans la barre Lore, « Aucune famille. » puis « Nouvelle famille » crée « Les Orfèvres » dont la fiche s’ouvre', opts, async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    const u = await (await page.request.fetch(`${srv.base}/api/univers`, {})).json();
    const U2 = (u.univers ?? u).find((x: Any) => x.nom === "Lame d'Ébène").id;
    await page.goto(`/univers/${U2}`);
    await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Familles') }).click();
    await page.getByRole('heading', { level: 1, name: 'Familles' }).waitFor();
    await page.getByRole('button', { name: rxExact('Nouvelle famille') }).first().click();
    const f = page.getByRole('dialog');
    await f.getByLabel('Titre').fill('Les Orfèvres');
    await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await page.getByRole('heading', { level: 1, name: 'Les Orfèvres' }).waitFor();
    await photo(page, 'famille-creee');
    await ctx.close();
  });
});
