// Feature-level tests of kanevas-deplacer-arborescence (B-35, E-9 « Déplacer sous… » with two views; AD-99
// unchanged, AD-129), written from the feature's « Livre » / exit criterion and docs/parcours.md /
// docs/ecrans.md only. World: the stub seed (« Lame d'Ébène »: Les Sphères > Port-Sel > La Taverne du Kraken,
// Les Docks, Le Phare aux Sels, Quartier des Cordiers, Le Repaire des contrebandiers). Real server in stub
// mode, real Chromium. Expected values are literals. Waits are on what the user sees, never on networkidle
// after a gesture.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = '/tmp/kanevas-deplacer-arborescence-shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const ids: Record<string, number> = {};

async function brut(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; corps: Any; texte: string }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const texte = await r.text();
  let corps: Any = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    /* not json */
  }
  return { status: r.status(), corps, texte };
}
async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await brut(page, method, url, data);
  assert.ok(r.status < 300, `${method} ${url} -> ${r.status} ${r.texte}`);
  return r.corps;
}
const fiche = (id: number) => `/api/univers/${U}/fiches/${id}`;
async function ancetres(id: number): Promise<string[]> {
  return (await api(antor, 'GET', fiche(id))).ancetres.map((a: Any) => a.titre);
}
async function remettre(titre: string, parent: string | null): Promise<void> {
  await api(antor, 'PATCH', fiche(ids[titre]), { parent: parent === null ? null : ids[parent] });
}
async function creer(titre: string, parent: number | null = null): Promise<number> {
  const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre });
  if (parent !== null) await api(antor, 'PATCH', fiche(f.id), { parent });
  return f.id;
}

const boite = (page: Any) => page.getByRole('dialog');
const liste = (page: Any) => boite(page).getByRole('radiogroup', { name: 'Nouveau parent' });
const chemin = (page: Any) => boite(page).getByRole('navigation', { name: 'Chemin' });
const deplacer = (page: Any) => boite(page).getByRole('button', { name: 'Déplacer', exact: true });
async function inactif(loc: Any): Promise<boolean> {
  return (await loc.isDisabled()) || (await loc.getAttribute('aria-disabled')) === 'true';
}
async function ouvrirFiche(page: Any, id: number, titre: string): Promise<void> {
  await page.goto(`/univers/${U}/fiche/${id}`);
  await page.getByRole('heading', { level: 1, name: titre, exact: true }).waitFor();
}
async function ouvrirBoite(page: Any, titre: string): Promise<void> {
  await ouvrirFiche(page, ids[titre], titre);
  await page.getByRole('button', { name: /^Autres actions sur/ }).first().click();
  await page.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
  await boite(page).getByRole('heading', { name: `Déplacer « ${titre} » sous…` }).waitFor();
  await liste(page).getByRole('radio').nth(1).waitFor();
}
/** The path as the user reads it: crumbs, in order. */
async function maillons(page: Any): Promise<string[]> {
  return (await chemin(page).innerText()).split('\n').map((s: string) => s.trim()).filter(Boolean);
}
/** The rows of the list, "Aucun parent" excluded: one collapsed text per row. */
async function lignes(page: Any): Promise<string[]> {
  const t: string[] = await liste(page).getByRole('radio').evaluateAll((els: Any[]) =>
    els.map((e) => (e.closest('label')?.innerText ?? '').replace(/\s+/g, ' ').trim()),
  );
  return t.filter((x) => x && !x.startsWith('Aucun parent'));
}
const rangee = (page: Any, titre: string) => liste(page).getByRole('radio', { name: new RegExp(`^${titre}`) });
const ouvrirNiveau = (page: Any, titre: string) => boite(page).getByRole('button', { name: `Ouvrir « ${titre} »` });

describe('kanevas-deplacer-arborescence, « Déplacer sous… » de bout en bout', { skip: skipBrowser }, () => {
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

  // Panne : la boîte s'ouvre sur la recherche vide (« Tapez le début d'un titre. ») ou sans l'emplacement actuel.
  test('nominal : la boîte s’ouvre sans rien taper sur Port-Sel et ses enfants, la fiche elle-même non choisissable', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    assert.equal(await boite(antor).getByRole('button', { name: 'Arborescence' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await boite(antor).getByRole('button', { name: 'Recherche' }).getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await maillons(antor), ["Lame d'Ébène", 'Les Sphères', 'Port-Sel']);
    const textes = await lignes(antor);
    for (const t of ['Le Phare aux Sels', 'Le Repaire des contrebandiers', 'Les Docks', 'Quartier des Cordiers']) {
      assert.ok(textes.some((x) => x.startsWith(t)), `${t} absent : ${textes.join('|')}`);
    }
    assert.ok(textes.some((x) => x.includes('La Taverne du Kraken') && x.includes('(cette fiche)')), textes.join('|'));
    assert.equal(await inactif(rangee(antor, 'La Taverne du Kraken')), true, 'la fiche elle-même est choisissable');
    assert.equal(await inactif(deplacer(antor)), true, 'Déplacer actif sans choix');
    assert.equal(await boite(antor).getByText('Nouveau parent :').count(), 0, 'résumé sans choix');
    await antor.screenshot({ path: `${SHOTS}/ouverture.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Panne : le parent actuel redevient validable (déplacer sous soi-même), ou la remontée par le chemin casse.
  test('bord : remonter par le chemin, Port-Sel porte « (parent actuel) » et un chevron, le choisir laisse Déplacer inactif', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    await chemin(antor).getByRole('button', { name: 'Les Sphères' }).click();
    await ouvrirNiveau(antor, 'Port-Sel').waitFor();
    assert.deepEqual(await maillons(antor), ["Lame d'Ébène", 'Les Sphères']);
    const ligne = (await lignes(antor)).find((x) => x.startsWith('Port-Sel')) ?? '';
    assert.ok(ligne.includes('(parent actuel)'), ligne);
    await rangee(antor, 'Port-Sel').check();
    assert.equal(await inactif(deplacer(antor)), true, 'Déplacer actif sur le parent actuel');
    await antor.screenshot({ path: `${SHOTS}/parent-actuel.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Panne : le choix naviguer-puis-valider ne déplace pas, ou ne dit pas le résultat.
  test('nominal : choisir Les Docks, « Nouveau parent : Les Docks », Déplacer → toast « Fiche déplacée. » et nouvelle ascendance', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    await rangee(antor, 'Les Docks').check();
    await boite(antor).getByText('Nouveau parent : Les Docks').waitFor();
    assert.equal(await inactif(deplacer(antor)), false, 'Déplacer inactif avec un choix valide');
    await deplacer(antor).click();
    await antor.getByText('Fiche déplacée.').waitFor();
    await boite(antor).waitFor({ state: 'detached' });
    assert.deepEqual(await ancetres(ids['La Taverne du Kraken']), ['Les Sphères', 'Port-Sel', 'Les Docks']);
    const fil = (await antor.getByRole('navigation', { name: /Fil d.Ariane/i }).first().innerText()).replace(/\s+/g, ' ');
    assert.ok(fil.includes('Les Docks') && fil.includes('La Taverne du Kraken'), fil);
    await antor.screenshot({ path: `${SHOTS}/deplacee.png` });
    await remettre('La Taverne du Kraken', 'Port-Sel');
  });

  // Panne : le choix se perd quand on change de niveau.
  test('bord : Les Docks choisi, Remonter puis le chevron de Port-Sel, retour sur Port-Sel et Les Docks reste coché', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    await rangee(antor, 'Les Docks').check();
    await boite(antor).getByRole('button', { name: 'Remonter d’un niveau' }).click();
    await ouvrirNiveau(antor, 'Port-Sel').click();
    await rangee(antor, 'Les Docks').waitFor();
    assert.deepEqual(await maillons(antor), ["Lame d'Ébène", 'Les Sphères', 'Port-Sel']);
    assert.equal(await rangee(antor, 'Les Docks').isChecked(), true);
    await boite(antor).getByText('Nouveau parent : Les Docks').waitFor();
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Panne : « Aucun parent » n'est plus proposé / ne met plus à la racine.
  test('nominal : « Aucun parent » met la fiche à la racine de l’univers', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    await boite(antor).getByRole('radio', { name: /^Aucun parent/ }).check();
    await boite(antor).getByText('Nouveau parent : aucun (racine de l’univers)').or(boite(antor).getByText("Nouveau parent : aucun (racine de l'univers)")).waitFor();
    await deplacer(antor).click();
    await antor.getByText('Fiche déplacée.').waitFor();
    assert.deepEqual(await ancetres(ids['La Taverne du Kraken']), []);
    await remettre('La Taverne du Kraken', 'Port-Sel');
  });

  // Panne : la fiche à la racine n'ouvre pas la racine, ou Remonter y reste actif.
  test('bord : fiche sans parent, la boîte montre la racine, Remonter inactif, « Aucun parent » porte « (actuel) »', async () => {
    await ouvrirBoite(antor, 'Les Sphères');
    assert.deepEqual(await maillons(antor), ["Lame d'Ébène"]);
    assert.equal(await inactif(boite(antor).getByRole('button', { name: 'Remonter d’un niveau' })), true);
    assert.ok((await boite(antor).getByRole('radio', { name: /^Aucun parent/ }).locator('..').innerText()).includes('(actuel)'));
    const textes = await lignes(antor);
    assert.ok(textes.some((x) => x.includes('Les Sphères') && x.includes('(cette fiche)')), textes.join('|'));
    assert.ok(textes.some((x) => x.startsWith('Val-Fortin')), 'les autres fiches de la racine sont listées');
    await boite(antor).getByRole('radio', { name: /^Aucun parent/ }).check();
    assert.equal(await inactif(deplacer(antor)), true, 'Déplacer actif sur « Aucun parent » actuel');
    await antor.screenshot({ path: `${SHOTS}/racine.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Exclusion. Panne : les descendants redeviennent des cibles, dans l'arbre ou dans la recherche.
  test('exclusion : sur Port-Sel, pas de chevron sur elle-même, la Recherche ne rend ni Les Docks ni La Taverne', async () => {
    await ouvrirBoite(antor, 'Port-Sel');
    assert.equal(await ouvrirNiveau(antor, 'Port-Sel').count(), 0, 'chevron sur la fiche elle-même');
    assert.equal(await inactif(rangee(antor, 'Port-Sel')), true);
    await boite(antor).getByRole('button', { name: 'Recherche' }).click();
    const champ = boite(antor).getByRole('textbox', { name: 'Chercher une fiche' });
    await champ.fill('Doc');
    await boite(antor).getByText('Aucune fiche ne correspond.').waitFor();
    assert.equal(await boite(antor).getByRole('radio', { name: /^Les Docks/ }).count(), 0);
    await champ.fill('Taverne');
    await rangee(antor, 'Le Pendu Joyeux').or(boite(antor).getByText('Aucune fiche ne correspond.')).waitFor();
    assert.equal(await boite(antor).getByRole('radio', { name: /^La Taverne du Kraken/ }).count(), 0, 'descendant proposé');
    await antor.screenshot({ path: `${SHOTS}/recherche-descendants.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Critère de la doc (docs/ecrans.md, critères de la tranche) : sur Port-Sel, une saisie sans résultat donne
  // « Aucune fiche ne correspond. ». La recherche est celle de la liste (AD-63) : elle trouve aussi par sous-type.
  // Panne : la saisie sans correspondance n'affiche pas le message vide.
  test('critère de la tranche : une saisie sans résultat, « Zzzz » sur Port-Sel, dit « Aucune fiche ne correspond. »', async () => {
    await ouvrirBoite(antor, 'Port-Sel');
    await boite(antor).getByRole('button', { name: 'Recherche' }).click();
    await boite(antor).getByRole('textbox', { name: 'Chercher une fiche' }).fill('Zzzz');
    await boite(antor).getByText('Aucune fiche ne correspond.').waitFor();
  });

  // Panne : la Recherche ne trouve plus par titre, ou le choix fait dans l'arbre n'est plus gardé.
  test('nominal : la Recherche trouve « Phare » par titre, le choix y vaut, et l’ouverture suivante revient sur Arborescence', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    await boite(antor).getByRole('button', { name: 'Recherche' }).click();
    assert.equal(await boite(antor).getByText('Tapez le début d’un titre.').or(boite(antor).getByText("Tapez le début d'un titre.")).count(), 1);
    const champ = boite(antor).getByRole('textbox', { name: 'Chercher une fiche' });
    await champ.fill('Phare');
    await rangee(antor, 'Le Phare aux Sels').waitFor();
    await rangee(antor, 'Le Phare aux Sels').check();
    await boite(antor).getByText('Nouveau parent : Le Phare aux Sels').waitFor();
    assert.equal(await inactif(deplacer(antor)), false);
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    await liste(antor).getByRole('radio').nth(1).waitFor();
    assert.equal(await boite(antor).getByRole('button', { name: 'Arborescence' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await boite(antor).getByText('Nouveau parent :').count(), 0, 'choix gardé entre deux ouvertures');
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Panne : un enfant illisible ou un descendant fuit via horsDe, ou horsDe filtre côté page seulement.
  test('API : la recherche avec horsDe écarte la fiche et ses descendants côté serveur', async () => {
    const r = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Port&horsDe=${ids['Les Sphères']}`);
    assert.ok(!r.fiches.some((f: Any) => f.titre === 'Port-Sel'), 'descendant rendu');
    const r2 = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Port`);
    assert.ok(r2.fiches.some((f: Any) => f.titre === 'Port-Sel'), 'sans horsDe Port-Sel doit être trouvée');
    const r3 = await api(antor, 'GET', `/api/univers/${U}/fiches?q=Docks&horsDe=${ids['Les Sphères']}`);
    assert.equal(r3.fiches.length, 0);
  });

  // Exclusion. Panne : une route de hiérarchie ouverte à un joueur, ou au MJ en mode Joueur.
  test('exclusion : Léa et Antor en mode Joueur n’ont ni racines (403) ni horsDe (400)', async () => {
    const racines = await brut(lea, 'GET', `/api/univers/${U}/fiches/racines`);
    assert.equal(racines.status, 403);
    assert.ok(!racines.texte.includes('Sphères') && !racines.texte.includes('Port-Sel'), racines.texte);
    const hors = await brut(lea, 'GET', `/api/univers/${U}/fiches?q=Port&horsDe=${ids['Les Sphères']}`);
    assert.equal(hors.status, 400);
    assert.ok(!hors.texte.includes('Port-Sel'), hors.texte);
    const racinesMode = await brut(antor, 'GET', `/api/univers/${U}/fiches/racines?mode=joueur`);
    assert.equal(racinesMode.status, 403);
    const horsMode = await brut(antor, 'GET', `/api/univers/${U}/fiches?q=Port&horsDe=${ids['Les Sphères']}&mode=joueur`);
    assert.equal(horsMode.status, 400);
  });

  // Exclusion. Panne : le menu « ⋯ » ou la boîte s'ouvre pour un joueur ou un MJ en mode Joueur.
  test('exclusion : Léa n’a pas « Déplacer sous… », ni Antor en mode Joueur', async () => {
    await ouvrirFiche(lea, ids['Port-Sel'], 'Port-Sel');
    assert.equal(await lea.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    const m = (await connecte(browser, srv.base, 'Antor')).page;
    await ouvrirFiche(m, ids['Port-Sel'], 'Port-Sel');
    await m.getByLabel('Mode Joueur').check();
    await m.getByRole('button', { name: /^Autres actions sur/ }).first().waitFor({ state: 'detached' });
    assert.equal(await m.getByRole('button', { name: /^Autres actions sur/ }).count(), 0);
    await m.context().close();
  });

  // Échec. Panne : l'échec de lecture d'un niveau n'est pas dit, ou « Réessayer » ne relit pas.
  test('échec : un niveau qui ne charge pas dit « Impossible de charger ce niveau. », Réessayer le relit, le chemin reste utilisable', async () => {
    await antor.route('**/fiches/*/enfants*', (r: Any) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }));
    await ouvrirFiche(antor, ids['La Taverne du Kraken'], 'La Taverne du Kraken');
    await antor.getByRole('button', { name: /^Autres actions sur/ }).first().click();
    await antor.getByRole('menuitem', { name: 'Déplacer sous…' }).click();
    await boite(antor).getByRole('alert').filter({ hasText: 'Impossible de charger ce niveau.' }).waitFor();
    assert.equal(await inactif(deplacer(antor)), true);
    assert.ok((await maillons(antor)).includes('Port-Sel'), 'chemin perdu');
    await antor.screenshot({ path: `${SHOTS}/echec-niveau.png` });
    await antor.unroute('**/fiches/*/enfants*');
    await boite(antor).getByRole('button', { name: 'Réessayer' }).click();
    await rangee(antor, 'Les Docks').waitFor();
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Échec. Panne : la connexion perdue laisse naviguer / valider.
  test('échec : connexion perdue, le bandeau paraît, Déplacer, chemin et Remonter sont inactifs, le niveau reste affiché', async () => {
    await ouvrirBoite(antor, 'La Taverne du Kraken');
    await rangee(antor, 'Les Docks').check();
    await antor.context().setOffline(true);
    try {
      await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
      await antor.getByText(/Connexion perdue\./).waitFor();
      assert.equal(await inactif(deplacer(antor)), true, 'Déplacer actif hors ligne');
      assert.equal(await inactif(chemin(antor).getByRole('button', { name: 'Les Sphères' })), true, 'maillon actif hors ligne');
      assert.equal(await inactif(boite(antor).getByRole('button', { name: 'Remonter d’un niveau' })), true);
      assert.ok((await lignes(antor)).some((x) => x.startsWith('Les Docks')), 'le niveau a disparu');
      await antor.screenshot({ path: `${SHOTS}/hors-ligne.png` });
    } finally {
      await antor.context().setOffline(false);
      await antor.evaluate(() => window.dispatchEvent(new Event('online')));
    }
    await antor.getByText(/Connexion perdue\./).waitFor({ state: 'detached' });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Échec. Panne : la hiérarchie change boîte ouverte et le cycle passe, ou le refus n'est pas dit.
  test('échec : Les Sphères déplacée sous Port-Sel devenu son enfant boîte ouverte → refus « Une fiche ne peut pas… », rien ne change', async () => {
    // Val-Fortin (racine) est choisie, puis rangée sous Les Sphères par l'API, boîte ouverte.
    await ouvrirBoite(antor, 'Les Sphères');
    await rangee(antor, 'Val-Fortin').check();
    await remettre('Val-Fortin', 'Les Sphères');
    await deplacer(antor).click();
    await boite(antor).getByText('Une fiche ne peut pas être rangée sous l’un de ses descendants.').or(boite(antor).getByText("Une fiche ne peut pas être rangée sous l'un de ses descendants.")).waitFor();
    assert.ok(await boite(antor).isVisible(), 'la boîte doit rester ouverte');
    assert.deepEqual(await ancetres(ids['Les Sphères']), []);
    await antor.screenshot({ path: `${SHOTS}/cycle.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
    await remettre('Val-Fortin', null);
  });

  // Bord : niveau de plus de 50. Panne : la page suivante n'est pas servie ou remplace la première.
  test('bord : un niveau de 55 enfants montre 50 lignes puis « Charger la suite » en ajoute 5 sans retirer les 50', async () => {
    const parent = await creer('Gros niveau');
    let premier = 0;
    for (let i = 1; i <= 55; i++) {
      const id = await creer(`Enfant ${String(i).padStart(2, '0')}`, parent);
      ids[`Enfant ${String(i).padStart(2, '0')}`] = id;
      if (i === 1) premier = id;
    }
    assert.ok(premier > 0);
    await ouvrirBoite(antor, 'Enfant 01');
    assert.equal(await liste(antor).getByRole('radio').count(), 51, '50 lignes + Aucun parent');
    const suite = boite(antor).getByRole('button', { name: 'Charger la suite' });
    await suite.click();
    await rangee(antor, 'Enfant 55').waitFor();
    assert.equal(await liste(antor).getByRole('radio').count(), 56, '55 lignes + Aucun parent');
    assert.equal(await boite(antor).getByRole('button', { name: 'Charger la suite' }).count(), 0);
    await antor.screenshot({ path: `${SHOTS}/niveau-55.png` });
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Bord : chemin profond. Panne : le chemin déborde ou « … » n'ouvre pas les niveaux cachés.
  test('bord : cinq niveaux, le chemin montre l’univers, « … » et les deux derniers ; « … » ouvre le premier niveau caché', async () => {
    const n1 = await creer('Niveau 1');
    const n2 = await creer('Niveau 2', n1);
    const n3 = await creer('Niveau 3', n2);
    const n4 = await creer('Niveau 4', n3);
    ids['Niveau 5'] = await creer('Niveau 5', n4);
    await ouvrirBoite(antor, 'Niveau 5');
    assert.deepEqual(await maillons(antor), ["Lame d'Ébène", '…', 'Niveau 3', 'Niveau 4']);
    await antor.screenshot({ path: `${SHOTS}/chemin-profond.png` });
    await chemin(antor).getByRole('button', { name: '…' }).click();
    await antor.getByRole('menuitem', { name: /Niveau 1/ }).click();
    await rangee(antor, 'Niveau 2').waitFor();
    assert.deepEqual(await maillons(antor), ["Lame d'Ébène", 'Niveau 1']);
    await boite(antor).getByRole('button', { name: 'Annuler' }).click();
  });

  // Téléphone. Panne : la boîte déborde de l'écran à 390 px, les boutons du pied sortent.
  test('téléphone 390 px : la boîte tient dans l’écran, « Annuler » et « Déplacer » restent visibles', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await attendre(page);
    await ouvrirBoite(page, 'La Taverne du Kraken');
    for (const b of ['Annuler', 'Déplacer']) {
      const r = await boite(page).getByRole('button', { name: b, exact: true }).boundingBox();
      assert.ok(r && r.x >= 0 && r.x + r.width <= 390 && r.y + r.height <= 800, `${b} hors écran : ${JSON.stringify(r)}`);
    }
    const d = await boite(page).boundingBox();
    assert.ok(d && d.width <= 390, `boîte trop large : ${d?.width}`);
    await page.screenshot({ path: `${SHOTS}/telephone.png` });
    await ctx.close();
  });
});
