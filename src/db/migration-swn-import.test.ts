import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrate, openDb } from './db.js';

const SRC = new URL('./migrations/', import.meta.url).pathname;
const NUMEROS = readdirSync(SRC).filter((f) => /^\d{4}-.+\.sql$/.test(f)).map((f) => Number(f.slice(0, 4))).sort((a, b) => a - b);
const depuis = (n: number) => NUMEROS.filter((x) => x >= n);
function dossierJusqua(max: number): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mig-')), 'm') + '/';
  mkdirSync(dir);
  for (const f of readdirSync(SRC)) if (/^\d{4}-.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= max) copyFileSync(SRC + f, dir + f);
  return dir;
}

test('0023 : montée depuis 0022 peuplée, rien de perdu, version_importee nulle partout', () => {
  const db = openDb(':memory:');
  migrate(db, dossierJusqua(22));
  const d = '2026-10-01T00:00:00.000Z';
  db.prepare("INSERT INTO comptes (id, username, cree_le) VALUES (1, 'antor', ?)").run(d);
  db.prepare("INSERT INTO univers (id, nom, cree_le) VALUES (1, 'U', ?)").run(d);
  db.prepare("INSERT INTO swn_galaxies (id, univers_id, titre, visible, graine, densite_defaut, version) VALUES (1, 1, 'G', 0, 'abc', 0.2, 1)").run();
  for (const [id, cle, q] of [[1, 'a', 0], [2, 'b', 3]] as const) {
    db.prepare("INSERT INTO swn_systemes (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?, 1, 1, ?, ?, ?, 0, 3, 'accent', '', 0, 0)").run(id, cle, cle, q);
  }
  db.prepare("INSERT INTO swn_routes (galaxie_id, univers_id, depuis_id, vers_id, publique, longueur) VALUES (1, 1, 1, 2, 1, 3)").run();
  db.prepare("INSERT INTO swn_zones (galaxie_id, univers_id, cle, nom, contour, couleur, secret) VALUES (1, 1, 'z', 'Z', '[[0,0],[1,0],[0,1]]', 'accent', 0)").run();
  const tables = ['swn_galaxies', 'swn_systemes', 'swn_routes', 'swn_zones'];
  const avant = tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all());
  assert.deepEqual(migrate(db), depuis(23));
  const apres = tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all());
  apres.slice(1).forEach((lignes: any[], i) => lignes.forEach((l, j) => {
    assert.equal(l.version_importee, null);
    const { version_importee, ...sans } = l;
    // 0027 (B-81) adds the nullable `type_lien` to the routes: nothing else of the row may have moved.
    const { type_lien, ...sansType } = sans;
    assert.equal(type_lien === null || type_lien === undefined, true);
    // 0029 (B-84) adds the nullable `plages` to the zones: null for a polygon zone written before.
    const { plages, ...reste } = sansType;
    assert.equal(plages === null || plages === undefined, true);
    assert.deepEqual(reste, (avant[i + 1] as any[])[j]);
  }));
  assert.deepEqual(apres[0], avant[0]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(migrate(db), []);
});
