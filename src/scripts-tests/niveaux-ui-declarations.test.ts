import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

// AD-ecrans-ui-4, 6: a module of ui/ that pages reach by named imports is read by its top-level declarations.
const SCRIPT = process.env.NIVEAUX_SCRIPT ?? resolve('scripts/niveaux-tests.mjs');

const COMPOSANTS = [
  "import { Chevron, Croix } from 'icones-lib';",
  'const arrondi = (n: number) => Math.round(n);',
  'export function Alpha() { return <b>{arrondi(1.5)}<Chevron /></b>; }',
  'export function Beta() { return <i>beta</i>; }',
  'export function Gamma() { return <u><Croix /></u>; }',
  'export function Orphelin() { return <s>orphelin</s>; }',
  'export type Forme = { a: number };',
  '',
].join('\n');

const ARBRE: Record<string, string> = {
  'frontend/src/ecrans/fiche.tsx': "import { Alpha } from '../ui/composants';\nexport default {};",
  'frontend/src/ecrans/carte.tsx': "import { Beta } from '../ui/composants';\nexport default {};",
  'frontend/src/ecrans/nouveau.tsx': "import { Gamma } from '../ui/composants';\nexport default {};",
  'frontend/src/ecrans/pur.tsx': "import { Alpha } from '../ui/composants';\nimport type { Forme } from '../ui/composants';\nexport default {};",
  'frontend/src/ui/composants.tsx': COMPOSANTS,
  'frontend/src/registre.ts': "const m = import.meta.glob('./ecrans/*.tsx');",
  'src/e2e/fiche.test.ts': "// ecrans: fiche\ntest('a', () => {})",
  'src/e2e/carte.test.ts': "// ecrans: carte\ntest('b', () => {})",
  'src/e2e/nouveau.test.ts': "// ecrans: nouveau\ntest('c', () => {})",
  'src/e2e/pur.test.ts': "// ecrans: pur\ntest('d', () => {})",
  'package.json': JSON.stringify({ name: 'k', scripts: { build: 'tsc' }, dependencies: { a: '1' } }),
};
const C = 'frontend/src/ui/composants.tsx';
const TOUS = ['src/e2e/carte.test.ts', 'src/e2e/fiche.test.ts', 'src/e2e/nouveau.test.ts', 'src/e2e/pur.test.ts'];
const FICHE_PUR = ['src/e2e/fiche.test.ts', 'src/e2e/pur.test.ts'];

let depot: string;
const ecrire = (f: string, c: string) => { mkdirSync(dirname(join(depot, f)), { recursive: true }); writeFileSync(join(depot, f), c); };
const git = (...a: string[]) => execFileSync('git', a, { cwd: depot, encoding: 'utf8' });
function liste(modifs: Record<string, string>): string[] {
  const base = git('rev-parse', 'HEAD').trim();
  for (const [f, c] of Object.entries(modifs)) ecrire(f, c);
  git('add', '-A');
  git('commit', '-qm', 'change');
  const r = spawnSync(process.execPath, [SCRIPT, '--liste', 'ecrans', base], { cwd: depot, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean);
}
const remplacer = (de: string, par: string) => { assert.ok(COMPOSANTS.includes(de), de); return COMPOSANTS.replace(de, par); };

describe('niveaux : une déclaration de ui/composants.tsx lue par ses noms', () => {
  beforeEach(() => {
    depot = mkdtempSync(join(tmpdir(), 'niveaux-decl-'));
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    for (const [f, c] of Object.entries(ARBRE)) ecrire(f, c);
    git('add', '-A');
    git('commit', '-qm', 'depart');
  });
  afterEach(() => rmSync(depot, { recursive: true, force: true }));

  test('le corps d’un composant qu’un seul écran importe ne choisit que cet écran', () => {
    assert.deepEqual(liste({ [C]: remplacer('<i>beta</i>', '<i>BETA</i>') }), ['src/e2e/carte.test.ts']);
  });

  test('un utilitaire non exporté choisit les écrans du composant qui l’emploie', () => {
    assert.deepEqual(liste({ [C]: remplacer('Math.round(n)', 'Math.floor(n)') }), FICHE_PUR);
  });

  test('la ligne d’import d’une icône choisit les écrans du composant qui l’emploie', () => {
    assert.deepEqual(liste({ [C]: remplacer('Chevron, Croix', 'Chevron, Croix, Autre') }), FICHE_PUR.concat(['src/e2e/nouveau.test.ts']).sort());
  });

  test('un composant qu’aucun écran n’importe ne choisit aucun écran', () => {
    assert.deepEqual(liste({ [C]: remplacer('<s>orphelin</s>', '<s>autre</s>') }), []);
  });

  test('un type changé que nulle valeur ne mentionne ne choisit personne', () => {
    assert.deepEqual(liste({ [C]: remplacer('{ a: number }', '{ a: string }') }), []);
  });

  test('un composant ajouté qu’aucun écran n’importe ne choisit personne', () => {
    assert.deepEqual(liste({ [C]: COMPOSANTS + 'export function Neuf() { return null; }\n' }), []);
  });

  test('un composant retiré qu’un écran importe choisit cet écran', () => {
    assert.deepEqual(liste({ [C]: remplacer('export function Beta() { return <i>beta</i>; }\n', '') }), ['src/e2e/carte.test.ts']);
  });

  test('un commentaire entre deux statements ne choisit personne', () => {
    assert.deepEqual(liste({ [C]: remplacer('export function Beta', '// note\nexport function Beta') }), []);
  });

  test('garde-fou : un import ./x.css changé choisit tous les écrans', () => {
    assert.deepEqual(liste({ [C]: "import './x.css';\n" + COMPOSANTS, 'frontend/src/ui/x.css': 'a{}' }), TOUS);
  });

  test('un export default ajouté ne choisit que l’écran qui demande le module en bloc', () => {
    ecrire('frontend/src/ecrans/carte.tsx', "import * as ui from '../ui/composants';\nexport default ui;");
    git('add', '-A'); git('commit', '-qm', 'ns');
    assert.deepEqual(liste({ [C]: COMPOSANTS + 'export default function Defaut() { return null; }\n' }), ['src/e2e/carte.test.ts']);
  });

  test('garde-fou : une erreur de syntaxe choisit tous les écrans qui atteignent le module', () => {
    assert.deepEqual(liste({ [C]: COMPOSANTS + 'export function Casse( {\n' }), TOUS);
  });

  test('garde-fou : un statement sans nom changé (expression) choisit tous les écrans', () => {
    assert.deepEqual(liste({ [C]: COMPOSANTS + 'console.log(1);\n' }), TOUS);
  });

  test('garde-fou : un export = changé choisit tous les écrans', () => {
    assert.deepEqual(liste({ [C]: COMPOSANTS + 'export = {};\n' }), TOUS);
  });
});
