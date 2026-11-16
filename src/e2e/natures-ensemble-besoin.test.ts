// Tests d'ensemble de kanevas-fiches-liees-natures, écrits depuis le besoin (la fiche de la feature, B-63, B-66,
// B-69, docs/parcours.md P-17, docs/ecrans.md E-9 « Relier avec une nature », E-11, maquette e09-fiche) et non depuis le code.
// Vrai serveur en mode bouchon AVEC son monde de départ, vrai Chromium. Les attendus sont des littéraux du besoin.
// Les captures vont dans /tmp, jamais dans l'arbre.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, connecte, launch, rxExact, section, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-natures-ensemble-shots';
const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
const U = 1; // « Lame d'Ébène » sur la base semée
const ids: Record<string, number> = {};

const norm = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const opt = async (sel: Any) => (await sel.locator('option').allInnerTexts()).map((s: string) => s.trim());

async function photo(page: Any, nom: string): Promise<void> {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${nom}.png` });
}
async function ouvrir(page: Any, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${ids[titre]}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
  await page.getByRole('group', { name: 'Relations' }).first().waitFor();
}
const bloc = (page: Any, titre = 'Apparence') => section(page, titre).getByRole('group', { name: 'Relations' });
async function ouvrirFormulaire(page: Any, titre = 'Apparence'): Promise<Any> {
  const b = bloc(page, titre);
  await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
  await b.getByLabel('Nature').waitFor();
  return b;
}
async function choisirCible(b: Any, cible: string): Promise<void> {
  await b.getByRole('button', { name: new RegExp(`^${cible}`) }).or(b.getByRole('radio', { name: new RegExp(`^${cible}`) })).first().click();
}
/** Presses « Relier » and resolves with the status of THIS POST. */
async function relier(page: Any, b: Any): Promise<number> {
  const [rep] = await Promise.all([
    page.waitForResponse((r: Any) => r.request().method() === 'POST' && /\/relations$/.test(r.url())),
    b.getByRole('button', { name: rxExact('Relier') }).click(),
  ]);
  return rep.status();
}
async function relations(page: Any, fiche: number, sectionId: number): Promise<Any[]> {
  const r = await page.request.fetch(`${srv.base}/api/univers/${U}/fiches/${fiche}/sections/${sectionId}/relations`);
  return r.status() === 200 ? (await r.json()).relations : [];
}
async function poster(page: Any, fiche: number, sectionId: number, corps: Any): Promise<{ status: number; body: Any }> {
  const r = await page.request.fetch(`${srv.base}/api/univers/${U}/fiches/${fiche}/sections/${sectionId}/relations`, {
    method: 'POST',
    data: corps,
  });
  return { status: r.status(), body: await r.json().catch(() => ({})) };
}

describe('kanevas-fiches-liees-natures, besoin assemblé (B-63, B-66, B-69)', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    for (const t of ['personnage', 'lieu', 'faction', 'famille', 'objet']) {
      const r = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches?type=${t}`)).json();
      for (const f of r.fiches) ids[f.titre] = f.id;
    }
  }, { timeout: 120000 });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // Panne visée : « Relier » ne commence plus par la nature, « dirige » devient une nature, la restriction du type est perdue,
  // la ligne ne lit plus « nature · cible — qualificatif ».
  test('Ombeline : Nature (les cinq puis « Sans nature »), « se situe à » restreint à Lieu, Port-Sel + « habite » → « se situe à · Port-Sel — habite »', opts, async () => {
    await ouvrir(antor, 'Dame Ombeline de Val-Fortin');
    const b = await ouvrirFormulaire(antor);
    assert.deepEqual(await opt(b.getByLabel('Nature')), ['se situe à', 'membre de', 'détient', 'allié de', 'ennemi de', 'Sans nature']);
    assert.ok(!(await opt(b.getByLabel('Nature'))).some((o) => /dirige/i.test(o)), '« dirige » n’est proposé nulle part');
    await b.getByLabel('Nature').selectOption({ label: 'se situe à' });
    assert.deepEqual(await opt(b.getByLabel('Type de fiche')), ['Lieu']);
    await choisirCible(b, 'Port-Sel');
    await b.getByLabel('Qualificatif').fill('habite');
    await photo(antor, 'ombeline-formulaire');
    assert.equal(await relier(antor, b), 201);
    await b.getByText(/Port-Sel/).first().waitFor();
    assert.ok(norm(await bloc(antor).innerText()).includes('se situe à · Port-Sel — habite'), norm(await bloc(antor).innerText()));
    await photo(antor, 'ombeline-ligne');
  });

  // Panne visée : l'ordre du formulaire (le besoin dit qu'il commence par « Nature » et finit par « Qualificatif »).
  test('E-9 : le formulaire commence par « Nature » et finit par « Qualificatif » (après le choix de la fiche)', opts, async () => {
    await ouvrir(antor, 'Léa Brisefer');
    const b = await ouvrirFormulaire(antor);
    const y = async (el: Any) => (await el.boundingBox()).y;
    const yNature = await y(b.getByLabel('Nature'));
    const yType = await y(b.getByLabel('Type de fiche'));
    const yQualif = await y(b.getByLabel('Qualificatif'));
    const yRelier = await y(b.getByRole('button', { name: rxExact('Relier') }));
    assert.ok(yNature < yType, 'Nature avant Type de fiche');
    assert.ok(yType < yQualif, 'Type de fiche avant Qualificatif');
    assert.ok(yQualif < yRelier, 'Qualificatif avant le bouton Relier');
    await photo(antor, 'ordre-formulaire');
    await b.getByRole('button', { name: rxExact('Annuler') }).click();
  });

  test('Suie : « membre de » → La Guilde des Brumes, « passeur » : « membre de · La Guilde des Brumes — passeur »', opts, async () => {
    await ouvrir(antor, 'Suie');
    const b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'membre de' });
    assert.deepEqual(await opt(b.getByLabel('Type de fiche')), ['Faction', 'Famille']);
    await b.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
    await choisirCible(b, 'La Guilde des Brumes');
    await b.getByLabel('Qualificatif').fill('passeur');
    assert.equal(await relier(antor, b), 201);
    await b.getByText(/passeur/).first().waitFor();
    assert.ok(norm(await bloc(antor).innerText()).includes('membre de · La Guilde des Brumes — passeur'));
  });

  // Panne visée : « Sans nature » n'exige plus de texte (relation vide), ou perd le texte libre d'aujourd'hui.
  test('Sans nature : sans qualificatif « Le qualificatif est obligatoire sans nature. » et rien n’est écrit ; avec un texte, la relation libre est écrite', opts, async () => {
    await ouvrir(antor, 'Bran Corvalis');
    const b = await ouvrirFormulaire(antor);
    await b.getByLabel('Nature').selectOption({ label: 'Sans nature' });
    await b.getByLabel('Type de fiche').selectOption({ label: 'Lieu' });
    await choisirCible(b, 'Val-Fortin');
    await b.getByRole('button', { name: rxExact('Relier') }).click();
    await b.getByText('Le qualificatif est obligatoire sans nature.').first().waitFor();
    await photo(antor, 'sans-nature-refus');
    await b.getByLabel('Qualificatif').fill('prisonnier de');
    assert.equal(await relier(antor, b), 201);
    await bloc(antor).getByText('prisonnier de').first().waitFor();
    assert.ok(norm(await bloc(antor).innerText()).includes('prisonnier de'));
  });

  // Panne visée : « Mentionnée dans » reprend les relations à nature (le bloc « Fiches liées » les lira, pas lui).
  test('Port-Sel, « Mentionnée dans » : la Guilde et le rapport (relations libres) y restent ; les relations à nature (habite, se cache) n’y sont plus', opts, async () => {
    await ouvrir(antor, 'Port-Sel');
    const t = norm(await antor.locator('main').innerText());
    assert.ok(t.includes('La Guilde des Brumes') && /Rapport secret de l'amirauté/.test(t));
    await photo(antor, 'port-sel-mentions');
  });

  // Panne visée : le graphe garde l'ancien libellé (« habite » seul) ou n'a plus le lien libre.
  test('Carte de la côte (E-11) : Aldric a deux liens vers Port-Sel, « se situe à — habite » et « maître de port »', opts, async () => {
    const cs = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes`)).json();
    const carte = cs.cartes.find((c: Any) => c.titre === 'Carte de la côte').id;
    await antor.goto(`/univers/${U}/cartes/${carte}`);
    await antor.getByRole('heading', { level: 1, name: 'Carte de la côte' }).waitFor();
    const liens = antor.getByRole('region', { name: 'Liens' }).or(antor.locator('section', { has: antor.getByRole('heading', { name: 'Liens' }) }));
    await liens.getByText('Maître Aldric — se situe à — habite → Port-Sel').waitFor();
    await liens.getByText('Maître Aldric — maître de port → Port-Sel').waitFor();
    assert.equal(await antor.locator('svg.graphe-liens text').filter({ hasText: /^se situe à — habite$/ }).count(), 1);
    assert.equal(await antor.locator('svg.graphe-liens text').filter({ hasText: /^maître de port$/ }).count(), 1);
    await photo(antor, 'carte-cote');
  });

  // Panne visée : le libellé d'un lien long n'est pas coupé à 40 caractères avec « … », ou le texte entier se perd.
  test('E-11 : un libellé de plus de 40 caractères est coupé par « … » sur le graphe, entier dans l’infobulle', opts, async () => {
    const long = 'a'.repeat(70);
    const r = await poster(antor, ids['Maître Aldric'], 1, { cibleFicheId: ids['Port-Sel'], nature: 'se_situe', qualificatif: long });
    assert.equal(r.status, 201);
    const cs = await (await antor.request.fetch(`${srv.base}/api/univers/${U}/cartes`)).json();
    const carte = cs.cartes.find((c: Any) => c.titre === 'Carte de la côte').id;
    await antor.goto(`/univers/${U}/cartes/${carte}`);
    await antor.getByRole('heading', { level: 1, name: 'Carte de la côte' }).waitFor();
    const texte = antor.locator('svg.graphe-liens text').filter({ hasText: /^se situe à — a+…$/ });
    await texte.first().waitFor();
    const affiche = (await texte.first().textContent()) as string;
    assert.ok(affiche.length >= 40 && affiche.length <= 41, `coupé à 40 caractères : ${affiche.length}`);
    const entier = `se situe à — ${long}`;
    const infobulle = (await antor.locator('svg.graphe-liens g.graphe-lien title').allTextContents()).concat(
      await antor.locator('svg.graphe-liens g.graphe-lien text').evaluateAll((l: Any[]) => l.map((e) => e.getAttribute('title') ?? '')),
    );
    assert.ok(infobulle.some((t: string) => t.includes(entier)), 'le libellé entier est dans l’infobulle');
    await photo(antor, 'carte-libelle-long');
  });

  // Panne visée : le MJ en mode Joueur ou un joueur voit « Relier », le champ « Nature » ou une relation de section fermée.
  test('Léa : ni « Relier » ni « Nature » ; Aldric y a ses relations lisibles seulement ; une relation de section « MJ seul » reste invisible', opts, async () => {
    const secret = await poster(antor, ids['Maître Aldric'], 2, { cibleFicheId: ids['Port-Sel'], nature: 'se_situe', qualificatif: 'planque-secrète' });
    assert.equal(secret.status, 201);
    await lea.goto(`/univers/${U}/fiche/${ids['Maître Aldric']}`);
    await lea.getByRole('heading', { level: 1, name: 'Maître Aldric' }).waitFor();
    await lea.getByRole('group', { name: 'Relations' }).first().waitFor();
    const t = norm(await lea.locator('main').innerText());
    assert.ok(!t.includes('Relier'), 'pas de « Relier » pour Léa');
    assert.ok(!t.includes('planque-secrète'), 'la relation de la section MJ seul est invisible');
    assert.equal(await lea.getByLabel('Nature').count(), 0);
    assert.ok(!t.includes('trésorier'), 'la cible (Guilde) lui est fermée : la relation est absente');
    assert.ok(t.includes('Port-Sel'));
    await photo(lea, 'lea-aldric');
  });

  // Panne visée : « Famille » absent de la barre Lore ou proposé comme cible de « se situe à » ; « membre de » proposé à une famille.
  test('Famille : « Familles » est dans la barre Lore ; les natures d’une famille sont se situe à, détient, allié de, ennemi de (pas « membre de »)', opts, async () => {
    await ouvrir(antor, 'Les Corvalis');
    await antor.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Familles') }).waitFor();
    const b = await ouvrirFormulaire(antor, 'Description');
    assert.deepEqual(await opt(b.getByLabel('Nature')), ['se situe à', 'détient', 'allié de', 'ennemi de', 'Sans nature']);
    await b.getByLabel('Nature').selectOption({ label: 'se situe à' });
    assert.deepEqual(await opt(b.getByLabel('Type de fiche')), ['Lieu']);
    await photo(antor, 'famille-natures');
  });

  test('Famille, semis : Bran « aîné » et Dame Ombeline « veuve » sont reliés à Les Corvalis par « membre de »', opts, async () => {
    await ouvrir(antor, 'Bran Corvalis');
    assert.ok(norm(await bloc(antor).innerText()).includes('membre de · Les Corvalis — aîné'));
    await ouvrir(antor, 'Dame Ombeline de Val-Fortin');
    assert.ok(norm(await bloc(antor).innerText()).includes('membre de · Les Corvalis — veuve'));
    assert.ok(norm(await bloc(antor).innerText()).includes('membre de · La Guilde des Brumes — dirige'));
  });

  test('Une relation retirée : l’étiquette accessible dit « Retirer la relation membre de · Lames Grises — trésorier »', opts, async () => {
    await ouvrir(antor, 'Maître Aldric');
    await bloc(antor).getByRole('button', { name: 'Retirer la relation membre de · La Guilde des Brumes — trésorier' }).waitFor();
    assert.ok(norm(await bloc(antor).innerText()).includes('se situe à · Port-Sel — habite'));
  });
});

describe('kanevas-fiches-liees-natures, Famille dans un univers vierge (B-66)', { skip: skipBrowser }, () => {
  let srv2: Server;
  let br: Any;
  before(async () => {
    srv2 = await startServer();
    br = await launch();
  }, { timeout: 120000 });
  after(async () => {
    await br?.close();
    srv2?.stop();
  });

  // Panne visée : le type « Famille » absent des types activés par défaut, ou « Nouvelle famille » absent.
  test('Antor crée un univers : « Familles » (« Aucune famille. ») puis « Nouvelle famille » crée « Les Corvalis »', opts, async () => {
    const { page } = await connecte(br, srv2.base, 'Antor');
    const { creerUnivers } = await import('./harnais.test.js');
    await creerUnivers(page, 'Brumes de test');
    await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Familles') }).click();
    await page.getByRole('heading', { level: 1, name: 'Familles' }).waitFor();
    await page.getByText(/^Aucune famille/).waitFor(); // « Aucune famille pour l’instant. » (le motif des listes de E-8)
    await page.getByRole('button', { name: rxExact('Nouvelle famille') }).first().click();
    const f = page.getByRole('dialog');
    await f.getByLabel('Titre').fill('Les Corvalis');
    await f.getByRole('button', { name: rxExact('Créer la fiche') }).click();
    await page.getByRole('heading', { level: 1, name: 'Les Corvalis' }).waitFor();
    await photo(page, 'famille-creee');
  });

  // Panne visée : « Nouvelle famille » offert à un joueur.
  test('Léa, joueuse, ne voit pas « Nouvelle famille » (Familles de Lame d’Ébène)', opts, async () => {
    const s = await startServer({ KANEVAS_SANS_SEMIS: '' });
    try {
      const { page } = await connecte(br, s.base, 'Léa');
      const us = await (await page.request.fetch(`${s.base}/api/univers`)).json();
      const u = (us.univers ?? us).find((x: Any) => x.nom === "Lame d'Ébène").id;
      await page.goto(`/univers/${u}`);
      await page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: rxExact('Familles') }).click();
      await page.getByRole('heading', { level: 1, name: 'Familles' }).waitFor();
      await page.getByText('Les Corvalis').first().waitFor();
      assert.equal(await page.getByRole('button', { name: rxExact('Nouvelle famille') }).count(), 0);
      await photo(page, 'lea-familles');
    } finally {
      s.stop();
    }
  });
});
