import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exit criterion of kanevas-carte-spatiale-liens-routes (AD-liens-1): PUT / DELETE …/interieur/:q/:r/astres|zones/:cle/fiche,
// under the tool's guard, cookie only; each answers the system as the read would give it.
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
const PUIS = '42/43';
async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const h: Record<string, { cookie: string }> = {};
  for (const c of ['antor', 'lea', 'teo']) h[c] = await connecter(app, c);
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const g = one(app, 'SELECT id FROM swn_galaxies WHERE univers_id = ?', E).id as number;
  for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) app.db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
  const sys = (cle: string, nom: string, q: number, r: number, secret: number) => app.db.prepare(
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
    .run(g, E, cle, nom, q, r, secret).lastInsertRowid as number;
  sys('int-secret', 'Caché', 40, 41, 1);
  const ouvert = sys('int-ouvert', 'Ouvert', 42, 43, 0);
  const astre = (cle: string, genre: string, type: string, orbite: number, heure: number) =>
    app.db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, type, orbite, heure, taille) VALUES (?,?,?,?,?,?,?)').run(ouvert, cle, genre, type, orbite, heure, 1);
  astre('etoile', 'etoile', 'naine_jaune', 0, 0); astre('ano', 'planete', 'anomalie', 2, 4);
  const fiche = (titre: string, univers = E) => app.db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', ?, '{}', 1, 1)").run(univers, titre).lastInsertRowid as number;
  const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}/interieur`;
  const ecrire = (who: string, method: 'PUT' | 'DELETE' | 'POST', path: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url: `${base}/${path}`, headers: { ...(h[who] ?? {}), ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const lire = async (who: string, path = PUIS) => (await app.inject({ method: 'GET', url: `${base}/${path}`, headers: h[who] })).json();
  return { app, E, g, ecrire, lire, h, fiche, base };
}

test('liens : PUT puis DELETE d\'un corps et d\'une zone rendent l\'intérieur relu, etat défini', async () => {
  const w = await monde();
  const f = w.fiche('Port');
  let v = await w.lire('antor');
  const z = await w.ecrire('antor', 'POST', `${PUIS}/zones`, { forme: 'anneau', nom: 'Ceinture', parametres: { de: 3, a: 3.5 }, versionSysteme: v.versionSysteme });
  assert.equal(z.statusCode, 201, z.body);
  v = await w.lire('antor');
  const suite = async (res: any) => { assert.equal(res.statusCode, 200, res.body); const relu = await w.lire('antor'); assert.deepEqual(res.json(), relu); assert.equal(relu.etat, 'defini'); return relu; };
  const ano = () => v.astres.find((a: any) => a.cle === 'ano');
  v = await suite(await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: f, version: ano().version, versionSysteme: v.versionSysteme }));
  assert.deepEqual(ano().fiche, { id: f, titre: 'Port' });
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle=?', 'ano').f, f);
  const zone = () => v.formations[0];
  v = await suite(await w.ecrire('antor', 'PUT', `${PUIS}/zones/${zone().cle}/fiche`, { ficheId: f, version: zone().version, versionSysteme: v.versionSysteme }));
  assert.deepEqual(zone().fiche, { id: f, titre: 'Port' });
  // A second sheet replaces the first.
  const f2 = w.fiche('Station');
  v = await suite(await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: f2, version: ano().version, versionSysteme: v.versionSysteme }));
  assert.deepEqual(ano().fiche, { id: f2, titre: 'Station' });
  v = await suite(await w.ecrire('antor', 'DELETE', `${PUIS}/astres/ano/fiche?version=${ano().version}&versionSysteme=${v.versionSysteme}`));
  assert.equal(ano().fiche, null);
  v = await suite(await w.ecrire('antor', 'DELETE', `${PUIS}/zones/${zone().cle}/fiche?version=${zone().version}&versionSysteme=${v.versionSysteme}`));
  assert.equal(zone().fiche, null);
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle=?', 'ano').f, null);
});

test('liens : fiche_inconnue avec champ, astre_inconnu, a_change 409, corps invalides', async () => {
  const w = await monde();
  const autre = one(w.app, 'SELECT id FROM univers WHERE id != ? LIMIT 1', w.E).id as number;
  const etrangere = w.fiche('Ailleurs', autre);
  const f = w.fiche('Port');
  const v = await w.lire('antor');
  const ano = v.astres.find((a: any) => a.cle === 'ano');
  const jv = v.versionSysteme;
  const avant = JSON.stringify(v);
  const code = (res: any, statut: number, c: string) => { assert.equal(res.statusCode, statut, res.body); assert.equal(res.json().code, c, res.body); return res.json(); };
  for (const id of [999999, etrangere, 'x', null, 1.5]) {
    const r = code(await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: id, version: ano.version, versionSysteme: jv }), 400, 'fiche_inconnue');
    assert.equal(r.champ, 'ficheId');
  }
  assert.equal(code(await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { version: ano.version, versionSysteme: jv }), 400, 'fiche_inconnue').champ, 'ficheId');
  code(await w.ecrire('antor', 'PUT', `${PUIS}/zones/fantome/fiche`, { ficheId: f, version: 1, versionSysteme: jv }), 404, 'astre_inconnu');
  code(await w.ecrire('antor', 'PUT', `${PUIS}/astres/fantome/fiche`, { ficheId: f, version: 1, versionSysteme: jv }), 404, 'astre_inconnu');
  code(await w.ecrire('antor', 'DELETE', `${PUIS}/astres/fantome/fiche?version=1&versionSysteme=${jv}`), 404, 'astre_inconnu');
  code(await w.ecrire('antor', 'DELETE', `${PUIS}/zones/fantome/fiche?version=1&versionSysteme=${jv}`), 404, 'astre_inconnu');
  code(await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: f, version: ano.version + 5, versionSysteme: jv }), 409, 'a_change');
  code(await w.ecrire('antor', 'DELETE', `${PUIS}/astres/ano/fiche?version=${ano.version + 5}&versionSysteme=${jv}`), 409, 'a_change');
  const sans = await w.ecrire('antor', 'DELETE', `${PUIS}/astres/ano/fiche?versionSysteme=${jv}`);
  assert.equal(sans.statusCode, 400, sans.body); assert.equal(sans.json().code, 'invalide');
  const abc = await w.ecrire('antor', 'DELETE', `${PUIS}/astres/ano/fiche?version=abc&versionSysteme=${jv}`);
  assert.equal(abc.statusCode, 400, abc.body);
  // Nothing written by the refusals.
  assert.equal(JSON.stringify(await w.lire('antor')), avant);
  // Same version twice: the second is a_change.
  assert.equal((await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: f, version: ano.version, versionSysteme: jv })).statusCode, 200);
  code(await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: f, version: ano.version, versionSysteme: jv }), 409, 'a_change');
});

test('liens : un Authorization est ignoré ; sans cookie rien n\'ouvre', async () => {
  const w = await monde();
  const f = w.fiche('Port');
  const v = await w.lire('antor');
  const ano = v.astres.find((a: any) => a.cle === 'ano');
  const corps = { ficheId: f, version: ano.version, versionSysteme: v.versionSysteme };
  const sans = await w.app.inject({ method: 'PUT', url: `${w.base}/${PUIS}/astres/ano/fiche`, headers: { authorization: 'Bearer kvs_nimportequoi' }, payload: corps });
  assert.ok([401, 302, 403].includes(sans.statusCode), String(sans.statusCode));
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle=?', 'ano').f, null);
  const res = await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, corps, { authorization: 'Bearer kvs_nimportequoi' });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(one(w.app, 'SELECT fiche_id f FROM swn_astres WHERE cle=?', 'ano').f, f);
  // Not in the import scope.
  const imp = await w.app.inject({ method: 'PUT', url: `/api/import/v1/univers/${w.E}/outils/swn/galaxie/galaxies/${w.g}/interieur/${PUIS}/astres/ano/fiche`, headers: { authorization: 'Bearer kvs_x' }, payload: corps });
  assert.notEqual(imp.statusCode, 200);
});

test('liens : la joueuse reçoit refuse, le non-membre 404, rien n\'est écrit ; hexagone masqué = corps de la lecture', async () => {
  const w = await monde();
  const f = w.fiche('Port');
  const v = await w.lire('antor');
  const avant = JSON.stringify(v);
  const j = { ficheId: f, version: 1, versionSysteme: v.versionSysteme };
  const essais: Array<['PUT' | 'DELETE', string, unknown?]> = [
    ['PUT', `${PUIS}/astres/ano/fiche`, j], ['PUT', `${PUIS}/zones/z/fiche`, j],
    ['DELETE', `${PUIS}/astres/ano/fiche?version=1&versionSysteme=${v.versionSysteme}`], ['DELETE', `${PUIS}/zones/z/fiche?version=1&versionSysteme=${v.versionSysteme}`],
  ];
  for (const [m, p, c] of essais) {
    const lea = await w.ecrire('lea', m, p, c);
    assert.equal(lea.statusCode, 403, `${m} ${p} ${lea.body}`);
    assert.equal(lea.json().code ?? lea.json().error ?? 'refuse', 'refuse', `${m} ${p}`);
    assert.equal((await w.ecrire('teo', m, p, c)).statusCode, 404, `${m} ${p} teo`);
  }
  assert.equal(JSON.stringify(await w.lire('antor')), avant);
  assert.equal(one(w.app, 'SELECT count(*) n FROM swn_astres WHERE fiche_id IS NOT NULL').n, 0);
  const lecture = await w.app.inject({ method: 'GET', url: `${w.base}/40/41`, headers: w.h.lea });
  assert.equal(lecture.statusCode, 404);
  for (const [m, p, c] of [['PUT', '40/41/astres/x/fiche', j], ['PUT', '40/41/zones/x/fiche', j],
    ['DELETE', '40/41/astres/x/fiche?version=1'], ['DELETE', '40/41/zones/x/fiche?version=1']] as const) {
    const res = await w.ecrire('lea', m, p, c);
    assert.equal(res.statusCode, 404, `${m} ${p}`);
    assert.equal(res.body, lecture.body, `${m} ${p}`);
  }
  // An hexagon that is not an integer is the same 404 as the read.
  for (const p of ['abc/1', '1.5/2']) {
    const ref = await w.app.inject({ method: 'GET', url: `${w.base}/${p}`, headers: w.h.antor });
    const res = await w.ecrire('antor', 'PUT', `${p}/astres/ano/fiche`, j);
    assert.equal(res.statusCode, 404, p);
    assert.equal(res.body, ref.body, p);
  }
});

test('liens : la lecture de Léa ne montre pas une fiche qu\'elle ne lit pas ; lier un système tiré l\'ancre', async () => {
  const w = await monde();
  const secrete = w.fiche('Secret');
  const v = await w.lire('antor');
  const ano = v.astres.find((a: any) => a.cle === 'ano');
  const sansLien = JSON.stringify(await w.lire('lea')).length;
  const res = await w.ecrire('antor', 'PUT', `${PUIS}/astres/ano/fiche`, { ficheId: secrete, version: ano.version, versionSysteme: v.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  const lea = await w.lire('lea');
  assert.equal(lea.astres.find((a: any) => a.cle === 'ano').fiche, null);
  assert.ok(!JSON.stringify(lea).includes('Secret'));
  assert.ok(sansLien > 0);
});
