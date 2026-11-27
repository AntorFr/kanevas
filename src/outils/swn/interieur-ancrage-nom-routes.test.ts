import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-edition-ancrage: the first write of a drawn system carries the anchoring
// dialog's name (`nomAncrage`) in the SAME request; a refused write anchors nothing.
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

test('nomAncrage : le premier geste d\'un système tiré l\'ancre et le nomme dans la même requête', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  assert.equal(avant.etat, 'tire');
  const res = await w.ecrire('antor', 'PUT', `${TIRE}/transition`, { transition: 40, nomAncrage: 'Kessel', versionSysteme: avant.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().etat, 'defini');
  assert.equal(res.json().nom, 'Kessel');
  assert.equal(res.json().transition, 40);
  assert.deepEqual(res.json(), await w.lire('antor', TIRE));
  assert.equal(res.json().astres.length, avant.astres.length);
});

test('nomAncrage : porté par la query d\'un DELETE', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  const lune = avant.astres.find((a: any) => a.genre === 'lune') ?? avant.astres.find((a: any) => a.genre === 'planete');
  assert.ok(lune);
  const res = await w.ecrire('antor', 'DELETE', `${TIRE}/astres/${lune.cle}?version=${lune.version}&versionSysteme=${avant.versionSysteme}&nomAncrage=${encodeURIComponent('Épsilon & Cie')}`);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().etat, 'defini');
  assert.equal(res.json().nom, 'Épsilon & Cie');
  assert.ok(!res.json().astres.some((a: any) => a.cle === lune.cle));
});

test('nomAncrage : 80 caractères passent, 81 sont refusés (invalide, champ nomAncrage) et le système reste tiré', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  const trop = await w.ecrire('antor', 'PUT', `${TIRE}/transition`, { transition: 40, nomAncrage: 'x'.repeat(81), versionSysteme: avant.versionSysteme });
  assert.equal(trop.statusCode, 400, trop.body);
  assert.equal(trop.json().code, 'invalide');
  assert.equal(trop.json().champ, 'nomAncrage');
  assert.equal((await w.lire('antor', TIRE)).etat, 'tire');
  const juste = await w.ecrire('antor', 'PUT', `${TIRE}/transition`, { transition: 40, nomAncrage: 'y'.repeat(80), versionSysteme: avant.versionSysteme });
  assert.equal(juste.statusCode, 200, juste.body);
  assert.equal(juste.json().nom, 'y'.repeat(80));
});

test('nomAncrage : un geste refusé n\'ancre pas (rayon 1001 avec un nom)', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  const res = await w.ecrire('antor', 'PUT', `${TIRE}/transition`, { transition: 1001, nomAncrage: 'Kessel', versionSysteme: avant.versionSysteme });
  assert.equal(res.statusCode, 400, res.body);
  const apres = await w.lire('antor', TIRE);
  assert.equal(apres.etat, 'tire');
  assert.notEqual(apres.nom, 'Kessel');
});

test('nomAncrage : sur un système déjà défini, le nom ne renomme rien', async () => {
  const w = await monde();
  const avant = await w.lire('antor');
  const res = await w.ecrire('antor', 'PUT', `${PUIS}/transition`, { transition: 40, nomAncrage: 'Intrus', versionSysteme: avant.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().nom, avant.nom);
});

test('nomAncrage : la joueuse reçoit refuse et rien n\'est ancré', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  const res = await w.ecrire('lea', 'PUT', `${TIRE}/transition`, { transition: 40, nomAncrage: 'Kessel', versionSysteme: avant.versionSysteme });
  assert.ok([403, 404].includes(res.statusCode), res.body);
  assert.equal((await w.lire('antor', TIRE)).etat, 'tire');
});

test('nomAncrage : un nom blanc vaut « sans nom » (le nom est facultatif) et ancre quand même', async () => {
  const w = await monde();
  const avant = await w.lire('antor', TIRE);
  const res = await w.ecrire('antor', 'PUT', `${TIRE}/transition`, { transition: 40, nomAncrage: '   ', versionSysteme: avant.versionSysteme });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().etat, 'defini');
  assert.equal(res.json().nom, 'Système (-49, -48)');
});
