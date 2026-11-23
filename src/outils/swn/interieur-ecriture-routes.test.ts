import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-edition-routes (AD-edition-5): the write routes of the interior of a system,
// under the tool's guard; each answers the system as the read would give it.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');
const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));
const TIRE = '-49/-48'; // a drawn system of the neutral seed

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
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  app.db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
  for (const z of GALAXIE.densites.zones) {
    app.db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
      .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
  }
  const sys = (cle: string, nom: string, q: number, r: number, secret: number) => app.db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',?,0)")
    .run(g, E, cle, nom, q, r, secret).lastInsertRowid as number;
  sys('int-secret', 'Caché', 40, 41, 1);
  const ouvert = sys('int-ouvert', 'Ouvert', 42, 43, 0);
  app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)').run(ouvert, 'etoile', 'etoile', 'naine_jaune', 0, 0, 1);
  app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)').run(ouvert, 'ano', 'planete', 'anomalie', 2, 4, 0.1);
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur`;
  const ecrire = (who: string, method: 'POST' | 'PATCH' | 'DELETE' | 'PUT', path: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url: `${base}/${path}`, headers: { ...(h[who] ?? {}), ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const lire = async (who: string, path = '42/43') => (await app.inject({ method: 'GET', url: `${base}/${path}`, headers: h[who] })).json();
  return { app, E, g, ecrire, lire, h };
}
const PUIS = '42/43';

test('routes : chaque écriture rend l\'intérieur tel que la lecture le donne ensuite, état défini', async () => {
  const w = await monde();
  let v = await w.lire('antor');
  const jeton = () => v.versionSysteme as number;
  const suite = async (res: any, statut = 200) => {
    assert.equal(res.statusCode, statut, res.body);
    v = await w.lire('antor');
    assert.deepEqual(res.json(), v);
    assert.equal(v.etat, 'defini');
    return v;
  };
  const ajoute = await w.ecrire('antor', 'POST', `${PUIS}/astres`, { genre: 'planete', nom: 'Neuve', type: 'tellurique', orbite: 3, heure: 5, taille: 1, versionSysteme: jeton() });
  const v1 = await suite(ajoute, 201);
  const neuve = v1.astres.find((a: any) => a.nom === 'Neuve');
  assert.ok(neuve);
  const patch = await w.ecrire('antor', 'PATCH', `${PUIS}/astres/${neuve.cle}`, { heure: 7.5, version: neuve.version, versionSysteme: jeton() });
  const v2 = await suite(patch);
  assert.equal(v2.astres.find((a: any) => a.cle === neuve.cle).heure, 7.5);
  const z = await w.ecrire('antor', 'POST', `${PUIS}/zones`, { forme: 'anneau', nom: 'Ceinture', parametres: { de: 3, a: 3.5 }, versionSysteme: jeton() });
  const v3 = await suite(z, 201);
  assert.equal(v3.formations.length, 1);
  const f = v3.formations[0];
  await suite(await w.ecrire('antor', 'PATCH', `${PUIS}/zones/${f.cle}`, { nom: 'Ceinture 2', version: f.version, versionSysteme: jeton() }));
  assert.equal(v.formations[0].nom, 'Ceinture 2');
  await suite(await w.ecrire('antor', 'PUT', `${PUIS}/transition`, { transition: 40, versionSysteme: jeton() }));
  await suite(await w.ecrire('antor', 'PUT', `${PUIS}/transition`, { transition: null, versionSysteme: jeton() }));
  const fz = v.formations[0];
  await suite(await w.ecrire('antor', 'DELETE', `${PUIS}/zones/${fz.cle}?version=${fz.version}&versionSysteme=${jeton()}`));
  assert.equal(v.formations.length, 0);
  const nv = v.astres.find((a: any) => a.cle === neuve.cle);
  await suite(await w.ecrire('antor', 'DELETE', `${PUIS}/astres/${nv.cle}?version=${nv.version}&versionSysteme=${jeton()}`));
  assert.ok(!v.astres.some((a: any) => a.cle === neuve.cle));
});

test('routes : ancrage d\'un système tiré ; un Authorization est ignoré (ni ouvre, ni refuse)', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  assert.equal(avant.etat, 'tire');
  const sans = await w.app.inject({ method: 'POST', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur/${TIRE}/ancrage`,
    headers: { authorization: 'Bearer kvs_nimportequoi' }, payload: { versionSysteme: avant.versionSysteme } });
  assert.ok([401, 302, 403].includes(sans.statusCode), String(sans.statusCode));
  const res = await w.ecrire('antor', 'POST', `${TIRE}/ancrage`, { versionSysteme: avant.versionSysteme }, { authorization: 'Bearer kvs_nimportequoi' });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().etat, 'defini');
  assert.deepEqual(res.json(), await w.lire('antor', TIRE));
  assert.equal(res.json().astres.length, avant.astres.length);
});

test('routes : orbite_invalide, astre_inconnu, a_change, etoile_principale, invalide avec champ', async () => {
  const w = await monde();
  const v = await w.lire('antor');
  const ano = v.astres.find((a: any) => a.cle === 'ano');
  const etoile = v.astres.find((a: any) => a.cle === 'etoile');
  const corps = async (res: any, statut: number, code: string) => { assert.equal(res.statusCode, statut, res.body); assert.equal(res.json().code, code, res.body); return res.json(); };
  const neg = await corps(await w.ecrire('antor', 'PATCH', `${PUIS}/astres/ano`, { orbite: -1, version: ano.version, versionSysteme: v.versionSysteme }), 400, 'orbite_invalide');
  assert.equal(neg.champ, 'orbite');
  await w.ecrire('antor', 'PATCH', `${PUIS}/astres/ano`, { orbite: -1, version: ano.version, versionSysteme: v.versionSysteme });
  const h12 = await corps(await w.ecrire('antor', 'PATCH', `${PUIS}/astres/ano`, { heure: 12, version: ano.version, versionSysteme: v.versionSysteme }), 400, 'orbite_invalide');
  assert.equal(h12.champ, 'heure');
  await corps(await w.ecrire('antor', 'PATCH', `${PUIS}/astres/fantome`, { heure: 1, version: 1, versionSysteme: v.versionSysteme }), 404, 'astre_inconnu');
  await corps(await w.ecrire('antor', 'DELETE', `${PUIS}/astres/fantome?version=1&versionSysteme=${v.versionSysteme}`), 404, 'astre_inconnu');
  await corps(await w.ecrire('antor', 'DELETE', `${PUIS}/astres/etoile?version=${etoile.version}&versionSysteme=${v.versionSysteme}`), 403, 'etoile_principale');
  await corps(await w.ecrire('antor', 'PATCH', `${PUIS}/astres/ano`, { heure: 1, version: ano.version + 5, versionSysteme: v.versionSysteme }), 409, 'a_change');
  const ok = await w.ecrire('antor', 'PATCH', `${PUIS}/astres/ano`, { heure: 6, version: ano.version, versionSysteme: v.versionSysteme });
  assert.equal(ok.statusCode, 200, ok.body);
  await corps(await w.ecrire('antor', 'PATCH', `${PUIS}/astres/ano`, { heure: 7, version: ano.version, versionSysteme: v.versionSysteme }), 409, 'a_change');
  const t = await corps(await w.ecrire('antor', 'PUT', `${PUIS}/transition`, { transition: 1001, versionSysteme: (await w.lire('antor')).versionSysteme }), 400, 'invalide');
  assert.equal(t.champ, 'transition');
  const nomLong = await corps(await w.ecrire('antor', 'POST', `${PUIS}/zones`, { forme: 'anneau', nom: 'x'.repeat(81), parametres: { de: 3, a: 3.5 }, versionSysteme: (await w.lire('antor')).versionSysteme }), 400, 'invalide');
  assert.equal(nomLong.champ, 'nom');
  // DELETE with a missing / non-numeric token in the query is invalid, not a crash.
  const cur = await w.lire('antor');
  const sansVersion = await w.ecrire('antor', 'DELETE', `${PUIS}/astres/ano?versionSysteme=${cur.versionSysteme}`);
  assert.equal(sansVersion.statusCode, 400, sansVersion.body);
  assert.equal(sansVersion.json().code, 'invalide');
  const abc = await w.ecrire('antor', 'DELETE', `${PUIS}/astres/ano?version=abc&versionSysteme=${cur.versionSysteme}`);
  assert.equal(abc.statusCode, 400, abc.body);
  // The refusals changed nothing.
  const fin = await w.lire('antor');
  assert.equal(fin.astres.find((a: any) => a.cle === 'ano').heure, 6);
  assert.equal(fin.formations.length, 0);
});

test('routes : la joueuse reçoit refuse sur chaque route, rien n\'est écrit ; hexagone masqué = corps de la lecture', async () => {
  const w = await monde();
  const v = await w.lire('antor');
  const avant = JSON.stringify(v);
  const j = { versionSysteme: v.versionSysteme };
  const essais: Array<['POST' | 'PATCH' | 'DELETE' | 'PUT', string, unknown?]> = [
    ['POST', `${PUIS}/ancrage`, j], ['POST', `${PUIS}/astres`, { genre: 'planete', type: 'tellurique', orbite: 1, heure: 1, taille: 1, ...j }],
    ['PATCH', `${PUIS}/astres/ano`, { heure: 1, version: 1, ...j }], ['DELETE', `${PUIS}/astres/ano?version=1&versionSysteme=${v.versionSysteme}`],
    ['POST', `${PUIS}/zones`, { forme: 'anneau', nom: 'Z', parametres: {}, ...j }], ['PATCH', `${PUIS}/zones/z`, { nom: 'Y', version: 1, ...j }],
    ['DELETE', `${PUIS}/zones/z?version=1&versionSysteme=${v.versionSysteme}`], ['PUT', `${PUIS}/transition`, { transition: 5, ...j }],
  ];
  for (const [m, p, c] of essais) {
    for (const qui of ['lea', 'teo']) {
      const res = await w.ecrire(qui, m, p, c);
      if (qui === 'lea') { assert.equal(res.statusCode, 403, `${m} ${p} ${res.body}`); assert.equal(res.json().code ?? res.json().error ?? 'refuse', 'refuse', `${m} ${p}`); }
      else assert.equal(res.statusCode, 404, `${m} ${p} teo (non membre)`);
    }
  }
  assert.equal(JSON.stringify(await w.lire('antor')), avant);
  // A hidden hexagon: the same 404 body as the read, whatever the route, for the player; and for a non-integer q / r.
  const lecture = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur/40/41`, headers: w.h.lea });
  assert.equal(lecture.statusCode, 404);
  for (const [m, p, c] of [['POST', '40/41/ancrage', {}], ['POST', '40/41/astres', {}], ['PUT', '40/41/transition', { transition: 1 }], ['DELETE', '40/41/astres/x?version=1']] as const) {
    const res = await w.ecrire('lea', m, p, c);
    assert.equal(res.statusCode, 404, `${m} ${p}`);
    assert.equal(res.body, lecture.body, `${m} ${p}`);
  }
  for (const p of ['abc/1', '1/abc', '1.5/2', '1e3/2', '99999999999999999999/1']) {
    const ref = await w.app.inject({ method: 'GET', url: `/api/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur/${p}`, headers: w.h.antor });
    const res = await w.ecrire('antor', 'POST', `${p}/ancrage`, {});
    assert.equal(res.statusCode, 404, p);
    assert.equal(res.body, ref.body, p);
  }
});
