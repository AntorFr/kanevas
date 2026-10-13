// Independent verification of kanevas-cartes-graphes, written from the need only (docs/parcours.md B-12
// (carte), B-22, B-23, B-29 ; P-3 step 6, P-6 step 3, P-9 ; docs/ecrans.md « Détail des écrans de
// kanevas-cartes-graphes »). It complements cartes-graphes-besoin.test.ts (which it does not touch):
// the cases below are the ones that file leaves open — the search of the « Ajouter une fiche » window,
// the sidebar entry, an unknown map versus a hidden one, the instance admin on a map, the type written
// on a graph arrow, long titles on graph nodes, a rename seen by the players.
// Real server in stub mode + real Chromium (harnais.test.ts). Expected values are literals from the docs.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, texte as texteBrut, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/kanevas-captures';
mkdirSync(CAPTURES, { recursive: true });

let srv: Server;
let browser: Any;

const texte = async (page: Any): Promise<string> => (await texteBrut(page)).replace(/\s+/g, ' ');
async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
  return r.status() === 204 ? null : r.json().catch(() => null);
}
const reponse = async (page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; corps: string }> => {
  const r = await page.request.fetch(srv.base + url, { method, data });
  return { status: r.status(), corps: await r.text() };
};
const capture = (page: Any, nom: string) => page.screenshot({ path: `${CAPTURES}/verif-${nom}.png`, fullPage: true });

interface Monde {
  U: number;
  antor: Any;
  lea: Any;
  teo: Any;
  admin: Any;
  aldric: number;
  ombres: number;
  lames: number;
  guilde: number;
}

async function monde(nom: string): Promise<Monde> {
  const antor = (await connecte(browser, srv.base, 'Antor')).page;
  const lea = (await connecte(browser, srv.base, 'Léa')).page;
  const teo = (await connecte(browser, srv.base, 'Teo')).page;
  const admin = (await connecte(browser, srv.base, 'Admin')).page;
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
  await sec(aldric, 'Apparence', 'Grand, cape grise.', true);
  const ombres = (await fiche('faction', 'Les Ombres de Fer')).id;
  await sec(ombres, 'Secret', 'Ils brûlent les archives.', false);
  const lames = (await fiche('faction', 'Les Lames Grises')).id;
  await sec(lames, 'Présentation', 'Coursiers.', true);
  const rivalites = await sec(lames, 'Rivalités', 'Contre la Guilde.', true);
  const guilde = (await fiche('faction', 'La Guilde')).id;
  await sec(guilde, 'Présentation', 'Marchands.', true);
  await api(antor, 'POST', `/api/univers/${U}/fiches/${lames}/sections/${rivalites}/relations`, { cibleFicheId: guilde, type: 'rival de' });
  return { U, antor, lea, teo, admin, aldric, ombres, lames, guilde };
}
const urlCartes = (m: Monde) => `/api/univers/${m.U}/cartes`;
async function carte(m: Monde, forme: 'illustree' | 'graphe', titre: string, visible: boolean): Promise<number> {
  const c = await api(m.antor, 'POST', urlCartes(m), { titre, forme });
  if (visible) await api(m.antor, 'PATCH', `${urlCartes(m)}/${c.id}`, { visible: true });
  return c.id as number;
}
async function ouvrir(page: Any, m: Monde, id: number): Promise<void> {
  await page.goto(`/univers/${m.U}/cartes/${id}`);
  await page.getByRole('heading', { level: 1 }).or(page.getByText(rx('Page introuvable.'))).first().waitFor();
  await attendre(page);
  await page.waitForTimeout(200);
}

describe('kanevas-cartes-graphes, vérification indépendante', { skip: skipBrowser }, () => {
  before(async () => {
    srv = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  describe('E-11 fenêtre « Ajouter une fiche » : la recherche', () => {
    let m: Monde;
    let c = 0;
    before(async () => {
      m = await monde('Verif fenêtre');
      c = await carte(m, 'illustree', 'La ville de Brume', false);
    });
    const ouvrirFenetre = async () => {
      await ouvrir(m.antor, m, c);
      await m.antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
      const f = m.antor.getByRole('dialog', { name: rx('Ajouter une fiche') });
      await f.getByLabel('Type de fiche').selectOption({ label: 'Faction' });
      await f.getByText(rx('Les Ombres de Fer')).waitFor();
      return f;
    };

    // Si Entrée ne lance pas la recherche, la liste garde les trois factions.
    test('nominal : Entrée lance la recherche « Guilde » et retire les factions qui ne correspondent pas', async () => {
      const f = await ouvrirFenetre();
      const champ = f.getByRole('textbox', { name: rx('Chercher une fiche') });
      await champ.fill('Guilde');
      await champ.press('Enter');
      await attendre(m.antor);
      await f.getByText(rx('Les Ombres de Fer')).waitFor({ state: 'detached' });
      await f.getByText(rx('La Guilde')).first().waitFor();
    });

    // Si la limite de 100 caractères n'est pas tenue : 100 passent, 101 disent « 100 caractères au plus. ».
    test('bords : 100 caractères sont acceptés, 101 disent « 100 caractères au plus. »', async () => {
      const f = await ouvrirFenetre();
      const champ = f.getByRole('textbox', { name: rx('Chercher une fiche') });
      await champ.fill('a'.repeat(100));
      await champ.press('Enter');
      await attendre(m.antor);
      assert.ok(!(await texte(m.antor)).includes('100 caractères au plus.'));
      await champ.fill('a'.repeat(101));
      await champ.press('Enter');
      await attendre(m.antor);
      await f.getByText(rx('100 caractères au plus.')).waitFor();
      await capture(m.antor, 'recherche-101');
    });

    // Si la fenêtre propose autre chose que les sept types du produit.
    test('bord : le choix de type propose les sept types', async () => {
      const f = await ouvrirFenetre();
      const options = (await f.getByLabel('Type de fiche').locator('option').allInnerTexts()) as string[];
      assert.equal(options.length, 7);
    });

    // Si « Fermer » ne ferme pas, ou si ajouter ferme la fenêtre sans que le token soit posé.
    test('nominal : « Ajouter » pose la fiche, la ligne porte alors « Déjà sur la carte » sans bouton', async () => {
      const f = await ouvrirFenetre();
      const ligne = f.getByRole('listitem').filter({ hasText: rx('La Guilde') });
      await ligne.getByRole('button', { name: rxExact('Ajouter') }).click();
      await ligne.getByText(rx('Déjà sur la carte')).waitFor();
      assert.equal(await ligne.getByRole('button', { name: rxExact('Ajouter') }).count(), 0);
      await f.getByRole('button', { name: rxExact('Fermer') }).click();
      await f.waitFor({ state: 'detached' });
    });
  });

  describe('refus : carte inconnue, carte cachée, compte sans rôle, Admin d\'instance', () => {
    let m: Monde;
    let cachee = 0;
    before(async () => {
      m = await monde('Verif refus');
      cachee = await carte(m, 'illustree', 'Le donjon secret', false);
    });

    // Si une carte cachée répond autrement qu'une carte inconnue, Léa apprend qu'elle existe.
    test('exclusion : pour Léa, la carte cachée et une carte inconnue répondent pareil, à l\'écran comme à l\'API', async () => {
      const cachee404 = await reponse(m.lea, 'GET', `${urlCartes(m)}/${cachee}`);
      const inconnue404 = await reponse(m.lea, 'GET', `${urlCartes(m)}/987654`);
      assert.equal(cachee404.status, 404);
      assert.equal(inconnue404.status, 404);
      assert.equal(cachee404.corps, inconnue404.corps);
      assert.ok(!cachee404.corps.includes('donjon'));
      await ouvrir(m.lea, m, cachee);
      const t1 = await texte(m.lea);
      await ouvrir(m.lea, m, 987654);
      const t2 = await texte(m.lea);
      assert.ok(t1.includes('Page introuvable.'));
      assert.ok(t1.includes('Mes univers'));
      assert.equal(t1, t2);
      assert.ok(!t1.includes('donjon'));
    });

    // Si l'Admin d'instance, sans rôle dans l'univers, lit la carte, le refus est troué.
    test('exclusion : l\'Admin d\'instance lit « Page introuvable. » sur une carte visible, et l\'API répond 404', async () => {
      const visible = await carte(m, 'graphe', 'Les factions', true);
      await ouvrir(m.admin, m, visible);
      const t = await texte(m.admin);
      assert.ok(t.includes('Page introuvable.'));
      assert.ok(!t.includes('Les factions'));
      assert.equal((await reponse(m.admin, 'GET', `${urlCartes(m)}/${visible}`)).status, 404);
      assert.equal((await reponse(m.admin, 'GET', urlCartes(m))).status, 404);
      assert.equal((await reponse(m.teo, 'GET', `${urlCartes(m)}/${visible}`)).status, 404);
    });

    // Si le refus de la liste laisse voir une carte, ou si l'Admin voit la liste.
    test('exclusion : l\'Admin d\'instance lit « Page introuvable. » sur la liste des cartes', async () => {
      await m.admin.goto(`/univers/${m.U}/cartes`);
      await attendre(m.admin);
      await m.admin.getByText(rx('Page introuvable.')).waitFor();
      assert.ok(!(await texte(m.admin)).includes('Nouvelle carte'));
    });
  });

  describe('barre latérale et renommage', () => {
    let m: Monde;
    let c = 0;
    before(async () => {
      m = await monde('Verif barre');
      c = await carte(m, 'graphe', 'Les factions', true);
    });

    // Si l'item « Cartes » n'apparaît pas avec la tranche, il n'y a pas d'entrée vers E-10.
    test('nominal : Léa et Antor atteignent la liste des cartes par l\'item « Cartes » de la barre', async () => {
      for (const page of [m.lea, m.antor]) {
        await page.goto(`/univers/${m.U}`);
        await attendre(page);
        await page.getByRole('link', { name: rxExact('Cartes') }).first().click();
        await page.getByRole('heading', { name: 'Cartes', level: 1 }).waitFor();
        await attendre(page);
        assert.ok((await texte(page)).includes('Les factions'));
        assert.ok((await texte(page)).includes('Graphe'));
      }
    });

    // Si le sous-titre MJ est montré aux joueurs, ou manque au MJ.
    test('exclusion : le sous-titre de E-10 n\'est lu que du MJ', async () => {
      const phrase = 'Les cartes de l\'univers. Les joueurs ne voient que celles que vous rendez visibles.';
      await m.antor.goto(`/univers/${m.U}/cartes`);
      await attendre(m.antor);
      assert.ok((await texte(m.antor)).includes(phrase));
      await m.lea.goto(`/univers/${m.U}/cartes`);
      await attendre(m.lea);
      assert.ok(!(await texte(m.lea)).includes('rendez visibles'));
    });

    // Si le renommage ne s'enregistre pas ou n'atteint pas les joueurs.
    test('nominal : Antor renomme le graphe ; Léa le lit sous son nouveau titre au rechargement', async () => {
      await ouvrir(m.antor, m, c);
      await m.antor.getByRole('button', { name: rxExact('Renommer') }).click();
      const champ = m.antor.getByRole('textbox').first();
      await champ.fill('Les grandes factions');
      await m.antor.getByRole('button', { name: rxExact('Enregistrer') }).click();
      await m.antor.getByRole('heading', { name: 'Les grandes factions', level: 1 }).waitFor();
      await ouvrir(m.lea, m, c);
      await m.lea.getByRole('heading', { name: 'Les grandes factions', level: 1 }).waitFor();
    });

    // Si Léa peut renommer, rendre visible ou cacher par l'API.
    test('exclusion : Léa reçoit 403 sur renommer et sur cacher une carte qu\'elle lit', async () => {
      assert.equal((await reponse(m.lea, 'PATCH', `${urlCartes(m)}/${c}`, { titre: 'Pirate' })).status, 403);
      assert.equal((await reponse(m.lea, 'PATCH', `${urlCartes(m)}/${c}`, { visible: false })).status, 403);
      await ouvrir(m.antor, m, c);
      assert.ok(!(await texte(m.antor)).includes('Pirate'));
      assert.ok((await texte(m.antor)).includes('Visible des joueurs'));
    });
  });

  describe('P-9 graphe : cadre', () => {
    let m: Monde;
    let g = 0;
    before(async () => {
      m = await monde('Verif graphe');
      g = await carte(m, 'graphe', 'Les factions', true);
      await api(m.antor, 'POST', `${urlCartes(m)}/${g}/elements`, { ficheId: m.lames });
      await api(m.antor, 'POST', `${urlCartes(m)}/${g}/elements`, { ficheId: m.guilde });
      await api(m.antor, 'POST', `${urlCartes(m)}/${g}/elements`, { ficheId: m.ombres });
    });

    // Si le type de la relation n'est écrit que dans la liste « Liens » et pas sur la flèche du schéma.
    test('nominal : « rival de » est écrit sur la flèche du cadre, pour Léa comme pour Antor', async () => {
      for (const page of [m.lea, m.antor]) {
        await ouvrir(page, m, g);
        assert.equal(await page.getByText('rival de', { exact: true }).count(), 1);
      }
      await capture(m.lea, 'graphe-fleche');
    });

    // Si un nœud caché laisse un trou, un compteur ou une trace dans la page de Léa.
    test('exclusion : Léa ne lit ni le titre, ni « 3 », ni « masqué » à la place du nœud caché', async () => {
      await ouvrir(m.lea, m, g);
      const t = await texte(m.lea);
      assert.ok(!t.includes('Ombres'));
      assert.deepEqual(await m.lea.getByRole('region', { name: rx('Sur la carte') }).getByRole('listitem').count(), 2);
      assert.ok(!/masqu|cach|invisible|restreint/i.test(t.replace('Sur la carte', '')));
    });

    // Si le titre de 80 caractères n'est pas coupé à 24 sur le nœud, le schéma déborde.
    test('contenu long : une fiche au titre de 80 caractères est coupée à 24 puis « … » sur son nœud, entière dans la liste', async () => {
      const long = 'Le Très Vénérable Ordre des Gardiens du Seuil Oublié de la Marche Septentrionale';
      assert.equal(long.length, 80);
      const f = await api(m.antor, 'POST', `/api/univers/${m.U}/fiches`, { type: 'faction', titre: long });
      const s = await api(m.antor, 'POST', `/api/univers/${m.U}/fiches/${f.id}/sections`, { titre: 'Présentation', contenu: 'x' });
      await api(m.antor, 'PATCH', `/api/univers/${m.U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
      await api(m.antor, 'POST', `${urlCartes(m)}/${g}/elements`, { ficheId: f.id });
      await ouvrir(m.lea, m, g);
      const entier = await m.lea.getByRole('region', { name: rx('Sur la carte') }).getByText(long).count();
      assert.equal(entier, 1);
      assert.equal(await m.lea.getByText(/^Le Très Vénérable Ordre ?…$/).count(), 1);
      const largeur = await m.lea.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(largeur <= 0, true);
      await capture(m.lea, 'graphe-titre-long');
    });
  });
});
