// Migration 0053 (kanevas-systemes-jeu-surcharge-socle, AD-153, AD-147): `fiches.surcharge_de`, its partial unique index,
// `historique.action` widened to `detachee` and the trigger that writes that line. Base: migrations 0001–0052 filled by hand.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate, openDb } from './db.js';

const COMPLET = fileURLToPath(new URL('./migrations/', import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function baseAvant() {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-surcharge-'));
  const precedent = join(dir, 'precedent');
  cpSync(COMPLET, precedent, { recursive: true });
  for (const f of readdirSync(precedent)) if (Number(/^(\d+)/.exec(f)?.[1] ?? 0) >= 53) rmSync(join(precedent, f));
  const db: Any = openDb(join(dir, 'k.db'));
  migrate(db, precedent + '/');
  db.exec(`
    INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', '2026-01-01T00:00:00Z');
    INSERT INTO univers (id, nom, cree_le, cle) VALUES (1, 'Éneria', '2026-01-01T00:00:00Z', 'eneria');
    INSERT INTO univers (id, nom, cree_le, cle) VALUES (2, 'Aube', '2026-01-01T00:00:00Z', 'aube');
    INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via)
      VALUES (1, 1, 'objet', 'Épée', '{}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00.000Z', 'objet:epee', 'ecran');
    INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via)
      VALUES (2, 2, 'objet', 'Épée', '{}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00.000Z', 'objet:epee', 'ecran');
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, action, origine, cree_le)
      VALUES (1, 1, 'objet:epee', 'Épée', 'fiche', 'creee', 'ecran', '2026-01-01T00:00:00.000Z');
  `);
  return { db, dir };
}
const un = (db: Any, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p);
const tout = (db: Any, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p);

test('0053 : montée — aucune copie, fiches et historique intacts, rejeu vide, clés étrangères saines', () => {
  const { db, dir } = baseAvant();
  try {
    assert.ok(!tout(db, 'PRAGMA table_info(fiches)').some((c: Any) => c.name === 'surcharge_de'));
    assert.deepEqual(migrate(db), [53]);
    assert.deepEqual(tout(db, 'SELECT id, titre, modifie_le, surcharge_de FROM fiches ORDER BY id'), [
      { id: 1, titre: 'Épée', modifie_le: '2026-01-02T00:00:00.000Z', surcharge_de: null },
      { id: 2, titre: 'Épée', modifie_le: '2026-01-02T00:00:00.000Z', surcharge_de: null },
    ]);
    const h = tout(db, "SELECT univers_id, fiche_id, action, origine, cree_le FROM historique WHERE cree_le = '2026-01-01T00:00:00.000Z'");
    assert.deepEqual(h, [{ univers_id: 1, fiche_id: 1, action: 'creee', origine: 'ecran', cree_le: '2026-01-01T00:00:00.000Z' }]);
    assert.deepEqual(migrate(db), []);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    // the widened CHECK keeps refusing the unknown, and the recreated indexes exist
    assert.throws(
      () => db.prepare("INSERT INTO historique (univers_id, fiche_cle, fiche_titre, objet, action, origine, cree_le) VALUES (1, 'k', 't', 'fiche', 'inconnue', 'ecran', 'x')").run(),
      /CHECK/,
    );
    const idx = tout(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'historique'").map((r: Any) => r.name);
    for (const n of ['historique_univers', 'historique_fiche', 'historique_cree_le']) assert.ok(idx.includes(n), n);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('0053 : un seul exemplaire par (univers, original) ; plusieurs copies ordinaires (NULL) restent permises', () => {
  const { db, dir } = baseAvant();
  try {
    migrate(db);
    const ins = db.prepare("INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, surcharge_de) VALUES (?, 'objet', ?, '{}', 'x', 'x', ?, 'ecran', ?)");
    ins.run(2, 'Copie', 'objet:copie', 1);
    assert.throws(() => ins.run(2, 'Copie bis', 'objet:copie-bis', 1), /UNIQUE/);
    ins.run(1, 'Autre univers', 'objet:copie-u1', 1); // another universe, same original: allowed
    ins.run(2, 'Ordinaire 1', 'objet:o1', null);
    ins.run(2, 'Ordinaire 2', 'objet:o2', null);
    assert.throws(() => ins.run(2, 'Orpheline', 'objet:orph', 999), /FOREIGN KEY/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('0053 : vider surcharge_de écrit une ligne detachee dans l’univers de la copie, sans bouger modifie_le', () => {
  const { db, dir } = baseAvant();
  try {
    migrate(db);
    db.prepare("INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle, creee_via, surcharge_de) VALUES (10, 2, 'objet', 'Épée+', '{}', 'x', '2026-02-02T00:00:00.000Z', 'objet:epee-plus', 'ecran', 1)").run();
    const avant = tout(db, 'SELECT id FROM historique').length;
    db.prepare('UPDATE fiches SET surcharge_de = NULL WHERE id = 10').run();
    const d = tout(db, "SELECT * FROM historique WHERE action = 'detachee'");
    assert.equal(d.length, 1);
    assert.equal(d[0].univers_id, 2, 'la copie est dans l’univers 2, pas celui de l’original');
    assert.equal(d[0].fiche_id, 10);
    assert.equal(d[0].fiche_cle, 'objet:epee-plus');
    assert.equal(d[0].fiche_titre, 'Épée+');
    assert.equal(d[0].objet, 'fiche');
    assert.equal(tout(db, 'SELECT id FROM historique').length, avant + 1, 'une seule ligne de plus');
    assert.equal(un(db, 'SELECT modifie_le m FROM fiches WHERE id = 10').m, '2026-02-02T00:00:00.000Z');
    // not a detachment: NULL → NULL and a change of title do not write `detachee`
    db.prepare('UPDATE fiches SET surcharge_de = NULL WHERE id = 10').run();
    assert.equal(tout(db, "SELECT id FROM historique WHERE action = 'detachee'").length, 1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
