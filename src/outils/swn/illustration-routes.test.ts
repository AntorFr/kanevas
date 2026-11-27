import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-carte-illustration, route side: GET …/interieur/:q/:r/astres/:cle/illustration?cote=N.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, Record<string, string>> = {};
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const sys = (cle: string, q: number, r: number, secret: number) => {
    const sid = app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',?,0)")
      .run(g, E, cle, cle, q, r, secret).lastInsertRowid as number;
    app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)").run(sid, 'p1', 'planete', 'rocheux', 2, 4, 0.1);
  };
  sys('il-secret', 60, 61, 1);
  sys('il-ouvert', 62, 63, 0);
  const get = (who: string, path: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/${path}`, headers: { ...(h[who] ?? {}), ...headers } });
  return { app, E, g, get, h };
}

test('route : 200 WebP avec Cache-Control private, no-cache et ETag ; avec l\'ETag, 304 sans corps ; autre ETag, 200', async () => {
  const w = await monde();
  const r = await w.get('lea', '62/63/astres/p1/illustration?cote=64');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'image/webp');
  assert.equal(r.headers['cache-control'], 'private, no-cache');
  const etag = String(r.headers.etag);
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  assert.equal(r.rawPayload.subarray(8, 12).toString('latin1'), 'WEBP');
  const n = await w.get('lea', '62/63/astres/p1/illustration?cote=64', { 'if-none-match': etag });
  assert.equal(n.statusCode, 304);
  assert.equal(n.body, '');
  assert.equal(n.headers.etag, etag);
  assert.equal((await w.get('lea', '62/63/astres/p1/illustration?cote=64', { 'if-none-match': '"autre"' })).statusCode, 200);
  assert.notEqual((await w.get('lea', '62/63/astres/p1/illustration?cote=65')).headers.etag, etag);
}, { timeout: 60_000 });

test('route : cote absent, hors bornes ou non entier = 400 invalide champ cote', async () => {
  const w = await monde();
  for (const c of ['', '?cote=63', '?cote=2049', '?cote=abc', '?cote=64.5', '?cote=-64', '?cote=1e2', '?cote=99999999999999999999', '?cote=64&cote=65']) {
    const r = await w.get('lea', `62/63/astres/p1/illustration${c}`);
    assert.equal(r.statusCode, 400, c);
    assert.equal(r.json().champ, 'cote', c);
    assert.equal(r.json().code, 'invalide', c);
  }
});

test('route : cle inconnue, hexagone inconnu, secret (joueuse), q non entier : le même 404, octet pour octet ; le MJ lit le secret', async () => {
  const w = await monde();
  const ref = await w.get('lea', '62/63/astres/inconnu/illustration?cote=64');
  assert.equal(ref.statusCode, 404);
  for (const p of ['62/63/astres/inconnu/illustration?cote=64', '5/5/astres/p1/illustration?cote=64', '60/61/astres/p1/illustration?cote=64',
    'abc/63/astres/p1/illustration?cote=64', '1.5/63/astres/p1/illustration?cote=64', '60/61/astres/p1/illustration?cote=3', '60/61/astres/p1/illustration']) {
    const x = await w.get('lea', p);
    assert.equal(x.statusCode, 404, p);
    assert.equal(x.body, ref.body, p);
  }
  assert.equal((await w.get('teo', '62/63/astres/p1/illustration?cote=64')).statusCode, 404);
  // The ETag of a readable picture opens nothing on the hidden system.
  const etag = String((await w.get('lea', '62/63/astres/p1/illustration?cote=64')).headers.etag);
  const cache = await w.get('lea', '60/61/astres/p1/illustration?cote=64', { 'if-none-match': etag });
  assert.equal(cache.statusCode, 404);
  assert.equal((await w.get('antor', '60/61/astres/p1/illustration?cote=64')).statusCode, 200);
}, { timeout: 60_000 });

test('route : sans session refusée', async () => {
  const w = await monde();
  const r = await w.get('personne', '62/63/astres/p1/illustration?cote=64');
  assert.ok([401, 302, 403].includes(r.statusCode), String(r.statusCode));
  assert.notEqual(r.headers['content-type'], 'image/webp');
});
