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

const appel = (app: App, h: { cookie: string }, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, payload });

test('critère de sortie : univers, membres, 404, dernier MJ, retrait', async () => {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');

  // compte neuf : liste vide
  const vide = await appel(app, mira, 'GET', '/api/univers');
  assert.equal(vide.statusCode, 200);
  assert.deepEqual(vide.json(), []);

  // B-2
  const cree = await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' });
  assert.equal(cree.statusCode, 201);
  const u = cree.json();
  assert.equal(u.nom, 'Lame d’Ébène');
  assert.equal(u.role, 'mj');
  const base = `/api/univers/${u.id}`;

  // B-3
  const inconnu = await appel(app, antor, 'POST', `${base}/membres`, { username: 'inconnu' });
  assert.equal(inconnu.statusCode, 400);
  assert.equal(inconnu.json().message, "Ce compte ne s'est jamais connecté.");

  const ajout = await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  assert.equal(ajout.statusCode, 201);
  assert.equal(ajout.json().role, 'joueur');
  const leaId = ajout.json().compteId;

  const liste = (await appel(app, lea, 'GET', '/api/univers')).json();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].nom, 'Lame d’Ébène');
  assert.equal(liste[0].role, 'joueur');

  // doublon
  assert.equal((await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' })).statusCode, 400);

  // B-4 : Teo sans rôle
  assert.equal((await appel(app, teo, 'GET', base)).statusCode, 404);
  assert.equal((await appel(app, teo, 'GET', `${base}/membres`)).statusCode, 404);
  assert.equal((await appel(app, teo, 'POST', `${base}/membres`, { username: 'teo' })).statusCode, 404);
  // Léa joueuse
  assert.equal((await appel(app, lea, 'GET', base)).statusCode, 200);
  assert.equal((await appel(app, lea, 'GET', `${base}/membres`)).statusCode, 404);
  assert.equal((await appel(app, lea, 'POST', `${base}/membres`, { username: 'teo', role: 'mj' })).statusCode, 403);
  assert.equal((await appel(app, lea, 'DELETE', `${base}/membres/${leaId}`)).statusCode, 403);

  // MJ voit les membres
  const membres = (await appel(app, antor, 'GET', `${base}/membres`)).json();
  assert.deepEqual(membres.map((m: { username: string; role: string }) => [m.username, m.role]), [
    ['antor', 'mj'],
    ['lea', 'joueur'],
  ]);
  const antorId = membres[0].compteId;

  // B-5
  const dernier = await appel(app, antor, 'DELETE', `${base}/membres/${antorId}`);
  assert.equal(dernier.statusCode, 400);
  assert.equal(dernier.json().message, "Impossible : l'univers doit garder au moins un MJ.");
  assert.equal((await appel(app, antor, 'PATCH', `${base}/membres/${antorId}`, { role: 'joueur' })).statusCode, 400);

  // rôle inconnu
  assert.equal((await appel(app, antor, 'PATCH', `${base}/membres/${leaId}`, { role: 'roi' })).statusCode, 400);

  // retrait de Léa → 404 à la requête suivante
  assert.equal((await appel(app, antor, 'DELETE', `${base}/membres/${leaId}`)).statusCode, 204);
  assert.equal((await appel(app, lea, 'GET', base)).statusCode, 404);
  assert.deepEqual((await appel(app, lea, 'GET', '/api/univers')).json(), []);
  await app.close();
});

test('entrées invalides : nom vide/long, identifiants de chemin, sans session', async () => {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  assert.equal((await appel(app, antor, 'POST', '/api/univers', { nom: '   ' })).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', '/api/univers', { nom: 'x'.repeat(81) })).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', '/api/univers', {})).statusCode, 400);
  assert.equal((await appel(app, antor, 'POST', '/api/univers', { nom: 'x'.repeat(80) })).statusCode, 201);
  for (const id of ['abc', '-1', '1.5', '99999999999999999999', '9999']) {
    assert.equal((await appel(app, antor, 'GET', `/api/univers/${id}`)).statusCode, 404, id);
  }
  assert.equal((await app.inject({ url: '/api/univers' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/univers', payload: { nom: 'a' } })).statusCode, 401);
  await app.close();
});

test('changer le rôle : promotion en MJ puis rétrogradation permise avec deux MJ', async () => {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'U' })).json();
  const base = `/api/univers/${u.id}`;
  const leaId = (await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' })).json().compteId;
  const p = await appel(app, antor, 'PATCH', `${base}/membres/${leaId}`, { role: 'mj' });
  assert.equal(p.statusCode, 200);
  assert.equal((await appel(app, lea, 'GET', `${base}/membres`)).statusCode, 200);
  assert.equal((await appel(app, lea, 'GET', '/api/univers')).json()[0].role, 'mj');
  assert.equal((await appel(app, antor, 'PATCH', `${base}/membres/${leaId}`, { role: 'joueur' })).statusCode, 200);
  assert.equal((await appel(app, lea, 'GET', `${base}/membres`)).statusCode, 404);
  await app.close();
});
