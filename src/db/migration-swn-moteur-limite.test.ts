import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';
import { versionsSource } from '../services/swn/calcul-vaisseau.js';

// 0046 (B-94, H-2, H-3): `moteur_spike` (0/1, default 1) on the hulls, `limite_par` (NULL or 'armes') on the fittings; no row rewritten, no version moved.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0046 : montée depuis 0045, coque à moteur_spike 1, aménagement à limite_par NULL, conception et versions inchangées, CHECK posés', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(45));
  const noms = (t: string) => (db.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name);
  assert.ok(!noms('swn_catalogue_coques').includes('moteur_spike'));
  assert.ok(!noms('swn_catalogue_amenagements').includes('limite_par'));
  db.prepare("INSERT INTO univers (id, nom, cle, cree_le) VALUES (1, 'U', 'univ-essai', '2026-11-01T00:00:00.000Z')").run();
  db.prepare(`INSERT INTO swn_catalogue_coques (proprietaire, univers_id, cle, nom, classe, cout, pv, ca, puissance, masse, emports, facteur_cout, facteur_puissance, facteur_masse, version_catalogue)
    VALUES ('univers', 1, 'c', 'Coque', 2, 10, 5, 10, 10, 8, 1, 1, 1, 1, 'v7')`).run();
  db.prepare(`INSERT INTO swn_catalogue_amenagements (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, version_catalogue)
    VALUES ('univers', 1, 'a', 'Amén', 7, 1, 1.5, 2, 3, 4, 0, 1, 0, 'v7')`).run();
  db.prepare("INSERT INTO fiches (id, univers_id, cle, type, titre, charge, creee_via, cree_le, modifie_le) VALUES (1, 1, 'fiche-v', 'vaisseau', 'V', '{}', 'ecran', 'x', 'x')").run();
  db.prepare(`INSERT INTO swn_conceptions (univers_id, fiche_id, coque_cle, choix, version_reglages, version_catalogue, resultat)
    VALUES (1, 1, 'c', '[{"nature":"amenagements","cle":"a","quantite":1}]', 'r3', 'v7', '{"cout":42}')`).run();
  const v = () => versionsSource(db, 1);
  const avantV = v();
  const avantC = db.prepare('SELECT * FROM swn_catalogue_coques').get() as any;
  const avantA = db.prepare('SELECT * FROM swn_catalogue_amenagements').get() as any;
  const avantK = db.prepare('SELECT * FROM swn_conceptions').get();

  assert.deepEqual(migrate(db), [46, 47, 48]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  const c = db.prepare('SELECT * FROM swn_catalogue_coques').get() as any;
  const a = db.prepare('SELECT * FROM swn_catalogue_amenagements').get() as any;
  assert.equal(c.moteur_spike, 1);
  assert.equal(a.limite_par, null);
  for (const [k, x] of Object.entries(avantC)) assert.deepEqual(c[k], x, `coque.${k}`);
  for (const [k, x] of Object.entries(avantA)) assert.deepEqual(a[k], x, `amenagement.${k}`);
  assert.deepEqual(db.prepare('SELECT * FROM swn_conceptions').get(), { ...(avantK as object), pj: 0, robots: 0 }); // 0043 adds pj and robots, at 0
  assert.deepEqual(v(), avantV);
  assert.equal(c.version, avantC.version); assert.equal(c.version_catalogue, 'v7');

  // CHECK
  const majC = (x: unknown) => db.prepare('UPDATE swn_catalogue_coques SET moteur_spike = ?').run(x);
  const majA = (x: unknown) => db.prepare('UPDATE swn_catalogue_amenagements SET limite_par = ?').run(x);
  for (const x of [0, 1]) majC(x);
  for (const x of [2, -1, 0.5, 'x']) assert.throws(() => majC(x), /CHECK/, String(x));
  assert.throws(() => majC(null), /NOT NULL/);
  for (const x of ['armes', null]) majA(x);
  for (const x of ['moteurs', '', 'Armes', 1]) assert.throws(() => majA(x), /CHECK/, String(x));
});
