// Feature-level tests of kanevas-illustrations (complement of illustrations-systemes-besoin.test.ts), written from
// the need (docs/parcours.md B-30, B-31, B-29, B-13, B-14; docs/ecrans.md « Détail des écrans de
// `kanevas-illustrations` »), not from the code. Real server in stub mode WITH its starting world, real Chromium.
// Expected values are literals taken from the doc. Two servers: A (illustrations and read-only screens),
// B (tests that change the world: roles, detaching, new universes).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, rx, startServer, texte, type Server } from './harnais.test.js';

const opts = { skip: undefined as string | false | undefined, timeout: 90000 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function api(page: Any, method: string, url: string, base: string, multipart?: { nom: string; buf: Buffer; mime: string }, data?: unknown) {
  const r = await page.request.fetch(base + url, multipart ? { method, multipart: { fichier: { name: multipart.nom, mimeType: multipart.mime, buffer: multipart.buf } } } : data !== undefined ? { method, data } : { method });
  return { statut: r.status() as number, corps: (await r.text()) as string };
}
const carte = (page: Any, titre: string) => page.getByRole('link', { name: rx(titre) }).first();
async function aller(page: Any, url: string, titre?: string | RegExp) {
  await page.goto(url);
  await page.getByRole('heading', { level: 1, ...(titre ? { name: titre } : {}) }).waitFor();
  await attendre(page);
}
async function grille(page: Any, U: number, type: string, q?: string) {
  await aller(page, `/univers/${U}/fiches/${type}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}
const geste = (page: Any, nom: string) => page.getByRole('button', { name: rx(nom) });

interface Monde {
  srv: Server;
  browser: Any;
  U: number;
  fiches: Record<string, number>;
  comptes: Record<string, Any>;
  get: (compte: string, url: string) => Promise<{ statut: number; corps: string }>;
}
async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  const browser = await launch();
  const comptes: Record<string, Any> = {};
  for (const c of ['Antor', 'Léa', 'Teo', 'Mira', 'Admin']) comptes[c] = (await connecte(browser, srv.base, c)).page;
  const get = (compte: string, url: string) => api(comptes[compte], 'GET', url, srv.base);
  const univers = JSON.parse((await get('Antor', '/api/univers')).corps);
  const U = (univers.univers ?? univers).find((u: Any) => u.nom === "Lame d'Ébène").id as number;
  const fiches: Record<string, number> = {};
  for (const type of ['personnage', 'lieu', 'faction']) {
    const l = JSON.parse((await get('Antor', `/api/univers/${U}/fiches?type=${type}`)).corps);
    for (const f of l.fiches ?? l) fiches[f.titre] = f.id;
  }
  return { srv, browser, U, fiches, comptes, get };
}

describe('kanevas-illustrations (A) : illustrations, états et écrans en lecture', { timeout: 600000 }, () => {
  let m: Monde;
  before(async () => {
    m = await monde();
  }, { timeout: 180000 });
  after(async () => {
    await m?.browser?.close();
    m?.srv?.stop();
  });

  test('B-30 échec UI : un fichier vide dit « est vide. », « Ignorer » efface le message, l’illustration d’avant reste', opts, async () => {
    const antor = m.comptes.Antor;
    await aller(antor, `/univers/${m.U}/fiche/${m.fiches['Suie']}`, 'Suie');
    await antor.locator('input[type=file]').first().setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    await antor.getByText(rx('« portrait.png » est vide.')).first().waitFor();
    assert.equal(await antor.getByRole('img', { name: rx('Illustration de « Suie »') }).count(), 1);
    await antor.getByRole('button', { name: 'Ignorer' }).click();
    assert.equal(await antor.getByText(rx('« portrait.png » est vide.')).count(), 0);
  });

  test('B-30 échec UI : un retrait qui échoue dit « L’action n’a pas abouti. Réessayez. », l’illustration reste partout', opts, async () => {
    const antor = m.comptes.Antor;
    const id = m.fiches["Le Portrait de l'échec"];
    assert.ok(id, 'fiche du monde de départ');
    await aller(antor, `/univers/${m.U}/fiche/${id}`);
    await attendre(antor);
    await geste(antor, 'Retirer l’illustration').first().click();
    await antor.getByText(/L.image sera perdue\./).waitFor();
    await antor.getByRole('button', { name: /^Retirer l.illustration$/ }).last().click();
    await antor.getByText(rx('L’action n’a pas abouti. Réessayez.')).first().waitFor();
    await antor.getByRole('button', { name: 'Réessayer' }).waitFor();
    await antor.getByRole('button', { name: 'Ignorer' }).waitFor();
    assert.equal(await antor.getByRole('img', { name: /Illustration de/ }).count(), 1);
    assert.equal((await m.get('Léa', `/api/univers/${m.U}/fiches/${id}/illustration`)).statut, 200);
    await grille(m.comptes.Léa, m.U, 'personnages');
    assert.equal(await carte(m.comptes.Léa, "Le Portrait de l'échec").locator('img').count(), 1);
  });

  test('B-30 échec : image illisible — « Image indisponible. » sans geste pour Léa, avec « Remplacer » et « Retirer » pour Antor, repli dans la grille', opts, async () => {
    const id = m.fiches['La Fresque effacée'];
    assert.ok(id);
    const lea = m.comptes.Léa;
    await aller(lea, `/univers/${m.U}/fiche/${id}`);
    await lea.getByText('Image indisponible.').first().waitFor();
    assert.equal(await geste(lea, 'Remplacer l’illustration').count(), 0);
    assert.equal(await geste(lea, 'Retirer l’illustration').count(), 0);
    const antor = m.comptes.Antor;
    await aller(antor, `/univers/${m.U}/fiche/${id}`);
    await antor.getByText('Image indisponible.').first().waitFor();
    assert.equal(await geste(antor, 'Remplacer l’illustration').count(), 1);
    assert.equal(await geste(antor, 'Retirer l’illustration').count(), 1);
    await grille(lea, m.U, 'lieux');
    const c = carte(lea, 'La Fresque effacée');
    await c.waitFor();
    const cassees = await c.locator('img').evaluateAll((l: HTMLImageElement[]) => l.filter((i) => i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== 'none' && i.getBoundingClientRect().width > 0).length);
    assert.equal(cassees, 0, 'jamais une image cassée');
    assert.equal(await c.getByText('F', { exact: true }).count(), 1, 'repli : initiale « F », article écarté');
  });

  test('B-30 bords : le repli porte l’initiale du titre, article écarté (« Le Gué-aux-Saules » → « G »)', opts, async () => {
    const antor = m.comptes.Antor;
    const r = await api(antor, 'POST', `/api/univers/${m.U}/fiches`, m.srv.base, undefined, { type: 'lieu', titre: 'Le Gué-aux-Saules' });
    assert.equal(r.statut, 201);
    await grille(antor, m.U, 'lieux');
    const c = carte(antor, 'Le Gué-aux-Saules');
    assert.equal(await c.locator('img').count(), 0);
    assert.equal(await c.getByText('G', { exact: true }).count(), 1);
    assert.equal(await c.getByText('L', { exact: true }).count(), 0);
  });

  test('B-30 bords : un titre de 120 caractères garde la grille intacte, le titre entier en infobulle', opts, async () => {
    const antor = m.comptes.Antor;
    const titre = ('Seigneur des Brumes ' + 'Aldebaran '.repeat(12)).slice(0, 120).trim();
    assert.equal(titre.length >= 100 && titre.length <= 120, true);
    const r = await api(antor, 'POST', `/api/univers/${m.U}/fiches`, m.srv.base, undefined, { type: 'personnage', titre, charge: { v: 1, pj: false } });
    assert.equal(r.statut, 201);
    await grille(antor, m.U, 'personnages');
    const c = antor.getByRole('link', { name: rx(titre.slice(0, 40)) }).first();
    await c.waitFor();
    const infobulle = await c.evaluate((el: HTMLElement, t: string) => [el, ...Array.from(el.querySelectorAll('[title]'))].some((e) => e.getAttribute('title') === t), titre);
    assert.equal(infobulle, true);
    const deborde = await antor.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(deborde, false);
  });

  test('B-30 recherche : Léa cherche « Vérité » (section MJ seul) → aucun résultat ; Antor trouve Maître Aldric en carte', opts, async () => {
    const lea = m.comptes.Léa;
    await grille(lea, m.U, 'personnages', 'Vérité');
    await lea.getByText(rx('Aucun résultat pour « Vérité » dans les personnages.')).first().waitFor();
    assert.equal(await lea.getByRole('link', { name: /Maître Aldric/ }).count(), 0);
    const antor = m.comptes.Antor;
    await grille(antor, m.U, 'personnages', 'Vérité');
    await antor.getByRole('link', { name: /Maître Aldric/ }).first().waitFor();
    await grille(lea, m.U, 'personnages', 'Aldric');
    assert.equal(await lea.getByRole('link', { name: /Maître Aldric/ }).count(), 1);
    assert.equal(await lea.getByRole('link', { name: /Bran Corvalis/ }).count(), 0);
  });

  test('B-30 bords : les cartes restent dans l’ordre alphabétique sans casse', opts, async () => {
    const lea = m.comptes.Léa;
    await grille(lea, m.U, 'personnages');
    const titres: string[] = await lea.getByRole('link', { name: /Bran Corvalis|Dame Ombeline|Maître Aldric|Suie/ }).evaluateAll((l: HTMLElement[]) => l.map((e) => e.innerText));
    const ordre = ['Bran Corvalis', 'Dame Ombeline de Val-Fortin', 'Maître Aldric', 'Suie'].map((t) => titres.findIndex((x) => x.includes(t)));
    assert.deepEqual(ordre, [0, 1, 2, 3]);
  });

  test('B-30 exclusion : Admin (membre d’un autre univers seulement) reçoit 404 à GET, PUT et DELETE de l’illustration', opts, async () => {
    const id = m.fiches['Suie'];
    const u = `/api/univers/${m.U}/fiches/${id}/illustration`;
    const inconnu = await m.get('Admin', `/api/univers/${m.U}/fiches/999999/illustration`);
    const lu = await m.get('Admin', u);
    assert.equal(lu.statut, 404);
    assert.equal(lu.corps, inconnu.corps);
    assert.equal((await api(m.comptes.Admin, 'PUT', u, m.srv.base, { nom: 'a.png', buf: PNG, mime: 'image/png' })).statut, 404);
    assert.equal((await api(m.comptes.Admin, 'DELETE', u, m.srv.base)).statut, 404);
    assert.equal((await m.get('Antor', u)).statut, 200);
  });

  test('B-30 exclusion : Antor en mode Joueur voit l’illustration et aucun geste ; en mode MJ, « Ajouter » avec l’aide', opts, async () => {
    const antor = m.comptes.Antor;
    await aller(antor, `/univers/${m.U}/fiche/${m.fiches['Suie']}`, 'Suie');
    await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
    await antor.getByRole('img', { name: rx('Illustration de « Suie »') }).waitFor();
    assert.equal(await geste(antor, 'Remplacer l’illustration').count(), 0);
    assert.equal(await geste(antor, 'Retirer l’illustration').count(), 0);
    await antor.getByRole('radio', { name: 'Mode MJ' }).check();
    await aller(antor, `/univers/${m.U}/fiche/${m.fiches['Bran Corvalis']}`, 'Bran Corvalis');
    await antor.getByRole('heading', { level: 1 }).hover();
    await geste(antor, 'Ajouter une illustration').waitFor({ state: 'visible' });
    await antor.getByText('Visible de tous ceux qui voient la fiche.').first().waitFor({ state: 'visible' });
    await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
    assert.equal(await geste(antor, 'Ajouter une illustration').count(), 0);
    await antor.getByRole('radio', { name: 'Mode MJ' }).check();
  });

  test('B-30 échec : un envoi interrompu dit « l’envoi n’a pas abouti. », n’écrit rien, et « Réessayer » le mène à bien', opts, async () => {
    const antor = m.comptes.Antor;
    const id = m.fiches['Rue des Cordiers'];
    await aller(antor, `/univers/${m.U}/fiche/${id}`);
    await antor.route('**/illustration', (r: Any) => (r.request().method() === 'PUT' ? r.abort() : r.continue()));
    await antor.locator('input[type=file]').first().setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
    await antor.getByText(rx('« portrait.png » : l’envoi n’a pas abouti.')).first().waitFor();
    await antor.getByRole('button', { name: 'Réessayer' }).waitFor();
    assert.equal((await m.get('Antor', `/api/univers/${m.U}/fiches/${id}/illustration`)).statut, 404);
    await antor.unroute('**/illustration');
    await antor.getByRole('button', { name: 'Réessayer' }).click();
    await antor.getByText(rx('Illustration de « Rue des Cordiers » ajoutée')).first().waitFor();
    assert.equal((await m.get('Léa', `/api/univers/${m.U}/fiches/${id}/illustration`)).statut, 200);
  });

  test('B-29 connexion perdue : bandeau, gestes d’illustration désactivés, l’image reste ; la grille garde ses cartes, « Chercher » désactivé', opts, async () => {
    const antor = m.comptes.Antor;
    await aller(antor, `/univers/${m.U}/fiche/${m.fiches['Suie']}`, 'Suie');
    await antor.context().setOffline(true);
    await antor.getByText(/Connexion perdue\./).first().waitFor();
    assert.equal(await geste(antor, 'Remplacer l’illustration').isDisabled(), true);
    assert.equal(await geste(antor, 'Retirer l’illustration').isDisabled(), true);
    assert.equal(await antor.getByRole('img', { name: rx('Illustration de « Suie »') }).count(), 1);
    await antor.context().setOffline(false);
    const lea = m.comptes.Léa;
    await grille(lea, m.U, 'personnages');
    const avant = await lea.getByRole('link', { name: /Maître Aldric/ }).count();
    await lea.context().setOffline(true);
    await lea.getByText(/Connexion perdue\./).first().waitFor();
    assert.equal(await lea.getByRole('button', { name: 'Chercher' }).isDisabled(), true);
    assert.equal(await lea.getByRole('link', { name: /Maître Aldric/ }).count(), avant);
    await lea.context().setOffline(false);
  });

  test('B-29 chargement : « Chargement des fiches… », « Chargement des systèmes… », « Chargement de vos univers… »', opts, async () => {
    const lea = m.comptes.Léa;
    const lent = (motif: string) => lea.route(motif, async (r: Any) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
    await lent('**/api/univers/*/fiches?*');
    await lea.goto(`/univers/${m.U}/fiches/personnages`);
    await lea.getByRole('status').filter({ hasText: 'Chargement des fiches…' }).waitFor();
    await attendre(lea);
    await lea.unroute('**/api/univers/*/fiches?*');
    await lent('**/api/systemes');
    await lea.goto('/systemes');
    await lea.getByRole('status').filter({ hasText: 'Chargement des systèmes…' }).waitFor();
    await attendre(lea);
    await lea.unroute('**/api/systemes');
    await lent('**/api/univers');
    await lea.goto('/');
    await lea.getByRole('status').filter({ hasText: 'Chargement de vos univers…' }).waitFor();
    await attendre(lea);
    await lea.unroute('**/api/univers');
  });

  test('B-29 contenu extrême : à 390 px la grille des personnages a deux colonnes, E-16 et E-1 une, sans débordement', opts, async () => {
    const ctx = await m.browser.newContext({ baseURL: m.srv.base, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Léa$/i }).click();
    await attendre(page);
    const boites = async (nom: RegExp) => page.getByRole('link', { name: nom }).evaluateAll((l: HTMLElement[]) => l.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }));
    await grille(page, m.U, 'personnages');
    const b = await boites(/Bran Corvalis|Dame Ombeline/);
    assert.equal(b.length, 2);
    assert.equal(b[0]!.y, b[1]!.y, 'deux cartes sur la même rangée');
    assert.notEqual(b[0]!.x, b[1]!.x);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await aller(page, '/systemes', 'Systèmes de jeu');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    const s = await boites(/CoF Mini/);
    assert.equal(s.length >= 1, true);
    assert.equal(s[0]!.w >= 390 - 80, true, 'une colonne : la carte prend la largeur');
    await ctx.close();
  });

  test('B-31 bords : Antor voit CoF Mini avec « Utilisé par 2 univers », « 3 règles · 4 créatures · 2 objets » et sa seule puce « Lame d’Ébène · MJ », jamais Les Landes grises', opts, async () => {
    const antor = m.comptes.Antor;
    await aller(antor, '/systemes', 'Systèmes de jeu');
    const t = await texte(antor);
    assert.match(t, /Utilisé par 2 univers/);
    assert.match(t, /3 règles · 4 créatures · 2 objets/);
    assert.match(t, /Lame d'Ébène\s*·?\s*MJ/);
    assert.ok(!/Landes grises/.test(t));
    const liste = JSON.parse((await m.get('Antor', '/api/systemes')).corps);
    const cof = liste.find((s: Any) => s.nom === 'CoF Mini');
    assert.ok(!/Landes grises/.test((await m.get('Antor', '/api/systemes')).corps));
    const un = await m.get('Antor', `/api/systemes/${cof.id}`);
    assert.ok(!/Landes grises/.test(un.corps));
    await aller(antor, `/systemes/${cof.id}`, /CoF Mini/);
    const t2 = await texte(antor);
    assert.match(t2, /Référentiel commun · utilisé par 2 univers/i);
    assert.ok(!/Landes grises/.test(t2));
  });

  test('B-31 bords : Teo, sans univers rattaché, lit « Les systèmes de vos univers apparaîtront ici quand leur MJ en rattachera un. »', opts, async () => {
    const teo = m.comptes.Teo;
    await aller(teo, '/systemes', 'Systèmes de jeu');
    await teo.getByText(rx('Aucun système de jeu pour l’instant.')).first().waitFor();
    await teo.getByText('Les systèmes de vos univers apparaîtront ici quand leur MJ en rattachera un.').first().waitFor();
    assert.equal(await teo.getByRole('link', { name: 'Les Landes grises' }).count(), 0);
  });

  test('E-1 : cartes par nom avec rôle, système, nombre de membres ; « Sans système de jeu » absent ici ; un clic sur la carte ouvre l’univers', opts, async () => {
    const antor = m.comptes.Antor;
    const r = JSON.parse((await m.get('Antor', '/api/univers')).corps);
    const l = (r.univers ?? r) as Any[];
    const lame = l.find((u) => u.nom === "Lame d'Ébène");
    const cendres = l.find((u) => u.nom === 'Les Cendres de Vaëlis');
    assert.deepEqual(lame.systeme.nom, 'CoF Mini');
    assert.equal(lame.nbMembres, 2);
    assert.equal(cendres.systeme.nom, 'Chroniques Oubliées Fantasy');
    assert.equal(cendres.nbMembres, 2);
    await aller(antor, '/', 'Mes univers');
    const cartes = antor.getByRole('link', { name: /Lame d.Ébène|Les Cendres de Vaëlis/ });
    assert.equal(await cartes.count(), 2);
    const noms: string[] = await cartes.evaluateAll((x: HTMLElement[]) => x.map((e) => e.innerText));
    assert.ok(noms[0]!.includes('Lame'), 'Lame d’Ébène avant Les Cendres de Vaëlis');
    assert.match(noms[0]!, /MJ/);
    assert.match(noms[0]!, /CoF Mini/);
    assert.match(noms[1]!, /Joueur/);
    assert.match(noms[1]!, /Chroniques Oubliées Fantasy/);
    assert.match(noms[1]!, /2 membres/);
    assert.ok(!/Sans système de jeu/.test(await texte(antor)));
    const box = await cartes.first().boundingBox();
    await antor.mouse.click(box.x + box.width / 2, box.y + box.height - 6);
    await antor.waitForURL(new RegExp(`/univers/${m.U}(/|$)`));
  });

  test('B-14 : Antor ajoute « Garde du sceau » à CoF Mini ; Mira la voit avec « Utilisé par 2 univers » et la seule puce « Les Landes grises », Léa la lit sans « Ajouter » ni « Modifier »', opts, async () => {
    const antor = m.comptes.Antor;
    const cof = JSON.parse((await m.get('Antor', '/api/systemes')).corps).find((s: Any) => s.nom === 'CoF Mini').id;
    await aller(antor, `/systemes/${cof}?type=creature`);
    await antor.getByRole('button', { name: /^Ajouter une créature/ }).click();
    await antor.getByLabel('Nom').fill('Garde du sceau');
    await antor.getByLabel('Contenu').fill('Veille sur le sceau de Val-Fortin.');
    await antor.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await antor.getByText('Garde du sceau').first().waitFor();
    const mira = m.comptes.Mira;
    await aller(mira, `/systemes/${cof}?type=creature`);
    await mira.getByText('Garde du sceau').first().waitFor();
    const t = await texte(mira);
    assert.match(t, /utilisé par 2 univers/i);
    assert.match(t, /Les Landes grises/);
    assert.ok(!/Lame d'Ébène/.test(t));
    const lea = m.comptes.Léa;
    await aller(lea, `/systemes/${cof}?type=creature`);
    await lea.getByText('Garde du sceau').first().waitFor();
    assert.equal(await lea.getByRole('button', { name: /^Ajouter/ }).count(), 0);
    assert.equal(await lea.getByRole('button', { name: /^Modifier/ }).count(), 0);
  });
});

describe('kanevas-illustrations (B) : tests qui changent le monde', { timeout: 600000 }, () => {
  let m: Monde;
  before(async () => {
    m = await monde();
  }, { timeout: 180000 });
  after(async () => {
    await m?.browser?.close();
    m?.srv?.stop();
  });

  test('B-29 contenu extrême : plus de 100 fiches → « Charger la suite » sous la grille, puis toutes les cartes', opts, async () => {
    const antor = m.comptes.Antor;
    for (let i = 1; i <= 101; i++) {
      const r = await api(antor, 'POST', `/api/univers/${m.U}/fiches`, m.srv.base, undefined, { type: 'quete', titre: `Quête ${String(i).padStart(3, '0')}` });
      assert.equal(r.statut, 201);
    }
    await grille(antor, m.U, 'quetes');
    assert.equal(await antor.getByRole('link', { name: /^Quête \d{3}/ }).count(), 100);
    await antor.getByRole('button', { name: 'Charger la suite' }).click();
    await antor.getByRole('link', { name: 'Quête 101' }).waitFor();
    assert.equal(await antor.getByRole('link', { name: /^Quête \d{3}/ }).count(), 101);
  });

  test('B-31 vide : un compte MJ sans système lit « Un système se rattache depuis les paramètres d’un univers que vous menez. » et le lien « Mes univers »', opts, async () => {
    const teo = m.comptes.Teo;
    const r = await api(teo, 'POST', '/api/univers', m.srv.base, undefined, { nom: 'Brume' });
    assert.equal(r.statut, 201);
    await aller(teo, '/systemes', 'Systèmes de jeu');
    await teo.getByText(rx('Aucun système de jeu pour l’instant.')).first().waitFor();
    await teo.getByText('Un système se rattache depuis les paramètres d’un univers que vous menez.').first().waitFor();
    assert.equal(await teo.getByRole('main').getByRole('link', { name: 'Mes univers' }).count(), 1);
    // an unattached universe has no « Système de jeu » block and no system on its old address
    const brume = JSON.parse(r.corps).id;
    await aller(teo, `/univers/${brume}`);
    assert.equal(await teo.getByRole('link', { name: /Ouvrir le système/ }).count(), 0);
    await teo.goto(`/univers/${brume}/systeme`);
    await teo.getByText('Page introuvable.').first().waitFor();
    // E-1 : the new card says « Sans système de jeu »
    await aller(teo, '/', 'Mes univers');
    assert.match(await texte(teo), /Sans système de jeu/);
  });

  test('B-13 / B-31 : détaché pendant que la page est ouverte — E-3 de Léa puis E-14 d’Antor mènent à « Page introuvable. » avec le lien « Systèmes de jeu »', opts, async () => {
    const antor = m.comptes.Antor;
    const lea = m.comptes.Léa;
    const cof = JSON.parse((await m.get('Antor', '/api/systemes')).corps).find((s: Any) => s.nom === 'CoF Mini').id;
    // Léa opens E-3 while the universe is attached
    await aller(lea, `/univers/${m.U}`);
    await lea.getByRole('link', { name: /Ouvrir le système/ }).waitFor();
    // Antor opens E-14
    await aller(antor, `/univers/${m.U}/parametres`);
    await antor.getByRole('link', { name: /Ouvrir le système/ }).waitFor();
    // Another MJ of the universe detaches it: Léa is promoted, then detaches.
    const membres = JSON.parse((await m.get('Antor', `/api/univers/${m.U}/membres`)).corps);
    const lm = (membres.membres ?? membres).find((x: Any) => /l[ée]a/i.test(x.username ?? x.nom ?? ''));
    assert.ok(lm, 'Léa est membre');
    const idLea = lm.compteId ?? lm.id;
    assert.equal((await api(antor, 'PATCH', `/api/univers/${m.U}/membres/${idLea}`, m.srv.base, undefined, { role: 'mj' })).statut, 200);
    assert.equal((await api(lea, 'PUT', `/api/univers/${m.U}/systeme`, m.srv.base, undefined, { systemeId: null })).statut, 204);
    // Léa is a GM now: her stale E-3 click lands on « Page introuvable. » (the system is no longer readable for her)
    await lea.getByRole('link', { name: /Ouvrir le système/ }).click();
    await lea.getByText('Page introuvable.').first().waitFor();
    await lea.getByRole('link', { name: 'Systèmes de jeu' }).first().waitFor();
    await aller(lea, `/univers/${m.U}`);
    assert.equal(await lea.getByRole('link', { name: /Ouvrir le système/ }).count(), 0);
    // Antor, on E-14 opened before the detach
    await antor.getByRole('link', { name: /Ouvrir le système/ }).click();
    await antor.getByText('Page introuvable.').first().waitFor();
    await antor.getByRole('link', { name: 'Systèmes de jeu' }).first().waitFor();
    await antor.goBack();
    await aller(antor, `/univers/${m.U}/parametres`);
    await antor.getByText('Cet univers n’est rattaché à aucun système de jeu.').first().waitFor();
    // CoF Mini is still in the catalogue and still lives for Mira
    assert.equal((await m.get('Mira', `/api/systemes/${cof}`)).statut, 200);
    assert.ok((await m.get('Antor', '/api/systemes/catalogue')).corps.includes('CoF Mini'));
  });

  test('B-30 refus : Antor rétrogradé Joueur par un autre MJ pendant l’envoi → « Vous ne pouvez plus modifier l’illustration de cette fiche. », les gestes disparaissent', opts, async () => {
    const antor = m.comptes.Antor;
    const lea = m.comptes.Léa; // GM since the previous test
    const bran = m.fiches['Bran Corvalis'];
    await aller(antor, `/univers/${m.U}/fiche/${bran}`, 'Bran Corvalis');
    const membres = JSON.parse((await m.get('Léa', `/api/univers/${m.U}/membres`)).corps);
    const am = (membres.membres ?? membres).find((x: Any) => /antor/i.test(x.username ?? x.nom ?? ''));
    assert.ok(am);
    assert.equal((await api(lea, 'PATCH', `/api/univers/${m.U}/membres/${am.compteId ?? am.id}`, m.srv.base, undefined, { role: 'joueur' })).statut, 200);
    await antor.locator('input[type=file]').first().setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
    await antor.getByText('Vous ne pouvez plus modifier l’illustration de cette fiche.').first().waitFor();
    await attendre(antor);
    assert.equal(await geste(antor, 'Ajouter une illustration').count(), 0);
    assert.equal((await m.get('Léa', `/api/univers/${m.U}/fiches/${bran}/illustration`)).statut, 404, 'rien n’a été écrit');
  });
});
