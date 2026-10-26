// Independent acceptance tests of kanevas-relation-badge-pj, written from the need only (fiche, messages « Livre » and
// « Précision » of Monsieur, docs/ecrans.md E-9 « le bloc Relations », the AD-64 amendment and the route line of ARCHITECTURE.md).
// Real server in stub mode, real SQLite, real Chromium; every expected value is a literal.
//
// PLAN DE TEST (besoin -> famille -> cas -> panne qui le fait rougir)
//  Livre « la ligne porte le badge PJ ou PNJ exact »
//   nominal    GET relations: cible PJ -> charge {pj:true}; cible PNJ -> {pj:false}   (charge absente ou fausse)
//              POST 201: même cible, charge comprise                                    (POST oublié)
//              E-9: relier à un PJ puis à un PNJ -> lignes « PJ » et « PNJ »            (badge lu au mauvais endroit)
//   bords      cible d'un autre type (lieu, faction) -> pas de charge (ou {}), libellé « Lieu » / « Faction », jamais PJ/PNJ
//              personnage dont la fiche porte d'autres clés de charge -> la cible ne rend que {pj}
//              recharger la fiche (nouvelle ouverture) -> mêmes badges
//   échec      une fiche reliée à un personnage s'ouvre : aucune erreur de page, titre et lignes visibles
//   exclusions Léa (Joueur) ne voit ni ligne ni badge d'une cible qu'elle ne lit pas ; la charge ne fuit pas d'autre clé
//              Léa voit les badges exacts des cibles qu'elle lit
//   hors tranche (non testé: autres données de la cible)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { type Any, attendre, connecte, launch, rxExact, skipBrowser, startServer, type Server } from './harnais.test.js';

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/shots';
let srv: Server;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
const F: Record<string, number> = {};
let secPortSel = 0;

async function api(page: Any, method: string, url: string, data?: unknown): Promise<{ status: number; body: Any }> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const t = await r.text();
  return { status: r.status(), body: t ? JSON.parse(t) : null };
}
async function ok(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await api(page, method, url, data);
  assert.ok(r.status < 300, `${method} ${url} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const relUrl = (f: number, s: number) => `/api/univers/${U}/fiches/${f}/sections/${s}/relations`;

async function ouvrir(page: Any, titre: string, id: number): Promise<string[]> {
  const erreurs: string[] = [];
  const surErreur = (e: Error) => erreurs.push(e.message);
  page.on('pageerror', surErreur);
  await page.goto(`/univers/${U}/fiche/${id}`);
  await page.getByRole('heading', { level: 1, name: titre }).waitFor();
  await attendre(page);
  await page.waitForFunction(() => !/Chargement des relations…/.test(document.body.innerText));
  page.off('pageerror', surErreur);
  return erreurs;
}
const ligne = (page: Any, cible: string) => page.getByRole('group', { name: 'Relations' }).first().getByRole('listitem').filter({ hasText: cible });

async function relierParEcran(page: Any, type: string, typeFiche: string, chercherDans: string, cible: string): Promise<void> {
  const b = page.getByRole('group', { name: 'Relations' }).first();
  await b.getByRole('button', { name: rxExact('Relier à une fiche') }).click();
  await b.getByLabel('Type de relation').fill(type);
  await b.getByLabel('Type de fiche').selectOption({ label: typeFiche });
  await b.getByLabel(`Chercher dans ${chercherDans}`).fill(cible);
  await b.getByRole('button', { name: rxExact('Chercher') }).click();
  const choix = b.locator('button.choix-fiche').filter({ hasText: cible });
  await choix.waitFor();
  await choix.click();
  const reponse = page.waitForResponse((r: Any) => r.url().includes('/relations') && r.request().method() === 'POST');
  await b.getByRole('button', { name: rxExact('Relier') }).click();
  assert.equal((await reponse).status(), 201);
  await ligne(page, cible).waitFor();
}

describe('kanevas-relation-badge-pj, badge PJ/PNJ du bloc Relations (E-9)', { skip: skipBrowser }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer();
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    lea = (await connecte(browser, srv.base, 'Léa')).page;
    U = (await ok(antor, 'POST', '/api/univers', { nom: "Lame d'Ébène" })).id;
    await ok(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
    const mk = async (type: string, titre: string, charge?: Any, lue = true) => {
      const f = await ok(antor, 'POST', `/api/univers/${U}/fiches`, { type, titre, ...(charge ? { charge } : {}) });
      const s = await ok(antor, 'POST', `/api/univers/${U}/fiches/${f.id}/sections`, { titre: 'Description', contenu: 'Texte.' });
      if (lue) await ok(antor, 'PATCH', `/api/univers/${U}/fiches/${f.id}/sections/${s.id}`, { joueursLisent: true });
      F[titre] = f.id;
      return s.id as number;
    };
    secPortSel = await mk('lieu', 'Port-Sel');
    await mk('personnage', 'Léa Brisefer', { v: 1, pj: true });
    await mk('personnage', 'Maître Aldric', { v: 1, pj: false });
    await mk('lieu', 'Anse-aux-Sels');
    await mk('faction', 'Lames Grises');
    await mk('personnage', 'Le Prieur masqué', { v: 1, pj: false }, false); // aucune section lue des joueurs
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  test('GET relations : cible PJ -> charge {pj:true}, cible PNJ -> {pj:false}, lieu et faction -> sans pj', async () => {
    // panne : la cible ne joint pas la charge, ou la joint inversée
    await ok(antor, 'POST', relUrl(F['Port-Sel'], secPortSel), { cibleFicheId: F['Léa Brisefer'], type: 'compagnon de' });
    await ok(antor, 'POST', relUrl(F['Port-Sel'], secPortSel), { cibleFicheId: F['Maître Aldric'], type: 'tenu par' });
    await ok(antor, 'POST', relUrl(F['Port-Sel'], secPortSel), { cibleFicheId: F['Anse-aux-Sels'], type: 'voisin de' });
    await ok(antor, 'POST', relUrl(F['Port-Sel'], secPortSel), { cibleFicheId: F['Lames Grises'], type: 'tenu par' });
    const { relations } = await ok(antor, 'GET', relUrl(F['Port-Sel'], secPortSel));
    const par = (t: string) => relations.find((r: Any) => r.cible.titre === t).cible;
    assert.deepEqual(par('Léa Brisefer').charge, { pj: true });
    assert.deepEqual(par('Maître Aldric').charge, { pj: false });
    assert.equal(par('Léa Brisefer').type, 'personnage');
    for (const t of ['Anse-aux-Sels', 'Lames Grises']) {
      const c = par(t).charge;
      assert.ok(c === undefined || Object.keys(c).length === 0, `${t} ne porte pas de charge: ${JSON.stringify(c)}`);
    }
  });

  test('POST relations : la réponse 201 porte la même cible, charge comprise', async () => {
    // panne : la cible de la réponse du POST est construite sans charge
    const s = await ok(antor, 'GET', `/api/univers/${U}/fiches/${F['Anse-aux-Sels']}`);
    const sec = s.sections[0].id;
    const pj = await api(antor, 'POST', relUrl(F['Anse-aux-Sels'], sec), { cibleFicheId: F['Léa Brisefer'], type: 'ami de' });
    assert.equal(pj.status, 201);
    assert.deepEqual(pj.body.cible.charge, { pj: true });
    const pnj = await api(antor, 'POST', relUrl(F['Anse-aux-Sels'], sec), { cibleFicheId: F['Maître Aldric'], type: 'ennemi de' });
    assert.equal(pnj.status, 201);
    assert.deepEqual(pnj.body.cible.charge, { pj: false });
    const lieu = await api(antor, 'POST', relUrl(F['Anse-aux-Sels'], sec), { cibleFicheId: F['Lames Grises'], type: 'allié de' });
    assert.equal(lieu.status, 201);
    assert.ok(lieu.body.cible.charge === undefined || Object.keys(lieu.body.cible.charge).length === 0);
  });

  test('la charge d une cible qui n est pas un personnage ne fuit pas (compte-rendu : pas de campagne_id)', async () => {
    // panne : la charge entière de la fiche cible est jointe sans filtre
    const c = await ok(antor, 'POST', `/api/univers/${U}/campagnes`, { nom: 'La Couronne brisée' });
    const cr = await ok(lea, 'POST', `/api/univers/${U}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 3', texte: 'Aldric parle.' });
    const r = await api(antor, 'POST', relUrl(F['Port-Sel'], secPortSel), { cibleFicheId: cr.id, type: 'raconté dans' });
    assert.equal(r.status, 201);
    const { relations } = await ok(antor, 'GET', relUrl(F['Port-Sel'], secPortSel));
    const cible = relations.find((x: Any) => x.cible.titre === 'Séance 3').cible;
    assert.equal(JSON.stringify(cible).includes('campagne'), false, JSON.stringify(cible));
    assert.equal(JSON.stringify(r.body.cible).includes('campagne'), false, JSON.stringify(r.body.cible));
    assert.equal(cible.charge?.pj, undefined);
  });

  test('E-9 : relier par l écran à un PJ puis à un PNJ affiche PJ puis PNJ, la fiche reste ouverte', async () => {
    // panne : l'écran lit charge.pj sur une cible sans charge (plantage) ou affiche le mauvais badge
    const id = (await ok(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'lieu', titre: 'Cap Brume' })).id;
    await ok(antor, 'POST', `/api/univers/${U}/fiches/${id}/sections`, { titre: 'Description', contenu: 'Brume.' });
    const erreurs: string[] = [];
    antor.on('pageerror', (e: Error) => erreurs.push(e.message));
    await ouvrir(antor, 'Cap Brume', id);
    await relierParEcran(antor, 'allié de', 'Personnage', 'les personnages', 'Léa Brisefer');
    await relierParEcran(antor, 'tenu par', 'Personnage', 'les personnages', 'Maître Aldric');
    await relierParEcran(antor, 'voisin de', 'Lieu', 'les lieux', 'Port-Sel');
    await relierParEcran(antor, 'sous', 'Faction', 'les factions', 'Lames Grises');
    assert.deepEqual(erreurs, []);
    await antor.getByRole('heading', { level: 1, name: 'Cap Brume' }).waitFor();
    const txt = async (c: string) => (await ligne(antor, c).innerText()).replace(/\s+/g, ' ');
    assert.match(await txt('Léa Brisefer'), /\bPJ\b/);
    assert.doesNotMatch(await txt('Léa Brisefer'), /\bPNJ\b/);
    assert.match(await txt('Maître Aldric'), /\bPNJ\b/);
    assert.doesNotMatch(await txt('Maître Aldric'), /\bPJ\b/);
    assert.match(await txt('Port-Sel'), /Lieu/);
    assert.doesNotMatch(await txt('Port-Sel'), /\bPN?J\b/);
    assert.match(await txt('Lames Grises'), /Faction/);
    await antor.screenshot({ path: `${SHOTS}/relation-badge-relie.png`, fullPage: true });
    // rouverture : mêmes badges
    const erreurs2 = await ouvrir(antor, 'Cap Brume', id);
    assert.deepEqual(erreurs2, []);
    assert.match(await txt('Léa Brisefer'), /\bPJ\b/);
    assert.match(await txt('Maître Aldric'), /\bPNJ\b/);
    assert.doesNotMatch(await txt('Maître Aldric'), /\bPJ\b/);
    F['Cap Brume'] = id;
  });

  test('E-9 : une fiche déjà reliée à des personnages s ouvre sans erreur (cas de la production)', async () => {
    // panne : « Cannot read properties of undefined (reading 'pj') »
    const erreurs = await ouvrir(antor, 'Port-Sel', F['Port-Sel']);
    assert.deepEqual(erreurs, []);
    assert.equal(await ligne(antor, 'Léa Brisefer').count(), 1);
    assert.equal(await ligne(antor, 'Maître Aldric').count(), 1);
    await antor.screenshot({ path: `${SHOTS}/relation-badge-ouverture.png`, fullPage: true });
  });

  test('Léa (Joueur) voit les badges exacts des cibles qu elle lit, rien des cibles qu elle ne lit pas', async () => {
    // panne : badge absent côté joueur, ou une cible illisible laisse une ligne
    await ok(antor, 'POST', relUrl(F['Port-Sel'], secPortSel), { cibleFicheId: F['Le Prieur masqué'], type: 'craint' });
    const api_ = await ok(lea, 'GET', relUrl(F['Port-Sel'], secPortSel));
    const titres = api_.relations.map((r: Any) => r.cible.titre);
    assert.ok(!titres.includes('Le Prieur masqué'));
    assert.ok(titres.includes('Léa Brisefer'));
    const erreurs = await ouvrir(lea, 'Port-Sel', F['Port-Sel']);
    assert.deepEqual(erreurs, []);
    assert.match((await ligne(lea, 'Léa Brisefer').innerText()).replace(/\s+/g, ' '), /\bPJ\b/);
    const aldric = (await ligne(lea, 'Maître Aldric').innerText()).replace(/\s+/g, ' ');
    assert.match(aldric, /\bPNJ\b/);
    assert.doesNotMatch(aldric, /\bPJ\b/);
    assert.equal(await lea.getByText('Prieur').count(), 0);
    await lea.screenshot({ path: `${SHOTS}/relation-badge-joueur.png`, fullPage: true });
  });
});
