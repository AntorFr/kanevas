import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
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

type H = { cookie: string };
const appel = (app: App, h: H | undefined, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

test('instance : 401 sans session, 404 identique à une adresse inconnue hors Admin', async () => {
  const app = await buildApp();
  const routes: ['GET' | 'POST' | 'PATCH' | 'DELETE', string, object?][] = [
    ['GET', '/api/instance/univers'],
    ['GET', '/api/instance/univers/1/membres'],
    ['POST', '/api/instance/univers/1/membres', { username: 'lea' }],
    ['PATCH', '/api/instance/univers/1/membres/1', { role: 'mj' }],
    ['DELETE', '/api/instance/univers/1/membres/1'],
    ['POST', '/api/instance/univers/abc/membres', {}],
    ['PATCH', '/api/instance/univers/1/membres/1', {}],
  ];
  for (const [m, u, p] of routes) {
    assert.equal((await appel(app, undefined, m, u, p)).statusCode, 401, `${m} ${u}`);
  }
  const antor = await connecter(app, 'antor');
  await appel(app, antor, 'POST', '/api/univers', { nom: 'U' });
  const ref = await appel(app, antor, 'GET', '/api/adresse-inconnue');
  assert.equal(ref.statusCode, 404);
  for (const compte of ['lea', 'antor', 'teo']) {
    const h = await connecter(app, compte);
    for (const [m, u, p] of routes) {
      const r = await appel(app, h, m, u, p);
      assert.equal(r.statusCode, 404, `${compte} ${m} ${u}`);
      assert.equal(r.body, ref.body, `${compte} ${m} ${u}`);
      assert.equal(r.headers['content-type'], ref.headers['content-type']);
    }
  }
  await app.close();
});

test('instance : Admin liste, répare les membres, sans description ; ne voit pas les fiches sans rôle', async () => {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const admin = await connecter(app, 'admin');
  const teo = await connecter(app, 'teo');
  void teo;

  const cree = await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène', description: 'SECRET' });
  assert.equal(cree.statusCode, 201);
  const id = cree.json().id;
  const base = `/api/instance/univers/${id}/membres`;

  const liste = await appel(app, admin, 'GET', '/api/instance/univers');
  assert.equal(liste.statusCode, 200);
  assert.deepEqual(liste.json(), [{ id, nom: 'Lame d’Ébène', nbMembres: 1 }]);
  assert.ok(!liste.body.includes('SECRET'));

  // Admin n'est pas membre : 404 sur l'univers et ses fiches
  assert.equal((await appel(app, admin, 'GET', `/api/univers/${id}`)).statusCode, 404);
  assert.equal((await appel(app, admin, 'GET', `/api/univers/${id}/fiches`)).statusCode, 404);

  const inconnu = await appel(app, admin, 'POST', base, { username: 'fantome' });
  assert.equal(inconnu.statusCode, 400);
  assert.equal(inconnu.json().message, "Ce compte ne s'est jamais connecté.");

  const ajout = await appel(app, admin, 'POST', base, { username: 'lea' });
  assert.equal(ajout.statusCode, 201);
  assert.equal(ajout.json().role, 'joueur');
  const leaId = ajout.json().compteId;
  assert.ok(!JSON.stringify(ajout.json()).includes('SECRET'));
  assert.equal((await appel(app, admin, 'POST', base, { username: 'lea' })).statusCode, 400);
  assert.equal((await appel(app, admin, 'POST', base, { username: 'lea', role: 'roi' })).statusCode, 400);
  assert.equal((await appel(app, admin, 'POST', base, {})).statusCode, 400);

  const membres = await appel(app, admin, 'GET', base);
  assert.equal(membres.statusCode, 200);
  assert.deepEqual(membres.json().map((m: { username: string }) => m.username), ['antor', 'lea']);
  assert.equal((await appel(app, admin, 'GET', '/api/instance/univers/9999/membres')).statusCode, 404);
  assert.equal((await appel(app, admin, 'GET', '/api/instance/univers/abc/membres')).statusCode, 404);

  const antorId = membres.json()[0].compteId;
  // dernier MJ
  const dernier = await appel(app, admin, 'PATCH', `${base}/${antorId}`, { role: 'joueur' });
  assert.equal(dernier.statusCode, 400);
  assert.equal(dernier.json().message, 'Impossible : l’univers doit garder au moins un MJ.'.replace('’', "'"));
  assert.equal((await appel(app, admin, 'DELETE', `${base}/${antorId}`)).statusCode, 400);
  assert.equal((await appel(app, admin, 'PATCH', `${base}/${leaId}`, { role: 'roi' })).statusCode, 400);
  assert.equal((await appel(app, admin, 'PATCH', `${base}/${leaId}`, {})).statusCode, 400);

  // Léa promue MJ puis Antor retiré : réparation
  const promu = await appel(app, admin, 'PATCH', `${base}/${leaId}`, { role: 'mj' });
  assert.equal(promu.statusCode, 200);
  assert.equal(promu.json().role, 'mj');
  assert.equal((await appel(app, admin, 'DELETE', `${base}/${antorId}`)).statusCode, 204);
  assert.equal((await appel(app, antor, 'GET', `/api/univers/${id}`)).statusCode, 404);
  assert.equal((await appel(app, lea, 'GET', `/api/univers/${id}`)).statusCode, 200);

  // Admin s'ajoute lui-même MJ : 200 ensuite
  const moi = await appel(app, admin, 'POST', base, { username: 'admin', role: 'mj' });
  assert.equal(moi.statusCode, 201);
  assert.equal((await appel(app, admin, 'GET', `/api/univers/${id}`)).statusCode, 200);
  assert.equal((await appel(app, admin, 'GET', '/api/instance/univers')).json()[0].nbMembres, 2);
  await app.close();
});

test('instance : l’acteur ne vient jamais du corps ni de la requête', async () => {
  const app = await buildApp();
  const lea = await connecter(app, 'lea');
  const r = await appel(app, lea, 'POST', '/api/instance/univers/1/membres', {
    username: 'lea', admin: true, groups: ['parents'],
  });
  assert.equal(r.statusCode, 404);
  const r2 = await app.inject({ method: 'GET', url: '/api/instance/univers?admin=true&groups=parents', headers: { ...lea, 'x-groups': 'parents' } });
  assert.equal(r2.statusCode, 404);
  await app.close();
});
