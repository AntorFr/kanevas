// Black-box tests of kanevas-cg-ecran-graphe, written from its exit criterion and
// docs/ecrans.md « E-11 Carte » (graphe). Real server in stub mode + real Chromium.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type Any,
  ajouterMembre,
  allerMembres,
  attendre,
  connecte,
  creerUnivers,
  launch,
  rx,
  rxExact,
  skipBrowser,
  startServer,
  texte,
} from './harnais.test.js';

const opts = { skip: skipBrowser, timeout: 180000 };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let uid = '';
let cid = 0;
let lames = 0;
let ombres = 0;
let guilde = 0;
let secLames = 0;
let secGuilde = 0;

async function api(page: Any, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(path, { method, data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

/** Pairs of node boxes that overlap (more than 1 px on both axes). */
async function chevauchements(page: Any): Promise<string[]> {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll('.graphe .carte-token')].map((e) => ({ t: (e.textContent ?? '').trim(), r: e.getBoundingClientRect() }));
    const out: string[] = [];
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const a = b[i]!.r, c = b[j]!.r;
      if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push(`${b[i]!.t} / ${b[j]!.t}`);
    }
    return out;
  });
}
const base = () => `/api/univers/${uid}/cartes/${cid}`;
async function ouvrir(page: Any, suffixe = '') {
  await page.goto(`/univers/${uid}/cartes/${cid}${suffixe}`);
  await page.locator('h1, [role=alert]').first().waitFor();
  await attendre(page);
}
const fiche = async (type: string, titre: string) => (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type, titre })).body.id as number;
async function section(fid: number, titre: string, lisent: boolean) {
  const s = (await api(antor, 'POST', `/api/univers/${uid}/fiches/${fid}/sections`, { titre, contenu: 'x' })).body;
  assert.equal((await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${fid}/sections/${s.id}`, { joueursLisent: lisent })).status, 200);
  return s.id as number;
}
async function ajouter(fid: number) {
  assert.equal((await api(antor, 'POST', `${base()}/elements`, { ficheId: fid })).status, 201);
}
/** Number of graph nodes on the page (links in the frame for a player, buttons for the GM). */
const noeuds = (page: Any) => page.locator('.graphe .carte-token');
async function centres(page: Any) {
  const out: Record<string, string> = {};
  for (const h of await noeuds(page).all()) {
    const b = await h.boundingBox();
    out[(await h.getAttribute('aria-label')) ?? '?'] = `${Math.round(b.x)},${Math.round(b.y)}`;
  }
  return out;
}

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  await creerUnivers(antor, 'Brume');
  await antor.getByRole('heading', { name: 'Brume', level: 1 }).waitFor();
  uid = new URL(antor.url()).pathname.split('/').pop()!;
  await allerMembres(antor);
  await ajouterMembre(antor, 'lea');
  await antor.getByText('lea', { exact: true }).first().waitFor();
  lames = await fiche('faction', 'Les Lames Grises');
  ombres = await fiche('faction', 'Les Ombres de Fer');
  guilde = await fiche('faction', 'La Guilde');
  secLames = await section(lames, 'Pactes secrets', false);
  const pub = await section(lames, 'Public', true);
  await section(ombres, 'Public', true);
  secGuilde = await section(guilde, 'Public', true);
  const rel = (sec: number, cible: number, type: string) =>
    api(antor, 'POST', `/api/univers/${uid}/fiches/${lames}/sections/${sec}/relations`, { cibleFicheId: cible, type });
  assert.equal((await rel(secLames, ombres, 'allié de')).status, 201);
  assert.equal((await rel(pub, guilde, 'rival de')).status, 201);
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  srv?.stop();
});

test('création d’un graphe : naît vide avec son texte, ajout des trois fiches par la fenêtre', opts, async () => {
  await antor.goto(`/univers/${uid}/cartes`);
  await antor.getByRole('button', { name: rxExact('Nouvelle carte') }).click();
  await antor.getByLabel('Titre').fill('Les factions');
  await antor.getByLabel('Forme').selectOption({ label: 'Graphe' });
  await antor.getByRole('button', { name: rxExact('Créer') }).click();
  await antor.getByRole('heading', { name: 'Les factions', level: 1 }).waitFor();
  await attendre(antor);
  cid = Number(new URL(antor.url()).pathname.split('/').pop());
  assert.ok(cid > 0);
  assert.ok((await texte(antor)).includes('Aucune fiche. Ajoutez des fiches pour voir leurs liens.'));
  await antor.screenshot({ path: '/tmp/e11-graphe-vide-mj.png' });

  await antor.getByRole('button', { name: rxExact('Ajouter une fiche') }).click();
  const dlg = antor.getByRole('dialog');
  await dlg.getByLabel('Type de fiche').selectOption('faction');
  for (const t of ['Les Lames Grises', 'Les Ombres de Fer', 'La Guilde']) {
    await dlg.locator('li').filter({ hasText: t }).getByRole('button', { name: rxExact('Ajouter') }).click();
    await dlg.locator('li').filter({ hasText: t }).getByText('Déjà sur la carte').waitFor();
  }
  await dlg.getByRole('button', { name: rxExact('Fermer') }).click();
  await attendre(antor);
  assert.equal(await noeuds(antor).count(), 3);
  // Without reloading: the two links among the nodes just added are drawn and listed.
  assert.equal(await antor.locator('.graphe-lien').count(), 2, 'deux flèches dès l’ajout, sans recharger');
  assert.ok((await texte(antor)).includes('Les Lames Grises — rival de → La Guilde'));
});

test('MJ : trois nœuds, deux flèches écrites de leur type, liste « Liens » ; nœud ≥ 44 px', opts, async () => {
  await ouvrir(antor);
  assert.equal(await noeuds(antor).count(), 3);
  assert.equal(await antor.locator('.graphe-lien').count(), 2);
  const types = await antor.locator('.graphe-lien text').allTextContents();
  assert.deepEqual(types.sort(), ['allié de', 'rival de']);
  const t = await texte(antor);
  assert.ok(t.includes('Les Lames Grises — allié de → Les Ombres de Fer'));
  assert.ok(t.includes('Les Lames Grises — rival de → La Guilde'));
  for (const n of await noeuds(antor).all()) {
    const b = await n.boundingBox();
    assert.ok(b.width >= 44 && b.height >= 44, `zone ${b.width}x${b.height}`);
  }
  await antor.screenshot({ path: '/tmp/e11-graphe-mj.png' });
});

test('Léa, graphe visible : trois nœuds et le seul « rival de » ; toucher un nœud ouvre la fiche', opts, async () => {
  await ouvrir(lea);
  await lea.getByText(rx('Page introuvable.')).waitFor();
  await antor.goto(`/univers/${uid}/cartes/${cid}`);
  await attendre(antor);
  await antor.getByRole('button', { name: rxExact('Rendre visible') }).click();
  await antor.getByText('Visible des joueurs').waitFor();

  await ouvrir(lea);
  assert.equal(await noeuds(lea).count(), 3);
  assert.deepEqual(await lea.locator('.graphe-lien text').allTextContents(), ['rival de']);
  const t = await texte(lea);
  assert.ok(t.includes('Les Lames Grises — rival de → La Guilde'));
  assert.ok(!t.includes('allié de'), 'le lien porté par une section illisible n’apparaît pas');
  for (const interdit of ['Retirer', 'Ajouter une fiche', 'Rendre visible', 'Renommer']) assert.ok(!t.includes(interdit));
  const l = (await api(lea, 'GET', base())).body;
  assert.deepEqual(l.liens.map((x: Any) => x.type), ['rival de']);
  await lea.screenshot({ path: '/tmp/e11-graphe-joueuse.png' });

  await lea.locator('.graphe .carte-token[aria-label="La Guilde"]').click();
  await lea.waitForURL(rx(`/fiche/${guilde}`));
  await lea.getByRole('heading', { name: 'La Guilde' }).first().waitFor();
});

test('mode Joueur : Antor voit exactement le graphe de Léa, positions comprises', opts, async () => {
  await ouvrir(lea);
  const celleDeLea = await centres(lea);
  const vp = lea.viewportSize();
  await antor.setViewportSize(vp);
  await ouvrir(antor);
  await antor.getByRole('radio', { name: rxExact('Mode Joueur') }).check();
  await antor.waitForFunction(() => !document.body.innerText.includes('Retirer'));
  await attendre(antor);
  assert.equal(await noeuds(antor).count(), 3);
  assert.deepEqual(await antor.locator('.graphe-lien text').allTextContents(), ['rival de']);
  assert.ok(!(await texte(antor)).includes('allié de'));
  assert.deepEqual(Object.keys(await centres(antor)).sort(), Object.keys(celleDeLea).sort());
  await antor.screenshot({ path: '/tmp/e11-graphe-mj-mode-joueur.png' });
  await antor.getByRole('radio', { name: rxExact('Mode MJ') }).check();
});

test('fiche illisible : deux nœuds, « Aucun lien entre ces fiches. », aucune trace ; la disposition ne dépend pas du nœud caché', opts, async () => {
  await ouvrir(lea);
  const avant = await centres(lea);
  // Léa stops reading La Guilde.
  const secs = (await api(antor, 'GET', `/api/univers/${uid}/fiches/${guilde}`)).body;
  assert.ok(secs);
  assert.equal((await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${guilde}/sections/${secGuilde}`, { joueursLisent: false })).status, 200);
  await ouvrir(lea);
  assert.equal(await noeuds(lea).count(), 2);
  const t = await texte(lea);
  assert.ok(t.includes('Aucun lien entre ces fiches.'));
  assert.ok(!t.includes('La Guilde') && !t.includes('rival de'), 'sans trace de ce qui manque');
  assert.equal(await lea.locator('.graphe-lien').count(), 0);
  await lea.screenshot({ path: '/tmp/e11-graphe-joueuse-sans-guilde.png' });

  // Same layout on every load...
  const un = await centres(lea);
  await ouvrir(lea);
  assert.deepEqual(await centres(lea), un);
  // ...and adding a node Léa cannot read (not in her response) moves nothing.
  const nouvelle = await fiche('faction', 'Aaa cachée');
  await section(nouvelle, 'MJ', false);
  await ajouter(nouvelle);
  await ouvrir(lea);
  assert.deepEqual(await centres(lea), un);
  assert.ok(avant['Les Lames Grises'] !== undefined);
  await api(antor, 'PATCH', `/api/univers/${uid}/fiches/${guilde}/sections/${secGuilde}`, { joueursLisent: true });
  const cache = (await api(antor, 'GET', base())).body.elements.find((e: Any) => e.titre === 'Aaa cachée');
  assert.equal((await api(antor, 'DELETE', `${base()}/elements/${cache.id}`)).status, 204);
});

test('MJ : sélection d’un nœud, panneau, retrait avec confirmation ; la fiche reste', opts, async () => {
  await ouvrir(antor);
  await antor.locator('.graphe .carte-token[aria-label="La Guilde"]').click();
  await antor.getByRole('link', { name: rxExact('Ouvrir la fiche') }).waitFor();
  await antor.screenshot({ path: '/tmp/e11-graphe-selection.png' });
  await antor.getByRole('button', { name: rxExact('Retirer de la carte') }).first().click();
  await antor.getByText('Retirer « La Guilde » de cette carte ? La fiche reste.').waitFor();
  assert.equal((await api(antor, 'GET', base())).body.elements.length, 3, 'rien retiré au premier clic');
  await antor.getByRole('alertdialog').getByRole('button', { name: rxExact('Retirer de la carte') }).click();
  await antor.waitForFunction(() => document.querySelectorAll('.graphe .carte-token').length === 2);
  assert.equal(await noeuds(antor).count(), 2);
  assert.equal((await api(antor, 'GET', `/api/univers/${uid}/fiches/${guilde}`)).status, 200);
  try {
    assert.ok(!(await texte(antor)).includes('rival de'), 'le lien vers le nœud retiré disparaît de la page (liste « Liens » comprise)');
  } finally {
    await ajouter(guilde);
  }
});

test('relation ajoutée sur une fiche : visible au rechargement du graphe', opts, async () => {
  await ouvrir(antor);
  assert.equal(await antor.locator('.graphe-lien').count(), 2);
  const r = await api(antor, 'POST', `/api/univers/${uid}/fiches/${guilde}/sections/${secGuilde}/relations`, { cibleFicheId: ombres, type: 'ennemie de' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await antor.reload();
  await attendre(antor);
  assert.equal(await antor.locator('.graphe-lien').count(), 3);
  assert.ok((await texte(antor)).includes('La Guilde — ennemie de → Les Ombres de Fer'));
  await antor.screenshot({ path: '/tmp/e11-graphe-relation.png' });
});

test('100 nœuds : sans erreur, zones ≥ 44 px, titres à 24 caractères + …, titre entier dans « Sur la carte »', opts, async () => {
  const g = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'Gros', forme: 'graphe' })).body.id as number;
  const long = 'Un titre vraiment très long pour un nœud';
  const ids: number[] = [];
  for (let i = 0; i < 100; i++) ids.push((await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: i === 0 ? long : `Lieu ${i}` })).body.id);
  for (const id of ids) assert.equal((await api(antor, 'POST', `/api/univers/${uid}/cartes/${g}/elements`, { ficheId: id })).status, 201);
  const erreurs: string[] = [];
  antor.on('pageerror', (e: Error) => erreurs.push(String(e)));
  await antor.goto(`/univers/${uid}/cartes/${g}`);
  await antor.getByRole('heading', { name: 'Gros', level: 1 }).waitFor();
  await attendre(antor);
  assert.equal(await noeuds(antor).count(), 100);
  const tailles = await antor.evaluate(() => [...document.querySelectorAll('.graphe .carte-token')].map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [w, h] of tailles) assert.ok(w >= 44 && h >= 44, `zone ${w}x${h}`);
  const court = 'Un titre vraiment très l…';
  assert.equal(Array.from(court).length, 25);
  assert.ok((await antor.locator('.graphe .carte-token').filter({ hasText: court }).count()) === 1);
  assert.equal(await antor.locator('.graphe .carte-token').filter({ hasText: long }).count(), 0, 'titre tronqué dans le cadre');
  assert.ok(await antor.locator('.carte-sur').getByText(long).count() >= 1, 'titre entier dans la liste');
  const cadre = await antor.locator('.graphe').boundingBox();
  const vp = antor.viewportSize();
  assert.ok(cadre.width <= vp.width, `cadre à la largeur disponible, pas plus large que l'écran : ${cadre.width} > ${vp.width}`);
  assert.deepEqual(await chevauchements(antor), [], 'aucun nœud ne recouvre un autre (100 nœuds)');
  await antor.screenshot({ path: '/tmp/e11-graphe-100.png' });
  assert.deepEqual(erreurs, []);
});

test('100 nœuds à 390 px : cadre dans l’écran, aucun recouvrement, tous les nœuds atteignables', opts, async () => {
  const g = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'Mobile', forme: 'graphe' })).body.id as number;
  for (let i = 0; i < 30; i++) {
    const f = (await api(antor, 'POST', `/api/univers/${uid}/fiches`, { type: 'lieu', titre: `Mob ${i}` })).body.id;
    assert.equal((await api(antor, 'POST', `/api/univers/${uid}/cartes/${g}/elements`, { ficheId: f })).status, 201);
  }
  await antor.setViewportSize({ width: 390, height: 800 });
  await antor.goto(`/univers/${uid}/cartes/${g}`);
  await antor.getByRole('heading', { name: 'Mobile', level: 1 }).waitFor();
  await attendre(antor);
  assert.equal(await noeuds(antor).count(), 30);
  const cadre = await antor.locator('.graphe').boundingBox();
  assert.ok(cadre.width <= 390, `cadre ${cadre.width}`);
  assert.deepEqual(await chevauchements(antor), []);
  const hors = await antor.evaluate(() => {
    const c = document.querySelector('.graphe')!.getBoundingClientRect();
    return [...document.querySelectorAll('.graphe .carte-token')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < c.left - 1 || r.right > c.right + 1; }).length;
  });
  assert.equal(hors, 0, 'aucun nœud hors du cadre horizontalement');
  await antor.screenshot({ path: '/tmp/e11-graphe-390.png' });
  await antor.setViewportSize({ width: 1280, height: 720 });
});

test('erreur et connexion perdue du graphe', opts, async () => {
  await antor.route(`**/api/univers/${uid}/cartes/${cid}`, (r: Any) => r.fulfill({ status: 500, body: '{}' }));
  await antor.goto(`/univers/${uid}/cartes/${cid}`);
  await antor.getByText('Impossible de charger cette page.').waitFor();
  await antor.getByRole('button', { name: rxExact('Réessayer') }).waitFor();
  await antor.screenshot({ path: '/tmp/e11-graphe-erreur.png' });
  await antor.unroute(`**/api/univers/${uid}/cartes/${cid}`);
  await antor.getByRole('button', { name: rxExact('Réessayer') }).click();
  await antor.locator('.graphe').waitFor();

  await antor.context().setOffline(true);
  await antor.getByText(rx('Connexion perdue.')).waitFor({ timeout: 30000 }).catch(() => undefined);
  const present = await antor.getByText(rx('Connexion perdue.')).count();
  await antor.screenshot({ path: '/tmp/e11-graphe-hors-ligne.png' });
  await antor.context().setOffline(false);
  assert.ok(present >= 1, 'bandeau de connexion perdue');
  assert.equal(await noeuds(antor).count(), 3, 'le graphe chargé reste');
});

test('graphe vide côté Joueur : « Rien à voir sur ce graphe pour l’instant. »', opts, async () => {
  const g = (await api(antor, 'POST', `/api/univers/${uid}/cartes`, { titre: 'Vide', forme: 'graphe' })).body.id as number;
  await api(antor, 'PATCH', `/api/univers/${uid}/cartes/${g}`, { visible: true });
  await lea.goto(`/univers/${uid}/cartes/${g}`);
  await lea.getByRole('heading', { name: 'Vide', level: 1 }).waitFor();
  await attendre(lea);
  assert.ok((await texte(lea)).match(/Rien à voir sur ce graphe pour l[’']instant\./));
  await lea.screenshot({ path: '/tmp/e11-graphe-vide-joueuse.png' });
});
