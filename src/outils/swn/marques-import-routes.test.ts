import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// kanevas-carte-spatiale-atlas-import: the import's marks (`cle`, `importee`) are not readable from a screen's body (AD-atlas-3, B-48).
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
    "INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',?,0)")
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

test('routes d\'écran : importee et cle du corps sont ignorés, la ligne reste hors import', async () => {
  const w = await monde();
  const fiche = one(w.app, "INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'lieu', 'Port', '{}', 1, 1) RETURNING id", w.E).id as number;
  const jeton = async () => (await w.lire('antor')).versionSysteme as number;
  const astres = () => w.app.db.prepare('SELECT * FROM swn_astres WHERE systeme_id = (SELECT id FROM swn_systemes WHERE cle = ?)').all('int-ouvert') as any[];
  const formations = () => w.app.db.prepare('SELECT * FROM swn_formations WHERE systeme_id = (SELECT id FROM swn_systemes WHERE cle = ?)').all('int-ouvert') as any[];
  const sys = () => one(w.app, "SELECT * FROM swn_systemes WHERE cle = 'int-ouvert'");

  // creation with marks: drawn key, not the sent one, and no version_importee
  const a = await w.ecrire('antor', 'POST', `${PUIS}/astres`, { genre: 'planete', nom: 'Neuve', type: 'tellurique', orbite: 3, heure: 5, taille: 1,
    versionSysteme: await jeton(), cle: 'pirate', importee: true });
  assert.equal(a.statusCode, 201, a.body);
  const neuve = astres().find((x) => x.nom === 'Neuve');
  assert.notEqual(neuve.cle, 'pirate');
  assert.equal(neuve.version_importee, null);

  const z = await w.ecrire('antor', 'POST', `${PUIS}/zones`, { forme: 'anneau', nom: 'Ceinture', parametres: { de: 3, a: 3.5 },
    versionSysteme: await jeton(), cle: 'pirate-zone', importee: true });
  assert.equal(z.statusCode, 201, z.body);
  assert.notEqual(formations()[0].cle, 'pirate-zone');
  assert.equal(formations()[0].version_importee, null);

  // an invalid key is not even looked at
  const mauvaise = await w.ecrire('antor', 'POST', `${PUIS}/astres`, { genre: 'planete', nom: 'Autre', type: 'tellurique', orbite: 4, heure: 1, taille: 1,
    versionSysteme: await jeton(), cle: 'Pas Valide!' });
  assert.equal(mauvaise.statusCode, 201, mauvaise.body);

  // modifications and links with the marks: still nothing stamped
  const m = await w.ecrire('antor', 'PATCH', `${PUIS}/astres/${neuve.cle}`, { heure: 7, version: neuve.version, versionSysteme: await jeton(), importee: true });
  assert.equal(m.statusCode, 200, m.body);
  assert.equal(astres().find((x) => x.cle === neuve.cle).version_importee, null);
  const l = await w.ecrire('antor', 'PUT', `${PUIS}/astres/${neuve.cle}/fiche`, { ficheId: fiche, version: astres().find((x) => x.cle === neuve.cle).version,
    versionSysteme: await jeton(), importee: true });
  assert.equal(l.statusCode, 200, l.body);
  assert.equal(astres().find((x) => x.cle === neuve.cle).version_importee, null);
  const f = formations()[0];
  const mz = await w.ecrire('antor', 'PATCH', `${PUIS}/zones/${f.cle}`, { nom: 'C2', version: f.version, versionSysteme: await jeton(), importee: true });
  assert.equal(mz.statusCode, 200, mz.body);
  const lz = await w.ecrire('antor', 'PUT', `${PUIS}/zones/${f.cle}/fiche`, { ficheId: fiche, version: formations()[0].version, versionSysteme: await jeton(), importee: true });
  assert.equal(lz.statusCode, 200, lz.body);
  assert.equal(formations()[0].version_importee, null);

  // transition: the system's version_importee does not follow (set it to the current version first: an import wrote it)
  w.app.db.prepare('UPDATE swn_systemes SET version_importee = version WHERE id = ?').run(sys().id);
  const t = await w.ecrire('antor', 'PUT', `${PUIS}/transition`, { transition: 40, versionSysteme: await jeton(), importee: true });
  assert.equal(t.statusCode, 200, t.body);
  assert.notEqual(sys().version_importee, sys().version);
});
