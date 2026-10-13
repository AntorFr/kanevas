import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { semerBouchon } from '../bouchon/depart.js';
import { assurerCompte } from '../services/comptes.js';
import { ErreurService } from '../services/erreurs.js';
import { creerFiche, listerFiches } from '../services/fiches.js';
import { creerUnivers } from '../services/univers.js';
import { migrate, openDb, type Db } from './db.js';

const SRC = new URL('./migrations/', import.meta.url).pathname;
const TABLES = [
  'fiches',
  'sections',
  'relations',
  'elements_carte',
  'propositions',
  'pieces_jointes',
  'recherche_fiches',
];

/** Copy of the migrations directory keeping only the files whose number is <= `max`. */
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) {
    if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  }
  return dir;
}

function comptes(db: Db): Record<string, number> {
  return Object.fromEntries(
    TABLES.map((t) => [t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]),
  );
}

function avant12(): Db {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(12));
  semerBouchon(db);
  return db;
}

test('0013: comptes, identifiants, clés étrangères et recherche conservés', () => {
  const db = avant12();
  const c0 = comptes(db);
  assert.ok(c0.fiches >= 5, 'le semis du bouchon porte des fiches');
  assert.ok(c0.sections > 0);
  const ids0 = db.prepare('SELECT id, titre, type FROM fiches ORDER BY id').all();
  const titre = (ids0[0] as { titre: string }).titre;
  const mot = titre.split(/\s+/)[0]!.replace(/[^\p{L}\p{N}]/gu, '');

  assert.deepEqual(migrate(db), [13]);

  assert.deepEqual(comptes(db), c0);
  assert.deepEqual(db.prepare('SELECT id, titre, type FROM fiches ORDER BY id').all(), ids0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  const trouvees = db
    .prepare('SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH ?')
    .all(`${mot}*`) as { rowid: number }[];
  assert.ok(trouvees.some((r) => r.rowid === (ids0[0] as { id: number }).id));
  // the table exists and the switches tables are there
  for (const t of ['types_systeme', 'types_univers']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n, 0);
  }
  // the migration is recorded
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM migrations WHERE numero = 11').get()?.n, 1);
});

test('0013: les déclencheurs de recherche et les index survivent à la recréation', () => {
  const db = avant12();
  migrate(db);
  const marc = assurerCompte(db, 'marc-mig');
  const u = creerUnivers(db, marc.id, { nom: 'Univers de test' });
  const f = creerFiche(db, marc.id, u.id, { type: 'lieu', titre: 'Zorgglub', charge: {} });
  const cherche = (m: string) =>
    (db.prepare('SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH ?').all(m) as unknown[])
      .length;
  assert.equal(cherche('zorgglub'), 1);
  db.prepare('UPDATE fiches SET titre = ? WHERE id = ?').run('Quuxplorp', f.id);
  assert.equal(cherche('zorgglub'), 0);
  assert.equal(cherche('quuxplorp'), 1);
  db.prepare('DELETE FROM fiches WHERE id = ?').run(f.id);
  assert.equal(cherche('quuxplorp'), 0);
  const index = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'fiches'").all() as { name: string }[]).map((r) => r.name);
  for (const n of ['fiches_par_univers', 'fiches_illustration_fichier', 'fiches_cle_origine']) {
    assert.ok(index.includes(n), n);
  }
});

test('0013: une clé orpheline fait échouer migrate, base inchangée, clés rétablies', () => {
  const db = avant12();
  // an orphan section: foreign keys off to plant it, as a damaged copy would carry it
  db.pragma('foreign_keys = OFF');
  db.prepare("UPDATE sections SET fiche_id = 999999 WHERE id = (SELECT MIN(id) FROM sections)").run();
  db.pragma('foreign_keys = ON');
  const c0 = comptes(db);
  assert.throws(() => migrate(db), /foreign key/i);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(db.prepare('SELECT MAX(numero) AS m FROM migrations').get()?.m, 12);
  assert.deepEqual(comptes(db), c0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('fiches_nouvelle','types_systeme')").get()?.n, 0);
  // the old table still carries its CHECK: the base really is at 12
  assert.throws(() => db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (1, 'monde', 'x', '{}', 'a', 'a')").run());
});

test('0013: une relation vers une fiche absente fait aussi échouer migrate', () => {
  const db = avant12();
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO relations (section_id, cible_fiche_id, type, cree_le) VALUES ((SELECT MIN(id) FROM sections), 888888, 'cite', 'a')").run();
  db.pragma('foreign_keys = ON');
  assert.throws(() => migrate(db), /foreign key/i);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
});

test('creerFiche: savoir créé, monde refusé, insertion directe sans contrainte', () => {
  const db = openDb(':memory:');
  migrate(db);
  const marc = assurerCompte(db, 'marc-types');
  const u = creerUnivers(db, marc.id, { nom: 'Les Cristaux' });
  const f = creerFiche(db, marc.id, u.id, { type: 'savoir', titre: "Les Cristaux d'Ombre", charge: {} });
  assert.equal(f.type, 'savoir');
  assert.deepEqual(f.charge, { v: 1 });
  for (const mauvais of ['monde', '', 'Savoir', 'compte rendu']) {
    assert.throws(
      () => creerFiche(db, marc.id, u.id, { type: mauvais, titre: 'X', charge: {} }),
      (e) => e instanceof ErreurService && e.code === 'invalide' && e.message === 'Type de fiche inconnu.',
      mauvais,
    );
  }
  assert.equal(listerFiches(db, { compteId: marc.id }, u.id, { type: 'savoir' }).fiches.length, 1);
  db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le) VALUES (?, 'nimporte', 'T', '{}', 'a', 'a')").run(u.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM fiches WHERE type = 'nimporte'").get()?.n, 1);
});

test('creerFiche: les treize types créables avec charge {v:1}', () => {
  const db = openDb(':memory:');
  migrate(db);
  const marc = assurerCompte(db, 'marc-treize');
  const u = creerUnivers(db, marc.id, { nom: 'Tous' });
  const treize = ['personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete', 'creature', 'race', 'vaisseau', 'savoir', 'recit', 'regle', 'note'];
  for (const type of treize) {
    const f = creerFiche(db, marc.id, u.id, { type, titre: `t-${type}`, charge: type === 'personnage' ? { pj: false } : {} });
    assert.equal(f.type, type);
    assert.equal((f.charge as { v: number }).v, 1);
  }
});
