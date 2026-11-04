import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-galaxie-tenir-galaxies : formes créables et routes de cœur de la création (T-6).
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
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  const req = (method: 'GET' | 'POST' | 'PATCH', who: string, url: string, payload?: object) =>
    app.inject({ method, url, headers: h[who] ?? {}, payload: payload as any });
  return { app, E, S, g, req };
}
const FORME = { module: 'swn', outil: 'galaxie', libelle: 'Carte de la galaxie' };

test('liste des cartes : formes pour le MJ seul, outil {module, outil}, aucune forme outil désactivé', async () => {
  const w = await monde();
  const url = `/api/univers/${w.E}/cartes`;
  const antor = (await w.req('GET', 'antor', url)).json();
  assert.deepEqual(antor.formes, [FORME]);
  assert.deepEqual(antor.cartes.find((c: any) => c.type === 'outil').outil, { module: 'swn', outil: 'galaxie' });
  assert.deepEqual((await w.req('GET', 'lea', url)).json().formes, []);
  assert.deepEqual((await w.req('GET', 'antor', url + '?mode=joueur')).json().formes, []);
  const off = await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/galaxie/activation`, headers: (await connecter(w.app, 'antor')), payload: { active: false } });
  assert.equal(off.statusCode, 204);
  assert.deepEqual((await w.req('GET', 'antor', url)).json().formes, []);
});

test('POST puis PATCH : création invisible, visible pour Léa à la version 2, rejeu 409 donnee_modifiee', async () => {
  const w = await monde();
  const base = `/api/univers/${w.E}/outils/swn/galaxie/cartes`;
  const cree = await w.req('POST', 'antor', base, { titre: 'Galaxie neuve' });
  assert.equal(cree.statusCode, 201);
  const { id } = cree.json();
  assert.equal(typeof id, 'number');
  const l = one(w.app, 'SELECT * FROM swn_galaxies WHERE id=?', id);
  assert.deepEqual([l.titre, l.visible, l.version], ['Galaxie neuve', 0, 1]);
  const titresLea = async () => (await w.req('GET', 'lea', `/api/univers/${w.E}/cartes`)).json().cartes.map((c: any) => c.titre);
  assert.ok(!(await titresLea()).includes('Galaxie neuve'));
  const p = await w.req('PATCH', 'antor', `${base}/${id}`, { visible: true, version: 1 });
  assert.equal(p.statusCode, 200);
  assert.deepEqual(p.json(), { version: 2 });
  assert.ok((await titresLea()).includes('Galaxie neuve'));
  const rejeu = await w.req('PATCH', 'antor', `${base}/${id}`, { visible: true, version: 1 });
  assert.equal(rejeu.statusCode, 409);
  assert.equal(rejeu.json().code ?? rejeu.json().detail, 'donnee_modifiee');
});

test('refus : Léa 403, mode Joueur 403 mode_joueur ; titre invalide 400 ; PATCH sans visible ou sans version 400', async () => {
  const w = await monde();
  const base = `/api/univers/${w.E}/outils/swn/galaxie/cartes`;
  const n = () => one(w.app, 'SELECT count(*) n FROM swn_galaxies').n;
  assert.equal((await w.req('POST', 'lea', base, { titre: 'X' })).statusCode, 403);
  const mj = await w.req('POST', 'antor', base + '?mode=joueur', { titre: 'X' });
  assert.equal(mj.statusCode, 403);
  assert.ok(JSON.stringify(mj.json()).includes('mode_joueur'));
  assert.equal((await w.req('PATCH', 'lea', `${base}/${w.g}`, { visible: false, version: 1 })).statusCode, 403);
  const pj = await w.req('PATCH', 'antor', `${base}/${w.g}?mode=joueur`, { visible: false, version: 1 });
  assert.equal(pj.statusCode, 403);
  assert.ok(JSON.stringify(pj.json()).includes('mode_joueur'));
  for (const payload of [{}, { titre: '' }, { titre: 'a'.repeat(81) }, { titre: 3 }]) {
    assert.equal((await w.req('POST', 'antor', base, payload)).statusCode, 400, JSON.stringify(payload));
  }
  for (const payload of [{ version: 1 }, { visible: 'oui', version: 1 }, { visible: false }, { visible: false, version: 'x' }]) {
    assert.equal((await w.req('PATCH', 'antor', `${base}/${w.g}`, payload)).statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(n(), 1);
  assert.equal(one(w.app, 'SELECT visible, version FROM swn_galaxies WHERE id=?', w.g).visible, 1);
});

test('404 identique octet pour octet : Teo, étranger, module/outil inconnu, outil sans creation, outil désactivé', async () => {
  const w = await monde();
  const corps = async (method: 'POST' | 'PATCH', who: string, url: string, payload: object) => {
    const r = await w.req(method, who, url, payload);
    return [r.statusCode, r.body] as const;
  };
  const ref = await corps('POST', 'antor', `/api/univers/${w.E}/outils/zzz/zzz/cartes`, { titre: 'X' });
  assert.equal(ref[0], 404);
  const cas: [string, string, string][] = [
    ['POST', 'teo', `/api/univers/${w.E}/outils/swn/galaxie/cartes`],
    ['POST', 'antor', `/api/univers/999999/outils/swn/galaxie/cartes`],
    ['POST', 'antor', `/api/univers/${w.E}/outils/swn/inconnu/cartes`],
    ['POST', 'antor', `/api/univers/${w.E}/outils/inconnu/galaxie/cartes`],
    ['PATCH', 'teo', `/api/univers/${w.E}/outils/swn/galaxie/cartes/${w.g}`],
    ['PATCH', 'antor', `/api/univers/999999/outils/swn/galaxie/cartes/${w.g}`],
    ['PATCH', 'antor', `/api/univers/${w.E}/outils/inconnu/galaxie/cartes/${w.g}`],
  ];
  const refPatch = await corps('PATCH', 'antor', `/api/univers/${w.E}/outils/zzz/zzz/cartes/${w.g}`, { visible: true, version: 1 });
  for (const [m, who, url] of cas) {
    const r = await corps(m as 'POST', who, url, m === 'POST' ? { titre: 'X' } : { visible: true, version: 1 });
    assert.deepEqual(r, m === 'POST' ? ref : refPatch, `${m} ${who} ${url}`);
  }
  // Un outil existant qui ne déclare pas de création (non-carte ou carte sans creation).
  const autres = w.app.db.prepare("SELECT 1").get();
  assert.ok(autres);
  const { modulesActifs } = await import('../registre.js');
  const sans = modulesActifs().flatMap((m) => m.outils.map((o) => ({ m: m.nom, o }))).filter(({ o }) => !(o as any).creation);
  for (const { m, o } of sans) {
    const r = await corps('POST', 'antor', `/api/univers/${w.E}/outils/${m}/${o.cle.slice(m.length + 1)}/cartes`, { titre: 'X' });
    assert.deepEqual(r, ref, o.cle);
  }
  await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/galaxie/activation`, headers: await connecter(w.app, 'antor'), payload: { active: false } });
  assert.deepEqual(await corps('POST', 'antor', `/api/univers/${w.E}/outils/swn/galaxie/cartes`, { titre: 'X' }), ref);
  assert.deepEqual(await corps('PATCH', 'antor', `/api/univers/${w.E}/outils/swn/galaxie/cartes/${w.g}`, { visible: true, version: 1 }), refPatch);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_galaxies').n, 1);
});

test('un jeton kvs_ n\'ouvre pas la création (hors portée d\'import)', async () => {
  const w = await monde();
  const { JETON_BOUCHON } = await import('../../bouchon/depart.js');
  const r = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/outils/swn/galaxie/cartes`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` }, payload: { titre: 'X' } });
  assert.equal(r.statusCode, 401);
});
