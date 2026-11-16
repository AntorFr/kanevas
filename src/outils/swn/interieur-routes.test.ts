import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-systeme-lecture, route side: GET …/galaxies/:gid/interieur/:q/:r under the tool's guard.
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
  const sid = app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',1,0)")
    .run(g, E, 'int-secret', 'Caché', 40, 41, ).lastInsertRowid as number;
  const sid2 = app.db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
    .run(g, E, 'int-ouvert', 'Ouvert', 42, 43).lastInsertRowid as number;
  app.db.prepare("INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)").run(sid2, 'ano', 'planete', 'anomalie', 2, 4, 0.1);
  const get = (who: string, path: string, base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur`) =>
    app.inject({ method: 'GET', url: `${base}/${path}`, headers: h[who] ?? {} });
  return { app, E, S, g, get, h };
}

test('route : défini lu par tous, secret 404 pour la joueuse (même corps qu\'un hexagone vide), MJ le lit, aucune clé interdite', async () => {
  const w = await monde();
  const mj = await w.get('antor', '42/43');
  assert.equal(mj.statusCode, 200);
  const v = mj.json();
  assert.equal(v.etat, 'defini'); assert.equal(v.astres[0].type, 'anomalie');
  assert.deepEqual((await w.get('lea', '42/43')).json(), v);
  assert.ok(!/fiche_id|secret|"id"/.test(mj.body));
  assert.equal((await w.get('antor', '40/41')).statusCode, 200);
  const vide = await w.get('lea', '41/7777');
  const sec = await w.get('lea', '40/41');
  assert.equal(sec.statusCode, 404);
  assert.equal(sec.body, vide.body);
});

test('route : q ou r non entiers, vides ou énormes = le même introuvable (jamais 400) ; étranger, galaxie et univers inconnus idem', async () => {
  const w = await monde();
  const ref = await w.get('lea', '41/7777');
  assert.equal(ref.statusCode, 404);
  for (const p of ['abc/1', '1/abc', '1.5/2', '1e3/2', '0x10/1', '-/1', '99999999999999999999/1', '42/43abc']) {
    const x = await w.get('antor', p);
    assert.equal(x.statusCode, 404, p);
    assert.equal(x.body, (await w.get('antor', '41/7777')).body, p);
  }
  assert.equal((await w.get('teo', '42/43')).statusCode, 404);
  assert.equal((await w.get('antor', '42/43', `/api/univers/${w.E}/outils/swn/galaxie/galaxies/999999/interieur`)).statusCode, 404);
  assert.equal((await w.get('antor', '42/43', `/api/univers/999999/outils/swn/galaxie/galaxies/${w.g}/interieur`)).statusCode, 404);
  assert.notEqual((await w.get('antor', '42/43', `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur`)).statusCode, 404);
});

test('route : sans session, refusée ; outil désactivé, comme une route non enregistrée', async () => {
  const w = await monde();
  const anon = await w.get('personne', '42/43');
  assert.ok(anon.statusCode === 401 || anon.statusCode === 302 || anon.statusCode === 403, String(anon.statusCode));
  assert.ok(!anon.body.includes('anomalie'));
  const off = await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/galaxie/activation`, headers: w.h.antor, payload: { active: false } });
  assert.equal(off.statusCode, 204);
  const mort = await w.get('antor', '42/43');
  const inconnu = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/outils/swn/galaxie/inexistant/42/43`, headers: w.h.antor });
  assert.equal(mort.statusCode, 404);
  assert.equal(mort.statusCode, inconnu.statusCode);
});
