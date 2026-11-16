import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** A scratch repository of its own: each trap reads the choice of a change on a fixed tree. */
function depotDEssai(arbre: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'niveaux-pieges-'));
  const g = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  const poser = (f: string, c: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), c); };
  g('init', '-q');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  for (const [f, c] of Object.entries(arbre)) poser(f, c);
  g('add', '-A');
  g('commit', '-qm', 'depart');
  return {
    liste(modifs: Record<string, string>): string[] {
      const base = g('rev-parse', 'HEAD').trim();
      for (const [f, c] of Object.entries(modifs)) poser(f, c);
      g('add', '-A');
      g('commit', '-qm', 'change');
      const r = spawnSync(process.execPath, [SCRIPT, '--liste', 'ecrans', base], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.split('\n').filter(Boolean);
    },
    nettoyer: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const T = (nom: string) => `src/e2e/${nom}.test.ts`;
const test_ = (ecran: string) => `// ecrans: ${ecran}\ntest('x', () => {})`;

describe('niveaux ecrans : barrel (AD-touches-2)', () => {
  const arbre = {
    'frontend/src/ecrans/a.tsx': "import { Alpha } from '../ui';\nexport default {};",
    'frontend/src/ecrans/b.tsx': "import { Beta } from '../ui';\nexport default {};",
    'frontend/src/ecrans/c.tsx': "import { Gamma } from '../ui';\nexport default {};",
    'frontend/src/ecrans/d.tsx': "import * as ui from '../ui';\nexport default {};",
    'frontend/src/ecrans/e.tsx': "import { Inconnu } from '../ui';\nexport default {};",
    'frontend/src/ui/index.ts': "export * from './alpha';\nexport { Beta } from './beta';\nexport * from './chaine';",
    'frontend/src/ui/alpha.tsx': 'export const Alpha = 1;',
    'frontend/src/ui/beta.tsx': 'export const Beta = 1; export const Autre = 2;',
    'frontend/src/ui/chaine.ts': "export * from './gamma';",
    'frontend/src/ui/gamma.tsx': 'export const Gamma = 1;',
    [T('a')]: test_('a'), [T('b')]: test_('b'), [T('c')]: test_('c'), [T('d')]: test_('d'), [T('e')]: test_('e'),
  };
  let depot: ReturnType<typeof depotDEssai>;
  before(() => { depot = depotDEssai(arbre); });
  after(() => depot.nettoyer());

  test('un module du barrel ne touche que les pages qui en importent un symbole (et celles qui jouent tout dans le doute)', () => {
    // d (namespace) and e (symbol nobody declares) play everything; a alone names Alpha.
    assert.deepEqual(depot.liste({ 'frontend/src/ui/alpha.tsx': 'export const Alpha = 2;' }), [T('a'), T('d'), T('e')]);
  });

  test('`export { … } from` ne relie que la page qui nomme le symbole', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ui/beta.tsx': 'export const Beta = 2; export const Autre = 3;' }), [T('b'), T('d'), T('e')]);
  });

  test('la chaîne de `export *` est suivie jusqu’au module qui déclare le symbole', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ui/gamma.tsx': 'export const Gamma = 2;' }), [T('c'), T('d'), T('e')]);
  });

  test('le barrel lui-même touche toutes les pages qui l’atteignent', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ui/index.ts': "export * from './alpha';\nexport * from './chaine';\nexport { Beta } from './beta';\n// x" }),
      [T('a'), T('b'), T('c'), T('d'), T('e')]);
  });
});

describe('niveaux ecrans : sans doute, un barrel dont tous les symboles sont connus (AD-touches-2)', () => {
  let depot: ReturnType<typeof depotDEssai>;
  before(() => {
    depot = depotDEssai({
      'frontend/src/ecrans/a.tsx': "import { Alpha } from '../ui';\nexport default {};",
      'frontend/src/ecrans/b.tsx': "import { Beta } from '../ui';\nexport default {};",
      'frontend/src/ui/index.ts': "export * from './alpha';\nexport * from './beta';",
      'frontend/src/ui/alpha.tsx': 'export const Alpha = 1;',
      'frontend/src/ui/beta.tsx': 'export const Beta = 1;',
      [T('a')]: test_('a'), [T('b')]: test_('b'),
    });
  });
  after(() => depot.nettoyer());

  test('modifier un module n’atteint que son écran', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ui/alpha.tsx': 'export const Alpha = 2;' }), [T('a')]);
    assert.deepEqual(depot.liste({ 'frontend/src/ui/beta.tsx': 'export const Beta = 2;' }), [T('b')]);
  });
});

describe('niveaux ecrans : import de type seul (AD-touches-3)', () => {
  const arbre = {
    'frontend/src/ecrans/a.tsx': "import type { TA } from '../types/ta';\nimport { type TB } from '../types/tb';\nimport { valeur, type TC } from '../types/tc';\nexport type { TD } from '../types/td';\nexport default {};",
    'frontend/src/ecrans/b.tsx': "import { TA } from '../types/ta';\nexport default {};",
    'frontend/src/types/ta.ts': 'export type TA = number;',
    'frontend/src/types/tb.ts': 'export type TB = number;',
    'frontend/src/types/tc.ts': 'export const valeur = 1; export type TC = number;',
    'frontend/src/types/td.ts': 'export type TD = number;',
    'frontend/src/types/index.ts': 'export {};',
    [T('a')]: test_('a'), [T('b')]: test_('b'),
  };
  let depot: ReturnType<typeof depotDEssai>;
  before(() => { depot = depotDEssai(arbre); });
  after(() => depot.nettoyer());

  test('`import type` et `import { type X }` ne relient pas la page', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/types/tb.ts': 'export type TB = string;' }), []);
  });

  test('`export type { … } from` ne relie pas la page', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/types/td.ts': 'export type TD = string;' }), []);
  });

  test('un import mêlé relie par ses valeurs, et un autre import de la même cible garde le lien', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/types/tc.ts': 'export const valeur = 2; export type TC = number;' }), [T('a')]);
    // b imports TA without `type`: the file stays an edge for b only.
    assert.deepEqual(depot.liste({ 'frontend/src/types/ta.ts': 'export type TA = string;' }), [T('b')]);
  });

  test('aucun tsconfig ne garde les imports de type (verbatimModuleSyntax, importsNotUsedAsValues)', () => {
    for (const f of ['tsconfig.json', 'frontend/tsconfig.json']) {
      const texte = readFileSync(f, 'utf8');
      assert.doesNotMatch(texte, /verbatimModuleSyntax/, `${f} sets verbatimModuleSyntax: a type import would keep its side effects (AD-touches-3).`);
      assert.doesNotMatch(texte, /importsNotUsedAsValues/, `${f} sets importsNotUsedAsValues (AD-touches-3).`);
    }
  });
});

describe('niveaux ecrans : import.meta.glob (AD-touches-4)', () => {
  const arbre = {
    'frontend/src/ecrans/a.tsx': "import { blocs } from './a/registre';\nexport default {};",
    'frontend/src/ecrans/a/registre.ts': "export const blocs = import.meta.glob('./blocs/*.tsx', { eager: true });",
    'frontend/src/ecrans/a/blocs/un.tsx': 'export const u = 1;',
    'frontend/src/ecrans/b.tsx': "import { blocs } from './b/registre';\nexport default {};",
    'frontend/src/ecrans/b/registre.ts': "export const blocs = import.meta.glob(['./vues/**/*.tsx', '!./vues/prive/*.tsx']);",
    'frontend/src/ecrans/b/vues/x/ouvert.tsx': 'export const o = 1;',
    'frontend/src/ecrans/b/vues/prive/cache.tsx': 'export const c = 1;',
    'frontend/src/ecrans/c.tsx': "import { tout } from './c/registre';\nexport default {};",
    'frontend/src/ecrans/c/registre.ts': "const motif = './autres/*.tsx';\nexport const tout = import.meta.glob(motif);",
    'frontend/src/ecrans/c/autres/z.tsx': 'export const z = 1;',
    'frontend/src/ecrans/d.tsx': "// import.meta.glob('./nulle/*.tsx')\nconst s = \"import { x } from './d/fantome'\";\nexport default {};",
    'frontend/src/ecrans/d/fantome.ts': 'export const x = 1;',
    [T('a')]: test_('a'), [T('b')]: test_('b'), [T('c')]: test_('c'), [T('d')]: test_('d'),
  };
  let depot: ReturnType<typeof depotDEssai>;
  before(() => { depot = depotDEssai(arbre); });
  after(() => depot.nettoyer());

  test('un fichier chargé par un glob littéral de sous-dossier ne touche que l’écran qui le contient', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ecrans/a/blocs/un.tsx': 'export const u = 2;' }), [T('a')]);
  });

  test('un tableau avec un motif `!` : le fichier retranché n’est pas relié, l’autre l’est', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ecrans/b/vues/x/ouvert.tsx': 'export const o = 2;' }), [T('b')]);
    // not matched by any page: unknown path, every screen is played
    assert.equal(depot.liste({ 'frontend/src/ecrans/b/vues/prive/cache.tsx': 'export const c = 2;' }).length, 4);
  });

  test('un glob non littéral relie tout le dossier du fichier qui l’appelle', () => {
    assert.deepEqual(depot.liste({ 'frontend/src/ecrans/c/autres/z.tsx': 'export const z = 2;' }), [T('c')]);
  });

  test('un commentaire ou une chaîne qui ressemble à un import ou à un glob n’est pas un lien', () => {
    // d/fantome.ts is reached by no page: unknown path, every screen is played, not just d
    assert.equal(depot.liste({ 'frontend/src/ecrans/d/fantome.ts': 'export const x = 2;' }).length, 4);
  });
});
