// Migration 0040 (AD-138): the four import bookkeeping columns leave the schema, nothing else moves.
// The 0039 database is built by the test itself (migrations up to 0039, then SQL rows).
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const D = '2022-02-02T10:00:00.000Z';
const colonnes = (db: ReturnType<typeof openDb>, t: string) =>
  (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);

test('0040 : les quatre colonnes disparaissent, les lignes, la recherche et les liens restent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-retrait-'));
  try {
    const source = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(source)) {
      if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 39) copyFileSync(new URL(f, source), join(dir, f));
    }
    const db = openDb(':memory:');
    assert.equal(migrate(db, dir + '/').at(-1), 39);
    const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p);

    run("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'mj', ?)", D);
    for (const [id, nom, cle] of [[1, 'Un', 'un'], [2, 'Deux', 'deux']] as const) {
      run('INSERT INTO univers (id, nom, description, cree_le, cle) VALUES (?, ?, ?, ?, ?)', id, nom, '', D, cle);
    }
    run(`INSERT INTO fichiers (id, univers_id, nom, type, taille, disque, empreinte, visibilite, cle_origine, ajoute_par, ajoute_le, dernier_import)
         VALUES (1, 1, 'carte.png', 'image/png', 10, 'd1', 'e1', 'mj', 'carte', 1, ?, '{"nom":"carte.png","visibilite":"joueurs"}')`, D);
    run(`INSERT INTO fichiers (id, univers_id, nom, type, taille, disque, ajoute_par, ajoute_le) VALUES (2, 2, 'b.pdf', 'application/pdf', 5, 'd2', 1, ?)`, D);
    const fiche = (id: number, u: number, titre: string, marque: string | null) =>
      run(`INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, dernier_import)
           VALUES (?, ?, 'lieu', ?, '{}', ?, '2023-03-03T00:00:00.000Z', ?, 'import', ?)`, id, u, titre, D, `f-${id}`, marque);
    fiche(1, 1, 'Port-Sel', '{"titre":"Port-Sel"}');
    fiche(2, 1, 'Fort-Vent', null);
    fiche(3, 2, 'Ailleurs', '{"illustration":{"demande":"carte","ecrit":1}}');
    const section = (id: number, f: number, ordre: number, contenu: string, vi: number | null, di: string | null) =>
      run(`INSERT INTO sections (id, fiche_id, titre, ordre, contenu, contenu_public, version, modifie_le, cle, version_importee, dernier_import)
           VALUES (?, ?, 'Description', ?, ?, ?, 4, '2023-03-03T00:00:00.000Z', ?, ?, ?)`, id, f, ordre, contenu, contenu, `s-${id}`, vi, di);
    section(1, 1, 1, 'Un phare sur la falaise [[f-2|Fort-Vent]]', 3, '{"fichiers":{"ecrits":[1]}}');
    section(2, 2, 1, 'Vent glacial', null, null);
    section(3, 3, 1, 'Autre monde', 2, '{}');
    run("INSERT INTO liens (section_id, cible_fiche_id, texte) VALUES (1, 2, 'Fort-Vent')");
    run("INSERT INTO relations (section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (1, 2, 'proche', 'allié', ?)", D);
    run('INSERT INTO fichiers_sections (fichier_id, section_id, joint) VALUES (1, 1, 1)');
    run("INSERT INTO fiche_alias (fiche_id, alias) VALUES (1, 'Le Port')");
    run("INSERT INTO etiquettes (id, univers_id, nom, cree_le) VALUES (1, 1, 'côte', ?)", D);
    run('INSERT INTO fiche_etiquettes (fiche_id, etiquette_id) VALUES (1, 1)');

    const tables = ['univers', 'fiches', 'sections', 'liens', 'relations', 'fichiers', 'fichiers_sections', 'fiche_alias', 'etiquettes', 'fiche_etiquettes'];
    const compte = () => tables.map((t) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n);
    const avant = compte();
    const lire = () => ({
      fiches: db.prepare('SELECT id, titre, modifie_le, cle, parent_id FROM fiches ORDER BY id').all(),
      sections: db.prepare('SELECT id, contenu, contenu_public, version, modifie_le FROM sections ORDER BY id').all(),
      fichiers: db.prepare('SELECT id, nom, visibilite, empreinte, cle_origine FROM fichiers ORDER BY id').all(),
      liens: db.prepare('SELECT * FROM liens ORDER BY id').all(),
      relations: db.prepare('SELECT * FROM relations ORDER BY id').all(),
      jointures: db.prepare('SELECT * FROM fichiers_sections').all(),
      alias: db.prepare("SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH 'Port*'").all(),
      texte: db.prepare("SELECT rowid FROM recherche_sections WHERE recherche_sections MATCH 'phare'").all(),
    });
    const etat = lire();

    assert.deepEqual(migrate(db, new URL('./migrations/', import.meta.url).pathname), [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54]);

    assert.ok(!colonnes(db, 'fiches').includes('dernier_import'));
    assert.ok(!colonnes(db, 'sections').includes('dernier_import'));
    assert.ok(!colonnes(db, 'sections').includes('version_importee'));
    assert.ok(!colonnes(db, 'fichiers').includes('dernier_import'));
    assert.ok(colonnes(db, 'sections').includes('version'));
    assert.deepEqual(compte(), avant);
    assert.deepEqual(lire(), etat);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    // The triggers survived: a title change still reaches the search index.
    run("UPDATE fiches SET titre = 'Port-Neuf' WHERE id = 1");
    assert.equal(db.prepare("SELECT count(*) AS n FROM recherche_fiches WHERE recherche_fiches MATCH 'Neuf'").get().n, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
