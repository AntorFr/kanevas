import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';
import { versionsSource } from '../services/swn/calcul-vaisseau.js';

// 0053 (B-94, H-8, H-10): the `effet` CHECK of swn_catalogue_modifications is rebuilt for `surdimensionne` and `moteur_niveau`;
// every row keeps every value, no design is rewritten, no catalogue version moves.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0053 : montée depuis 0052, la modification et la conception à vise gardent toutes leurs valeurs, CHECK élargi, index gardés', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(52));
  db.prepare("INSERT INTO univers (id, nom, cle, cree_le) VALUES (1, 'U', 'univ-essai', '2026-11-01T00:00:00.000Z')").run();
  const ins = (cle: string, effet: string | null, extra: Record<string, unknown> = {}) => {
    const cols: Record<string, unknown> = { proprietaire: 'univers', univers_id: 1, cle, nom: `N ${cle}`, cout: 700, puissance: 2, masse: 1.5, pv: 3, ca: 4, limite: 2,
      x_cout: 0, x_puissance: 1, x_masse: 0, masque: 1, version: 6, version_catalogue: 'v1', cout_pct: 120, effet, ...extra };
    db.prepare(`INSERT INTO swn_catalogue_modifications (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`).run(...Object.values(cols) as any[]);
  };
  ins('mon', 'montages_specialises', { limite: 1 });
  ins('sur', 'surcharge_cumulable', { effet_pct: 50 });
  ins('vit', 'vitesse', { valeur: -2 });
  ins('nu', null);
  assert.throws(() => ins('x', 'surdimensionne'), /CHECK/);
  assert.throws(() => ins('x', 'moteur_niveau'), /CHECK/);
  db.prepare("INSERT INTO fiches (id, univers_id, cle, type, titre, charge, creee_via, cree_le, modifie_le) VALUES (1, 1, 'fiche-v', 'vaisseau', 'V', '{}', 'ecran', 'x', 'x')").run();
  db.prepare(`INSERT INTO swn_conceptions (univers_id, fiche_id, coque_cle, choix, version_reglages, version_catalogue, resultat, version)
    VALUES (1, 1, 'c', '[{"nature":"modifications","cle":"mon","quantite":2,"vise":{"nature":"armes","cle":"a"}}]', 'r3', 'v7', '{"cout":42}', 5)`).run();
  const indexes = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'swn_catalogue_modifications' AND sql IS NOT NULL ORDER BY name").all() as any[]).map((r) => r.name);
  const avant = db.prepare('SELECT * FROM swn_catalogue_modifications ORDER BY cle').all();
  const avantK = db.prepare('SELECT * FROM swn_conceptions').get();
  const avantI = indexes();
  const avantV = versionsSource(db, 1);
  assert.ok(avantI.length > 0);

  assert.deepEqual(migrate(db), [53, 54]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  // the columns of 0054 (default 0) are not part of what 0053 must keep
  assert.deepEqual((db.prepare('SELECT * FROM swn_catalogue_modifications ORDER BY cle').all() as any[]).map(({ composants, composants_par_classe, ...r }) => r), avant);
  const { mod_int_con, ...conception } = db.prepare('SELECT * FROM swn_conceptions').get() as any;
  assert.equal(mod_int_con, 0);
  assert.deepEqual(conception, avantK);
  assert.deepEqual(versionsSource(db, 1), avantV);
  assert.deepEqual(indexes(), avantI);
  ins('sd', 'surdimensionne', { limite: 1 });
  ins('mn', 'moteur_niveau', { limite: 1 });
  assert.throws(() => ins('bad', 'inconnu'), /CHECK/);
  assert.throws(() => ins('mon', 'montages_specialises'), /UNIQUE/);
  assert.throws(() => db.prepare("UPDATE swn_catalogue_modifications SET masse = 0.3 WHERE cle = 'sd'").run(), /CHECK/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM swn_catalogue_modifications').get().n, 6);
  // the foreign key to the universe still cascades
  db.prepare('DELETE FROM swn_conceptions').run(); db.prepare('DELETE FROM fiches').run();
  db.prepare('DELETE FROM univers WHERE id = 1').run();
  assert.equal((db.prepare('SELECT count(*) AS n FROM swn_catalogue_modifications').get() as any).n, 0);
});
