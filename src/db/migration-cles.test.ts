// Migration 0018 (AD-146): every universe, sheet and section gets a unique non-null key; the 0017 database is
// built by the test itself (migrations 0001–0017, then SQL rows). `creee_via` follows the former origin key.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb, type Db } from './db.js';

const D = '2022-02-02T10:00:00.000Z';

function base0017(): { db: Db; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'migration-cles-'));
  const source = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(source)) {
    if (/^\d{4}-.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 17) copyFileSync(new URL(file, source), join(dir, file));
  }
  const db = openDb(':memory:');
  assert.deepEqual(migrate(db, dir + '/').at(-1), 17);
  return { db, dir };
}

const univers = (db: Db, id: number, nom: string) =>
  db.prepare('INSERT INTO univers (id, nom, description, cree_le) VALUES (?, ?, ?, ?)').run(id, nom, '', D);
const fiche = (db: Db, id: number, u: number, type: string, titre: string, cle: string | null) =>
  db
    .prepare('INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle_origine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, u, type, titre, '{"v":1}', D, D, cle);
const section = (db: Db, id: number, f: number, ordre: number, titre: string, cle: string | null) =>
  db
    .prepare('INSERT INTO sections (id, fiche_id, titre, ordre, contenu, modifie_le, cle_origine) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, f, titre, ordre, '', D, cle);

test('0018 : chaque univers, fiche et section reçoit une clé unique non nulle ; creee_via suit la clé d’origine', () => {
  const { db, dir } = base0017();
  try {
    univers(db, 1, 'Éneria Prime');
    univers(db, 2, 'eneria  prime'); // same slug: suffixed in id order
    univers(db, 3, '42'); // no letter
    univers(db, 4, 'x'.repeat(60)); // longer than 40
    univers(db, 5, 'x'.repeat(60));
    // sheets
    fiche(db, 1, 1, 'lieu', 'Port-Sel', 'lieu:port-sel'); // origin key kept
    fiche(db, 2, 1, 'lieu', 'Château d’Éau', null); // drawn: lieu:chateau-d-eau
    fiche(db, 3, 1, 'lieu', 'Château d’Eau', null); // same title: -2
    fiche(db, 4, 1, 'personnage', 'Aldric', '123'); // digits only → cle-123
    fiche(db, 5, 1, 'personnage', 'Autre', 'cle-123'); // existing, has a letter: kept, wins over the rewritten one
    fiche(db, 6, 2, 'lieu', 'Port-Sel', null); // other universe: no collision with 1
    fiche(db, 7, 2, 'lieu', '!!!', null); // title without letter nor digit
    section(db, 1, 1, 1, 'Description', 'desc'); // kept
    section(db, 2, 1, 2, 'Description', null); // same title as the first: drawn `description`
    section(db, 3, 1, 3, 'Description', null); // → description-2
    section(db, 4, 2, 1, 'Vérité ?', null);
    section(db, 5, 2, 2, '???', null);
    section(db, 6, 3, 1, 'Description', null); // other sheet: same key allowed

    assert.deepEqual(migrate(db), [18]);

    const u = db.prepare('SELECT id, cle FROM univers ORDER BY id').all() as { id: number; cle: string }[];
    assert.deepEqual(u.map((r) => r.cle).slice(0, 3), ['eneria-prime', 'eneria-prime-2', 'univers-3']);
    for (const r of u) assert.match(r.cle, /^[a-z0-9-]{2,40}$/, `univers ${r.id}`);
    assert.equal(new Set(u.map((r) => r.cle)).size, 5, 'unique on the instance');
    assert.equal(u[3]!.cle, 'x'.repeat(40));
    assert.match(u[4]!.cle, /^x+-2$/);
    assert.equal(u[4]!.cle.length, 40, 'the suffix still fits in 40');

    const f = Object.fromEntries(
      (db.prepare('SELECT id, cle, creee_via FROM fiches').all() as { id: number; cle: string; creee_via: string }[]).map((r) => [r.id, r]),
    );
    assert.equal(f[1].cle, 'lieu:port-sel');
    assert.equal(f[2].cle, 'lieu:chateau-d-eau');
    assert.equal(f[3].cle, 'lieu:chateau-d-eau-2');
    assert.equal(f[5].cle, 'cle-123');
    assert.equal(f[4].cle, 'cle-123-2', 'digits-only key rewritten, never colliding with an existing one');
    assert.equal(f[6].cle, 'lieu:port-sel', 'unique per universe, not on the instance');
    assert.equal(f[7].cle, 'lieu:7', 'no letter nor digit in the title: falls back on the id');
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7].map((i) => f[i].creee_via),
      ['import', 'ecran', 'ecran', 'import', 'import', 'ecran', 'ecran'],
    );

    const s = Object.fromEntries(
      (db.prepare('SELECT id, cle FROM sections').all() as { id: number; cle: string }[]).map((r) => [r.id, r.cle]),
    );
    assert.deepEqual(s, { 1: 'desc', 2: 'description', 3: 'description-2', 4: 'verite', 5: 'section-5', 6: 'description' });

    // unique, NOT NULL (the tables are rebuilt)
    assert.throws(() => db.prepare("UPDATE fiches SET cle = 'lieu:port-sel' WHERE id = 2").run());
    assert.throws(() => db.prepare('UPDATE fiches SET cle = NULL WHERE id = 2').run());
    assert.throws(() => db.prepare("UPDATE sections SET cle = 'desc' WHERE id = 2").run());
    assert.throws(() => db.prepare('UPDATE sections SET cle = NULL WHERE id = 2').run());
    assert.throws(() => db.prepare("UPDATE univers SET cle = 'eneria-prime' WHERE id = 3").run());
    assert.throws(() => db.prepare("UPDATE univers SET cle = 'Maj' WHERE id = 3").run(), 'the form of an universe key is a CHECK');
    // former keys: empty tables, and the old columns are gone
    for (const t of ['cles_anciennes', 'univers_cles_anciennes']) {
      assert.equal((db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n, 0, t);
    }
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    assert.ok(!cols('fiches').includes('cle_origine') && !cols('sections').includes('cle_origine'));
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    // the search triggers survived the rebuild
    const trouve = (m: string) => (db.prepare('SELECT COUNT(*) n FROM recherche_fiches WHERE recherche_fiches MATCH ?').get(m) as { n: number }).n;
    assert.equal(trouve('aldric'), 1);
    db.prepare("UPDATE fiches SET titre = 'Quuxplorp' WHERE id = 4").run();
    assert.equal(trouve('aldric'), 0);
    assert.equal(trouve('quuxplorp'), 1);
    assert.deepEqual(migrate(db), [], 'replay: nothing');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('0018 sur une base vide : rien à convertir, schéma posé', () => {
  const { db, dir } = base0017();
  try {
    assert.deepEqual(migrate(db), [18]);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM univers').get() as { n: number }).n, 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
