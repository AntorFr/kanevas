import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';
import { versionsSource } from '../services/swn/calcul-vaisseau.js';

// 0055 (B-93, B-94, H-9): `composants`, `composants_par_classe` and `mod_int_con` by ADD COLUMN; no row is rewritten, no version moves.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0055 : montée depuis 0054, la modification et la conception gardent leurs valeurs, colonnes à 0, CHECK de colonne', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(54));
  db.prepare("INSERT INTO univers (id, nom, cle, cree_le) VALUES (1, 'U', 'univ-essai', '2026-11-01T00:00:00.000Z')").run();
  const ins = (cle: string, extra: Record<string, unknown> = {}) => {
    const cols: Record<string, unknown> = { proprietaire: 'univers', univers_id: 1, cle, nom: `N ${cle}`, cout: 700, puissance: 2, masse: 1.5, pv: 3, ca: 4, limite: 2,
      x_cout: 0, x_puissance: 1, x_masse: 0, masque: 1, version: 6, version_catalogue: 'v1', cout_pct: 120, effet: 'montages_specialises', ...extra };
    db.prepare(`INSERT INTO swn_catalogue_modifications (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`).run(...Object.values(cols) as any[]);
  };
  ins('mon', { limite: 1 });
  db.prepare("INSERT INTO fiches (id, univers_id, cle, type, titre, charge, creee_via, cree_le, modifie_le) VALUES (1, 1, 'fiche-v', 'vaisseau', 'V', '{}', 'ecran', 'x', 'x')").run();
  db.prepare(`INSERT INTO swn_conceptions (univers_id, fiche_id, coque_cle, choix, version_reglages, version_catalogue, resultat, version)
    VALUES (1, 1, 'c', '[{"nature":"modifications","cle":"mon","quantite":3}]', 'r3', 'v7', '{"cout":42}', 5)`).run();
  const avantM = db.prepare('SELECT * FROM swn_catalogue_modifications').get() as any;
  const avantK = db.prepare('SELECT * FROM swn_conceptions').get() as any;
  const avantV = versionsSource(db, 1);

  assert.deepEqual(migrate(db), [55]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  assert.deepEqual(db.prepare('SELECT * FROM swn_catalogue_modifications').get(), { ...avantM, composants: 0, composants_par_classe: 0 });
  assert.deepEqual(db.prepare('SELECT * FROM swn_conceptions').get(), { ...avantK, mod_int_con: 0 });
  assert.deepEqual(versionsSource(db, 1), avantV);
  const upd = (sql: string) => db.prepare(sql).run();
  upd("UPDATE swn_conceptions SET mod_int_con = 10"); upd("UPDATE swn_conceptions SET mod_int_con = -10");
  assert.throws(() => upd('UPDATE swn_conceptions SET mod_int_con = 11'), /CHECK/);
  assert.throws(() => upd('UPDATE swn_conceptions SET mod_int_con = -11'), /CHECK/);
  assert.throws(() => upd("UPDATE swn_conceptions SET mod_int_con = 'x'"), /CHECK/);
  upd('UPDATE swn_catalogue_modifications SET composants = 99, composants_par_classe = 1');
  assert.throws(() => upd('UPDATE swn_catalogue_modifications SET composants = 100'), /CHECK/);
  assert.throws(() => upd('UPDATE swn_catalogue_modifications SET composants = -1'), /CHECK/);
  assert.throws(() => upd('UPDATE swn_catalogue_modifications SET composants_par_classe = 2'), /CHECK/);
  ins('sd', { effet: 'surdimensionne', limite: 1 }); // the effect CHECK is untouched
  assert.throws(() => ins('bad', { effet: 'inconnu' }), /CHECK/);
});
