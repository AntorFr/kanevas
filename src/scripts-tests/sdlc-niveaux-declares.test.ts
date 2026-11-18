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
  test('ecrans lit {base} avant --installe et appelle un script npm existant ; fiche reste autonome', () => {
    const scripts = JSON.parse(lire('package.json')).scripts as Record<string, string>;
    assert.equal(cle('ecrans'), 'npm run tests:ecrans -- {base} --installe');
    assert.equal(cle('fiche'), 'npm ci && npm run tests:fiche -- {base}');
    for (const nom of ['ecrans', 'fiche']) assert.ok(scripts[`tests:${nom}`]?.includes(`--${nom}`));
  });
  test('rejouer ne réinstalle pas et passe --installe après les noms', () => {
    assert.equal(cle('rejouer'), 'node scripts/rejouer-tests.mjs {tests} --installe');
  });
  test("chaque chemin d'outillage existe et couvre les scripts que les commandes lancent", () => {
    const chemins = outillage();
    assert.ok(chemins.length > 0, 'tests.outillage est vide');
    for (const c of chemins) assert.ok(existsSync(`${racine}${c}`), `outillage : ${c} n'existe pas`);
    const commandes = bloc.map((l) => l.replace(/^\s+\S+:\s*/, '')).join('\n');
    const scripts = JSON.parse(lire('package.json')).scripts as Record<string, string>;
    const lances = new Set<string>();
    for (const m of commandes.matchAll(/node\s+(\S+\.mjs)/g)) lances.add(m[1]);
    for (const m of commandes.matchAll(/npm run ([\w:.-]+)/g)) {
      for (const s of (scripts[m[1]] ?? '').matchAll(/node\s+(?:--\S+\s+\S+\s+)*(\S+\.mjs)/g)) lances.add(s[1]);
    }
    assert.ok(lances.size > 0);
    for (const s of lances) {
      assert.ok(existsSync(`${racine}${s}`), `${s} n'existe pas`);
      assert.ok(chemins.some((c) => s === c || (c.endsWith('/') && s.startsWith(c))), `${s} n'est sous aucun chemin d'outillage`);
    }
  });
});
