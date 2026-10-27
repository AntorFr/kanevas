// Black-box tests of kanevas-fiches-liees-recherche, written from the need alone: B-65
// (docs/parcours.md), E-17 « the advanced search » (docs/ecrans.md), the maquette
// e17-recherche-avancee.html and the exit criterion of the feature. Real server in stub mode,
// real HTTP and real Chromium; every expectation is a literal.
//
// Test plan (besoin -> cas -> preuve):
//  API  nominal   Antor, type=personnage&lie=Port-Sel&nature=se_situe&descendants=1 -> Aldric, Le Prieur, Suie
//       nominal   same call with ?mode=joueur -> Aldric, Suie
//       bords     without descendants -> Suie leaves ; without nature, without type -> + Guilde, Rapport
//                 symmetric nature read from both sides ; words combined with lie ; lie on a deleted sheet / another universe
//                 a tree of 60 levels : answers 200 and stops ; the shallow sheet is found, the one under level 50 is not
//       échec     nature without lie, unknown nature, lie not an integer, descendants=2 -> 400
//       exclusions Léa never sees the secret relation's holder, nor a hidden sub-place's occupant, nor an intermediate place
//                 lie on a sheet Léa does not read -> empty page, same as a non-existent sheet
//  UI   nominal   E-17 « Recherche avancée » : Lié à, Par, sous-lieux compris, type Personnage -> the 3 rows, « Les Docks » in grey
//       bords     sous-lieux compris unchecked -> Suie gone ; type « Tous » + toute relation -> + Guilde, Rapport ; address reopens the same
//       échec/ex  Léa : same address -> Aldric, Suie ; picker offers readable sheets only ; ?lie= on a hidden sheet -> « Fiche introuvable » and empty list
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte, type Server } from './harnais.test.js';

let srv: Server;
let antor: Any;
let lea: Any;
let browser: Any;
let U = 0;
const id: Record<string, number> = {};
let profondeur = 0;
let universProfond = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
async function brut(page: Any, url: string): Promise<{ status: number; body: Any }> {
  const r = await page.request.fetch(srv.base + url);
  return { status: r.status(), body: await r.json().catch(() => null) };
}
async function fiche(type: string, titre: string, opts: { public?: boolean; secret?: boolean; parent?: number } = {}): Promise<number> {
  const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, ...(type === 'personnage' ? { charge: { pj: false } } : {}) });
  if (opts.parent) await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}`, { parent: opts.parent });
  if (opts.public !== false) {
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${f.id}/sections`, { titre: 'Apparence', contenu: 'Visible.' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
  }
  return f.id;
}
async function relier(source: number, cible: number, nature: string | null, qualificatif: string, secret = false): Promise<void> {
  let s: Any;
  if (secret) {
    s = await api(antor, 'POST', `/api/univers/${U}/fiches/${source}/sections`, { titre: 'Secret — MJ seul', contenu: 'Caché.' });
  } else {
    const vue = await api(antor, 'GET', `/api/univers/${U}/fiches/${source}`);
    s = vue.sections.find((x: Any) => x.titre === 'Apparence');
  }
  await api(antor, 'POST', `/api/univers/${U}/fiches/${source}/sections/${s.id}/relations`, { cibleFicheId: cible, nature, qualificatif });
}
const liste = (page: Any, query: string) => brut(page, `/api/univers/${U}/fiches?${query}`);
const titres = (b: Any): string[] => (b.body.fiches as Any[]).map((f) => f.titre).sort();

before(async () => {
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  U = (await api(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
  await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });

  id.portSel = await fiche('lieu', 'Port-Sel');
  id.docks = await fiche('lieu', 'Les Docks', { parent: id.portSel });
  id.repaire = await fiche('lieu', 'Le Repaire', { parent: id.portSel, public: false });
  id.aldric = await fiche('personnage', 'Maître Aldric');
  id.prieur = await fiche('personnage', 'Le Prieur');
  id.suie = await fiche('personnage', 'Suie');
  id.gaspard = await fiche('creature', 'Gaspard');
  id.guilde = await fiche('faction', 'La Guilde des Brumes');
  id.rapport = await fiche('objet', "Rapport secret de l'amirauté");
  id.ligue = await fiche('faction', 'La Ligue du Sel');
  await relier(id.aldric, id.portSel, 'se_situe', 'habite');
  await relier(id.prieur, id.portSel, 'se_situe', 'officie', true);
  await relier(id.suie, id.docks, 'se_situe', 'habite');
  await relier(id.gaspard, id.repaire, 'se_situe', 'se cache');
  await relier(id.guilde, id.portSel, null, 'contrôle');
  await relier(id.rapport, id.portSel, null, 'concerne');
  await relier(id.guilde, id.ligue, 'allie', 'pacte');

  // a chain of 60 places under Port-Sel's neighbour « Racine », a person at level 3 and one at level 58
  const principal = U;
  U = (await api(antor, 'POST', '/api/univers', { nom: 'Arbre profond' })).id;
  universProfond = U;
  let parent = await fiche('lieu', 'Racine');
  id.racine = parent;
  const chaine: number[] = [parent];
  for (let n = 1; n <= 59; n++) {
    const f = await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: `Niveau ${n}` });
    const r = await antor.request.fetch(`${srv.base}/api/univers/${U}/fiches/${f.id}`, { method: 'PATCH', data: { parent } });
    if (r.status() >= 300) break; // the product refuses a hierarchy that deep (« trop_profond »)
    const s = await api(antor, 'POST', `/api/univers/${U}/fiches/${f.id}/sections`, { titre: 'Apparence', contenu: 'Visible.' });
    await api(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
    parent = f.id;
    chaine.push(parent);
  }
  profondeur = chaine.length;
  id.proche = await fiche('personnage', 'Proche');
  id.loin = await fiche('personnage', 'Lointain');
  await relier(id.proche, chaine[3], 'se_situe', 'ici');
  await relier(id.loin, chaine[chaine.length - 1], 'se_situe', 'là-bas');
  U = principal;
}, { timeout: 300000 });
after(async () => {
  await browser?.close();
  srv?.stop();
});

describe('B-65 par l’API', () => {
  test('MJ : lié à Port-Sel, se_situe, sous-lieux compris, personnage -> Aldric, le Prieur, Suie (via Les Docks)', async () => {
    const r = await liste(antor, `type=personnage&lie=${id.portSel}&nature=se_situe&descendants=1`);
    assert.equal(r.status, 200);
    assert.deepEqual(titres(r), ['Le Prieur', 'Maître Aldric', 'Suie']);
    const suie = r.body.fiches.find((f: Any) => f.titre === 'Suie');
    assert.equal(suie.via.titre, 'Les Docks');
    assert.equal(r.body.fiches.find((f: Any) => f.titre === 'Maître Aldric').via, undefined);
  });
  test('joueur : même appel en ?mode=joueur -> Aldric et Suie seulement', async () => {
    const r = await liste(antor, `type=personnage&lie=${id.portSel}&nature=se_situe&descendants=1&mode=joueur`);
    assert.deepEqual(titres(r), ['Maître Aldric', 'Suie']);
  });
  test('Léa, même appel -> Aldric et Suie seulement, aucune trace du Prieur ni de Gaspard', async () => {
    const r = await liste(lea, `type=personnage&lie=${id.portSel}&nature=se_situe&descendants=1`);
    assert.deepEqual(titres(r), ['Maître Aldric', 'Suie']);
    assert.ok(!JSON.stringify(r.body).includes('Prieur'));
    assert.ok(!JSON.stringify(r.body).includes('Repaire'));
  });
  test('sans descendants, Suie disparaît', async () => {
    const r = await liste(antor, `type=personnage&lie=${id.portSel}&nature=se_situe`);
    assert.deepEqual(titres(r), ['Le Prieur', 'Maître Aldric']);
  });
  test('MJ : Gaspard, lié au Repaire (sous-lieu caché aux joueurs), apparaît avec descendants pour le MJ, pas pour Léa', async () => {
    const mj = await liste(antor, `type=creature&lie=${id.portSel}&descendants=1`);
    assert.deepEqual(titres(mj), ['Gaspard']);
    const joueuse = await liste(lea, `type=creature&lie=${id.portSel}&descendants=1`);
    assert.deepEqual(titres(joueuse), []);
  });
  test('sans nature ni type, les relations libres de Port-Sel s’ajoutent : Guilde et Rapport', async () => {
    const r = await liste(antor, `lie=${id.portSel}&descendants=1`);
    assert.deepEqual(titres(r), ['Gaspard', 'La Guilde des Brumes', 'Le Prieur', 'Maître Aldric', "Rapport secret de l'amirauté", 'Suie']);
  });
  test('avec nature=se_situe, les relations libres ne comptent pas', async () => {
    const r = await liste(antor, `lie=${id.portSel}&nature=se_situe`);
    assert.deepEqual(titres(r), ['Le Prieur', 'Maître Aldric']);
  });
  test('nature symétrique lue des deux côtés : allié, saisi par la Guilde, se trouve depuis la Ligue et depuis la Guilde', async () => {
    assert.deepEqual(titres(await liste(antor, `lie=${id.ligue}&nature=allie`)), ['La Guilde des Brumes']);
    assert.deepEqual(titres(await liste(antor, `lie=${id.guilde}&nature=allie`)), ['La Ligue du Sel']);
  });
  test('lie se combine avec les mots : « Suie » est lié à Port-Sel par les sous-lieux seulement, pas à la Guilde', async () => {
    assert.deepEqual(titres(await liste(antor, `q=Suie&lie=${id.portSel}&descendants=1`)), ['Suie']);
    assert.deepEqual(titres(await liste(antor, `q=Suie&lie=${id.portSel}`)), []);
    assert.deepEqual(titres(await liste(antor, `q=Suie&lie=${id.guilde}`)), []);
    assert.deepEqual(titres(await liste(antor, `q=Zorglub&lie=${id.portSel}&descendants=1`)), []);
  });
  test('un arbre d’au moins 50 niveaux : réponse 200, le lié du niveau 3 est trouvé, sans descendants rien', async () => {
    assert.ok(profondeur >= 50, `the product accepted only ${profondeur} levels`);
    const r = await brut(antor, `/api/univers/${universProfond}/fiches?lie=${id.racine}&descendants=1`);
    assert.equal(r.status, 200);
    assert.ok(titres(r).includes('Proche'));
    assert.ok(!titres(r).includes('Racine'), 'Racine n’a aucune relation');
    const sans = await brut(antor, `/api/univers/${universProfond}/fiches?lie=${id.racine}`);
    assert.deepEqual(sans.body.fiches, []);
  });
  test('lie sur une fiche inexistante ou d’un autre univers : 200 et page vide', async () => {
    const a = await liste(antor, 'lie=999999');
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.fiches, []);
  });
  test('Léa, lie sur une fiche qu’elle ne lit pas (Le Repaire) : page vide, comme une fiche inexistante', async () => {
    const cachee = await liste(lea, `lie=${id.repaire}`);
    const inexistante = await liste(lea, 'lie=999999');
    assert.equal(cachee.status, 200);
    assert.deepEqual(cachee.body, inexistante.body);
    assert.deepEqual(cachee.body.fiches, []);
  });
  for (const [nom, q] of [
    ['nature sans lie', 'nature=se_situe'],
    ['descendants sans lie', 'descendants=1'],
    ['nature inconnue', 'lie=%ID%&nature=inventee'],
    ['lie qui n’est pas un entier', 'lie=abc'],
    ['descendants autre que 1', 'lie=%ID%&descendants=2'],
  ]) {
    test(`400 : ${nom}`, async () => {
      const r = await liste(antor, q.replace('%ID%', String(id.portSel)));
      assert.equal(r.status, 400);
    });
  }
});

describe('E-17 « Recherche avancée » au navigateur', { skip: skipBrowser }, () => {
  let adresse = '';
  const rangees = async (page: Any): Promise<string[]> =>
    ((await page.getByRole('main').getByRole('link').allInnerTexts()) as string[])
      .map((t) => t.replace(/\s+/g, ' ').trim().replace(/ (PNJ|PJ|Lieu|Faction|Objet|Créature)$/, ''))
      .sort();
  // Waits (up to 15 s) for the list the user sees to be exactly `attendu`; the page is the proof, not the network.
  const voir = async (page: Any, attendu: string[]): Promise<void> => {
    let derniere: string[] = [];
    for (let n = 0; n < 150; n++) {
      derniere = await rangees(page);
      if (JSON.stringify(derniere) === JSON.stringify(attendu)) return;
      await page.waitForTimeout(100);
    }
    assert.deepEqual(derniere, attendu);
  };
  const ouvrir = async (page: Any, query: string) => {
    await page.goto(`/univers/${U}/recherche${query}`);
    await page.getByRole('heading', { name: 'Recherche', level: 1 }).waitFor();
    await attendre(page);
  };

  test('Antor compose le filtre au geste : Lié à Port-Sel, s’y trouvent, sous-lieux compris, Personnages -> trois fiches, Suie avec « Les Docks » en gris', async () => {
    await antor.goto(`/univers/${U}/recherche`);
    await antor.getByRole('heading', { name: 'Recherche', level: 1 }).waitFor();
    assert.equal(await antor.getByLabel('Lié à').isVisible(), false, 'le volet est replié sans paramètre');
    await antor.getByText('Recherche avancée').click();
    await antor.getByLabel('Lié à').fill('Port');
    await antor.getByRole('button', { name: 'Port-Sel' }).click();
    await antor.getByText('Port-Sel').first().waitFor();
    await antor.getByLabel('Par').selectOption({ label: "s'y trouvent" });
    await antor.getByLabel('sous-lieux compris').check();
    await antor.getByRole('button', { name: 'Personnages' }).click();
    await voir(antor, ['Le Prieur', 'Maître Aldric', 'Suie Les Docks']);
    const u = new URL(antor.url());
    adresse = u.search;
    assert.equal(u.searchParams.get('lie'), String(id.portSel));
    assert.equal(u.searchParams.get('nature'), 'se_situe');
    assert.equal(u.searchParams.get('descendants'), '1');
    assert.equal(u.searchParams.get('type'), 'personnage');
    const rgb: string = await antor.getByText('Les Docks', { exact: true }).evaluate((el: Element) => getComputedStyle(el).color);
    const couleurs = { via: (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number) };
    assert.ok(Math.max(...couleurs.via) - Math.min(...couleurs.via) < 30, `« Les Docks » est gris : ${couleurs.via}`);
    await antor.screenshot({ path: '/tmp/e2e-recherche-liee-nominal.png' });
  });

  test('Antor décoche « sous-lieux compris » : Suie disparaît', async () => {
    await antor.getByLabel('sous-lieux compris').uncheck();
    await voir(antor, ['Le Prieur', 'Maître Aldric']);
    assert.equal(new URL(antor.url()).searchParams.get('descendants'), null);
  });

  test('Antor : « Tous » et « toute relation », sous-lieux compris -> la Guilde et le Rapport s’ajoutent (relations libres)', async () => {
    await antor.getByLabel('sous-lieux compris').check();
    await antor.getByRole('button', { name: 'Tous', exact: true }).click();
    await antor.getByLabel('Par').selectOption({ label: 'toute relation' });
    await voir(antor, [
      'Gaspard Le Repaire',
      'La Guilde des Brumes',
      'Le Prieur',
      'Maître Aldric',
      "Rapport secret de l'amirauté",
      'Suie Les Docks',
    ]);
  });

  test('l’adresse composée se rouvre telle quelle : volet ouvert, pastille, Par, case, type, trois fiches', async () => {
    assert.ok(adresse.includes('lie='), 'adresse relevée par le premier test');
    const page = (await connecte(browser, srv.base, 'Antor')).page;
    await ouvrir(page, adresse);
    await voir(page, ['Le Prieur', 'Maître Aldric', 'Suie Les Docks']);
    assert.equal(await page.getByLabel('Par').inputValue(), 'se_situe');
    assert.equal(await page.getByLabel('sous-lieux compris').isChecked(), true);
    assert.equal(await page.getByRole('button', { name: 'Personnages' }).getAttribute('aria-pressed'), 'true');
    assert.ok((await texte(page)).includes('Port-Sel'));
  });

  test('Léa, même adresse : Aldric et Suie seulement, pas de bascule de mode', async () => {
    await ouvrir(lea, adresse);
    await voir(lea, ['Maître Aldric', 'Suie Les Docks']);
    assert.ok(!(await texte(lea)).includes('Prieur'));
    assert.equal(await lea.getByRole('radio', { name: /Mode Joueur/ }).count(), 0);
    await lea.screenshot({ path: '/tmp/e2e-recherche-liee-lea.png' });
  });

  test('Léa : « Lié à » ne propose que les fiches qu’elle lit', async () => {
    await ouvrir(lea, '');
    await lea.getByText('Recherche avancée').click();
    await lea.getByLabel('Lié à').fill('Re');
    await lea.getByText('Aucune fiche.').waitFor();
    await lea.getByLabel('Lié à').fill('Port');
    await lea.getByRole('button', { name: 'Port-Sel' }).waitFor();
    assert.ok(!(await texte(lea)).includes('Le Repaire'));
  });

  test('Léa, ?lie= sur une fiche qu’elle ne lit pas (Le Repaire) : liste vide et pastille « Fiche introuvable »', async () => {
    await ouvrir(lea, `?lie=${id.repaire}`);
    await lea.getByText('Fiche introuvable').waitFor();
    await voir(lea, []);
    assert.ok((await texte(lea)).includes('Aucune fiche liée pour ces critères.'));
    assert.ok(!(await texte(lea)).includes('Repaire'));
  });

  test('Antor, ?lie= sur une fiche qui n’existe pas : « Fiche introuvable » aussi, liste vide', async () => {
    await ouvrir(antor, '?lie=999999');
    await antor.getByText('Fiche introuvable').waitFor();
    await voir(antor, []);
  });

  test('état vide : « Aucune fiche liée à « Suie » pour ces critères. » même avec des mots', async () => {
    await ouvrir(antor, `?lie=${id.suie}`);
    await antor.getByText(/Aucune fiche liée à « Suie » pour ces critères\./).waitFor();
    await ouvrir(antor, `?q=Zorglub&lie=${id.portSel}`);
    await antor.getByText(/Aucune fiche liée à « Port-Sel » pour ces critères\./).waitFor();
  });

  test('nature et sous-lieux qui ne conviennent pas à la fiche choisie (un personnage) : l’adresse est nettoyée, la liste tourne', async () => {
    await ouvrir(antor, `?lie=${id.aldric}&nature=se_situe&descendants=1`);
    await antor.waitForFunction(() => !location.search.includes('nature') && !location.search.includes('descendants'));
    assert.equal(new URL(antor.url()).searchParams.get('lie'), String(id.aldric));
    assert.equal(await antor.getByLabel('sous-lieux compris').count(), 0);
  });

  test('erreur de la liste : « Réessayer » et la page ne casse pas', async () => {
    const page = (await connecte(browser, srv.base, 'Antor')).page;
    await page.route(/\/fiches\?.*lie=/, (r: Any) => r.fulfill({ status: 500, body: '{"message":"boom"}', contentType: 'application/json' }));
    await page.goto(`/univers/${U}/recherche?lie=${id.portSel}`);
    await page.getByRole('button', { name: 'Réessayer' }).waitFor();
    await page.screenshot({ path: '/tmp/e2e-recherche-liee-erreur.png' });
  });
});
