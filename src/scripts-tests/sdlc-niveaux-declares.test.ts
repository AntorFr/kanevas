// `.sdlc.yaml` declares the levels, the installation, the files lookup and the tooling under `tests:`;
// the npm scripts and the paths they call exist.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../../', import.meta.url));
const lire = (f: string) => readFileSync(`${racine}${f}`, 'utf8');
const lignes = lire('.sdlc.yaml').split('\n');
const debut = lignes.findIndex((l) => l === 'tests:');
const bloc: string[] = [];
for (const l of lignes.slice(debut + 1)) { if (/^\S/.test(l)) break; bloc.push(l); }
const cle = (nom: string) => bloc.find((l) => l.startsWith(`  ${nom}:`))?.slice(nom.length + 3).trim();
const outillage = (): string[] =>
  (cle('outillage')?.match(/^\[(.*)\]$/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

describe('niveaux déclarés dans .sdlc.yaml', () => {
  test('les clés installation, fichiers, outillage, local, ecrans, fiche, rejouer sont déclarées', () => {
    for (const nom of ['installation', 'fichiers', 'outillage', 'local', 'ecrans', 'fiche', 'rejouer']) {
      assert.ok(cle(nom), `tests.${nom} manque`);
    }
    assert.equal(cle('installation'), 'npm ci && npm run build:wasm');
    assert.equal(cle('fichiers'), 'node scripts/rejouer-tests.mjs --fichiers {tests}');
  });
  test('les niveaux appellent tests-attestes.mjs directement ; {base} précède --installe', () => {
    assert.equal(cle('commande'), 'npm ci && node scripts/tests-attestes.mjs');
    assert.equal(cle('local'), 'npm ci && node scripts/tests-attestes.mjs --local');
    assert.equal(cle('ecrans'), 'node scripts/tests-attestes.mjs --ecrans {base} --installe');
    assert.equal(cle('fiche'), 'npm ci && node scripts/tests-attestes.mjs --fiche {base}');
    for (const nom of ['commande', 'local', 'ecrans', 'fiche']) assert.doesNotMatch(cle(nom) ?? '', /npm run/, `${nom} passe par package.json`);
  });
  test('rejouer ne réinstalle pas et passe --installe après les noms', () => {
    assert.equal(cle('rejouer'), 'node scripts/rejouer-tests.mjs {tests} --installe');
  });
  test("chaque chemin d'outillage existe et couvre les scripts que les commandes lancent", () => {
    const chemins = outillage();
    assert.ok(chemins.length > 0, 'tests.outillage est vide');
    for (const c of chemins) assert.ok(existsSync(`${racine}${c}`), `outillage : ${c} n'existe pas`);
    const commandes = bloc.map((l) => l.replace(/^\s+\S+:\s*/, '')).join('\n');
    const lances = new Set<string>();
    for (const m of commandes.matchAll(/node\s+(\S+\.mjs)/g)) lances.add(m[1]);
    assert.ok(lances.size > 0);
    for (const s of lances) {
      assert.ok(existsSync(`${racine}${s}`), `${s} n'existe pas`);
      assert.ok(chemins.includes(s), `${s} n'est pas nommé par l'outillage`);
    }
  });
  test("l'outillage ne nomme que des scripts de jugement : ni package.json, ni dossier, ni installation ou construction", () => {
    const chemins = outillage();
    assert.deepEqual([...chemins].sort(), [
      'scripts/niveaux-tests.mjs', 'scripts/playwright.mjs', 'scripts/rejouer-tests.mjs', 'scripts/tests-attestes.mjs',
    ]);
    for (const c of chemins) {
      assert.match(c, /^scripts\/[\w.-]+\.mjs$/, `${c} n'est pas un script .mjs exact`);
      assert.doesNotMatch(c, /package(-lock)?\.json|rust-wasm|copier-wasm/, `${c} installe ou construit`);
    }
  });
});
