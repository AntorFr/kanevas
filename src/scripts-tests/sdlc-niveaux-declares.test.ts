// `.sdlc.yaml` declares the four levels under `tests:` and the npm scripts they call exist.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const lire = (f: string) => readFileSync(fileURLToPath(new URL(`../../${f}`, import.meta.url)), 'utf8');
const lignes = lire('.sdlc.yaml').split('\n');
const debut = lignes.findIndex((l) => l === 'tests:');
const bloc: string[] = [];
for (const l of lignes.slice(debut + 1)) { if (/^\S/.test(l)) break; bloc.push(l); }
const cle = (nom: string) => bloc.find((l) => l.startsWith(`  ${nom}:`))?.slice(nom.length + 3).trim();

describe('niveaux déclarés dans .sdlc.yaml', () => {
  test('les quatre clés local, ecrans, fiche, rejouer sont déclarées', () => {
    for (const nom of ['local', 'ecrans', 'fiche', 'rejouer']) assert.ok(cle(nom), `tests.${nom} manque`);
  });
  test('ecrans et fiche prennent {base} et appellent un script npm existant', () => {
    const scripts = JSON.parse(lire('package.json')).scripts as Record<string, string>;
    for (const nom of ['ecrans', 'fiche']) {
      assert.equal(cle(nom), `npm ci && npm run tests:${nom} -- {base}`);
      assert.ok(scripts[`tests:${nom}`]?.includes(`--${nom}`));
    }
  });
});
