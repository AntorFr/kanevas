// AD-niveau-6: no decision of scripts/rejouer-tests.mjs reads the existence of an artefact git ignores.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(join(RACINE, 'scripts/rejouer-tests.mjs'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('rejouer : aucun état gardé', () => {
  test("le script ne teste l'existence d'aucun chemin", () => {
    for (const api of ['existsSync', 'statSync', 'lstatSync', 'accessSync', 'fs.exists', 'fs.stat', 'fs.access', 'opendirSync']) {
      assert.ok(!source.includes(api), `${api} dans rejouer-tests.mjs`);
    }
  });
  test('le script ne nomme aucun artefact ignoré par git hors de ses étapes de construction', () => {
    const lignes = source.split('\n').filter((l) => /dist|resultats\.tap|node_modules/.test(l));
    assert.deepEqual(lignes, [], `artefact cité : ${lignes.join(' / ')}`);
  });
  test('le build et le wasm suivent les fichiers rejoués, sans condition sur le disque', () => {
    assert.match(source, /startsWith\('src\/e2e\/'\)/);
    assert.match(source, /startsWith\('src\/wasm\/'\)/);
  });
  test('un nom inconnu sort non nul sans rien construire', () => {
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', 'nom qui n existe nulle part > zzz'], {
      cwd: RACINE, encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not found/i);
    assert.doesNotMatch(r.stdout, /Replaying/);
  });
});
