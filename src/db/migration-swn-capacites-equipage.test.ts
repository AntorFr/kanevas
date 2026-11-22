import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';
import { versionsSource } from '../services/swn/calcul-vaisseau.js';

// 0047 (H-4, H-5, B-94): the fittings table is rebuilt (the CHECK of `effet` takes `support_automatisation`) with `capacite`;
// `effet_jeu` on six tables, `pj` / `robots` on the designs; no row changes value, no version moves.
const SRC = new URL('./migrations/', import.meta.url).pathname;
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}
const SIX = ['coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications'];

function base() {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(46));
  db.prepare("INSERT INTO univers (id, nom, cle, cree_le) VALUES (1, 'U', 'univ-essai', '2026-11-01T00:00:00.000Z')").run();
  db.prepare(`INSERT INTO swn_catalogue_coques (proprietaire, univers_id, cle, nom, classe, cout, pv, ca, puissance, masse, emports, facteur_cout, facteur_puissance, facteur_masse, version_catalogue)
    VALUES ('univers', 1, 'c', 'Coque', 2, 10, 5, 10, 10, 8, 1, 1, 1, 1, 'v7')`).run();
  // an aménagement with EVERY column of the old table carrying a non-default value, so a column dropped by the copy shows
  db.prepare(`INSERT INTO swn_catalogue_amenagements (proprietaire, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite,
      x_cout, x_puissance, x_masse, masque, version, version_catalogue, classe_min, classe_max, condition, effet, rend_puissance, rend_masse, soute,
      soute_par_classe, reduction_cout_pct, reduction_base, limite_par)
    VALUES ('univers', 1, 'a', 'Amén', 'Fit', 'Desc', 'Src', 7, 1, 1.5, 2, 3, 4, 1, 0, 1, 1, 9, 'v7', 1, 3, 'Une condition', 'moteur_systeme',
      '[1,2,3,4]', '[0.5,1,1.5,2]', 12, '[1,2,3,4]', 30, 'coque', 'armes')`).run();
  db.prepare(`INSERT INTO swn_catalogue_amenagements (proprietaire, univers_id, cle, nom, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, version_catalogue)
    VALUES ('univers', 1, 'b', 'Nu', 1, 1, 1, 1, 1, 0, 0, 0, 0, 'v7')`).run();
  db.prepare("INSERT INTO fiches (id, univers_id, cle, type, titre, charge, creee_via, cree_le, modifie_le) VALUES (1, 1, 'fiche-v', 'vaisseau', 'V', '{}', 'ecran', 'x', 'x')").run();
  db.prepare(`INSERT INTO swn_conceptions (univers_id, fiche_id, coque_cle, choix, version_reglages, version_catalogue, resultat, equipage, reparation)
    VALUES (1, 1, 'c', '[{"nature":"amenagements","cle":"a","quantite":1}]', 'r3', 'v7', '{"cout":42}', 5, 2)`).run();
  return db;
}

test('0047 : montée depuis 0042, valeurs de la table reconstruite gardées, nouvelles colonnes à NULL / 0, versions et conception inchangées', () => {
  const db = base();
  const noms = (t: string) => (db.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name);
  assert.ok(!noms('swn_catalogue_amenagements').includes('capacite'));
  const avantA = db.prepare('SELECT * FROM swn_catalogue_amenagements ORDER BY cle').all() as any[];
  const avantC = db.prepare('SELECT * FROM swn_catalogue_coques').get() as any;
  const avantK = db.prepare('SELECT * FROM swn_conceptions').get() as any;
  const avantV = versionsSource(db, 1);

  assert.deepEqual(migrate(db), [47, 48]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  const apresA = db.prepare('SELECT * FROM swn_catalogue_amenagements ORDER BY cle').all() as any[];
  assert.equal(apresA.length, 2);
  apresA.forEach((a, i) => {
    for (const [k, x] of Object.entries(avantA[i])) assert.deepEqual(a[k], x, `amenagement ${a.cle}.${k}`);
    assert.equal(a.capacite, null);
    assert.equal(a.effet_jeu, null);
  });
  // the full set of former columns survives, nothing else than the two new ones appears
  assert.deepEqual(noms('swn_catalogue_amenagements').filter((n) => !(n in avantA[0])).sort(), ['capacite', 'effet_jeu']);

  const c = db.prepare('SELECT * FROM swn_catalogue_coques').get() as any;
  for (const [k, x] of Object.entries(avantC)) assert.deepEqual(c[k], x, `coque.${k}`);
  assert.equal(c.effet_jeu, null);
  for (const t of SIX) assert.ok(noms(`swn_catalogue_${t}`).includes('effet_jeu'), t);
  assert.ok(!noms('swn_catalogue_exemples').includes('effet_jeu'));
  assert.ok(!noms('swn_catalogue_exemples').includes('capacite'));

  const k = db.prepare('SELECT * FROM swn_conceptions').get() as any;
  for (const [n, x] of Object.entries(avantK)) assert.deepEqual(k[n], x, `conception.${n}`);
  assert.equal(k.pj, 0); assert.equal(k.robots, 0);
  assert.deepEqual(versionsSource(db, 1), avantV);
  assert.equal(c.version_catalogue, 'v7');
});

test('0047 : index uniques et cascade survivent à la reconstruction, CHECK de effet, capacite, effet_jeu, pj, robots', () => {
  const db = base();
  migrate(db);
  const ins = (cle: string, extra: Record<string, unknown> = {}) => {
    const cols: Record<string, unknown> = { proprietaire: 'univers', univers_id: 1, cle, nom: cle, cout: 1, puissance: 1, masse: 1, pv: 1, ca: 1, limite: 0,
      x_cout: 0, x_puissance: 0, x_masse: 0, version_catalogue: 'v7', ...extra };
    db.prepare(`INSERT INTO swn_catalogue_amenagements (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`).run(...Object.values(cols) as any[]);
  };
  assert.throws(() => ins('a'), /UNIQUE/);
  // a system row and a universe row with the same key stay allowed apart (partial indexes)
  db.prepare("INSERT INTO systemes_jeu (id, nom, cree_le) VALUES (1, 'Sys', 'x')").run();
  ins('s1', { proprietaire: 'systeme', univers_id: null, systeme_id: 1 });
  assert.throws(() => ins('s1', { proprietaire: 'systeme', univers_id: null, systeme_id: 1 }), /UNIQUE/);
  assert.throws(() => ins('s2', { proprietaire: 'systeme', univers_id: null, systeme_id: 1, masque: 1 }), /CHECK/);

  const effet = (e: unknown) => db.prepare("UPDATE swn_catalogue_amenagements SET effet = ? WHERE cle = 'b'").run(e);
  for (const e of ['moteur_systeme', 'support_automatisation', null]) effet(e);
  for (const e of ['vitesse', '', 'Support_automatisation']) assert.throws(() => effet(e), /CHECK/, String(e));

  const cap = (e: unknown) => db.prepare("UPDATE swn_catalogue_amenagements SET capacite = ? WHERE cle = 'b'").run(e);
  for (const e of ['canots', null]) cap(e);
  assert.throws(() => cap(''), /CHECK/);
  assert.throws(() => cap('x'.repeat(41)), /CHECK/);

  // the other tables hold no row yet: an UPDATE of nothing checks nothing, so each gets one
  const elt = { proprietaire: 'univers', univers_id: 1, cle: 'z', nom: 'Z', cout: 1, puissance: 1, masse: 1, pv: 1, ca: 1, limite: 0, x_cout: 0, x_puissance: 0, x_masse: 0, version_catalogue: 'v7' };
  const poser = (t: string, extra: Record<string, unknown>) => {
    const cols = { ...elt, ...extra };
    db.prepare(`INSERT INTO swn_catalogue_${t} (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`).run(...Object.values(cols) as any[]);
  };
  poser('moteurs', { niveau: 1 }); poser('defenses', {}); poser('modifications', {});
  poser('armes', { emport: 1, munitions: 0, cout_munition: 0 });
  for (const t of SIX) {
    assert.ok((db.prepare(`SELECT COUNT(*) n FROM swn_catalogue_${t}`).get() as any).n > 0, `${t} a une ligne`);
    const jeu = (e: unknown) => db.prepare(`UPDATE swn_catalogue_${t} SET effet_jeu = ?`).run(e);
    jeu('x'); jeu('x'.repeat(200)); jeu(null);
    assert.throws(() => jeu(''), /CHECK/, `${t} vide`);
    assert.throws(() => jeu('x'.repeat(201)), /CHECK/, `${t} 201`);
  }
  for (const col of ['pj', 'robots']) {
    const maj = (x: unknown) => db.prepare(`UPDATE swn_conceptions SET ${col} = ?`).run(x);
    maj(0); maj(3);
    for (const x of [-1, 1.5, 'x']) assert.throws(() => maj(x), /CHECK/, `${col} ${x}`);
    assert.throws(() => maj(null), /NOT NULL/, col);
  }

  db.prepare('DELETE FROM swn_conceptions').run(); db.prepare('DELETE FROM fiches').run();
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM univers WHERE id = 1').run();
  assert.equal((db.prepare("SELECT COUNT(*) n FROM swn_catalogue_amenagements WHERE proprietaire = 'univers'").get() as any).n, 0);
});
