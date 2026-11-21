// Door of the effects that « rattrapage-migration-main » (kanevas-fiches-liees-rattrapage) proved through a spawned server:
// a database at the schema of `main` (migrations 1 to 17), opened by the application, runs every later migration and stays readable.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Database from 'better-sqlite3';

import { migrate, openDb } from './db.js';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const NUMEROS = readdirSync(new URL('./migrations/', import.meta.url)).filter((f) => /^\d{4}-.+\.sql$/.test(f)).map((f) => Number(f.slice(0, 4))).sort((a, b) => a - b);

let dir = '';
let chemin = '';
let app: Any;
let cookie = '';
const lire = async (p: string) => app.inject({ url: p, headers: { cookie } });

describe('A database at the schema of main opened by the application', () => {
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rattrapage-migration-'));
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    const source = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 17) copyFileSync(new URL(f, source), join(migrations, f));
    }
    chemin = join(dir, 'k.db');
    const db = openDb(chemin);
    migrate(db, migrations + '/');
    assert.equal((db.prepare('SELECT max(numero) AS n FROM migrations').get() as { n: number }).n, 17, 'the start base is at the schema of main');
    const d = '2026-10-20T10:00:00.000Z';
    db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
    db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?)").run(d);
    db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj')").run();
    const f = db.prepare("INSERT INTO fiches (id, univers_id, type, sous_type, titre, charge, cree_le, modifie_le) VALUES (?, 1, ?, ?, ?, ?, ?, ?)");
    f.run(1, 'aventure', 'Campagne', 'La Couronne brisée', '{"v":1,"statut":"en_cours"}', d, d);
    f.run(2, 'lieu', null, 'Port-Sel', '{"v":1}', d, d);
    f.run(3, 'personnage', null, 'Aldric', '{"v":1,"pj":false}', d, d);
    const cols = (db.prepare('PRAGMA table_info(sections)').all() as { name: string }[]).map((c) => c.name);
    const val: Record<string, unknown> = { fiche_id: 1, titre: 'Présentation', contenu: 'x', contenu_public: 'x', ordre: 0, version: 1, joueurs_lisent: 1, cree_le: d, modifie_le: d };
    const noms = Object.keys(val).filter((k) => cols.includes(k));
    db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (1, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => val[k]));
    db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (2, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => (k === 'fiche_id' ? 3 : k === 'titre' ? 'Apparence' : val[k])));
    db.prepare('INSERT INTO relations (id, section_id, cible_fiche_id, type, cree_le) VALUES (1, 1, 2, ?, ?)').run('mouille à', d);
    db.close();
    process.env.NODE_ENV = 'test';
    process.env.KANEVAS_STUB = '1';
    process.env.DB_PATH = chemin;
    const { buildApp } = await import('../app.js');
    app = await buildApp();
    const r = await app.inject({
      method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor',
    });
    cookie = r.cookies.map((c: Any) => `${c.name}=${c.value}`).join('; ');
    assert.ok(cookie.includes('kanevas_session'), 'signed in as antor');
  }, { timeout: 120000 });
  after(async () => {
    await app?.close();
    delete process.env.DB_PATH;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('the base opened by the application carries migrations 1 to the last, once each', () => {
    const ro = new Database(chemin, { readonly: true });
    const numeros = (ro.prepare('SELECT numero FROM migrations ORDER BY numero').all() as { numero: number }[]).map((r) => r.numero);
    ro.close();
    assert.deepEqual(numeros, NUMEROS);
  });

  test('the earlier free relation answers nature "" and its text as qualifier', async () => {
    const r = await lire('/api/univers/1/fiches/1/sections/1/relations');
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().relations.map((x: Any) => [x.nature, x.qualificatif, x.cible.titre]), [['', 'mouille à', 'Port-Sel']]);
  });

  test('the campaign of main stays readable, type aventure, status « en_cours »', async () => {
    const r = await lire('/api/univers/1/fiches/1');
    assert.equal(r.statusCode, 200);
    const f = r.json();
    assert.equal(f.type, 'aventure');
    assert.equal(f.sousType, 'Campagne');
    assert.equal(f.charge.statut, 'en_cours');
    assert.deepEqual(f.sections.map((s: Any) => s.titre), ['Présentation']);
  });

  test('the list of adventures answers and carries the campaign', async () => {
    const r = await lire('/api/univers/1/fiches?type=aventure');
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().fiches.map((x: Any) => x.titre), ['La Couronne brisée']);
  });

  test('a relation with a nature can be posed on the migrated base', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/univers/1/fiches/3/sections/2/relations', headers: { cookie }, payload: { cibleFicheId: 2, nature: 'se_situe', qualificatif: 'habite' },
    });
    assert.ok(r.statusCode < 300, `POST -> ${r.statusCode}`);
    const l = await lire('/api/univers/1/fiches/3/sections/2/relations');
    assert.deepEqual(l.json().relations.map((x: Any) => [x.nature, x.qualificatif, x.cible.titre]), [['se_situe', 'habite', 'Port-Sel']]);
  });
});
