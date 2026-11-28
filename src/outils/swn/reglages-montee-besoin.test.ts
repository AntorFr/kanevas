import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Climb test of kanevas-carte-spatiale-reglages: the migration of the settings and aspects tables is played on an example base at the
// previous schema (every migration before 0045), a galaxy of the neutral seed with its zones. Written from the exit criterion
// (« Le test de montée joue la migration sur une base d'exemple au schéma précédent ») and docs/donnees.md, not from the code:
// the galaxy, its defined systems, routes and zones are the same rows after the climb, and the galaxy reads and draws as before
// (Éneria's fixtures: the neutral seed's star at (-49, -48) is orange, its first planet is a lava one at orbit 1.03, hour 0.6).
const dossier = mkdtempSync(join(tmpdir(), 'kanevas-montee-reglages-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.DB_PATH = join(dossier, 'k.db');
const { openDb, migrate } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { plagesDe } = await import('./regles/forme.js');
const GALAXIE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url)), 'utf8'));

const source = new URL('../../db/migrations/', import.meta.url);
const ancien = mkdtempSync(join(tmpdir(), 'kanevas-migrations-avant-'));
for (const f of readdirSync(source).filter((x) => /^\d{4}-.+\.sql$/.test(x))) if (Number(f.slice(0, 4)) !== 45) copyFileSync(new URL(f, source), join(ancien, f));

const tables = ['swn_galaxies', 'swn_systemes', 'swn_routes', 'swn_zones', 'swn_astres', 'swn_formations'];
const instantane = (db: any) => Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));

const db = openDb(process.env.DB_PATH);
migrate(db, ancien + '/');
assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('swn_reglages','swn_aspects')").get().n, 0, 'le schéma précédent n’a ni l’une ni l’autre table');
assert.equal(semerBouchon(db), true);
const E = db.prepare('SELECT id FROM univers WHERE nom = ?').get("Éneria d'essai").id as number;
const g = db.prepare('SELECT id FROM swn_galaxies WHERE univers_id = ?').get(E).id as number;
for (const t of ['swn_routes', 'swn_zones', 'swn_systemes']) db.prepare(`DELETE FROM ${t} WHERE galaxie_id=?`).run(g);
db.prepare('UPDATE swn_galaxies SET graine=?, densite_defaut=? WHERE id=?').run('kanevas-neutre-1', GALAXIE.densites.defaut, g);
for (const z of GALAXIE.densites.zones) {
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, densite, secret, plages) VALUES (?,?,?,?, '[]', 'rouge', ?, 0, ?)")
    .run(g, E, z.nom, z.nom, z.densite, JSON.stringify(plagesDe(z.hexagones)));
}
db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, secret) VALUES (?,?,?,?,?,?,?,?,0)").run(g, E, 'ancien', 'Ancien', 3, -2, 2, 'bleu');
const avant = instantane(db);
db.close();

const { buildApp } = await import('../../app.js'); // opens the file: the migration of the slice is played here
const app = await buildApp();
const cookie = async () => {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
};
const base = `/api/univers/${E}/outils/swn/galaxie/galaxies/${g}`;

test('montée : les lignes de la base d’exemple sont celles d’avant, les deux tables sont là et vides, aucune clé étrangère cassée', () => {
  assert.deepEqual(instantane(app.db), avant);
  for (const t of ['swn_reglages', 'swn_aspects']) assert.equal((app.db.prepare(`SELECT count(*) n FROM ${t}`).get() as any).n, 0, t);
  assert.deepEqual(app.db.pragma('foreign_key_check'), []);
  assert.deepEqual(migrate(app.db), [], 'rejouée, la montée ne fait rien');
});

test('montée : la galaxie montée se lit « Valeurs par défaut », version 1, et se dessine comme avant', async () => {
  const h = await cookie();
  const lu = (await app.inject({ method: 'GET', url: `${base}/reglages`, headers: h })).json();
  assert.equal(lu.version_generateur, 1);
  assert.deepEqual(lu.versions_connues, [1]);
  assert.equal(lu.par_defaut, true);
  assert.deepEqual(lu.surcharge, {});
  assert.deepEqual(lu.valeurs, lu.defauts);
  assert.equal(lu.densite_defaut, 0.68);
  const interieur = (await app.inject({ method: 'GET', url: `${base}/interieur/-49/-48`, headers: h })).json();
  assert.equal(interieur.etat, 'tire');
  assert.deepEqual(interieur.astres.slice(0, 2).map((a: any) => [a.genre, a.type, a.orbite, a.heure]), [['etoile', 'orange', 0, 0], ['planete', 'lave', 1.03, 0.6]]);
  const blocs = (await app.inject({ method: 'GET', url: `${base}/blocs?de=-10,-10&a=-1,-1`, headers: h })).json();
  const etoiles = blocs.blocs.flatMap((b: any) => b.generes.map(([q, r]: number[]) => `${q},${r}`));
  for (const s of ['-49,-48', '-44,-47', '-39,-49', '-17,-48', '-13,-48', '-7,-48', '-2,-49']) assert.ok(etoiles.includes(s), `l’étoile ${s} des fixtures`);
});

test('montée : la galaxie montée accepte un premier réglage, la comète à 1 donne une comète au système tiré', async () => {
  const h = await cookie();
  const lu = (await app.inject({ method: 'GET', url: `${base}/reglages`, headers: h })).json();
  const res = await app.inject({ method: 'PUT', url: `${base}/reglages`, headers: h, payload: { version: lu.version, confirme: true, valeurs: { frequences: { comete: 1 } } } });
  assert.equal(res.statusCode, 200, res.body);
  const interieur = (await app.inject({ method: 'GET', url: `${base}/interieur/-49/-48`, headers: h })).json();
  assert.ok(interieur.astres.some((a: any) => a.genre === 'comete'));
  assert.equal(app.db.prepare('SELECT count(*) n FROM swn_reglages').get().n, 1);
  assert.deepEqual(instantane(app.db).swn_systemes, avant.swn_systemes, 'le système défini d’avant n’a pas bougé');
});
