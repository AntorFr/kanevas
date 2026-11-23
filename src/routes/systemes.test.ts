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
    ['GET', '/api/systemes/1/gabarits'],
    ['POST', '/api/systemes/1/gabarits'],
    ['PUT', '/api/systemes/1/gabarits/1'],
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
      mesUnivers: [{ id: w.mirU.id, nom: 'Aube Secrète', role: 'mj' }],
      peutEcrire: false, // a GM of an attached universe is not a GM of the system (AD-152)
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
  const url = `/api/systemes/${sys.id}`;

  const inconnu = await appel(app, w.antor, 'GET', '/api/systemes/99999');
  const teo = await appel(app, w.teo, 'GET', url);
  const admin = await appel(app, w.admin, 'GET', url); // instance admin, no link: the header only (AD-157)
  for (const r of [inconnu, teo]) assert.equal(r.statusCode, 404);
  assert.equal(teo.body, inconnu.body);
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.json().fiches, undefined);
  assert.equal((await appel(app, w.teo, 'GET', '/api/systemes/abc')).statusCode, 404);

  const vu = await appel(app, w.antor, 'GET', url);
  assert.equal(vu.json().nbUnivers, 2);
  assert.equal(vu.json().peutEcrire, false);
  assert.deepEqual(vu.json().mesUnivers, [{ id: w.lame.id, nom: 'Lame', role: 'mj' }]);
  assert.equal(vu.json().gabarits, undefined);
  const mira = await appel(app, w.mira, 'GET', url);
  assert.equal(mira.statusCode, 200);
  assert.ok(!vu.body.includes('Aube Secrète'));
  assert.ok(!mira.body.includes('"Lame"'));
});

test('PUT types : réservé aux MJ du système ; un MJ d’univers rattaché reçoit 403, un étranger 404', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const s = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'A' })).json();
  const url = `/api/systemes/${s.id}/types/objet`;
  assert.equal((await appel(app, w.antor, 'PUT', url, { active: false })).statusCode, 403);
  assert.equal((await appel(app, w.lea, 'PUT', url, { active: false })).statusCode, 403);
  assert.equal((await appel(app, w.teo, 'PUT', url, { active: false })).statusCode, 404);
});

test('aucune route ne supprime', async () => {
  const app = await buildApp();
  const w = await monde(app);
  const s = (await appel(app, w.antor, 'POST', `/api/univers/${w.lame.id}/systeme-nouveau`, { nom: 'S' })).json();
  for (const u of ['/api/systemes', `/api/systemes/${s.id}`]) {
    assert.ok((await appel(app, w.antor, 'DELETE', u)).statusCode >= 400, u);
  }
  assert.equal((await appel(app, w.antor, 'GET', `/api/systemes/${s.id}`)).statusCode, 200);
});
