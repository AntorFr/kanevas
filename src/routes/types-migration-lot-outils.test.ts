// Door of the lot « outils » for the migration case of `src/e2e/types-besoin-verification.test.ts` (docs/tests-ecran/lot-outils.md): a base
// written before the types migration (0013) loses no row and breaks no foreign key (`inject`, no browser). Own file: DB_PATH is read at the app import.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';

const dir = mkdtempSync(join(tmpdir(), 'types-migration-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.KANEVAS_SANS_SEMIS = '1';
process.env.DB_PATH = join(dir, 'k.db');
const { migrate, openDb } = await import('../db/db.js');
const { buildApp } = await import('../app.js');

test('the sheets, sections, relations, map places and proposals are all there after the migration, with their illustration and origin key, and no foreign key is broken', async () => {
  try {
    const avant = join(dir, 'avant');
    mkdirSync(avant);
    const source = new URL('../db/migrations/', import.meta.url);
    for (const f of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) < 13) copyFileSync(new URL(f, source), join(avant, f));
    }
    const chemin = process.env.DB_PATH as string;
    const db = openDb(chemin);
    migrate(db, avant + '/');
    const t = '2026-01-01T00:00:00.000Z';
    db.exec(`
      INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', '${t}');
      INSERT INTO univers (id, nom, cree_le) VALUES (1, 'Avant', '${t}');
      INSERT INTO membres (univers_id, compte_id, role) VALUES (1, 1, 'mj');
      INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, illustration_fichier, illustration_type, illustration_taille, cle_origine, dernier_import)
        VALUES (1, 1, 'lieu', 'Port-Sel', '{}', '${t}', '${t}', 'abc.png', 'image/png', 12, 'lieu:port-sel', '"${t}"');
      INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (2, 1, 'personnage', 'Aldric', '{"pj":false}', '${t}', '${t}');
      INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le) VALUES (3, 1, 'compte_rendu', 'Séance 1', '{}', '${t}', '${t}');
      INSERT INTO sections (id, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (1, 1, 'Description', 0, 'Un port.', '${t}', 1);
      INSERT INTO sections (id, fiche_id, titre, ordre, contenu, modifie_le, joueurs_lisent) VALUES (2, 2, 'Apparence', 0, 'Grand.', '${t}', 1);
      INSERT INTO relations (section_id, cible_fiche_id, type, cree_le) VALUES (2, 1, 'habite', '${t}');
      INSERT INTO cartes (id, univers_id, titre, forme, visible, cree_le) VALUES (1, 1, 'Brume', 'graphe', 1, '${t}');
      INSERT INTO elements_carte (carte_id, fiche_id, x, y, cree_le) VALUES (1, 1, 10, 20, '${t}');
      INSERT INTO propositions (univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le) VALUES (1, 1, 2, 3, 'Plus grand.', 1, '${t}');
    `);
    db.close();
    const compter = (): Record<string, number> => {
      const d = new Database(chemin, { readonly: true });
      const r: Record<string, number> = {};
      for (const tbl of ['fiches', 'sections', 'relations', 'elements_carte', 'propositions', 'cartes']) {
        r[tbl] = (d.prepare(`SELECT count(*) AS n FROM ${tbl}`).get() as { n: number }).n;
      }
      d.close();
      return r;
    };
    const attendu = { fiches: 3, sections: 2, relations: 1, elements_carte: 1, propositions: 1, cartes: 1 };
    assert.deepEqual(compter(), attendu);
    const app = await buildApp(); // the migrations run at startup
    assert.deepEqual(compter(), attendu);
    const port = app.db.prepare('SELECT titre, type, illustration_fichier AS ill, cle_origine AS cle FROM fiches WHERE id = 1').get();
    assert.deepEqual(port, { titre: 'Port-Sel', type: 'lieu', ill: 'abc.png', cle: 'lieu:port-sel' });
    assert.deepEqual(app.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
