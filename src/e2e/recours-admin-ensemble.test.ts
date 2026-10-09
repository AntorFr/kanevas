// Black-box tests of `kanevas-recours-admin` written from the need only (B-6, P-2 step 3, E-5,
// docs/ecrans.md "Détail des écrans de kanevas-recours-admin"), not from the code. Real server in stub
// mode, real Chromium. The expected texts are literals copied from the doc.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  type Any,
  type Server,
  allerMembres,
  attendre,
  connecte,
  creerFiche,
  creerUnivers,
  launch,
  ouvrirUniversDepuisAccueil,
  playwright,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.ts';

const DESC_LAME = 'Une cité marchande rongée par les secrets.';
const LAME = "Lame d'Ébène";

interface Monde {
  s: Server;
  browser: Any;
  antor: Any;
  lea: Any;
  mira: Any;
  teo: Any;
  admin: Any;
  ids: Record<string, number>;
}

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

/** Accounts sign in (so they exist), then the universes are created through the API of the gestures any MJ has. */
async function monde(opts: { univers?: boolean } = {}): Promise<Monde> {
  const s = await startServer();
  const browser = await launch();
  aFermer.push(async () => {
    await browser.close();
    s.stop();
  });
  const antor = await connecte(browser, s.base, 'Antor');
  const lea = await connecte(browser, s.base, 'Léa');
  const mira = await connecte(browser, s.base, 'Mira');
  const teo = await connecte(browser, s.base, 'Teo');
  const admin = await connecte(browser, s.base, 'Admin');
  const ids: Record<string, number> = {};
  if (opts.univers !== false) {
    const cree = async (c: Any, nom: string, description: string) => {
      const r = await c.ctx.request.post('/api/univers', { data: { nom, description } });
      assert.equal(r.status(), 201);
      ids[nom] = (await r.json()).id;
    };
    await cree(antor, LAME, DESC_LAME);
    await cree(mira, 'Les Landes grises', 'Tourbières, brumes et villages isolés.');
    const ajout = await antor.ctx.request.post(`/api/univers/${ids[LAME]}/membres`, { data: { username: 'lea', role: 'joueur' } });
    assert.equal(ajout.status(), 201);
    const ajoutT = await mira.ctx.request.post(`/api/univers/${ids['Les Landes grises']}/membres`, { data: { username: 'teo', role: 'joueur' } });
    assert.equal(ajoutT.status(), 201);
    await ouvrirUniversDepuisAccueil(antor.page, LAME);
    await creerFiche(antor.page, 'personnage', 'Maître Aldric');
  }
  return { s, browser, antor, lea, mira, teo, admin, ids };
}

async function ouvrirAdmin(page: Any, univers?: string): Promise<void> {
  await page.goto('/administration');
  await page.getByRole('heading', { name: 'Administration', level: 1 }).waitFor();
  await attendre(page);
  if (univers) {
    await page.getByRole('link', { name: rx(univers) }).first().click();
    await page.getByRole('heading', { name: `Membres — ${univers}` }).waitFor();
    await attendre(page);
  }
}

async function ajouter(page: Any, identifiant: string, role: 'MJ' | 'Joueur' = 'Joueur'): Promise<void> {
  await page.getByLabel('Identifiant du compte').fill(identifiant);
  await page.getByLabel('Rôle', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: rxExact('Ajouter') }).click();
  await attendre(page);
}

async function voir(page: Any, message: string): Promise<void> {
  await page.getByText(rx(message)).first().waitFor();
}

/** Clicks « Retirer <id> » then confirms in place (docs/ecrans.md E-4: « Retirer <id> » / « Annuler »). */
async function retirer(page: Any, identifiant: string, univers: string): Promise<void> {
  await page.getByRole('button', { name: `Retirer ${identifiant}` }).first().click();
  await voir(page, `Retirer ${identifiant} de ${univers} ?`);
  await page.getByText(`Retirer ${identifiant}`, { exact: true }).click();
  await attendre(page);
}

const ligne = (page: Any, identifiant: string) => page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Retirer ${identifiant}` }) });

describe('kanevas-recours-admin : B-6 / P-2 étape 3 / E-5 (navigateur)', { skip: skipBrowser }, () => {
  // Panne visée : l'admin ne voit pas l'univers ou ses membres, ou voit la description / une fiche.
  it('critère de sortie : Admin voit « 2 membres », antor MJ et lea Joueur, sans description ni fiche', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page);
    const entree = m.admin.page.getByRole('complementary', { name: 'Barre latérale' }).getByRole('link', { name: 'Administration' });
    assert.equal(await entree.count(), 1, "l'entrée Administration de la barre");
    const t0 = await texte(m.admin.page);
    assert.match(t0, /Choisissez un univers pour voir ses membres\./);
    await ouvrirAdmin(m.admin.page, LAME);
    const t = await texte(m.admin.page);
    assert.match(t, /2 membres/);
    assert.match(t, /Sélectionné/);
    await ligne(m.admin.page, 'antor').getByLabel('Rôle de antor').waitFor();
    assert.equal(await ligne(m.admin.page, 'antor').getByLabel('Rôle de antor').inputValue(), 'mj');
    assert.equal(await ligne(m.admin.page, 'lea').getByLabel('Rôle de lea').inputValue(), 'joueur');
    assert.ok(!t.includes('cité marchande'), 'la description ne doit pas apparaître');
    assert.ok(!t.includes('Maître Aldric'), 'aucune fiche ne doit apparaître');
    await m.admin.page.screenshot({ path: '/tmp/recours-admin-e5.png' });
  });

  // Panne visée : l'admin lit le contenu sans être membre, ou son ajout n'apparaît pas chez le MJ.
  it('critère de sortie : ajouter mira MJ ne donne pas de lecture ; s\'ajouter soi-même ouvre l\'univers et antor voit « admin »', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page, LAME);
    await ajouter(m.admin.page, 'mira', 'MJ');
    await ligne(m.admin.page, 'mira').waitFor();
    assert.match(await texte(m.admin.page), /3 membres/);
    const url = `/univers/${m.ids[LAME]}`;
    await m.admin.page.goto(url);
    await attendre(m.admin.page);
    assert.match(await texte(m.admin.page), /Page introuvable\./);
    for (const chemin of [`/api/univers/${m.ids[LAME]}`, `/api/univers/${m.ids[LAME]}/fiches`, `/api/univers/${m.ids[LAME]}/membres`]) {
      const r = await m.admin.ctx.request.get(chemin);
      assert.equal(r.status(), 404, `${chemin} avant l'auto-ajout`);
    }
    await ouvrirAdmin(m.admin.page, LAME);
    await ajouter(m.admin.page, 'admin', 'MJ');
    await ligne(m.admin.page, 'admin').waitFor();
    await m.admin.page.goto(url);
    await attendre(m.admin.page);
    const t = await texte(m.admin.page);
    assert.ok(!/Page introuvable\./.test(t), "la vue d'ensemble doit s'ouvrir une fois membre");
    assert.equal((await m.admin.ctx.request.get(`/api/univers/${m.ids[LAME]}`)).status(), 200);
    // Antor, sur E-4
    await ouvrirUniversDepuisAccueil(m.antor.page, LAME);
    await allerMembres(m.antor.page);
    assert.ok(await m.antor.page.getByText('admin', { exact: true }).first().isVisible(), 'antor voit admin dans les membres');
    assert.match(await texte(m.antor.page), /\badmin\b/);
  });

  // Panne visée : le tri sensible à la casse, le singulier, la pagination par cent.
  it('liste : par nom sans casse, « 1 membre » au singulier, cent à la fois puis « Charger la suite »', async () => {
    const m = await monde();
    for (const nom of ['alpha', 'Brume']) {
      const r = await m.antor.ctx.request.post('/api/univers', { data: { nom, description: '' } });
      assert.equal(r.status(), 201);
    }
    await ouvrirAdmin(m.admin.page);
    const noms: string[] = await m.admin.page.locator('ul.liste-instance a.choix .nom').allInnerTexts();
    assert.deepEqual(noms, ['alpha', 'Brume', LAME, 'Les Landes grises']);
    const t = await texte(m.admin.page);
    assert.match(t, /alpha\s+1 membre\n/);
    assert.match(t, /Les Landes grises\s+2 membres/);
    assert.ok(!/1 membres/.test(t));
    // 101 univers au total pour passer la frontière des cent
    for (let i = 0; i < 97; i++) {
      const r = await m.antor.ctx.request.post('/api/univers', { data: { nom: `Zone ${String(i).padStart(3, '0')}`, description: '' } });
      assert.equal(r.status(), 201);
    }
    await ouvrirAdmin(m.admin.page);
    assert.equal(await m.admin.page.locator('ul.liste-instance a.choix').count(), 100);
    const suite = m.admin.page.getByRole('button', { name: 'Charger la suite' });
    assert.equal(await suite.count(), 1);
    await suite.click();
    await attendre(m.admin.page);
    assert.equal(await m.admin.page.locator('ul.liste-instance a.choix').count(), 101);
    assert.equal(await m.admin.page.getByRole('button', { name: 'Charger la suite' }).count(), 0);
  });

  // Panne visée : les refus de membres ne sont pas ceux d'E-4 ou la liste bouge.
  it('refus : nadia jamais connectée, déjà membre, dernier MJ (retirer et rétrograder) ; la liste reste', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page, 'Les Landes grises');
    await ajouter(m.admin.page, 'nadia');
    await voir(m.admin.page, "Ce compte ne s'est jamais connecté.");
    await ajouter(m.admin.page, 'teo');
    await voir(m.admin.page, 'Ce compte est déjà membre.');
    await retirer(m.admin.page, 'mira', 'Les Landes grises');
    await voir(m.admin.page, "Impossible : l'univers doit garder au moins un MJ.");
    await ouvrirAdmin(m.admin.page, 'Les Landes grises');
    await ligne(m.admin.page, 'mira').getByLabel('Rôle de mira').selectOption({ label: 'Joueur' });
    await voir(m.admin.page, "Impossible : l'univers doit garder au moins un MJ.");
    await ouvrirAdmin(m.admin.page, 'Les Landes grises');
    assert.equal(await ligne(m.admin.page, 'mira').getByLabel('Rôle de mira').inputValue(), 'mj');
    assert.equal(await m.admin.page.getByRole('button', { name: /^Retirer / }).count(), 2);
    assert.equal(await ligne(m.admin.page, 'nadia').count(), 0);
  });

  // Panne visée : changer un rôle ou retirer ne marche pas pour l'admin.
  it('gestes : changer un rôle puis retirer un membre, la confirmation est demandée', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page, LAME);
    await ligne(m.admin.page, 'lea').getByLabel('Rôle de lea').selectOption({ label: 'MJ' });
    await attendre(m.admin.page);
    await ouvrirAdmin(m.admin.page, LAME);
    assert.equal(await ligne(m.admin.page, 'lea').getByLabel('Rôle de lea').inputValue(), 'mj');
    await m.admin.page.getByRole('button', { name: 'Retirer lea' }).first().click();
    await voir(m.admin.page, `Retirer lea de ${LAME} ?`);
    // annuler ne retire pas
    await m.admin.page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await attendre(m.admin.page);
    assert.equal(await m.admin.page.getByText(rx(`Retirer lea de ${LAME} ?`)).count(), 0);
    assert.equal(await ligne(m.admin.page, 'lea').count(), 1);
    await retirer(m.admin.page, 'lea', LAME);
    await ligne(m.admin.page, 'lea').waitFor({ state: 'detached' });
    assert.equal(await ligne(m.admin.page, 'lea').count(), 0);
    assert.match(await texte(m.admin.page), /1 membre\b/);
  });

  // Panne visée : « Ouvrir » absent / présent à tort ; l'admin membre qui se retire reste sur E-5.
  it("admin membre de « Brume » : lien « Ouvrir » sur Brume seulement ; seul MJ il ne peut se retirer ; avec un 2e MJ il se retire et le lien disparaît", async () => {
    const m = await monde();
    await creerUnivers(m.admin.page, 'Brume');
    await ouvrirAdmin(m.admin.page);
    const lienOuvrir = (nom: string) => m.admin.page.getByRole('listitem').filter({ hasText: nom }).getByRole('link', { name: /^Ouvrir/ });
    assert.equal(await lienOuvrir('Brume').count(), 1);
    assert.equal(await lienOuvrir(LAME).count(), 0);
    await ouvrirAdmin(m.admin.page, 'Brume');
    await retirer(m.admin.page, 'admin', 'Brume');
    await voir(m.admin.page, "Impossible : l'univers doit garder au moins un MJ.");
    assert.equal(await lienOuvrir('Brume').count(), 1, 'le lien reste après le refus');
    await ajouter(m.admin.page, 'mira', 'MJ');
    await ligne(m.admin.page, 'mira').waitFor();
    await retirer(m.admin.page, 'admin', 'Brume');
    await ligne(m.admin.page, 'mira').waitFor();
    assert.match(m.admin.page.url(), /\/administration\/univers\/\d+$/);
    await ligne(m.admin.page, 'admin').waitFor({ state: 'detached' });
    assert.equal(await ligne(m.admin.page, 'admin').count(), 0);
    assert.equal(await ligne(m.admin.page, 'mira').count(), 1);
    assert.equal(await lienOuvrir('Brume').count(), 0, 'plus de lien sans rôle');
    await m.admin.page.goto('/');
    await attendre(m.admin.page);
    assert.equal(await m.admin.page.getByRole('link', { name: rx('Brume') }).count(), 0, 'Brume quitte l\'accueil');
  });

  // Panne visée : « Ouvrir » ne mène pas à la vue d'ensemble ; entrée Instance dans un univers.
  it("admin membre : « Ouvrir » mène à la vue d'ensemble et la section « Instance » garde « Administration »", async () => {
    const m = await monde();
    await creerUnivers(m.admin.page, 'Brume');
    await ouvrirAdmin(m.admin.page);
    await m.admin.page.getByRole('listitem').filter({ hasText: 'Brume' }).getByRole('link', { name: /^Ouvrir/ }).click();
    await attendre(m.admin.page);
    assert.match(m.admin.page.url(), /\/univers\/\d+/);
    assert.ok(!/Page introuvable/.test(await texte(m.admin.page)));
    const barre = m.admin.page.getByRole('complementary', { name: 'Barre latérale' });
    await barre.getByRole('link', { name: 'Personnages' }).waitFor();
    assert.equal(await barre.getByRole('link', { name: 'Administration' }).count(), 1);
    assert.match(await barre.innerText(), /Instance/);
  });

  // Panne visée : un autre compte accède à E-5 ou voit l'entrée.
  for (const [nom, cle] of [['Léa (Joueuse)', 'lea'], ['Antor (MJ)', 'antor'], ['Teo (Joueur)', 'teo']] as const) {
    it(`exclusion : ${nom} ouvre /administration → « Page introuvable. », sans entrée « Administration »`, async () => {
      const m = await monde();
      const page = (m as Any)[cle].page;
      await page.goto('/administration');
      await attendre(page);
      const t = await texte(page);
      assert.match(t, /Page introuvable\./);
      await page.goto('/administration/univers/1');
      await attendre(page);
      assert.match(await texte(page), /Page introuvable\./);
      await page.goto('/');
      await attendre(page);
      assert.equal(await page.getByRole('link', { name: 'Administration' }).count(), 0);
      assert.ok(!/Administration/.test(await texte(page)));
    });
  }

  // Panne visée : un univers inexistant est traité autrement qu'une adresse inconnue.
  it('admin : un univers inexistant dans /administration/univers/:id → « Page introuvable. »', async () => {
    const m = await monde();
    await m.admin.page.goto('/administration/univers/9999');
    await attendre(m.admin.page);
    assert.match(await texte(m.admin.page), /Page introuvable\./);
  });

  // Panne visée : « Aucun univers » absent.
  it("instance sans univers : « Aucun univers sur l'instance pour l'instant. »", async () => {
    const m = await monde({ univers: false });
    await ouvrirAdmin(m.admin.page);
    assert.match(await texte(m.admin.page), /Aucun univers sur l'instance pour l'instant\./);
  });

  // Panne visée : états erreur / chargement / hors-ligne manquants.
  it('états : chargement, erreur avec « Réessayer », connexion perdue désactive les écritures', async () => {
    const m = await monde();
    const p = m.admin.page;
    // chargement
    let libere: () => void = () => {};
    const retenu = new Promise<void>((r) => (libere = r));
    await p.route('**/api/instance/univers', async (route: Any) => {
      if (route.request().url().endsWith('/api/instance/univers')) await retenu;
      await route.continue();
    });
    await p.goto('/administration');
    await p.getByText('Chargement des univers…').waitFor();
    libere();
    await p.getByRole('link', { name: rx(LAME) }).waitFor();
    await p.unroute('**/api/instance/univers');
    // erreur de la liste des univers
    await p.route('**/api/instance/univers', (route: Any) => route.abort());
    await p.goto('/administration');
    await p.getByText('Impossible de charger les univers.').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Réessayer' }).count(), 1);
    await p.unroute('**/api/instance/univers');
    await p.getByRole('button', { name: 'Réessayer' }).click();
    await p.getByRole('link', { name: rx(LAME) }).waitFor();
    // erreur des membres
    await p.route('**/api/instance/univers/*/membres', (route: Any) => route.abort());
    await p.getByRole('link', { name: rx(LAME) }).click();
    await p.getByText('Impossible de charger les membres.').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Réessayer' }).count(), 1);
    await p.unroute('**/api/instance/univers/*/membres');
    await p.getByRole('button', { name: 'Réessayer' }).click();
    await ligne(p, 'antor').waitFor();
    // connexion perdue : listes chargées restent, écritures désactivées
    await m.admin.ctx.setOffline(true);
    await p.getByText(/connexion/i).first().waitFor();
    assert.equal(await p.getByRole('button', { name: rxExact('Ajouter') }).isDisabled(), true);
    assert.equal(await p.getByRole('button', { name: 'Retirer lea' }).isDisabled(), true);
    assert.equal(await ligne(p, 'lea').count(), 1, 'la liste chargée reste');
    await m.admin.ctx.setOffline(false);
  });

  // Panne visée : une écriture échouée sans message.
  it("écriture échouée : « L'action n'a pas abouti. Réessayez. » au-dessus de la liste", async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p, LAME);
    await p.route('**/api/instance/univers/*/membres', (route: Any) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await ajouter(p, 'teo');
    await voir(p, "L'action n'a pas abouti. Réessayez.");
    assert.equal(await ligne(p, 'teo').count(), 0);
  });

  // Panne visée : noms longs non tronqués, infobulle absente.
  it('contenu long : un nom de 80 caractères est tronqué avec infobulle', async () => {
    const m = await monde();
    const long = 'N'.repeat(40) + ' ' + 'o'.repeat(39);
    assert.equal(long.length, 80);
    const r = await m.antor.ctx.request.post('/api/univers', { data: { nom: long, description: '' } });
    assert.equal(r.status(), 201);
    await ouvrirAdmin(m.admin.page);
    const lien = m.admin.page.locator('ul.liste-instance a.choix', { hasText: long });
    assert.equal(await lien.getAttribute('title'), long);
    const nom = lien.locator('.nom');
    assert.ok((await nom.evaluate((e: Any) => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis')), 'tronqué par …');
  });

  // Panne visée : sur téléphone la liste des membres n'est pas atteignable.
  it('téléphone (390 px) : après un clic sur l\'univers, ses membres s\'affichent', async () => {
    const m = await monde();
    const ctx = await m.browser.newContext({ baseURL: m.s.base, viewport: { width: 390, height: 800 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    await p.goto('/connexion-bouchon');
    await p.getByRole('button', { name: /^Se connecter en tant que Admin$/ }).click();
    await attendre(p);
    await ouvrirAdmin(p, LAME);
    assert.ok(await ligne(p, 'lea').isVisible());
    await p.screenshot({ path: '/tmp/recours-admin-e5-mobile.png' });
  });
});

describe('kanevas-recours-admin : routes /api/instance (sans écran)', { skip: skipBrowser }, () => {
  // Panne visée : une route d'instance ouverte sans session ou à un non-admin.
  it('sans session 401 ; Léa, Antor, Teo : 404 de corps identique à une adresse inconnue', async () => {
    const m = await monde();
    const anon = await m.browser.newContext({ baseURL: m.s.base });
    for (const chemin of ['/api/instance/univers', `/api/instance/univers/${m.ids[LAME]}/membres`]) {
      assert.equal((await anon.request.get(chemin)).status(), 401, chemin);
    }
    const inconnu = await m.lea.ctx.request.get('/api/instance/rien-du-tout');
    assert.equal(inconnu.status(), 404);
    const corpsInconnu = await inconnu.text();
    for (const cle of ['lea', 'antor', 'teo'] as const) {
      const c = (m as Any)[cle].ctx;
      for (const [methode, chemin, data] of [
        ['get', '/api/instance/univers', undefined],
        ['get', `/api/instance/univers/${m.ids[LAME]}/membres`, undefined],
        ['post', `/api/instance/univers/${m.ids[LAME]}/membres`, { username: cle, role: 'mj' }],
        ['delete', `/api/instance/univers/${m.ids['Les Landes grises']}/membres/1`, undefined],
      ] as const) {
        const r = await c.request[methode](chemin, data ? { data } : undefined);
        assert.equal(r.status(), 404, `${cle} ${methode} ${chemin}`);
        assert.equal(await r.text(), corpsInconnu, `${cle} ${methode} ${chemin} : corps identique`);
      }
    }
    // Teo (Joueur des Landes) n'a rien gagné
    const rm = await m.mira.ctx.request.get(`/api/univers/${m.ids['Les Landes grises']}/membres`);
    assert.equal((await rm.json()).length, 2);
  });

  // Panne visée : une réponse d'instance qui porte description ou contenu.
  it("GET /api/instance/univers ne rend que identifiant, nom et nombre de membres ; membres : identifiant et rôle", async () => {
    const m = await monde();
    const r = await m.admin.ctx.request.get('/api/instance/univers');
    assert.equal(r.status(), 200);
    const corps = await r.text();
    assert.ok(!corps.includes('cité marchande') && !corps.includes('Tourbières') && !/description/i.test(corps));
    const liste = JSON.parse(corps) as Array<Record<string, unknown>>;
    assert.equal(liste.length, 2);
    for (const u of liste) assert.equal(Object.keys(u).length, 3, `trois champs : ${Object.keys(u)}`);
    assert.deepEqual(liste.map((u) => u.nom), [LAME, 'Les Landes grises']);
    const rm = await m.admin.ctx.request.get(`/api/instance/univers/${m.ids[LAME]}/membres`);
    assert.equal(rm.status(), 200);
    const mt = await rm.text();
    assert.ok(!mt.includes('cité marchande') && !mt.includes('Maître Aldric'));
    const membres = JSON.parse(mt) as Array<Record<string, unknown>>;
    assert.equal(membres.length, 2);
    assert.ok(membres.some((x) => JSON.stringify(x).includes('antor') && JSON.stringify(x).includes('mj')));
    assert.ok(membres.some((x) => JSON.stringify(x).includes('lea') && JSON.stringify(x).includes('joueur')));
  });

  // Panne visée : l'admin sans rôle lit du contenu par une autre route.
  it("Admin sans rôle : aucune route de contenu de « Lame d'Ébène » ne répond autrement que 404", async () => {
    const m = await monde();
    const id = m.ids[LAME];
    for (const chemin of [`/api/univers/${id}`, `/api/univers/${id}/fiches`, `/api/univers/${id}/fiches/1`, `/api/univers/${id}/membres`, `/api/univers/${id}/campagnes`]) {
      const r = await m.admin.ctx.request.get(chemin);
      assert.equal(r.status(), 404, chemin);
      assert.ok(!(await r.text()).includes('Maître Aldric'), chemin);
    }
    const univers = await (await m.admin.ctx.request.get('/api/univers')).json();
    assert.deepEqual(univers, [], "l'admin sans rôle n'a aucun univers dans sa propre liste");
  });
});
