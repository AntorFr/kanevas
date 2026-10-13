import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };

async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

async function monde(app: App) {
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const admin = await connecter(app, 'admin');
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  await appel(app, antor, 'POST', `/api/univers/${lame.id}/membres`, { username: 'lea' });
  const mirU = (await appel(app, mira, 'POST', '/api/univers', { nom: 'Aube Secrète' })).json();
  const brume = (await appel(app, admin, 'POST', '/api/univers', { nom: 'Brume' })).json();
  return { antor, lea, teo, mira, admin, lame, mirU, brume };
}

test('sans session, chaque route répond 401', async () => {
  const app = await buildApp();
  const routes: [Parameters<typeof appel>[2], string][] = [
    ['GET', '/api/systemes'],
    ['GET', '/api/systemes/catalogue'],
    ['GET', '/api/systemes/1'],
    ['POST', '/api/systemes'],
    ['POST', '/api/systemes/1/gabarits'],
    ['PUT', '/api/systemes/1/gabarits/1'],
    ['PATCH', '/api/univers/1'],
    ['PUT', '/api/univers/1/systeme'],
    ['POST', '/api/univers/1/systeme-nouveau'],
  ];
  for (const [m, u] of routes) {
    assert.equal((await appel(app, null, m, u, {})).statusCode, 401, `${m} ${u}`);
  }
});

test('routes retirées : 404 pour un compte connecté', async () => {
  const app = await buildApp();
  const w = await monde(app);
  await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'S' });
  for (const [m, u] of [
    ['GET', `/api/univers/${w.lame.id}/systeme`],
    ['POST', `/api/univers/${w.lame.id}/systeme/gabarits`],
    ['PUT', `/api/univers/${w.lame.id}/systeme/gabarits/1`],
  ] as const) {
    assert.equal((await appel(app, w.antor, m, u, { type: 'regle', nom: 'x', contenu: '', version: 1 })).statusCode, 404, `${m} ${u}`);
  }
});

test('catalogue : couples (id, nom) seuls, MJ seulement ; création ; nom pris 409 nom_pris', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const cree = await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Epees & Sorts' });
  assert.equal(cree.statusCode, 201);
  assert.deepEqual(Object.keys(cree.json()).sort(), ['id', 'nom']);
  assert.equal((await appel(app, w.mira, 'POST', '/api/systemes', { nom: 'Cendres' })).statusCode, 201);
  assert.equal((await appel(app, w.admin, 'POST', '/api/systemes', { nom: 'Vapeur' })).statusCode, 201);

  const pris = await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'EPEES & sorts' });
  assert.equal(pris.statusCode, 409);
  assert.equal(pris.json().code, 'nom_pris');

  const liste = await appel(app, w.antor, 'GET', '/api/systemes/catalogue');
  assert.equal(liste.statusCode, 200);
  assert.deepEqual(liste.json().map((s: object) => Object.keys(s).sort()), [['id', 'nom'], ['id', 'nom'], ['id', 'nom']]);
  assert.deepEqual(liste.json().map((s: { nom: string }) => s.nom), ['Cendres', 'Epees & Sorts', 'Vapeur']);

  assert.equal((await appel(app, w.antor, 'POST', '/api/systemes', {})).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'POST', '/api/systemes', { nom: '  ' })).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'x'.repeat(81) })).statusCode, 400);
  assert.equal((await appel(app, w.teo, 'GET', '/api/systemes/catalogue')).statusCode, 403);
  assert.equal((await appel(app, w.lea, 'GET', '/api/systemes/catalogue')).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'POST', '/api/systemes', { nom: 'Z' })).statusCode, 403);
});

test('GET /api/systemes : systèmes visibles, forme exacte, Teo vide, Mira son seul univers', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const cof = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'CoF Mini' })).json();
  await appel(app, w.mira, 'PUT', `/api/univers/${w.mirU.id}/systeme`, { systemeId: cof.id });
  const cof2 = (await appel(app, w.admin, 'POST', `/api/univers/${w.brume.id}/systeme-nouveau`, { nom: 'Chroniques' })).json();
  await appel(app, w.antor, 'POST', `/api/systemes/${cof.id}/gabarits`, { type: 'regle', nom: 'Repos' });
  await appel(app, w.antor, 'POST', `/api/systemes/${cof.id}/gabarits`, { type: 'objet', nom: 'Lame' });
  await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Détaché' });

  const teo = await appel(app, w.teo, 'GET', '/api/systemes');
  assert.equal(teo.statusCode, 200);
  assert.deepEqual(teo.json(), []);

  const mira = await appel(app, w.mira, 'GET', '/api/systemes');
  assert.deepEqual(mira.json(), [
    {
      id: cof.id,
      nom: 'CoF Mini',
      nbUnivers: 2,
      entrees: { regle: 1, creature: 0, objet: 1 },
      mesUnivers: [{ id: w.mirU.id, nom: 'Aube Secrète', role: 'mj' }],
      peutEcrire: true,
    },
  ]);
  assert.ok(!mira.body.includes('"nom":"Lame"'));

  const lea = (await appel(app, w.lea, 'GET', '/api/systemes')).json();
  assert.equal(lea.length, 1);
  assert.deepEqual(lea[0].mesUnivers, [{ id: w.lame.id, nom: 'Lame', role: 'joueur' }]);
  assert.equal(lea[0].peutEcrire, false);
  assert.ok(!JSON.stringify(lea).includes('Aube Secrète'));

  assert.deepEqual((await appel(app, w.admin, 'GET', '/api/systemes')).json().map((x: { id: number }) => x.id), [cof2.id]);
  const antor = (await appel(app, w.antor, 'GET', '/api/systemes')).json();
  assert.deepEqual(antor.map((x: { nom: string }) => x.nom), ['CoF Mini']);
});

test('GET /api/univers et /api/univers/:id : système et nbMembres', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const s = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'CoF Mini' })).json();
  const un = (await appel(app, w.lea, 'GET', `/api/univers/${w.lame.id}`)).json();
  assert.deepEqual(un.systeme, { id: s.id, nom: 'CoF Mini' });
  const liste = (await appel(app, w.antor, 'GET', '/api/univers')).json();
  assert.equal(liste[0].nbMembres, 2);
  assert.deepEqual(liste[0].systeme, { id: s.id, nom: 'CoF Mini' });
  const mir = (await appel(app, w.mira, 'GET', '/api/univers')).json();
  assert.equal(mir[0].systeme, null);
  assert.equal(mir[0].nbMembres, 1);
  assert.equal((await appel(app, w.mira, 'GET', `/api/univers/${w.mirU.id}`)).json().systeme, null);
});

test('PATCH univers : Antor oui, Léa 403, Teo 404', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const url = `/api/univers/${w.lame.id}`;
  const ok = await appel(app, w.antor, 'PATCH', url, { nom: 'Lame d’Ébène', description: 'Une lame.' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().nom, 'Lame d’Ébène');
  assert.equal(ok.json().description, 'Une lame.');
  assert.equal((await appel(app, w.lea, 'PATCH', url, { nom: 'X', description: '' })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PATCH', url, { nom: 'X', description: '' })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PATCH', url, { nom: '', description: '' })).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'PATCH', url, { nom: 'ok', description: 'x'.repeat(501) })).statusCode, 400);
  // refusé : rien n'a changé
  assert.equal((await appel(app, w.antor, 'GET', url)).json().nom, 'Lame d’Ébène');
});

test('rattacher, détacher, créer et rattacher ; droits', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const sys = (await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Épées' })).json();
  const put = `/api/univers/${w.lame.id}/systeme`;
  const vue = (h: H, id: number) => appel(app, h, 'GET', `/api/systemes/${id}`);

  assert.equal((await vue(w.antor, sys.id)).statusCode, 404); // pas encore rattaché
  assert.equal((await appel(app, w.lea, 'PUT', put, { systemeId: sys.id })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PUT', put, { systemeId: sys.id })).statusCode, 404);
  assert.equal((await vue(w.antor, sys.id)).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PUT', put, { systemeId: 99999 })).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'PUT', put, {})).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'PUT', put, { systemeId: '1' })).statusCode, 400);

  assert.equal((await appel(app, w.antor, 'PUT', put, { systemeId: sys.id })).statusCode, 204);
  const vu = await vue(w.antor, sys.id);
  assert.equal(vu.statusCode, 200);
  assert.equal(vu.json().nom, 'Épées');
  assert.equal(vu.json().nbUnivers, 1);
  assert.equal((await vue(w.lea, sys.id)).statusCode, 200);
  assert.equal((await vue(w.teo, sys.id)).statusCode, 404);

  assert.equal((await appel(app, w.antor, 'PUT', put, { systemeId: null })).statusCode, 204);
  assert.equal((await vue(w.antor, sys.id)).statusCode, 404);

  const nv = await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Neuf' });
  assert.equal(nv.statusCode, 201);
  assert.equal((await vue(w.antor, nv.json().id)).json().nom, 'Neuf');
  const dup = await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Épées' });
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.json().code, 'nom_pris');
  assert.equal((await appel(app, w.antor, 'GET', `/api/univers/${w.lame.id}`)).json().systeme.nom, 'Neuf');
  assert.equal((await appel(app, w.lea, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'L' })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'T' })).statusCode, 404);
});

test('lecture : 404 de corps identique (inconnu, sans rôle, non rattaché, non entier) ; pas de fuite de noms', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const sys = (await appel(app, w.antor, 'POST', '/api/systemes', { nom: 'Commun' })).json();
  await appel(app, w.antor, 'PUT', `/api/univers/${w.lame.id}/systeme`, { systemeId: sys.id });
  await appel(app, w.mira, 'PUT', `/api/univers/${w.mirU.id}/systeme`, { systemeId: sys.id });
  await appel(app, w.antor, 'POST', `/api/systemes/${sys.id}/gabarits`, { type: 'regle', nom: 'Initiative', contenu: 'd20' });
  const url = `/api/systemes/${sys.id}`;

  const inconnu = await appel(app, w.antor, 'GET', '/api/systemes/99999');
  const teo = await appel(app, w.teo, 'GET', url);
  const admin = await appel(app, w.admin, 'GET', url); // MJ d'un univers non rattaché
  for (const r of [inconnu, teo, admin]) assert.equal(r.statusCode, 404);
  for (const r of [teo, admin]) assert.equal(r.body, inconnu.body);
  assert.equal((await appel(app, w.teo, 'GET', '/api/systemes/abc')).statusCode, 404);

  const vu = await appel(app, w.antor, 'GET', `${url}?type=regle`);
  assert.equal(vu.json().nbUnivers, 2);
  assert.equal(vu.json().peutEcrire, true);
  assert.deepEqual(vu.json().mesUnivers, [{ id: w.lame.id, nom: 'Lame', role: 'mj' }]);
  assert.equal(vu.json().gabarits[0].nom, 'Initiative');
  const mira = await appel(app, w.mira, 'GET', `${url}?type=regle`);
  assert.equal(mira.statusCode, 200);
  assert.equal(mira.json().gabarits.length, 1);
  assert.ok(!vu.body.includes('Aube Secrète'));
  assert.ok(!mira.body.includes('"Lame"'));
  assert.equal((await appel(app, w.antor, 'GET', `${url}?type=dragon`)).statusCode, 400);
  assert.equal((await appel(app, w.antor, 'GET', `${url}?curseur=%25%25`)).statusCode, 400);
});

test('gabarits : pagination par cent et curseur', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const s = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'Gros' })).json();
  const post = `/api/systemes/${s.id}/gabarits`;
  for (let i = 0; i < 101; i++) {
    const r = await appel(app, w.antor, 'POST', post, { type: 'creature', nom: `Bête ${String(i).padStart(3, '0')}` });
    assert.equal(r.statusCode, 201);
  }
  const url = `/api/systemes/${s.id}?type=creature`;
  const p1 = (await appel(app, w.lea, 'GET', url)).json();
  assert.equal(p1.gabarits.length, 100);
  assert.ok(p1.suivant);
  assert.equal(p1.gabarits[0].nom, 'Bête 000');
  const p2 = (await appel(app, w.lea, 'GET', `${url}&curseur=${p1.suivant}`)).json();
  assert.equal(p2.gabarits.length, 1);
  assert.equal(p2.gabarits[0].nom, 'Bête 100');
  assert.equal(p2.suivant, null);
  assert.equal((await appel(app, w.lea, 'GET', `/api/systemes/${s.id}?type=objet`)).json().gabarits.length, 0);
});

test('gabarits : écriture, droits, version périmée, autre système, MJ d’un second univers', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const sA = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'A' })).json();
  const sB = (await appel(app, w.mira, 'POST', `/api/univers/${w.mirU.id}/systeme-nouveau`, { nom: 'B' })).json();
  const post = `/api/systemes/${sA.id}/gabarits`;

  const g = await appel(app, w.antor, 'POST', post, { type: 'regle', nom: 'Soin', contenu: 'v1' });
  assert.equal(g.statusCode, 201);
  assert.equal(g.json().version, 1);
  assert.equal((await appel(app, w.lea, 'POST', post, { type: 'regle', nom: 'L' })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'POST', post, { type: 'regle', nom: 'T' })).statusCode, 404);
  assert.equal((await appel(app, w.mira, 'POST', post, { type: 'regle', nom: 'M' })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'POST', post, { type: 'regle', nom: 'soin' })).statusCode, 409);
  assert.equal((await appel(app, w.antor, 'POST', post, { type: 'monstre', nom: 'M' })).statusCode, 400);

  const put = `${post}/${g.json().id}`;
  const m = await appel(app, w.antor, 'PUT', put, { nom: 'Soin+', contenu: 'v2', version: 1 });
  assert.equal(m.statusCode, 200);
  assert.equal(m.json().version, 2);
  const perime = await appel(app, w.antor, 'PUT', put, { nom: 'X', contenu: 'v3', version: 1 });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'gabarit_modifie');
  assert.equal((await appel(app, w.lea, 'PUT', put, { nom: 'X', contenu: 'x', version: 2 })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PUT', put, { nom: 'X', contenu: 'x', version: 2 })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PUT', put, { nom: 'X', contenu: 'x' })).statusCode, 400);

  // Mira, MJ of B, aims at A's template through B's address: not found, nothing written
  const mur = `/api/systemes/${sB.id}/gabarits/${g.json().id}`;
  assert.equal((await appel(app, w.mira, 'PUT', mur, { nom: 'Pirate', contenu: 'x', version: 2 })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PUT', `${post}/99999`, { nom: 'X', contenu: 'x', version: 1 })).statusCode, 404);
  assert.equal((await appel(app, w.antor, 'PUT', `${post}/abc`, { nom: 'X', contenu: 'x', version: 1 })).statusCode, 404);
  const apres = (await appel(app, w.antor, 'GET', `/api/systemes/${sA.id}?type=regle`)).json().gabarits[0];
  assert.equal(apres.nom, 'Soin+');
  assert.equal(apres.version, 2);

  // AD-94: Mira's second universe, attached to A, makes her GM of A
  const m2 = (await appel(app, w.mira, 'POST', '/api/univers', { nom: 'Second' })).json();
  await appel(app, w.mira, 'PUT', `/api/univers/${m2.id}/systeme`, { systemeId: sA.id });
  assert.equal((await appel(app, w.mira, 'POST', post, { type: 'objet', nom: 'Par Mira' })).statusCode, 201);
});

test('aucune route ne supprime', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const s = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'S' })).json();
  const g = (await appel(app, w.antor, 'POST', `/api/systemes/${s.id}/gabarits`, { type: 'objet', nom: 'Épée' })).json();
  for (const u of ['/api/systemes', `/api/systemes/${s.id}`, `/api/systemes/${s.id}/gabarits/${g.id}`]) {
    assert.ok((await appel(app, w.antor, 'DELETE', u)).statusCode >= 400, u);
  }
  assert.equal((await appel(app, w.antor, 'GET', `/api/systemes/${s.id}?type=objet`)).json().gabarits.length, 1);
});
