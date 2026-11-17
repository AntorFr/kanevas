// Door of the lot « outils » for `src/e2e/natures-ensemble-migration.test.ts`: a database written by the schema before the natures,
// migrated at startup, read through the API (`inject`, no browser).
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const dir = mkdtempSync(join(tmpdir(), 'natures-migration-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.DB_PATH = join(dir, 'k.db');
const { migrate, openDb } = await import('../db/db.js');
const { buildApp } = await import('../app.js');

describe('Natures: a database of the previous schema', () => {
  test('after the migration the three old relations answer nature "" with their old text, « Mentionnée dans » keeps them, a nature relation is added and its replay is 409', async () => {
    try {
      const migrations = join(dir, 'migrations');
      mkdirSync(migrations);
      const source = new URL('../db/migrations/', import.meta.url);
      for (const f of readdirSync(source)) {
        if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 16) copyFileSync(new URL(f, source), join(migrations, f));
      }
      const chemin = join(dir, 'k.db');
      const db = openDb(chemin);
      migrate(db, migrations + '/');
      const d = '2024-05-05T10:00:00.000Z';
      db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
      db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Brumes', ?)").run(d);
      db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj')").run();
      const f = db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 1, ?, ?, '{}', ?, ?)");
      f.run(1, 'personnage', 'Aldric', d, d);
      f.run(2, 'lieu', 'Port-Sel', d, d);
      f.run(3, 'faction', 'Guilde', d, d);
      const cols = (db.prepare('PRAGMA table_info(sections)').all() as { name: string }[]).map((c) => c.name);
      const val: Record<string, unknown> = { fiche_id: 1, titre: 'Apparence', contenu: 'x', contenu_public: 'x', ordre: 0, version: 1, joueurs_lisent: 1, cree_le: d, modifie_le: d };
      const noms = Object.keys(val).filter((k) => cols.includes(k));
      db.prepare(`INSERT INTO sections (id, ${noms.join(',')}) VALUES (1, ${noms.map(() => '?').join(',')})`).run(...noms.map((k) => val[k]));
      const rel = db.prepare('INSERT INTO relations (id, section_id, cible_fiche_id, type, cree_le) VALUES (?, 1, ?, ?, ?)');
      rel.run(1, 2, 'maître de port', d);
      rel.run(2, 2, 'surveille', d);
      rel.run(3, 3, 'y fait passer ses cargaisons', d);
      db.close();
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'compte=antor' });
      const c = res.cookies.find((x) => x.name === 'kanevas_session');
      assert.ok(c);
      const h = { cookie: `kanevas_session=${c.value}` };
      const lire = (url: string) => app.inject({ method: 'GET', url, headers: h });
      const r = await lire('/api/univers/1/fiches/1/sections/1/relations');
      assert.equal(r.statusCode, 200);
      assert.deepEqual(
        (r.json().relations as Any[]).map((x) => [x.nature, x.qualificatif, x.cible.titre]),
        [['', 'maître de port', 'Port-Sel'], ['', 'surveille', 'Port-Sel'], ['', 'y fait passer ses cargaisons', 'Guilde']],
      );
      const fp = (await lire('/api/univers/1/fiches/2')).json() as Any;
      const libelles = (fp.mentions.find((m: Any) => m.titre === 'Aldric')?.pourquoi ?? []).filter((p: Any) => p.genre === 'relation').map((p: Any) => p.libelle);
      assert.deepEqual(libelles, ['maître de port', 'surveille']);
      const poster = (corps: Any) => app.inject({ method: 'POST', url: '/api/univers/1/fiches/1/sections/1/relations', headers: h, payload: corps });
      assert.equal((await poster({ cibleFicheId: 2, nature: 'se_situe', qualificatif: 'habite' })).statusCode, 201);
      assert.equal((await poster({ cibleFicheId: 2, nature: 'se_situe', qualificatif: 'habite' })).statusCode, 409);
      assert.equal((await poster({ cibleFicheId: 2, qualificatif: 'maître de port' })).statusCode, 409);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
