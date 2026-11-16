import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const SCRIPT = resolve('scripts/niveaux-tests.mjs');

const ARBRE: Record<string, string> = {
  'frontend/src/ecrans/fiche.tsx': "import { Titre } from '../ui/titre';\nimport './fiche.css';\nimport { pur } from '../../../src/services/pur';\nexport default {};",
  'frontend/src/ecrans/fiche.css': '',
  'frontend/src/ecrans/arbre.tsx': "import { Titre } from '../ui/titre';\nconst Lourd = () => import('./arbre/lourd');\nexport default {};",
  'frontend/src/ecrans/arbre/lourd.tsx': 'export const l = 1;',
  'frontend/src/ecrans/carte.tsx': "export * from '../ui/propre.js';\nexport default {};",
  'frontend/src/ui/titre.tsx': 'export const Titre = 1;',
  'frontend/src/ui/propre.ts': 'export const p = 1;',
  'frontend/src/Cadre.tsx': 'export const C = 1;',
  'frontend/src/registre.ts': "const m = import.meta.glob('./ecrans/*.tsx');",
  'src/services/pur.ts': 'export const pur = 1;',
  'src/services/serveur.ts': 'export const s = 1;',
  'src/services/serveur.test.ts': "test('s', () => {})",
  'src/e2e/harnais.ts': 'export {};',
  'src/e2e/fiche-a.test.ts': "// ecrans: fiche\ntest('a', () => {})",
  'src/e2e/arbre-a.test.ts': "// ecrans: arbre\ntest('b', () => {})",
  'src/e2e/deux.test.ts': "// ecrans: fiche, carte\ntest('c', () => {})",
  'src/e2e/libre.test.ts': "test('d', () => {})",
  'package.json': '{}',
  'README.md': 'x',
};

let depot: string;
const ecrire = (f: string, c: string) => { mkdirSync(dirname(join(depot, f)), { recursive: true }); writeFileSync(join(depot, f), c); };
const git = (...a: string[]) => execFileSync('git', a, { cwd: depot, encoding: 'utf8' });
function liste(niveau: string, modifs: Record<string, string>): string[] {
  const base = git('rev-parse', 'HEAD').trim();
  for (const [f, c] of Object.entries(modifs)) ecrire(f, c);
  git('add', '-A');
  git('commit', '-qm', 'change');
  const r = spawnSync(process.execPath, [SCRIPT, '--liste', niveau, base], { cwd: depot, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean);
}

describe('niveaux ecrans et fiche : le choix', () => {
  before(() => {
    depot = mkdtempSync(join(tmpdir(), 'niveaux-'));
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    for (const [f, c] of Object.entries(ARBRE)) ecrire(f, c);
    git('add', '-A');
    git('commit', '-qm', 'depart');
  });
  after(() => rmSync(depot, { recursive: true, force: true }));

  test('un fichier propre à une page : ses tests et ceux sans déclaration, pas ceux d’un autre écran', () => {
    assert.deepEqual(liste('ecrans', { 'frontend/src/ecrans/arbre/lourd.tsx': 'export const l = 2;' }),
      ['src/e2e/arbre-a.test.ts', 'src/e2e/libre.test.ts']);
  });

  test('un fichier de ui/ importé par deux pages : les tests des deux écrans', () => {
    assert.deepEqual(liste('ecrans', { 'frontend/src/ui/titre.tsx': 'export const Titre = 2;' }),
      ['src/e2e/arbre-a.test.ts', 'src/e2e/deux.test.ts', 'src/e2e/fiche-a.test.ts', 'src/e2e/libre.test.ts']);
  });

  test('css, import ./x.js résolu en .ts et module serveur importé par une page entrent dans le graphe', () => {
    assert.deepEqual(liste('ecrans', { 'frontend/src/ecrans/fiche.css': 'a{}' }), ['src/e2e/deux.test.ts', 'src/e2e/fiche-a.test.ts', 'src/e2e/libre.test.ts']);
    assert.deepEqual(liste('ecrans', { 'frontend/src/ui/propre.ts': 'export const p = 2;' }), ['src/e2e/deux.test.ts', 'src/e2e/libre.test.ts']);
    assert.deepEqual(liste('ecrans', { 'src/services/pur.ts': 'export const pur = 2;' }), ['src/e2e/deux.test.ts', 'src/e2e/fiche-a.test.ts', 'src/e2e/libre.test.ts']);
  });

  test('un fichier que nulle page n’importe et qu’aucune règle ne déclare touche tous les écrans', () => {
    const tous = ['src/e2e/arbre-a.test.ts', 'src/e2e/deux.test.ts', 'src/e2e/fiche-a.test.ts', 'src/e2e/libre.test.ts'];
    assert.deepEqual(liste('ecrans', { 'frontend/src/Cadre.tsx': 'export const C = 2;' }), tous);
    assert.deepEqual(liste('ecrans', { 'package.json': '{"a":1}' }), tous);
    assert.deepEqual(liste('ecrans', { 'frontend/src/registre.ts': '// x' }), tous);
    assert.deepEqual(liste('ecrans', { 'src/e2e/harnais.ts': 'export const h = 1;' }), tous);
  });

  test('un changement serveur seul, ou de doc, n’en touche aucun', () => {
    assert.deepEqual(liste('ecrans', { 'src/services/serveur.ts': 'export const s = 2;' }), []);
    assert.deepEqual(liste('ecrans', { 'README.md': 'y', 'src/services/serveur.test.ts': "test('s2', () => {})" }), []);
  });

  test('un test d’écran modifié est choisi quoi qu’il déclare', () => {
    assert.deepEqual(liste('ecrans', { 'src/e2e/arbre-a.test.ts': "// ecrans: arbre\ntest('b2', () => {})" }), ['src/e2e/arbre-a.test.ts']);
  });

  test('fiche : la suite entière moins les tests d’écran non choisis', () => {
    assert.deepEqual(liste('fiche', { 'frontend/src/ecrans/arbre/lourd.tsx': 'export const l = 3;' }),
      ['src/e2e/arbre-a.test.ts', 'src/e2e/libre.test.ts', 'src/services/serveur.test.ts']);
    assert.deepEqual(liste('fiche', { 'src/services/serveur.ts': 'export const s = 3;' }), ['src/services/serveur.test.ts']);
  });

  test('un nom d’écran inconnu dans // ecrans: est une erreur', () => {
    const base = git('rev-parse', 'HEAD').trim();
    ecrire('src/e2e/faux.test.ts', "// ecrans: nulle-part\ntest('f', () => {})");
    ecrire('frontend/src/ui/titre.tsx', 'export const Titre = 3;');
    git('add', '-A');
    git('commit', '-qm', 'faux');
    const r = spawnSync(process.execPath, [SCRIPT, '--liste', 'ecrans', base], { cwd: depot, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /nulle-part/);
  });
});
