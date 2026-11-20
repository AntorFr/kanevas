// Ensemble tests of kanevas-ecrans-touches-precis, written from the « Livre » and the exit criterion only:
// `scripts/niveaux-tests.mjs --liste ecrans <base>` run on a scratch clone of THIS repository's committed tree
// chooses only the screen tests a change really touches. Pitfalls tested on real files: a barrel
// (frontend/src/ui/index.ts), `import type`, `import.meta.glob`, the Rust/wasm rule, the header of every screen test.
// No network: node_modules is linked into the clone.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const RACINE = resolve('.');
const { NODE_TEST_CONTEXT: _ctx, ...ENV } = process.env;
let copie: string;
const git = (...a: string[]) => execFileSync('git', a, { cwd: copie, encoding: 'utf8' }).trim();

before(() => {
  copie = mkdtempSync(join(tmpdir(), 'touches-ensemble-'));
  execFileSync('git', ['clone', '-q', '--no-hardlinks', RACINE, copie]);
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  symlinkSync(join(RACINE, 'node_modules'), join(copie, 'node_modules'));
});
after(() => rmSync(copie, { recursive: true, force: true }));

/** Runs `--liste ecrans` for the commit `base`; returns status, stdout lines and stderr. */
function lister(base: string) {
  const r = spawnSync(process.execPath, ['scripts/niveaux-tests.mjs', '--liste', 'ecrans', base], { cwd: copie, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 });
  return { status: r.status, fichiers: r.stdout.split('\n').filter(Boolean), stderr: r.stderr };
}

/**
 * `preparation` is committed first (the base); then `fichier` gets a comment, is committed, and the screens tests
 * chosen between the two are returned. The clone goes back to where it was.
 */
function choisir(fichier: string, preparation: Record<string, string> = {}): string[] {
  const depart = git('rev-parse', 'HEAD');
  try {
    for (const [f, c] of Object.entries(preparation)) {
      mkdirSync(dirname(join(copie, f)), { recursive: true });
      writeFileSync(join(copie, f), c);
    }
    if (Object.keys(preparation).length) { git('add', '-A'); git('commit', '-qm', 'preparation'); }
    const base = git('rev-parse', 'HEAD');
    appendFileSync(join(copie, fichier), '\n// touched by a test\n');
    git('commit', '-qam', 'change');
    const r = lister(base);
    assert.equal(r.status, 0, r.stderr);
    return r.fichiers;
  } finally {
    git('reset', '-q', '--hard', depart);
    git('clean', '-qfd');
  }
}

const premiereLigne = (f: string) => readFileSync(join(copie, f), 'utf8').split('\n')[0];
const ecransDe = (f: string) => premiereLigne(f).replace(/^\/\/ ecrans:\s*/, '').split(',').map((s) => s.trim());
const E2E = 'src/e2e/';

describe('écrans touchés : le barrel de frontend/src/ui/index.ts (E-ecrans, Livre : barrel)', () => {
  test('Segments, que seule la galaxie importe : seuls les tests des écrans outil et outil-cible, pas les 256', () => {
    const l = choisir('frontend/src/ui/segments.tsx');
    assert.ok(l.includes(`${E2E}vaisseaux-atelier-livre-review.test.ts`), 'un test de l’écran outil');
    for (const exclu of ['administration-badge-entete', 'membres-pastille-largeur', 'accueil-refonte', 'alias-etiquettes-e9', 'recherche-avancee-ecran']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), `${exclu} ne dépend pas de Segments`);
    }
    for (const f of l) assert.ok(ecransDe(f).some((e) => e === 'outil' || e === 'outil-cible'), `${f} déclare ${ecransDe(f)}`);
    assert.ok(l.length < 60, `${l.length} fichiers`);
  });

  test('LigneFicheLiee et VignetteFiche : les écrans fiche et recherche, aucun autre', () => {
    const l = choisir('frontend/src/ui/ligne-fiche-liee.tsx');
    assert.ok(l.includes(`${E2E}alias-etiquettes-e9.test.ts`), 'un test fiche');
    assert.ok(l.includes(`${E2E}recherche-avancee-ecran.test.ts`), 'un test recherche');
    for (const exclu of ['administration-badge-entete', 'membres-pastille-largeur', 'accueil-refonte', 'vaisseaux-atelier-livre-review']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), `${exclu} n’importe pas ces symboles`);
    }
  });

  test('Interrupteur : fiche, outil, parametres le reçoivent ; administration, accueil, membres non', () => {
    const l = choisir('frontend/src/ui/interrupteur.tsx');
    assert.ok(l.includes(`${E2E}alias-etiquettes-e9.test.ts`));
    assert.ok(l.includes(`${E2E}vaisseaux-atelier-livre-review.test.ts`));
    for (const exclu of ['administration-badge-entete', 'membres-pastille-largeur', 'recherche-avancee-ecran']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), exclu);
    }
  });
});

describe('écrans touchés : l’éditeur d’un outil seul (équivalent de l’éditeur battlemap sur cet arbre)', () => {
  for (const fichier of ['frontend/src/outils/swn/galaxie/Carte.tsx', 'frontend/src/outils/registre.ts']) {
    test(`${fichier} : aucun test qui ne déclare que fiche, parametres ou systeme`, () => {
      const l = choisir(fichier);
      assert.ok(l.includes(`${E2E}galaxie-tenir-ecran-forme.test.ts`));
      assert.ok(!l.includes(`${E2E}alias-etiquettes-e9.test.ts`), 'un test fiche seul');
      assert.ok(!l.includes(`${E2E}administration-badge-entete.test.ts`));
      for (const f of l) {
        assert.ok(ecransDe(f).some((e) => e === 'outil' || e === 'outil-cible'), `${f} déclare ${ecransDe(f)}`);
      }
    });
  }
});

describe('écrans touchés : Cadre.tsx touche tous les écrans', () => {
  test('Cadre.tsx : les 256 tests d’écran', () => {
    const tous = git('ls-files', 'src/e2e').split('\n').filter((f) => f.endsWith('.test.ts')).sort();
    assert.equal(tous.length, 256);
    assert.deepEqual([...choisir('frontend/src/Cadre.tsx')].sort(), tous);
  });
});

describe('écrans touchés : import type seul (Livre : import type)', () => {
  const ZZ_TYPE = { 'frontend/src/zz-types.ts': 'export type Zz = number;\n' };
  const ZZ_VALEUR = { 'frontend/src/zz-valeur.ts': 'export const zz = 1;\n' };
  const avec = (ligne: string, extra: Record<string, string>) => ({
    ...extra,
    'frontend/src/ecrans/membres.tsx': ligne + '\n' + readFileSync(join(RACINE, 'frontend/src/ecrans/membres.tsx'), 'utf8'),
  });

  test('nominal : un import de valeur relie la page membres', () => {
    const l = choisir('frontend/src/zz-valeur.ts', avec("import { zz } from '../zz-valeur'; void zz;", ZZ_VALEUR));
    assert.ok(l.includes(`${E2E}membres-pastille-largeur.test.ts`));
    assert.ok(!l.includes(`${E2E}administration-badge-entete.test.ts`));
  });

  test('`import type { X }` ne relie pas la page membres', () => {
    const l = choisir('frontend/src/zz-types.ts', avec("import type { Zz } from '../zz-types'; export type { Zz };", ZZ_TYPE));
    assert.ok(!l.includes(`${E2E}membres-pastille-largeur.test.ts`), l.join(' '));
  });

  test('`import { type X }` ne relie pas la page membres', () => {
    const l = choisir('frontend/src/zz-types.ts', avec("import { type Zz } from '../zz-types'; export type { Zz };", ZZ_TYPE));
    assert.ok(!l.includes(`${E2E}membres-pastille-largeur.test.ts`), l.join(' '));
  });
});

describe('écrans touchés : import.meta.glob (Livre : blocs chargés par glob)', () => {
  test('nominal réel : un bloc de fiche/lignes chargé par glob touche les tests de l’écran fiche', () => {
    const l = choisir('frontend/src/ecrans/fiche/lignes/campagne.tsx');
    assert.ok(l.includes(`${E2E}alias-etiquettes-e9.test.ts`));
    assert.ok(!l.includes(`${E2E}administration-badge-entete.test.ts`));
    assert.ok(!l.includes(`${E2E}vaisseaux-atelier-livre-review.test.ts`));
  });

  test('un bloc chargé par un glob littéral de la page membres ne touche que membres', () => {
    const membres = readFileSync(join(RACINE, 'frontend/src/ecrans/membres.tsx'), 'utf8');
    const l = choisir('frontend/src/ecrans/zz-glob/un.tsx', {
      'frontend/src/ecrans/zz-glob/un.tsx': 'export const u = 1;\n',
      'frontend/src/ecrans/membres.tsx': membres + "\nexport const zzBlocs = import.meta.glob('./zz-glob/*.tsx', { eager: true });\n",
    });
    assert.ok(l.includes(`${E2E}membres-pastille-largeur.test.ts`));
    for (const exclu of ['administration-badge-entete', 'accueil-refonte', 'alias-etiquettes-e9', 'vaisseaux-atelier-livre-review']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), exclu);
    }
  });
});

describe('écrans touchés : Rust et wasm associés aux écrans qui les chargent', () => {
  const membres = () => readFileSync(join(RACINE, 'frontend/src/ecrans/membres.tsx'), 'utf8');

  test('un module Rust que la page membres charge : les seuls tests de membres', () => {
    const l = choisir('rust/modules/exemple/src/lib.rs', {
      'frontend/src/ecrans/membres.tsx': "import { chargerModule } from '../wasm/charger';\n" + membres() + "\nvoid chargerModule('exemple');\n",
    });
    assert.ok(l.includes(`${E2E}membres-pastille-largeur.test.ts`));
    for (const exclu of ['administration-badge-entete', 'accueil-refonte', 'alias-etiquettes-e9', 'vaisseaux-atelier-livre-review']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), exclu);
    }
  });

  test('un module Rust qu’aucun écran ne charge : aucun test d’écran', () => {
    assert.deepEqual(choisir('rust/modules/exemple/src/lib.rs'), []);
  });

  test('frontend/src/wasm/charger.ts, que nul écran ne charge : pas tous les écrans', () => {
    const l = choisir('frontend/src/wasm/charger.ts');
    assert.ok(l.length < 256, `${l.length} fichiers choisis`);
    assert.deepEqual(l, []);
  });

  test('frontend/src/wasm/charger.ts, chargé par la page membres : les tests de membres seuls', () => {
    const l = choisir('frontend/src/wasm/charger.ts', {
      'frontend/src/ecrans/membres.tsx': "import { chargerModule } from '../wasm/charger';\n" + membres() + "\nvoid chargerModule('exemple');\n",
    });
    assert.ok(l.includes(`${E2E}membres-pastille-largeur.test.ts`));
    assert.ok(!l.includes(`${E2E}administration-badge-entete.test.ts`));
    assert.ok(l.length < 30, `${l.length} fichiers choisis`);
  });
});

describe('écrans touchés : l’en-tête // ecrans: de chaque test d’écran', () => {
  test('les 256 tests de src/e2e/ ont leur ligne // ecrans: en première ligne', () => {
    const fichiers = git('ls-files', 'src/e2e').split('\n').filter((f) => f.endsWith('.test.ts'));
    assert.equal(fichiers.length, 256);
    const sans = fichiers.filter((f) => !/^\/\/ ecrans: [a-z0-9-]+(, [a-z0-9-]+)*$/.test(premiereLigne(f)));
    assert.deepEqual(sans, []);
  });

  test('un test d’écran sans en-tête est refusé, nommé, quel que soit l’écran touché', () => {
    const depart = git('rev-parse', 'HEAD');
    try {
      writeFileSync(join(copie, 'src/e2e/zz-sans-entete.test.ts'), "import { test } from 'node:test';\ntest('x', () => {});\n");
      git('add', '-A');
      git('commit', '-qm', 'sans en-tête');
      const base = git('rev-parse', 'HEAD');
      appendFileSync(join(copie, 'frontend/src/ecrans/membres.tsx'), '\n// touched\n');
      git('commit', '-qam', 'change');
      const r = lister(base);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /zz-sans-entete\.test\.ts/);
      assert.deepEqual(r.fichiers, []);
    } finally {
      git('reset', '-q', '--hard', depart);
    }
  });
});

describe('écrans touchés : le README dit le nombre de tests choisis et la durée', () => {
  const readme = () => readFileSync(join(RACINE, 'README.md'), 'utf8');
  const ligne = (motif: RegExp) => readme().split('\n').find((l) => l.startsWith('|') && motif.test(l)) ?? '';

  test('la ligne Cadre.tsx : 256 fichiers et 39 min', () => {
    const l = ligne(/Cadre\.tsx/);
    assert.match(l, /256 files/);
    assert.match(l, /39 min/);
  });

  test('la ligne de l’éditeur battlemap : 40 fichiers, ses tests et sa durée en secondes', () => {
    const l = ligne(/map editor alone/);
    assert.match(l, /40 files/);
    assert.match(l, /349 tests/);
    assert.match(l, /428 s/);
  });

  test('la ligne du module Rust : les mêmes 40 fichiers et la durée', () => {
    const l = ligne(/A Rust module/);
    assert.match(l, /40 files/);
    assert.match(l, /428 s/);
  });
});
