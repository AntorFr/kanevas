import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-rendu-aspects-socle-route: the illustration route takes `angle` and `lumiere`, does not quantise,
// refuses bad values with their `champ`, and draws a body without stored seed as the body whose aspect carries `graine_de`.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { graineDe } = await import('../../wasm/coeur.js');

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
  for (const c of ['antor', 'lea']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const sid = app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.5,NULL,'',0,0)")
    .run(g, E, 'ecl-sys', 'ecl-sys', 70, 71).lastInsertRowid as number;
  const astre = (cle: string, aspect: string) => app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille, aspect) VALUES (?,?,?,?,?,?,?,?)')
    .run(sid, cle, 'planete', 'rocheux', 2, 4, 0.1, aspect);
  const get = (who: string, path: string) =>
    app.inject({ method: 'GET', url: `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur/70/71/astres/${path}`, headers: h[who] });
  return { app, astre, get };
}

test('angle : 90 et 95 deux images et deux ETag ; 90 deux fois mêmes octets et ETag ; 92 ≠ 90 (pas de quantification)', async () => {
  const w = await monde();
  w.astre('p1', '{}');
  const u = (a: string) => w.get('lea', `p1/illustration?cote=128&angle=${a}`);
  const [a90, a90b, a95, a92, sans] = [await u('90'), await u('90'), await u('95'), await u('92'), await w.get('lea', 'p1/illustration?cote=128')];
  for (const r of [a90, a90b, a95, a92, sans]) assert.equal(r.statusCode, 200);
  assert.deepEqual(a90.rawPayload, a90b.rawPayload);
  assert.equal(a90.headers.etag, a90b.headers.etag);
  for (const x of [a95, a92, sans]) {
    assert.notEqual(x.headers.etag, a90.headers.etag);
    assert.notDeepEqual(x.rawPayload, a90.rawPayload);
  }
  assert.notDeepEqual(a92.rawPayload, a95.rawPayload);
  assert.equal((await u('0')).statusCode, 200);
  assert.equal((await u('359')).statusCode, 200);
}, { timeout: 120_000 });

test('lumière : couleur neuve = image et ETag neufs ; casse sans effet', async () => {
  const w = await monde();
  w.astre('p1', '{}');
  const u = (l: string) => w.get('lea', `p1/illustration?cote=128&angle=90&lumiere=${l}`);
  const [a, b, bm, sans] = [await u('ff0000'), await u('0000ff'), await u('0000FF'), await w.get('lea', 'p1/illustration?cote=128&angle=90')];
  assert.notEqual(a.headers.etag, b.headers.etag);
  assert.notDeepEqual(a.rawPayload, b.rawPayload);
  assert.notEqual(a.headers.etag, sans.headers.etag);
  assert.deepEqual(b.rawPayload, bm.rawPayload);
}, { timeout: 120_000 });

test('angle et lumiere invalides : 400 invalide avec leur champ', async () => {
  const w = await monde();
  w.astre('p1', '{}');
  const cas: [string, string][] = [['angle=360', 'angle'], ['angle=x', 'angle'], ['angle=-1', 'angle'], ['angle=90.5', 'angle'], ['angle=', 'angle'],
    ['angle=1e2', 'angle'], ['angle=0090', 'angle'], ['angle=90&angle=91', 'angle'],
    ['lumiere=zz', 'lumiere'], ['lumiere=', 'lumiere'], ['lumiere=%23ff0000', 'lumiere'], ['lumiere=ff00', 'lumiere'], ['lumiere=ff00000', 'lumiere'],
    ['lumiere=ff0000&lumiere=00ff00', 'lumiere']];
  for (const [q, champ] of cas) {
    const r = await w.get('lea', `p1/illustration?cote=64&${q}`);
    assert.equal(r.statusCode, 400, q);
    assert.equal(r.json().code, 'invalide', q);
    assert.equal(r.json().champ, champ, q);
  }
});

test('corps sans graine stockée : mêmes octets que le même corps dont l\'aspect porte graine_de(clé système, clé corps)', async () => {
  const w = await monde();
  w.astre('sans', '{}');
  w.astre('avec', JSON.stringify({ graine: await graineDe('ecl-sys', 'sans') }));
  const x = await w.get('lea', 'sans/illustration?cote=128&angle=90');
  const y = await w.get('lea', 'avec/illustration?cote=128&angle=90');
  assert.equal(x.statusCode, 200);
  assert.deepEqual(x.rawPayload, y.rawPayload);
  // The seed really counts: another stored seed draws another body.
  w.astre('autre', JSON.stringify({ graine: (await graineDe('ecl-sys', 'sans')) + 1 }));
  const z = await w.get('lea', 'autre/illustration?cote=128&angle=90');
  assert.notDeepEqual(x.rawPayload, z.rawPayload);
}, { timeout: 120_000 });

test('introuvable inchangé avec un angle ou une lumière valides ; invalide cote prime sur l\'inconnu', async () => {
  const w = await monde();
  w.astre('p1', '{}');
  const ref = await w.get('lea', 'inconnu/illustration?cote=64');
  assert.equal(ref.statusCode, 404);
  const x = await w.get('lea', 'inconnu/illustration?cote=64&angle=90&lumiere=ffffff');
  assert.equal(x.statusCode, 404);
  assert.equal(x.body, ref.body);
  // An unknown body with a bad angle stays « introuvable »: nothing is learned from a value check.
  const y = await w.get('lea', 'inconnu/illustration?cote=64&angle=x');
  assert.equal(y.statusCode, 404);
  assert.equal(y.body, ref.body);
});
