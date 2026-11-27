// kanevas-systemes-jeu-api-socle (review): a tool-only token takes no system, by creation and by change; revoked token; owner of a row.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
type Any = Record<string, any>;

test('jeton d’outils seul : l’outil existe, une liste non vide est refusée à la création et au changement, [] passe ; un jeton révoqué refuse le changement', async () => {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  const h = { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  const appel = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
  const adm = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=admin' });
  const ha = { cookie: `kanevas_session=${adm.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
  const rs = await appel('POST', '/api/systemes', { nom: 'Solo' });
  const sys = rs.json();
  assert.ok(sys.id, rs.body);
  assert.equal((await app.inject({ method: 'POST', url: `/api/instance/systemes/${sys.id}/membres`, headers: ha, payload: { username: 'antor' } })).statusCode, 201);
  const cle = 'essai/g';
  const E = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai") as Any).id;
  const tous = { tous: false, univers: [{ universId: E, niveau: 'ecriture' }] };
  const tousC = { tous: true, niveauTous: 'lecture' };
  const r = await appel('POST', '/api/compte/jetons', { nom: 'o', dureeJours: 30, acces: tous, contenu: false, outils: [cle], systemes: [{ id: sys.id, niveau: 'lecture' }] });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().champ, 'systemes');
  const ok = await appel('POST', '/api/compte/jetons', { nom: 'o', dureeJours: 30, acces: tous, contenu: false, outils: [cle] });
  assert.equal(ok.statusCode, 201, ok.body);
  const url = `/api/compte/jetons/${ok.json().jeton.id}`;
  const p = await appel('PATCH', url, { acces: tous, systemes: [{ id: sys.id, niveau: 'lecture' }] });
  assert.equal(p.statusCode, 400);
  assert.equal(p.json().champ, 'systemes');
  assert.equal((await appel('PATCH', url, { acces: tous, systemes: [] })).statusCode, 200);
  assert.deepEqual((await appel('PATCH', url, { acces: tous })).json().jeton.systemes, []);
  // revoked content token: no change at all
  const c = (await appel('POST', '/api/compte/jetons', { nom: 'c', dureeJours: 30, acces: tousC, systemes: [{ id: sys.id, niveau: 'ecriture' }] })).json().jeton;
  assert.equal((await appel('DELETE', `/api/compte/jetons/${c.id}`)).statusCode, 200);
  const rev = await appel('PATCH', `/api/compte/jetons/${c.id}`, { acces: tousC, systemes: [] });
  assert.ok(rev.statusCode >= 400, rev.body);
  const n = (app.db.prepare('SELECT COUNT(*) AS n FROM jetons_api j JOIN jetons_systemes s ON s.jeton_id = j.id WHERE j.id = ?').get(c.id) as Any).n;
  assert.equal(n, 1, 'the revoked token keeps its row');
  await app.close();
});
