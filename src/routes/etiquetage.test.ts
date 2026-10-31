// Tests of kanevas-recherche-donnees, written from the exit criterion (B-38, AD-21, AD-118 (1,4,5,8)).
// HTTP in stub mode, real SQLite.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
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
  m.app.db.prepare("UPDATE fiches SET titre = 'Port-Sel II' WHERE id = ?").run(port);
  assert.deepEqual(trouve('alias:salport'), [port]); // alias kept after a title change
  assert.deepEqual(trouve('titre:II'), [port]);
  await m.put('antor', 'Port-Sel II', { alias: ['Autrenom'], etiquettes: [] }).catch(() => undefined);
  const r = await m.req('antor', 'PUT', `/api/univers/${m.lame}/fiches/${port}/etiquetage`, { alias: ['Autrenom'], etiquettes: [] });
  assert.equal(r.status, 200);
  assert.deepEqual(trouve('alias:salport'), []);
  assert.deepEqual(trouve('alias:autrenom'), [port]);
  m.app.db.prepare('DELETE FROM fiche_alias WHERE fiche_id = ?').run(port);
  assert.deepEqual(trouve('alias:autrenom'), []);
  assert.deepEqual(trouve('titre:II'), [port]); // the sheet is still indexed
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
  // Same for the owner of a system (0017), which the current services write.
  db.exec('ALTER TABLE systemes_jeu ADD COLUMN responsable_id INTEGER');
  semerBouchon(db);
  db.exec('DROP TABLE fichiers_attente; DROP TABLE fichiers_sections; DROP TABLE fichiers; ALTER TABLE fiches DROP COLUMN illustration_fichier_id; ALTER TABLE systemes_jeu DROP COLUMN responsable_id');
  const avant = db.prepare('SELECT id, titre FROM fiches ORDER BY id').all() as { id: number; titre: string }[];
  assert.ok(avant.length >= 5);
  assert.deepEqual(migrate(db), [14, 15, 16, 17, 18]);
  for (const f of avant) {
    const mot = f.titre.split(/[^\p{L}\p{N}]+/u)[0]!;
    const ids = (db.prepare('SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH ?').all(`titre:${mot}*`) as Any[]).map((r) => r.rowid);
    assert.ok(ids.includes(f.id), `${f.titre} retrouvée`);
  }
  assert.equal((db.prepare('SELECT COUNT(*) n FROM recherche_fiches').get() as Any).n, avant.length);
});
