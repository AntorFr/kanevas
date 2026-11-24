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

const appel = (app: App, h: H | null, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: h ?? {}, payload });

async function monde() {
  const app = await buildApp();
  const [antor, lea, mira, admin] = [
    await connecter(app, 'antor'),
    await connecter(app, 'lea'),
    await connecter(app, 'mira'),
    await connecter(app, 'admin'),
  ];
  const lame = (await appel(app, antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const sys = (await appel(app, antor, 'POST', `/api/univers/${lame.id}/systeme-nouveau`, { nom: 'Zeta' })).json();
  const compteId = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  return { app, antor, lea, mira, admin, sys, compteId };
}

test('admin : ajoute un MJ au système, le liste, le retire, y compris le dernier', async () => {
  const w = await monde();
  const base = `/api/instance/systemes/${w.sys.id}/membres`;
  const avant = (await appel(w.app, w.admin, 'GET', base)).json() as { username: string }[];
  const ajout = await appel(w.app, w.admin, 'POST', base, { username: 'mira' });
  assert.equal(ajout.statusCode, 201, ajout.body);
  assert.equal(ajout.json().role, 'mj');
  const apres = (await appel(w.app, w.admin, 'GET', base)).json() as { username: string }[];
  assert.equal(apres.length, avant.length + 1);
  // a system with no universe is still listed to its GM
  const liste = (await appel(w.app, w.admin, 'GET', '/api/instance/systemes')).json();
  const s = liste.find((x: { id: number }) => x.id === w.sys.id);
  assert.deepEqual(s, { id: w.sys.id, nom: 'Zeta', nbUnivers: 1, nbMJ: apres.length });
  // remove everyone, the last included
  for (const m of apres as unknown as { compteId: number }[]) {
    assert.equal((await appel(w.app, w.admin, 'DELETE', `${base}/${m.compteId}`)).statusCode, 204);
  }
  assert.deepEqual((await appel(w.app, w.admin, 'GET', base)).json(), []);
  const l2 = (await appel(w.app, w.admin, 'GET', '/api/instance/systemes')).json();
  assert.equal(l2.find((x: { id: number }) => x.id === w.sys.id).nbMJ, 0);
  // removing again: not found
  assert.equal((await appel(w.app, w.admin, 'DELETE', `${base}/${w.compteId('mira')}`)).statusCode, 404);
  // the writer lost his right
  const r = await appel(w.app, w.antor, 'POST', `/api/systemes/${w.sys.id}/fiches`, { type: 'objet', titre: 'X' });
  assert.ok([403, 404].includes(r.statusCode), String(r.statusCode));
  await w.app.close();
});

test('admin : refus d’un compte inconnu, d’un doublon, d’un corps faux, d’un système inconnu', async () => {
  const w = await monde();
  const base = `/api/instance/systemes/${w.sys.id}/membres`;
  const inconnu = await appel(w.app, w.admin, 'POST', base, { username: 'personne' });
  assert.equal(inconnu.statusCode, 400);
  assert.equal(inconnu.json().message, 'Aucun compte ne porte cet identifiant.');
  assert.equal((await appel(w.app, w.admin, 'POST', base, { username: 'mira' })).statusCode, 201);
  const doublon = await appel(w.app, w.admin, 'POST', base, { username: 'mira' });
  assert.equal(doublon.statusCode, 400);
  assert.equal(doublon.json().message, 'Ce compte est déjà MJ de ce système.');
  assert.equal((await appel(w.app, w.admin, 'POST', base, {})).statusCode, 400);
  assert.equal((await appel(w.app, w.admin, 'GET', '/api/instance/systemes/9999/membres')).statusCode, 404);
  assert.equal((await appel(w.app, w.admin, 'POST', '/api/instance/systemes/9999/membres', { username: 'mira' })).statusCode, 404);
  assert.equal((await appel(w.app, w.admin, 'GET', '/api/instance/systemes/abc/membres')).statusCode, 404);
  await w.app.close();
});

test('non-admin : 401 sans session, sinon le corps d’une adresse inconnue, et rien n’est écrit', async () => {
  const w = await monde();
  const base = `/api/instance/systemes/${w.sys.id}/membres`;
  const routes: ['GET' | 'POST' | 'DELETE', string, object?][] = [
    ['GET', '/api/instance/systemes'],
    ['GET', base],
    ['POST', base, { username: 'mira' }],
    ['DELETE', `${base}/${w.compteId('antor')}`],
  ];
  for (const [m, u, p] of routes) assert.equal((await appel(w.app, null, m, u, p)).statusCode, 401, `${m} ${u}`);
  const ref = await appel(w.app, w.antor, 'GET', '/api/adresse-inconnue');
  for (const h of [w.antor, w.lea, w.mira]) {
    for (const [m, u, p] of routes) {
      const r = await appel(w.app, h, m, u, p);
      assert.equal(r.statusCode, 404, `${m} ${u}`);
      assert.equal(r.body, ref.body);
    }
  }
  const n = (w.app.db.prepare("SELECT count(*) n FROM membres m JOIN univers e ON e.id=m.univers_id WHERE e.espace_systeme_id = ?").get(w.sys.id) as { n: number }).n;
  assert.equal(n, 0, 'nothing written by a refused call');
  await w.app.close();
});

test('GET /api/systemes liste, pour son MJ, un système sans univers', async () => {
  const w = await monde();
  await appel(w.app, w.admin, 'POST', `/api/instance/systemes/${w.sys.id}/membres`, { username: 'mira' });
  w.app.db.prepare('UPDATE univers SET systeme_id = NULL WHERE systeme_id = ?').run(w.sys.id);
  const liste = (await appel(w.app, w.mira, 'GET', '/api/systemes')).json();
  assert.ok(JSON.stringify(liste).includes('Zeta'), JSON.stringify(liste));
  await w.app.close();
});
