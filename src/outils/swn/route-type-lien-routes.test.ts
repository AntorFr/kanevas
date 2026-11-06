import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-format-evolue-routes : T-8, le type de lien par les routes HTTP, avec les comptes du semis.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { encoderSession } = await import('../../services/session.js');
const { JETON_BOUCHON, semerBouchon } = await import('../../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
async function connecter(app: App, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'mira', 'lea', 'teo']) h[c] = await connecter(app, c);
  // Roxane n'a pas de connexion bouchon : on signe son cookie de session comme `ouvrirSession` le fait.
  const rid = one(app, 'SELECT id FROM comptes WHERE username = ?', 'roxane').id as number;
  h.roxane = { cookie: `kanevas_session=${app.signCookie(encoderSession({ id: rid, groups: [] }))}` };
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const V = one(app, 'SELECT id FROM univers WHERE nom = ?', 'Univers voisin').id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const R = `/api/univers/${E}/outils/swn/galaxie/galaxies`;
  const req = (method: M, who: string | null, url: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...(who ? h[who] : {}), ...headers }, payload: payload as any });
  return { app, E, V, S, g, R, B: `${R}/${g}`, req, h };
}
type W = Awaited<ReturnType<typeof monde>>;
const ver = (w: W, table: string, where: string, ...a: unknown[]) => one(w.app, `SELECT version FROM ${table} WHERE ${where}`, ...a).version as number;
const compte = (w: W, t: string) => one(w.app, `SELECT count(*) n FROM ${t}`).n as number;
const carre = [[20, 20], [24, 20], [24, 24], [20, 24]];

const BLOCS = '/blocs?de=-2,-2&a=9,9';
const routeDe = (res: { json(): any }, id: number) => (res.json().routes as any[]).find((x) => x.id === id);

test('route typée : Léa la voit tant qu’elle est publique, plus du tout (type compris) une fois privée ; Antor porte le type aux deux états ; Antor en mode joueur ne la voit pas', async () => {
  const w = await monde();
  await w.req('POST', 'antor', `${w.B}/systemes`, { nom: 'Port Noir', q: 30, r: 30 });
  const r = await w.req('POST', 'antor', `${w.B}/routes`, { depuis: 'port-noir', vers: 'vael', type_lien: 'Pirate' });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().type_lien, 'Pirate');
  const rid = r.json().id as number;
  const lire = (who: string, q = '') => w.req('GET', who, `${w.B}${BLOCS}${q}`);
  assert.equal(routeDe(await lire('lea'), rid).type_lien, 'Pirate');
  assert.equal(routeDe(await lire('antor'), rid).type_lien, 'Pirate');
  assert.equal(routeDe(await lire('antor'), rid).publique, true);
  const p = await w.req('PATCH', 'antor', `${w.B}/routes/${rid}`, { publique: false, version: 1 });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(p.json().type_lien, 'Pirate');
  const l = await lire('lea');
  assert.equal(routeDe(l, rid), undefined);
  assert.ok(!l.body.includes('Pirate'), 'ni la route ni le type dans le corps de Léa');
  const m = await lire('antor', '&mode=joueur');
  assert.equal(routeDe(m, rid), undefined);
  assert.ok(!m.body.includes('Pirate'));
  const a = await lire('antor');
  assert.equal(routeDe(a, rid).type_lien, 'Pirate');
  assert.equal(routeDe(a, rid).publique, false);
});

test('PATCH : type seul, null pour retirer, 41 caractères et espaces refusés avec champ type_lien (400 invalide), rien d’écrit', async () => {
  const w = await monde();
  await w.req('POST', 'antor', `${w.B}/systemes`, { nom: 'Port Noir', q: 30, r: 30 });
  const r = await w.req('POST', 'antor', `${w.B}/routes`, { depuis: 'port-noir', vers: 'vael' });
  const rid = r.json().id as number;
  assert.equal(Object.hasOwn(r.json(), 'type_lien'), false);
  const t = await w.req('PATCH', 'antor', `${w.B}/routes/${rid}`, { type_lien: 'Pirate', version: 1 });
  assert.equal(t.statusCode, 200, t.body);
  assert.deepEqual([t.json().type_lien, t.json().publique, t.json().version], ['Pirate', true, 2]);
  for (const mauvais of ['x'.repeat(41), '   ', '']) {
    const x = await w.req('PATCH', 'antor', `${w.B}/routes/${rid}`, { type_lien: mauvais, version: 2 });
    assert.equal(x.statusCode, 400, x.body);
    assert.equal(x.json().champ, 'type_lien');
    const y = await w.req('POST', 'antor', `${w.B}/routes`, { depuis: 'vael', vers: 'argent', type_lien: mauvais });
    assert.equal(y.statusCode, 400, y.body);
    assert.equal(y.json().champ, 'type_lien');
  }
  assert.equal(one(w.app, 'SELECT type_lien, version FROM swn_routes WHERE id=?', rid).type_lien, 'Pirate');
  assert.equal(one(w.app, 'SELECT version FROM swn_routes WHERE id=?', rid).version, 2);
  const n = await w.req('PATCH', 'antor', `${w.B}/routes/${rid}`, { type_lien: null, version: 2 });
  assert.equal(n.statusCode, 200, n.body);
  assert.equal(Object.hasOwn(n.json(), 'type_lien'), false);
  assert.equal(one(w.app, 'SELECT type_lien FROM swn_routes WHERE id=?', rid).type_lien, null);
});

test('un non-MJ ne pose ni ne change un type par la route (refus, rien écrit) ; les corps de lecture du semis sont sans type_lien', async () => {
  const w = await monde();
  const rid = one(w.app, 'SELECT id FROM swn_routes LIMIT 1').id as number;
  const avant = one(w.app, 'SELECT version, type_lien FROM swn_routes WHERE id=?', rid);
  const p = await w.req('PATCH', 'lea', `${w.B}/routes/${rid}`, { type_lien: 'Pirate', version: avant.version });
  assert.ok(p.statusCode >= 400 && p.statusCode < 500, p.body);
  const mj = await w.req('PATCH', 'antor', `${w.B}/routes/${rid}?mode=joueur`, { type_lien: 'Pirate', version: avant.version });
  assert.ok(mj.statusCode >= 400 && mj.statusCode < 500, mj.body);
  assert.deepEqual(one(w.app, 'SELECT version, type_lien FROM swn_routes WHERE id=?', rid), avant);
  for (const who of ['lea', 'antor']) assert.ok(!(await w.req('GET', who, `${w.B}${BLOCS}`)).body.includes('type_lien'), who);
});
