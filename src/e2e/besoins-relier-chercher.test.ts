// Black-box tests of kanevas-relier-chercher written from the need (docs/parcours.md B-10, B-11,
// B-29 ; docs/ecrans.md "Détail des écrans de kanevas-relier-chercher"), not from the code.
// Expected values are literals taken from those docs. Real server in stub mode + real Chromium
// (same harness as the other e2e files). The world is arranged through the API (fast), what is
// checked is always read on screen as the user sees it.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, ligneRelation, connecte, launch, rx, rxExact, section, skipBrowser, startServer, texte as texteBrut, type Server } from './harnais.test.js';

/** Visible text of the page with whitespace collapsed (a relation is drawn over several lines). */
const texte = async (page: Any): Promise<string> => (await texteBrut(page)).replace(/\s+/g, ' ');

const BANDEAU =
  "Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.";

let srv: Server;
let browser: Any;

interface Monde {
  U: number;
  antor: Any;
  lea: Any;
  aldric: number;
  apparence: number;
  verite: number;
  grises: number;
  grisesPresentation: number;
  cendres: number;
  cendresSecret: number;
}

async function api(page: Any, method: string, url: string, data?: unknown, ok = true): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  if (ok) assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json();
}

/**
 * Antor (MJ) and Léa (Joueuse) in a fresh universe. "Maître Aldric": section "Apparence" read by
 * the players, section "Vérité — MJ seul" closed. "Lames Grises": a section read by the players.
 * "Cercle des Cendres": its only section is closed (no player reads it).
 */
async function monde(nom: string): Promise<Monde> {
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const lea = (await connecte(browser, srv.base, 'Léa')).page;
  const U = (await api(antor, 'POST', '/api/univers', { nom })).id;
  await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const fiche = (type: string, titre: string) =>
    api(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, ...(type === 'personnage' ? { charge: { pj: false } } : {}) });
  const sec = async (f: number, titre: string, contenu: string, lisible: boolean) => {
    const base = `/api/univers/${U}/fiches/${f}/sections`;
    const s = await api(antor, 'POST', base, { titre, contenu });
    if (lisible) await api(antor, 'PATCH', `${base}/${s.id}`, { joueursLisent: true });
    return s.id as number;
  };
  const aldric = (await fiche('personnage', 'Maître Aldric')).id;
  const apparence = await sec(aldric, 'Apparence', 'Grand, cape grise, regard dur.', true);
  const verite = await sec(aldric, 'Vérité — MJ seul', 'Il trahit le Cercle.', false);
  const grises = (await fiche('faction', 'Lames Grises')).id;
  const grisesPresentation = await sec(grises, 'Présentation', 'Une guilde de coursiers.', true);
  const cendres = (await fiche('faction', 'Cercle des Cendres')).id;
  const cendresSecret = await sec(cendres, 'Secret', 'Ils brûlent les archives.', false);
  return { U, antor, lea, aldric, apparence, verite, grises, grisesPresentation, cendres, cendresSecret };
}

const relation = (m: Monde, section: number, cible: number, type: string, fiche = m.aldric) =>
  api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${fiche}/sections/${section}/relations`, { cibleFicheId: cible, type });

async function ouvrirFiche(page: Any, m: Monde, id: number, mode = ''): Promise<void> {
  await page.goto(`/univers/${m.U}/fiche/${id}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
  if (mode === 'joueur') await page.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
  await page.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
  await attendre(page);
}

const NOMS: Record<string, string> = {
  personnages: 'personnages',
  lieux: 'lieux',
  factions: 'factions',
};
async function ouvrirListe(page: Any, m: Monde, type: string, q = ''): Promise<void> {
  await page.goto(`/univers/${m.U}/fiches/${type}${q ? '?q=' + encodeURIComponent(q) : ''}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await attendre(page);
}
const champ = (page: Any, type = 'personnages') => page.getByLabel(rx(`Chercher dans les ${NOMS[type] ?? type}`));
async function chercher(page: Any, mot: string, type = 'personnages'): Promise<void> {
  await champ(page, type).fill(mot);
  await page.getByRole('button', { name: rxExact('Chercher') }).click();
  await page.waitForFunction(() => !/Recherche…/.test(document.body.innerText));
  await attendre(page);
  await page.waitForTimeout(150);
}
const aucun = (mot: string, type = 'personnages') => `Aucun résultat pour « ${mot} » dans les ${type}.`;
const liens = async (page: Any): Promise<string[]> =>
  (await page.locator('main a').allInnerTexts()).map((t: string) => (t.split('\n')[0] ?? '').replace(/’/g, "'"));

/** Collects every API response body seen by the page, to look for leaks the screen would hide. */
function espion(page: Any): { corps: () => Promise<string> } {
  const prises: Promise<string>[] = [];
  page.on('response', (r: Any) => {
    if (r.url().includes('/api/')) prises.push(r.text().catch(() => ''));
  });
  return { corps: async () => (await Promise.all(prises)).join('\n') };
}

describe('kanevas-relier-chercher, du besoin', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  // =============================== B-11 : chercher ===============================
  describe('B-11 recherche dans un type (E-8)', () => {
    let m: Monde;
    before(async () => {
      m = await monde("Lame d'Ébène recherche");
    });

    // Si le filtre de droits sur le contenu des sections est retiré, Léa trouve Aldric par « Vérité ».
    test('nominal : Léa cherche « Vérité » dans les personnages, aucune fiche ; Antor obtient Maître Aldric', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'Vérité');
      assert.ok((await texte(m.lea)).includes(aucun('Vérité')));
      assert.deepEqual(await liens(m.lea).then((l) => l.filter((t) => t.includes('Aldric'))), []);
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Vérité');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
      assert.ok(!(await texte(m.antor)).includes('Aucun résultat'));
    });

    test('nominal : Léa trouve Maître Aldric par son titre (« aldric ») et par une section qu’elle lit (« apparence »)', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'aldric');
      assert.ok((await liens(m.lea)).some((t) => t.includes('Maître Aldric')));
      await chercher(m.lea, 'apparence');
      assert.ok((await liens(m.lea)).some((t) => t.includes('Maître Aldric')));
    });

    // Si le texte « vide » variait selon l’existence de la fiche cachée, il trahirait la fiche.
    test('exclusion : le texte sans résultat est le même pour un mot caché et pour un mot qui n’existe nulle part', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'Vérité');
      const cache = await texte(m.lea);
      await chercher(m.lea, 'Zzyzx');
      const absent = await texte(m.lea);
      assert.ok(cache.includes('Aucun résultat pour « Vérité » dans les personnages.'));
      assert.ok(absent.includes('Aucun résultat pour « Zzyzx » dans les personnages.'));
      assert.equal(cache.replace('Vérité', 'MOT'), absent.replace('Zzyzx', 'MOT'));
      await page_effacer(m.lea);
    });

    test('bord : sans accent ni majuscule, « verite » et « VÉRITÉ » trouvent « Vérité » (MJ)', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'verite');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
      await chercher(m.antor, 'VÉRITÉ');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
    });

    test('bord : début de mot — « Ald » trouve, « dric » ne trouve rien', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'Ald');
      assert.ok((await liens(m.lea)).some((t) => t.includes('Maître Aldric')));
      await chercher(m.lea, 'dric');
      assert.ok((await texte(m.lea)).includes(aucun('dric')));
    });

    test('bord : tous les mots dans une même section : « grand cape » trouve, « Apparence Vérité » (deux sections) non', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'grand cape');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
      await chercher(m.antor, 'Apparence Vérité');
      assert.ok((await texte(m.antor)).includes(aucun('Apparence Vérité')));
    });

    test('exclusion : pour Léa, les mots d’une section fermée ne se combinent pas avec ceux d’une section lue (« grand trahit »)', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'grand trahit');
      assert.ok((await texte(m.lea)).includes(aucun('grand trahit')));
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'trahit cercle');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
    });

    // Si le filtre de droits sur le titre est retiré, la fiche « Dame Vérane » apparaît pour Léa.
    test('exclusion : une fiche dont Léa ne lit aucune section est absente des résultats, même par son titre ; le MJ la trouve, y compris sans section', async () => {
      const f = (titre: string) => api(m.antor, 'POST', `/api/univers/${m.U}/fiches`, { type: 'personnage', titre, charge: { pj: false } });
      const vera = (await f('Dame Vérane')).id;
      await api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${vera}/sections`, { titre: 'Secret', contenu: 'Espionne.' });
      await f('Dame Nue');
      await ouvrirListe(m.lea, m, 'personnages');
      const espionne = espion(m.lea);
      await chercher(m.lea, 'Dame');
      assert.ok((await texte(m.lea)).includes(aucun('Dame')));
      const corps = await espionne.corps();
      assert.ok(!corps.includes('Dame Vérane') && !corps.includes('Dame Nue'), 'titre caché dans la réponse');
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Dame');
      const l = await liens(m.antor);
      assert.ok(l.some((t) => t.includes('Dame Vérane')));
      assert.ok(l.some((t) => t.includes('Dame Nue')));
    });

    test('exclusion : aucune réponse reçue par Léa ne contient le contenu ni le titre des sections fermées', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      const e = espion(m.lea);
      await chercher(m.lea, 'Vérité');
      await chercher(m.lea, 'aldric');
      const corps = await e.corps();
      assert.ok(!corps.includes('trahit'), 'contenu fermé');
      assert.ok(!corps.includes('Vérité'), 'titre de section fermée');
    });

    test('exclusion : un résultat est une ligne de liste — pas d’extrait de section, pas de compteur', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'grand');
      const t = await texte(m.antor);
      assert.ok((await liens(m.antor)).some((x) => x.includes('Maître Aldric')));
      assert.ok(!t.includes('cape grise'), 'extrait');
      assert.ok(!/\d+ résultats?/.test(t), 'compteur');
    });

    test('exclusion : la recherche reste dans le type — « Lames » ne trouve rien parmi les personnages, trouve la faction parmi les factions', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Lames');
      assert.ok((await texte(m.antor)).includes(aucun('Lames')));
      await ouvrirListe(m.antor, m, 'factions');
      await chercher(m.antor, 'Lames', 'factions');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Lames Grises')));
      assert.ok(!(await texte(m.antor)).includes('Cercle des Cendres'));
    });

    test('bord : un mot sans lettre ni chiffre (« - ») se comporte comme une recherche sans résultat', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, '-');
      assert.ok((await texte(m.antor)).includes('Aucun résultat pour'));
      assert.deepEqual((await liens(m.antor)).filter((t) => t.includes('Aldric')), []);
    });

    test('bord : saisie de 100 caractères acceptée, 101 refusée sous le champ, rien n’est envoyé', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      const requetes: string[] = [];
      m.antor.on('request', (r: Any) => {
        if (/[?&]q=/.test(r.url())) requetes.push(r.url());
      });
      await chercher(m.antor, 'a'.repeat(100));
      assert.ok(!(await texte(m.antor)).includes('100 caractères au plus'));
      assert.equal(requetes.length, 1);
      await champ(m.antor).fill('a'.repeat(101));
      await m.antor.getByRole('button', { name: rxExact('Chercher') }).click();
      await attendre(m.antor);
      assert.ok((await texte(m.antor)).includes('Erreur : 100 caractères au plus.'));
      assert.equal(requetes.length, 1, 'une requête est partie malgré 101 caractères');
    });

    test('bord : une saisie blanche équivaut à « Effacer la recherche » : la liste complète revient', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Zzyzx');
      assert.ok((await texte(m.antor)).includes(aucun('Zzyzx')));
      await champ(m.antor).fill('   ');
      await m.antor.getByRole('button', { name: rxExact('Chercher') }).click();
      await attendre(m.antor);
      await m.antor.getByRole('link', { name: rx('Maître Aldric') }).first().waitFor({ timeout: 4000 });
      assert.ok(!(await texte(m.antor)).includes('Aucun résultat'));
    });

    test('« Effacer la recherche » rend la liste du type et vide le champ', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Zzyzx');
      await page_effacer(m.antor);
      await m.antor.getByRole('link', { name: rx('Maître Aldric') }).first().waitFor({ timeout: 4000 });
      assert.equal(await champ(m.antor).inputValue(), '');
    });

    test('la recherche part à Entrée, jamais à la frappe', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      const requetes: string[] = [];
      m.antor.on('request', (r: Any) => {
        if (/[?&]q=/.test(r.url())) requetes.push(r.url());
      });
      await champ(m.antor).pressSequentially('Zzyzx', { delay: 30 });
      await m.antor.waitForTimeout(600);
      assert.equal(requetes.length, 0, 'recherche partie à la frappe');
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
      await champ(m.antor).press('Enter');
      await attendre(m.antor);
      await m.antor.getByText(rx(aucun('Zzyzx'))).waitFor();
      assert.equal(requetes.length, 1);
    });

    test('la recherche est dans l’adresse (?q=) ; ouvrir un résultat puis revenir ramène aux mêmes résultats', async () => {
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'Aldric');
      assert.ok(decodeURIComponent(m.lea.url()).includes('?q=Aldric'), m.lea.url());
      await m.lea.getByRole('link', { name: rx('Maître Aldric') }).first().click();
      await m.lea.getByRole('heading', { name: 'Maître Aldric', level: 1 }).waitFor();
      await m.lea.goBack();
      await attendre(m.lea);
      assert.equal(await champ(m.lea).inputValue(), 'Aldric');
      assert.ok((await liens(m.lea)).some((t) => t.includes('Maître Aldric')));
      // la même adresse rouverte donne la même recherche
      await ouvrirListe(m.lea, m, 'personnages', 'Zzyzx');
      assert.ok((await texte(m.lea)).includes(aucun('Zzyzx')));
    });

    test('rôles : le MJ garde « Nouveau personnage » pendant une recherche ; la Joueuse ne l’a jamais', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Aldric');
      await m.antor.getByRole('button', { name: rxExact('Nouveau personnage') }).waitFor();
      await ouvrirListe(m.lea, m, 'personnages');
      await chercher(m.lea, 'Aldric');
      assert.equal(await m.lea.getByRole('button', { name: rxExact('Nouveau personnage') }).count(), 0);
    });

    test('refus : l’admin d’instance, sans rôle dans l’univers, a « Page introuvable. » sur la liste', async () => {
      const admin = (await connecte(browser, srv.base, 'Admin')).page;
      await admin.goto(`/univers/${m.U}/fiches/personnages?q=Aldric`);
      await attendre(admin);
      const t = await texte(admin);
      assert.ok(t.includes('Page introuvable.'));
      assert.ok(!t.includes('Maître Aldric'));
    });

    test('états : « Recherche… » pendant l’attente, sans l’ancienne liste', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await m.antor.route(/[?&]q=/, async (r: Any) => {
        await new Promise((ok) => setTimeout(ok, 1500));
        await r.continue().catch(() => undefined);
      });
      await champ(m.antor).fill('Aldric');
      await m.antor.getByRole('button', { name: rxExact('Chercher') }).click();
      await m.antor.getByRole('status').filter({ hasText: 'Recherche…' }).waitFor({ timeout: 1400 });
      assert.deepEqual((await liens(m.antor)).filter((t) => t.includes('Aldric')), []);
      await m.antor.unroute(/[?&]q=/);
      await m.antor.getByRole('link', { name: rx('Maître Aldric') }).first().waitFor();
    });

    test('états : erreur « Impossible de lancer la recherche. », la saisie reste, « Réessayer » relance', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await m.antor.route(/[?&]q=/, (r: Any) => r.abort('failed'));
      await champ(m.antor).fill('Aldric');
      await m.antor.getByRole('button', { name: rxExact('Chercher') }).click();
      await m.antor.getByText('Impossible de lancer la recherche.').waitFor();
      assert.equal(await champ(m.antor).inputValue(), 'Aldric');
      await m.antor.unroute(/[?&]q=/);
      await m.antor.getByRole('button', { name: rxExact('Réessayer') }).click();
      await m.antor.getByRole('link', { name: rx('Maître Aldric') }).first().waitFor();
      assert.ok(!(await texte(m.antor)).includes('Impossible de lancer la recherche.'));
    });

    test('états : connexion perdue — bandeau, « Chercher » désactivé, résultats déjà affichés conservés', async () => {
      await ouvrirListe(m.antor, m, 'personnages');
      await chercher(m.antor, 'Aldric');
      await m.antor.context().setOffline(true);
      await m.antor.getByText(rx(BANDEAU)).waitFor();
      assert.equal(await m.antor.getByRole('button', { name: rxExact('Chercher') }).isDisabled(), true);
      assert.ok((await liens(m.antor)).some((t) => t.includes('Maître Aldric')));
      await m.antor.context().setOffline(false);
      await m.antor.getByText(rx(BANDEAU)).waitFor({ state: 'detached' });
      assert.equal(await m.antor.getByRole('button', { name: rxExact('Chercher') }).isDisabled(), false);
    });

    test('états : plus de 100 résultats, 100 d’abord puis « Charger la suite » ajoute le reste, dans l’ordre alphabétique', async () => {
      const m2 = await monde("Lame d'Ébène cent");
      for (let i = 1; i <= 101; i++) {
        await api(m2.antor, 'POST', `/api/univers/${m2.U}/fiches`, {
          type: 'lieu',
          titre: `Halte ${String(i).padStart(3, '0')}`,
        });
      }
      await ouvrirListe(m2.antor, m2, 'lieux');
      await chercher(m2.antor, 'Halte', 'lieux');
      const premiers = (await liens(m2.antor)).filter((t) => t.startsWith('Halte'));
      assert.equal(premiers.length, 100);
      assert.equal(premiers[0], 'Halte 001');
      await m2.antor.getByRole('button', { name: rxExact('Charger la suite') }).click();
      await attendre(m2.antor);
      await m2.antor.getByRole('link', { name: rx('Halte 101') }).waitFor();
      const tous = (await liens(m2.antor)).filter((t) => t.startsWith('Halte'));
      assert.equal(tous.length, 101);
      assert.equal(tous[100], 'Halte 101');
    });
  });

  // =============================== B-10 : relier ===============================
  describe('B-10 bloc Relations (E-9)', () => {
    let m: Monde;
    before(async () => {
      m = await monde("Lame d'Ébène relations");
      await relation(m, m.apparence, m.grises, 'membre de');
      await relation(m, m.apparence, m.cendres, 'membre de');
    });

    // Si le filtre « cible lisible » est retiré, Léa lit « Cercle des Cendres ».
    test('nominal : Léa voit « membre de → Lames Grises » et rien d’autre dans le bloc ; ni Cercle des Cendres, ni compteur', async () => {
      const e = espion(m.lea);
      await ouvrirFiche(m.lea, m, m.aldric);
      const t = await texte(m.lea);
      assert.equal(await ligneRelation(m.lea, 'membre de', 'Lames Grises').count(), 1);
      assert.ok(!t.includes('Cercle des Cendres'));
      assert.ok(!/cachée?s?/i.test(t));
      const bloc = await section(m.lea, 'Apparence').getByRole('list').allInnerTexts();
      assert.ok(bloc.join('\n').includes('membre de'));
      const lignes = await section(m.lea, 'Apparence').getByRole('listitem').allInnerTexts();
      assert.equal(lignes.filter((l: string) => l.includes('membre de')).length, 1);
      const corps = await e.corps();
      assert.ok(!corps.includes('Cercle des Cendres'), 'cible illisible nommée dans une réponse');
    });

    test('nominal : la relation mène à la fiche de la cible', async () => {
      await ouvrirFiche(m.lea, m, m.aldric);
      await m.lea.getByRole('link', { name: rx('Lames Grises') }).first().click();
      await m.lea.getByRole('heading', { name: 'Lames Grises', level: 1 }).waitFor();
    });

    test('exclusion : Léa n’a ni « Relier à une fiche » ni « Retirer »', async () => {
      await ouvrirFiche(m.lea, m, m.aldric);
      assert.equal(await m.lea.getByRole('button', { name: rx('Relier') }).count(), 0);
      assert.equal(await m.lea.getByRole('button', { name: rx('Retirer') }).count(), 0);
    });

    test('rôle : Antor (MJ) voit les deux relations, avec « Relier à une fiche » et un « Retirer … » étiqueté', async () => {
      await ouvrirFiche(m.antor, m, m.aldric);
      const t = await texte(m.antor);
      assert.equal(await ligneRelation(m.antor, 'membre de', 'Lames Grises').count(), 1);
      assert.equal(await ligneRelation(m.antor, 'membre de', 'Cercle des Cendres').count(), 1);
      await m.antor.getByRole('button', { name: rxExact('Relier à une fiche') }).first().waitFor();
      await m.antor.getByRole('button', { name: 'Retirer la relation membre de → Lames Grises', exact: true }).waitFor();
    });

    test('mode Joueur : Antor voit la même chose que Léa, sans « Relier » ni « Retirer »', async () => {
      await ouvrirFiche(m.antor, m, m.aldric, 'joueur');
      const t = await texte(m.antor);
      assert.equal(await ligneRelation(m.antor, 'membre de', 'Lames Grises').count(), 1);
      assert.ok(!t.includes('Cercle des Cendres'));
      assert.equal(await m.antor.getByRole('button', { name: rx('Relier') }).count(), 0);
      assert.equal(await m.antor.getByRole('button', { name: rx('Retirer la relation') }).count(), 0);
    });

    test('exclusion : une relation est dirigée — la fiche cible ne montre pas celles qui l’atteignent', async () => {
      await ouvrirFiche(m.antor, m, m.grises);
      const t = await texte(m.antor);
      assert.ok(!t.includes('membre de'));
      assert.ok(!t.includes('Maître Aldric'));
    });

    test('refus : l’admin d’instance, sans rôle, a « Page introuvable. » sur la fiche', async () => {
      const admin = (await connecte(browser, srv.base, 'Admin')).page;
      await admin.goto(`/univers/${m.U}/fiche/${m.aldric}`);
      await attendre(admin);
      const t = await texte(admin);
      assert.ok(t.includes('Page introuvable.'));
      assert.ok(!t.includes('Lames Grises'));
    });

    test('vide : Joueuse sans relation à voir — pas de bloc Relations ; MJ — « Aucune relation pour l’instant. » et « Relier à une fiche »', async () => {
      const m2 = await monde("Lame d'Ébène relations vides");
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      assert.equal(await m2.lea.getByText(rx('Relations'), { exact: true }).count(), 0);
      assert.ok(!(await texte(m2.lea)).includes('Aucune relation'));
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      assert.ok((await texte(m2.antor)).includes("Aucune relation pour l'instant."));
      await m2.antor.getByRole('button', { name: rxExact('Relier à une fiche') }).first().waitFor();
    });

    test('exclusion : relation vers une fiche dont Léa ne lit plus rien — elle disparaît de la fiche d’Aldric sans trace', async () => {
      const m2 = await monde("Lame d'Ébène relations perdues");
      await relation(m2, m2.apparence, m2.grises, 'membre de');
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      assert.equal(await ligneRelation(m2.lea, 'membre de', 'Lames Grises').count(), 1);
      await api(m2.antor, 'PATCH', `/api/univers/${m2.U}/fiches/${m2.grises}/sections/${m2.grisesPresentation}`, { joueursLisent: false });
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      const t = await texte(m2.lea);
      assert.ok(!t.includes('Lames Grises'));
      assert.ok(!t.includes('membre de'));
      assert.equal(await m2.lea.getByText(rx('Relations'), { exact: true }).count(), 0);
    });

    test('exclusion : la relation a la visibilité de sa section — portée par « Vérité — MJ seul », Léa ne la voit pas', async () => {
      const m2 = await monde("Lame d'Ébène relations section fermée");
      await relation(m2, m2.verite, m2.grises, 'trahit');
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      const t = await texte(m2.lea);
      assert.ok(!t.includes('trahit'));
      assert.ok(!t.includes('Lames Grises'));
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      assert.equal(await ligneRelation(m2.antor, 'trahit', 'Lames Grises').count(), 1);
    });

    test('P-3 étape 4 : Antor relie la section « Apparence » du PNJ à sa faction par le formulaire ; Léa la voit', async () => {
      const m2 = await monde("Lame d'Ébène relier");
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const bloc = section(m2.antor, 'Apparence');
      await bloc.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await bloc.getByLabel('Type de relation').fill('membre de');
      await bloc.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await bloc.getByLabel(rx('Chercher dans les factions')).fill('Lames');
      await bloc.getByRole('button', { name: rxExact('Chercher') }).click();
      await attendre(m2.antor);
      assert.ok(!(await bloc.innerText()).includes('Cercle des Cendres'), 'la recherche du sélecteur ne filtre pas');
      await bloc.getByText('Lames Grises').first().click();
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await ligneRelation(m2.antor, 'membre de', 'Lames Grises').first().waitFor();
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      assert.equal(await ligneRelation(m2.lea, 'membre de', 'Lames Grises').count(), 1);
      // Retirer, sans confirmation
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      await m2.antor.getByRole('button', { name: 'Retirer la relation membre de → Lames Grises', exact: true }).click();
      await attendre(m2.antor);
      await ligneRelation(m2.antor, 'membre de', 'Lames Grises').first().waitFor({ state: 'detached' });
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      assert.ok(!(await texte(m2.lea)).includes('Lames Grises'));
    });

    test('échec : « Relier » est désactivé tant qu’aucune fiche n’est choisie ; type vide et 81 caractères refusés avec leur texte', async () => {
      const m2 = await monde("Lame d'Ébène relier erreurs");
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const bloc = section(m2.antor, 'Apparence');
      await bloc.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await bloc.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await bloc.getByText('Lames Grises').first().waitFor();
      assert.equal(await bloc.getByRole('button', { name: rxExact('Relier') }).isDisabled(), true);
      await bloc.getByText('Lames Grises').first().click();
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await bloc.getByText('Erreur : le type de relation est obligatoire.').waitFor();
      await bloc.getByLabel('Type de relation').fill('x'.repeat(81));
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await bloc.getByText('Erreur : 80 caractères au plus.').waitFor();
      await bloc.getByLabel('Type de relation').fill('x'.repeat(80));
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await ligneRelation(m2.antor, 'x'.repeat(80), 'Lames Grises').first().waitFor();
    });

    test('échec : relier une fiche à elle-même — « Une fiche ne se relie pas à elle-même. », rien d’écrit', async () => {
      const m2 = await monde("Lame d'Ébène relier soi");
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const bloc = section(m2.antor, 'Apparence');
      await bloc.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await bloc.getByLabel('Type de relation').fill('double de');
      await bloc.getByText('Maître Aldric').first().waitFor();
      await bloc.getByText('Maître Aldric').first().click();
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await bloc.getByText('Une fiche ne se relie pas à elle-même.').waitFor();
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      assert.equal(await ligneRelation(m2.antor, 'double de', 'Maître Aldric').count(), 0);
    });

    test('échec : deux relations de même type vers la même fiche — « Cette relation existe déjà. » ; un autre type passe', async () => {
      const m2 = await monde("Lame d'Ébène relier doublon");
      await relation(m2, m2.apparence, m2.grises, 'membre de');
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const bloc = section(m2.antor, 'Apparence');
      await bloc.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await bloc.getByLabel('Type de relation').fill('membre de');
      await bloc.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await bloc.getByRole('button', { name: /^Lames Grises/ }).click();
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await bloc.getByText('Cette relation existe déjà.').waitFor();
      assert.equal(await bloc.getByLabel('Type de relation').inputValue(), 'membre de', 'saisie perdue');
      await bloc.getByLabel('Type de relation').fill('espionne');
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await ligneRelation(m2.antor, 'espionne', 'Lames Grises').first().waitFor();
    });

    test('bord : une section porte 100 relations au plus — la 101e est refusée : « Cette section porte déjà 100 relations. »', async () => {
      const m2 = await monde("Lame d'Ébène relier cent");
      for (let i = 1; i <= 100; i++) await relation(m2, m2.apparence, m2.grises, `lien ${i}`);
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const bloc = section(m2.antor, 'Apparence');
      await bloc.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await bloc.getByLabel('Type de relation').fill('lien 101');
      await bloc.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await bloc.getByRole('button', { name: /^Lames Grises/ }).click();
      await bloc.getByRole('button', { name: rxExact('Relier') }).click();
      await bloc.getByText('Cette section porte déjà 100 relations.').waitFor();
    });

    test('états du sélecteur : « Aucun objet à relier. » sans objet ; « Impossible de charger les fiches. » puis « Réessayer »', async () => {
      const m2 = await monde("Lame d'Ébène relier sélecteur");
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const bloc = section(m2.antor, 'Apparence');
      await bloc.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
      await bloc.getByLabel('Type de fiche').selectOption({ label: 'Objet' });
      await bloc.getByText('Aucun objet à relier.').waitFor();
      await m2.antor.route(/\/fiches\?.*type=lieu/, (r: Any) => r.abort('failed'));
      await bloc.getByLabel('Type de fiche').selectOption({ label: 'Lieu' });
      await bloc.getByText('Impossible de charger les fiches.').waitFor();
      assert.equal(await bloc.getByRole('button', { name: rxExact('Relier') }).isDisabled(), true);
      await m2.antor.unroute(/\/fiches\?.*type=lieu/);
      await bloc.getByRole('button', { name: rxExact('Réessayer') }).click();
      await bloc.getByText('Aucun lieu à relier.').waitFor();
    });

    test('exclusion : seul un MJ relie et retire — une Joueuse qui écrit la section ne le peut pas par l’API', async () => {
      const m2 = await monde("Lame d'Ébène relier droit");
      const base = `/api/univers/${m2.U}/fiches/${m2.aldric}/sections/${m2.apparence}`;
      await api(m2.antor, 'PATCH', base, { joueursEcrivent: true });
      const r = await m2.lea.request.fetch(srv.base + `${base}/relations`, { method: 'POST', data: { cibleFicheId: m2.grises, type: 'membre de' } });
      assert.ok(r.status() === 403 || r.status() === 404, `POST -> ${r.status()}`);
      assert.deepEqual((await api(m2.antor, 'GET', `${base}/relations`)).relations, []);
      const cree = await relation(m2, m2.apparence, m2.grises, 'membre de');
      const d = await m2.lea.request.fetch(srv.base + `/api/univers/${m2.U}/fiches/relations/${cree.id}`, { method: 'DELETE' });
      assert.ok(d.status() === 403 || d.status() === 404, `DELETE -> ${d.status()}`);
      await ouvrirFiche(m2.lea, m2, m2.aldric);
      assert.equal(await ligneRelation(m2.lea, 'membre de', 'Lames Grises').count(), 1, 'relation retirée par une Joueuse');
    });

    test('exclusion : retirer la section « Apparence » retire ses relations, qui ne remontent pas à la recréation', async () => {
      const m2 = await monde("Lame d'Ébène relier cascade");
      await relation(m2, m2.apparence, m2.grises, 'membre de');
      await api(m2.antor, 'DELETE', `/api/univers/${m2.U}/fiches/${m2.aldric}/sections/${m2.apparence}`);
      const neuve = (await api(m2.antor, 'POST', `/api/univers/${m2.U}/fiches/${m2.aldric}/sections`, { titre: 'Apparence', contenu: 'Autre.' })).id;
      await api(m2.antor, 'PATCH', `/api/univers/${m2.U}/fiches/${m2.aldric}/sections/${neuve}`, { joueursLisent: true });
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const t = await texte(m2.antor);
      assert.ok(!t.includes('membre de'));
      assert.ok(t.includes("Aucune relation pour l'instant."));
      // la fiche cible reste elle-même : la retirer avec une relation n'est pas à faire ici, mais elle existe
      await ouvrirFiche(m2.antor, m2, m2.grises);
    });

    test('états : erreur de chargement « Impossible de charger les relations. » dans le bloc seul, les sections intactes', async () => {
      await m.antor.route(/\/relations$/, (r: Any) => r.abort('failed'));
      await m.antor.goto(`/univers/${m.U}/fiche/${m.aldric}`);
      await m.antor.getByText('Impossible de charger les relations.').first().waitFor();
      const t = await texte(m.antor);
      assert.ok(t.includes('Apparence') && t.includes('Grand, cape grise, regard dur.'));
      await m.antor.unroute(/\/relations$/);
    });

    test('états : connexion perdue — bandeau, « Relier à une fiche » et « Retirer » désactivés, la liste reste', async () => {
      await ouvrirFiche(m.antor, m, m.aldric);
      await m.antor.context().setOffline(true);
      await m.antor.getByText(rx(BANDEAU)).waitFor();
      assert.equal(await m.antor.getByRole('button', { name: 'Retirer la relation membre de → Lames Grises', exact: true }).isDisabled(), true);
      assert.equal(await m.antor.getByRole('button', { name: rxExact('Relier à une fiche') }).first().isDisabled(), true);
      assert.equal(await ligneRelation(m.antor, 'membre de', 'Lames Grises').count(), 1);
      await m.antor.context().setOffline(false);
    });

    test('états : type de 80 caractères et titre de fiche de 120 passent à la ligne sans déborder de l’écran', async () => {
      const m2 = await monde("Lame d'Ébène relier long");
      const long = 'L'.repeat(60) + ' ' + 'o'.repeat(59);
      const cible = (await api(m2.antor, 'POST', `/api/univers/${m2.U}/fiches`, { type: 'faction', titre: long })).id;
      await relation(m2, m2.apparence, cible, 'x'.repeat(40) + ' ' + 'y'.repeat(39));
      await m2.antor.setViewportSize({ width: 800, height: 700 });
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const debordement = await m2.antor.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(debordement, false, 'défilement horizontal de la page');
    });

    test('états : même contenu extrême au téléphone (390 px) — ni défilement horizontal ni jeton hors de la ligne', async () => {
      const m2 = await monde("Lame d'Ébène relier long tel");
      const long = 'L'.repeat(60) + ' ' + 'o'.repeat(59);
      const cible = (await api(m2.antor, 'POST', `/api/univers/${m2.U}/fiches`, { type: 'faction', titre: long })).id;
      await relation(m2, m2.apparence, cible, 'x'.repeat(40) + ' ' + 'y'.repeat(39));
      await m2.antor.setViewportSize({ width: 390, height: 800 });
      await ouvrirFiche(m2.antor, m2, m2.aldric);
      const hors = await m2.antor.evaluate(() => {
        const w = window.innerWidth;
        const sortants = [...document.querySelectorAll('main *, .relations *')].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.right > w + 0.5;
        }).map((e) => e.tagName + '.' + e.className);
        return { scroll: document.documentElement.scrollWidth > w, sortants };
      });
      assert.equal(hors.scroll, false, 'défilement horizontal de la page');
      assert.deepEqual(hors.sortants, [], 'éléments hors écran');
    });
  });
});

async function voit(page: Any, s: string): Promise<void> {
  await page.waitForFunction((x: string) => document.body.innerText.replace(/\s+/g, ' ').replace(/’/g, "'").includes(x), s, { timeout: 6000 });
}
async function absent(page: Any, s: string): Promise<void> {
  await page.waitForFunction((x: string) => !document.body.innerText.replace(/\s+/g, ' ').includes(x), s, { timeout: 6000 });
}

async function page_effacer(page: Any): Promise<void> {
  await page.getByRole('button', { name: rxExact('Effacer la recherche') }).first().click();
  await attendre(page);
}
