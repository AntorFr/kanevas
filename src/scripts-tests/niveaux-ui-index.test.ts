import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

// AD-ecrans-ui-1 to 3, 6: package.json and the barrel ui/index.ts, read by what changed inside them.
const SCRIPT = resolve('scripts/niveaux-tests.mjs');

const PACKAGE = JSON.stringify({
  name: 'k', scripts: { build: 'tsc', test: 'node --test', 'tests:local': 'x' }, dependencies: { a: '1' },
}, null, 2);

const ARBRE: Record<string, string> = {
  'frontend/src/ecrans/fiche.tsx': "import { Alpha } from '../ui';\nexport default {};",
  'frontend/src/ecrans/carte.tsx': "import { Beta } from '../ui';\nexport default {};",
  'frontend/src/ecrans/nouveau.tsx': "import { Gamma } from '../ui';\nexport default {};",
  'frontend/src/ui/index.ts': "import './ui.css';\nexport * from './alpha';\nexport * from './beta';\n",
  'frontend/src/ui/ui.css': 'a{}',
  'frontend/src/ui/alpha.tsx': 'export const Alpha = 1;',
  'frontend/src/ui/beta.tsx': 'export const Beta = 1;',
  'frontend/src/ui/gamma.tsx': 'export const Gamma = 1;',
  'frontend/src/registre.ts': "const m = import.meta.glob('./ecrans/*.tsx');",
  'src/e2e/fiche.test.ts': "// ecrans: fiche\ntest('a', () => {})",
  'src/e2e/carte.test.ts': "// ecrans: carte\ntest('b', () => {})",
  'src/e2e/nouveau.test.ts': "// ecrans: nouveau\ntest('c', () => {})",
  'package.json': PACKAGE,
};
const TOUS = ['src/e2e/carte.test.ts', 'src/e2e/fiche.test.ts', 'src/e2e/nouveau.test.ts'];

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
const pkg = (f: (p: any) => void) => { const p = JSON.parse(PACKAGE); f(p); return JSON.stringify(p, null, 2); };
const BARREL = 'frontend/src/ui/index.ts';

describe('niveaux : package.json et ui/index.ts lus par ce qui change', () => {
  beforeEach(() => {
    depot = mkdtempSync(join(tmpdir(), 'niveaux-ui-'));
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    for (const [f, c] of Object.entries(ARBRE)) ecrire(f, c);
    git('add', '-A');
    git('commit', '-qm', 'depart');
  });
  afterEach(() => rmSync(depot, { recursive: true, force: true }));

  test('package.json : le nom ou un script tests:* changé ne choisit aucun écran', () => {
    assert.deepEqual(liste('ecrans', { 'package.json': pkg((p) => { p.name = 'autre'; }) }), []);
    assert.deepEqual(liste('ecrans', { 'package.json': pkg((p) => { p.scripts['tests:local'] = 'y'; p.scripts['tests:neuf'] = 'z'; }) }), []);
  });

  test('fiche : même choix, la suite moins les écrans non choisis', () => {
    const l = liste('fiche', { 'package.json': pkg((p) => { p.name = 'autre'; }) });
    assert.ok(!l.some((f) => f.startsWith('src/e2e/')), l.join(','));
  });

  test('ui/index.ts : un export * d’un module qu’un seul écran emploie ne choisit que cet écran', () => {
    assert.deepEqual(liste('ecrans', { [BARREL]: ARBRE[BARREL] + "export * from './gamma';\n" }), ['src/e2e/nouveau.test.ts']);
  });

  test('garde-fou : une dépendance ajoutée choisit tous les écrans', () => {
    assert.deepEqual(liste('ecrans', { 'package.json': pkg((p) => { p.dependencies.b = '2'; }) }), TOUS);
  });

  test('garde-fou : un script build changé choisit tous les écrans', () => {
    assert.deepEqual(liste('ecrans', { 'package.json': pkg((p) => { p.scripts.build = 'vite build'; }) }), TOUS);
  });

  test('garde-fou : une clé inconnue de la liste blanche choisit tous les écrans', () => {
    assert.deepEqual(liste('ecrans', { 'package.json': pkg((p) => { p.engines = { node: '20' }; }) }), TOUS);
  });

  test('garde-fou : un package.json illisible choisit tous les écrans', () => {
    assert.deepEqual(liste('ecrans', { 'package.json': '{ pas du json' }), TOUS);
  });

  test('garde-fou : un import ./x.css ajouté à ui/index.ts choisit tous les écrans', () => {
    assert.deepEqual(liste('ecrans', { [BARREL]: "import './neuf.css';\n" + ARBRE[BARREL], 'frontend/src/ui/neuf.css': 'b{}' }), TOUS);
  });

  test('garde-fou : un écran qui fait import * du barrel est choisi par un export ajouté', () => {
    ecrire('frontend/src/ecrans/carte.tsx', "import * as ui from '../ui';\nexport default ui;");
    git('add', '-A'); git('commit', '-qm', 'ns');
    assert.deepEqual(liste('ecrans', { [BARREL]: ARBRE[BARREL] + "export * from './gamma';\n" }),
      ['src/e2e/carte.test.ts', 'src/e2e/nouveau.test.ts']);
  });

  test('garde-fou : une déclaration ajoutée à ui/index.ts choisit tous les écrans', () => {
    assert.deepEqual(liste('ecrans', { [BARREL]: ARBRE[BARREL] + 'export const x = 1;\n' }), TOUS);
  });

  test('garde-fou : un export retiré d’un module qu’un écran emploie choisit cet écran', () => {
    const avec = ARBRE[BARREL] + "export * from './gamma';\n";
    ecrire(BARREL, avec);
    git('add', '-A'); git('commit', '-qm', 'gamma');
    assert.deepEqual(liste('ecrans', { [BARREL]: avec.replace("export * from './beta';\n", '') }), ['src/e2e/carte.test.ts']);
  });
});
