// Tests of kanevas-recherche-donnees, written from the exit criterion (B-38, AD-21, AD-118 (1,4,5,8)).
// HTTP in stub mode, real SQLite.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { migrate, openDb } = await import('../db/db.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  const lame = (app.db.prepare("SELECT id FROM univers WHERE nom = ?").get("Lame d'Ébène") as { id: number }).id;
  const fid = (t: string) => (app.db.prepare('SELECT id FROM fiches WHERE titre = ?').get(t) as { id: number }).id;
  const cookies = new Map<string, string>();
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, payload });
    return { status: r.statusCode, json: JSON.parse(r.body) as Any };
  };
  const put = (compte: string, t: string, corps: object, q = '') =>
    req(compte, 'PUT', `/api/univers/${lame}/fiches/${fid(t)}/etiquetage${q}`, corps);
  const get = (compte: string, t: string) => req(compte, 'GET', `/api/univers/${lame}/fiches/${fid(t)}`);
  const noms = async (compte: string, q = '') =>
    (await req(compte, 'GET', `/api/univers/${lame}/etiquettes${q}`)).json.map((e: { nom: string }) => e.nom);
  return { app, req, put, get, noms, lame, fid };
}

test('pose, relecture triée, rejeu sans doublon, casse fusionnée', async () => {
  const m = await monde();
  const corps = { alias: ['Salport', 'Port-aux-Sels'], etiquettes: ['Côte des Brumes'] };
  // The seed already carries them: replace with something else first, to start from a known state.
  const r = await m.put('antor', 'Port-Sel', corps);
  assert.equal(r.status, 200);
  const f = await m.get('antor', 'Port-Sel');
  assert.deepEqual(f.json.alias, ['Port-aux-Sels', 'Salport']);
  assert.deepEqual(f.json.etiquettes, ['Côte des Brumes']);
  await m.put('antor', 'Port-Sel', corps);
  await m.put('antor', 'Port-Sel', { alias: ['salport', 'Port-aux-Sels', 'SALPORT'], etiquettes: ['côte des brumes'] });
  const g = await m.get('antor', 'Port-Sel');
  assert.deepEqual(g.json.alias, ['Port-aux-Sels', 'Salport']);
  assert.deepEqual(g.json.etiquettes, ['Côte des Brumes']);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM etiquettes').get() as Any).n, 1);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM fiche_alias').get() as Any).n, 2);
});

test('droits : Léa lit mais ne pose pas, Antor en mode Joueur non', async () => {
  const m = await monde();
  const l = await m.get('lea', 'Port-Sel');
  assert.deepEqual(l.json.alias, ['Port-aux-Sels', 'Salport']);
  assert.deepEqual(l.json.etiquettes, ['Côte des Brumes']);
  const r = await m.put('lea', 'Port-Sel', { alias: [], etiquettes: [] });
  assert.equal(r.status, 403);
  const j = await m.put('antor', 'Port-Sel', { alias: [], etiquettes: [] }, '?mode=joueur');
  assert.equal(j.status, 403);
  assert.deepEqual((await m.get('antor', 'Port-Sel')).json.alias, ['Port-aux-Sels', 'Salport']);
});

test('fiche illisible : 404 au joueur, pas 403 ; alias et étiquettes non lus', async () => {
  const m = await monde();
  const r = await m.put('lea', 'Cercle des Cendres', { alias: ['x'], etiquettes: [] });
  assert.equal(r.status, 404);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM fiche_alias').get() as Any).n, 2);
});

test('bornes : 21 alias, alias de 121, étiquette de 41, 21 étiquettes — rien écrit', async () => {
  const m = await monde();
  const avant = (await m.get('antor', 'Port-Sel')).json;
  const vingtEtUn = Array.from({ length: 21 }, (_, i) => `a${i}`);
  let r = await m.put('antor', 'Port-Sel', { alias: vingtEtUn, etiquettes: ['Autre'] });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'alias_trop_nombreux');
  r = await m.put('antor', 'Port-Sel', { alias: ['x'.repeat(121)], etiquettes: [] });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'alias_trop_long');
  r = await m.put('antor', 'Port-Sel', { alias: [], etiquettes: ['y'.repeat(41)] });
  assert.equal(r.json.code, 'etiquette_trop_longue');
  r = await m.put('antor', 'Port-Sel', { alias: [], etiquettes: vingtEtUn });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'etiquettes_trop_nombreuses');
  const apres = (await m.get('antor', 'Port-Sel')).json;
  assert.deepEqual([apres.alias, apres.etiquettes], [avant.alias, avant.etiquettes]);
  assert.equal((m.app.db.prepare("SELECT COUNT(*) n FROM etiquettes WHERE nom = 'Autre'").get() as Any).n, 0);
  // Exactly at the bounds is accepted; whitespace and empties are dropped.
  const vingt = Array.from({ length: 20 }, (_, i) => `a${i}`);
  r = await m.put('antor', 'Port-Sel', { alias: [...vingt, '  ', ''], etiquettes: ['z'.repeat(40)] });
  assert.equal(r.status, 200);
  r = await m.put('antor', 'Port-Sel', { alias: ['x'.repeat(120), '  padded  '], etiquettes: [] });
  assert.deepEqual(r.json.alias, ['padded', 'x'.repeat(120)]);
  // Wrong types are a 400, not a 500.
  assert.equal((await m.put('antor', 'Port-Sel', { alias: 'a', etiquettes: [] })).status, 400);
  assert.equal((await m.put('antor', 'Port-Sel', { alias: [1], etiquettes: [] })).status, 400);
  assert.equal((await m.put('antor', 'Port-Sel', {})).status, 400);
});

test('étiquettes proposées : filtre de lecture, suppression avec la dernière fiche', async () => {
  const m = await monde();
  assert.deepEqual(await m.noms('antor'), ['Côte des Brumes']);
  assert.deepEqual(await m.noms('lea'), ['Côte des Brumes']);
  await m.put('antor', 'Cercle des Cendres', { alias: [], etiquettes: ['Secte', 'Côte des Brumes'] });
  assert.deepEqual(await m.noms('antor'), ['Côte des Brumes', 'Secte']);
  assert.deepEqual(await m.noms('lea'), ['Côte des Brumes']); // « Secte » ne porte qu'une fiche illisible
  assert.deepEqual(await m.noms('antor', '?mode=joueur'), ['Côte des Brumes']);
  await m.put('antor', 'Cercle des Cendres', { alias: [], etiquettes: ['Côte des Brumes'] });
  await m.put('antor', 'Port-Sel', { alias: [], etiquettes: [] });
  assert.deepEqual(await m.noms('lea'), []);
  await m.put('antor', 'Cercle des Cendres', { alias: [], etiquettes: [] });
  assert.deepEqual(await m.noms('antor'), []);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM etiquettes').get() as Any).n, 0);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM fiche_etiquettes').get() as Any).n, 0);
});

test('étiquettes : étranger à l’univers → 404 ; mode inconnu → 400', async () => {
  const m = await monde();
  assert.equal((await m.req('teo', 'GET', `/api/univers/${m.lame}/etiquettes`)).status, 404);
  assert.equal((await m.req('antor', 'GET', `/api/univers/${m.lame}/etiquettes?mode=zzz`)).status, 400);
});

test('semis : la chronique est un savoir « Récit », lisible de Léa', async () => {
  const m = await monde();
  const row = m.app.db.prepare("SELECT type, sous_type FROM fiches WHERE titre = ?").get("Chronique de l'Âge d'Ombre") as Any;
  assert.deepEqual({ ...row }, { type: 'savoir', sous_type: 'Récit' });
  const l = await m.req('lea', 'GET', `/api/univers/${m.lame}/fiches?q=Chronique`);
  assert.equal(l.status, 200);
});

test('index : les alias se cherchent, suivent changement de titre, retrait et suppression', async () => {
  const m = await monde();
  const trouve = (mot: string) =>
    (m.app.db.prepare('SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH ?').all(mot) as Any[]).map(
      (r) => r.rowid,
    );
  const port = m.fid('Port-Sel');
  assert.deepEqual(trouve('alias:salport'), [port]);
  assert.deepEqual(trouve('alias:aux'), [port]);
  m.app.db.prepare("UPDATE fiches SET titre = 'Port-Sel Bis' WHERE id = ?").run(port);
  assert.deepEqual(trouve('alias:salport'), [port]); // alias kept after a title change
  assert.deepEqual(trouve('titre:Bis'), [port]);
  await m.put('antor', 'Port-Sel Bis', { alias: ['Autrenom'], etiquettes: [] }).catch(() => undefined);
  const r = await m.req('antor', 'PUT', `/api/univers/${m.lame}/fiches/${port}/etiquetage`, { alias: ['Autrenom'], etiquettes: [] });
  assert.equal(r.status, 200);
  assert.deepEqual(trouve('alias:salport'), []);
  assert.deepEqual(trouve('alias:autrenom'), [port]);
  m.app.db.prepare('DELETE FROM fiche_alias WHERE fiche_id = ?').run(port);
  assert.deepEqual(trouve('alias:autrenom'), []);
  assert.deepEqual(trouve('titre:Bis'), [port]); // the sheet is still indexed
});

test('migration depuis 0013 : la recherche du titre existant trouve toujours la fiche', () => {
  const src = new URL('../db/migrations/', import.meta.url).pathname;
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(src)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 13) copyFileSync(src + f, dir + f);
  const db = openDb(':memory:');
  migrate(db, dir);
  // The seed keeps `fichiers_sections` (0015) in step: scratch tables for it, dropped before 0015 creates the real ones.
  db.exec('CREATE TABLE fichiers (id, univers_id, nom, type, taille, disque, visibilite, ajoute_par)');
  db.exec('CREATE TABLE fichiers_sections (fichier_id, section_id, joint, dans_texte, dans_bloc_mj, PRIMARY KEY (fichier_id, section_id))');
  db.exec('CREATE TABLE fichiers_attente (id INTEGER PRIMARY KEY, univers_id, cle, section_id, fiche_id, maniere)');
  db.exec('ALTER TABLE fiches ADD COLUMN illustration_fichier_id INTEGER');
  // Same for the owner of a system (0019), which the current services write.
  db.exec('ALTER TABLE systemes_jeu ADD COLUMN responsable_id INTEGER');
  // Likewise `relations` (0018): the seed writes `nature` / `qualificatif`, absent from this schema (`type`).
  db.exec('ALTER TABLE relations RENAME COLUMN type TO qualificatif');
  db.exec("ALTER TABLE relations ADD COLUMN nature TEXT NOT NULL DEFAULT ''");
  // The seed also enables the galaxy tool and sows its galaxy: scratch copies of the tables of 0019, 0021, 0022 and 0024.
  const avantScratch = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Any[]).map((r) => r.name));
  const scratch = ['0019-outils.sql', '0021-catalogues.sql', '0022-swn-galaxie.sql', '0024-swn-vaisseaux.sql'].map((f) => readFileSync(src + f, 'utf8').replace(/^ALTER TABLE .*$/m, '')).join('\n');
  // The seed also sows managed sections and ship designs (0020, 0021, 0024): two columns of `sections`, then the tables.
  db.exec('ALTER TABLE sections ADD COLUMN gere_par TEXT; ALTER TABLE sections ADD COLUMN source_version TEXT; ALTER TABLE propositions ADD COLUMN source_version TEXT');
  db.exec('ALTER TABLE lots_import ADD COLUMN outil TEXT');
  // The designs' reads also go through the aliases and labels of 0014 (plain scratch tables, no triggers).
  db.exec('CREATE TABLE fiche_alias (fiche_id, alias); CREATE TABLE etiquettes (id INTEGER PRIMARY KEY, univers_id, nom, cree_le); CREATE TABLE fiche_etiquettes (fiche_id, etiquette_id)');
  db.exec(scratch);
  db.exec('ALTER TABLE swn_conceptions ADD COLUMN equipage INTEGER'); // 0030: the seed writes it
  db.exec('ALTER TABLE swn_catalogue_armes ADD COLUMN classe_min INTEGER'); // 0028: the seed writes it
  // 0029: the seed writes the optional columns of the catalogue too.
  for (const [t, cs] of Object.entries({ coques: ['vitesse', 'armure', 'equipage_min', 'equipage_max'], moteurs: ['classe_min', 'classe_max', 'condition'],
    amenagements: ['classe_min', 'classe_max', 'condition', 'effet', 'rend_puissance', 'rend_masse', 'soute', 'soute_par_classe', 'reduction_cout_pct', 'reduction_base'], defenses: ['classe_min', 'classe_max', 'condition', 'bonus_vitesse'],
    armes: ['degats', 'perforation', 'qualites', 'niveau_tech'], exemples: ['equipage'],
    // 0032: the seed writes the optional columns of modifications and fittings too.
    modifications: ['cout_pct', 'effet', 'valeur', 'points_max', 'sens', 'echange_puissance', 'echange_masse', 'reparation_min', 'effet_pct', 'echange_arrondi'] })) for (const c of cs) db.exec(`ALTER TABLE swn_catalogue_${t} ADD COLUMN ${c} INTEGER`);
  const ajoutees = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Any[]).map((r) => r.name as string).filter((n) => !avantScratch.has(n) && !n.startsWith('sqlite_'));
  semerBouchon(db);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of ajoutees) db.exec(`DROP TABLE ${t}`);
  db.exec('PRAGMA foreign_keys = ON; ALTER TABLE sections DROP COLUMN gere_par; ALTER TABLE sections DROP COLUMN source_version; ALTER TABLE propositions DROP COLUMN source_version; ALTER TABLE lots_import DROP COLUMN outil');
  db.exec('ALTER TABLE relations DROP COLUMN nature');
  db.exec('ALTER TABLE relations RENAME COLUMN qualificatif TO type');
  db.exec('DROP TABLE fichiers_attente; DROP TABLE fichiers_sections; DROP TABLE fichiers; ALTER TABLE fiches DROP COLUMN illustration_fichier_id; ALTER TABLE systemes_jeu DROP COLUMN responsable_id');
  const avant = db.prepare('SELECT id, titre FROM fiches ORDER BY id').all() as { id: number; titre: string }[];
  assert.ok(avant.length >= 5);
  assert.deepEqual(migrate(db), [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]);
  for (const f of avant) {
    const mot = f.titre.split(/[^\p{L}\p{N}]+/u)[0]!;
    const ids = (db.prepare('SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH ?').all(`titre:${mot}*`) as Any[]).map((r) => r.rowid);
    assert.ok(ids.includes(f.id), `${f.titre} retrouvée`);
  }
  assert.equal((db.prepare('SELECT COUNT(*) n FROM recherche_fiches').get() as Any).n, avant.length);
});
