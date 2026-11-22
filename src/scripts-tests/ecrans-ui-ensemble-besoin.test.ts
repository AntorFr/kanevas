// Ensemble tests of kanevas-ecrans-ui, written from the « Livre » and its exit criterion only: the choice of the
// screen tests (`scripts/niveaux-tests.mjs --liste ecrans <base>`, declared as `ecrans_liste`) no longer takes every
// screen when a branch changes an export of frontend/src/ui/index.ts, a rule of ui.css, a component of
// composants.tsx, or package.json without touching dependencies; what it cannot bound still plays every screen.
// Run on a scratch clone of this repository's committed tree; node_modules is linked in, no network.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const RACINE = resolve('.');
const { NODE_TEST_CONTEXT: _ctx, ...ENV } = process.env;
const E2E = 'src/e2e/';
let copie: string;
const git = (...a: string[]) => execFileSync('git', a, { cwd: copie, encoding: 'utf8' }).trim();

before(() => {
  copie = mkdtempSync(join(tmpdir(), 'ecrans-ui-ensemble-'));
  execFileSync('git', ['clone', '-q', '--no-hardlinks', RACINE, copie]);
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  symlinkSync(join(RACINE, 'node_modules'), join(copie, 'node_modules'));
});
after(() => rmSync(copie, { recursive: true, force: true }));

const lire = (f: string) => readFileSync(join(copie, f), 'utf8');
const ecrire = (f: string, c: string) => { mkdirSync(dirname(join(copie, f)), { recursive: true }); writeFileSync(join(copie, f), c); };
/** Replaces `de` by `par` in `f`, failing loudly when `de` is not there (the test would then prove nothing). */
function remplacer(f: string, de: string, par: string) {
  const s = lire(f);
  assert.ok(s.includes(de), `${f} : ${de}`);
  ecrire(f, s.replace(de, par));
}

/** Commits `preparation` (the base), then `changer()` (the branch), and returns the screen tests chosen between them. */
function choisir(changer: () => void, preparation: Record<string, string> = {}): string[] {
  const depart = git('rev-parse', 'HEAD');
  try {
    for (const [f, c] of Object.entries(preparation)) ecrire(f, c);
    if (Object.keys(preparation).length) { git('add', '-A'); git('commit', '-qm', 'preparation'); }
    const base = git('rev-parse', 'HEAD');
    changer();
    git('commit', '-qam', 'change');
    const r = spawnSync(process.execPath, ['scripts/niveaux-tests.mjs', '--liste', 'ecrans', base], { cwd: copie, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.split('\n').filter(Boolean).sort();
  } finally {
    git('reset', '-q', '--hard', depart);
    git('clean', '-qfd');
  }
}
const tous = () => git('ls-files', 'src/e2e').split('\n').filter((f) => f.endsWith('.test.ts')).sort();
const modifierPackage = (f: (p: any) => void) => () => { const p = JSON.parse(lire('package.json')); f(p); ecrire('package.json', JSON.stringify(p, null, 2) + '\n'); };

describe('package.json hors dépendances (Livre : package.json)', () => {
  test('renommer le paquet ne joue aucun écran', () => {
    assert.deepEqual(choisir(modifierPackage((p) => { p.name = 'kanevas-renomme'; })), []);
  });
  test('changer un script tests:* ne joue aucun écran', () => {
    assert.deepEqual(choisir(modifierPackage((p) => { p.scripts['tests:local'] += ' --verbose'; })), []);
  });
  test('ajouter une dépendance joue tous les écrans (dans le doute, on joue)', () => {
    assert.deepEqual(choisir(modifierPackage((p) => { p.dependencies['zz-nouvelle-dependance'] = '1.0.0'; })), tous());
  });
  test('changer un script build joue tous les écrans', () => {
    assert.deepEqual(choisir(modifierPackage((p) => { p.scripts.build += ' && echo fini'; })), tous());
  });
  test('un package.json illisible joue tous les écrans', () => {
    assert.deepEqual(choisir(() => ecrire('package.json', '{ "name": ')), tous());
  });
});

describe('export de frontend/src/ui/index.ts (Livre : index.ts)', () => {
  test('retirer l’export de Segments ne joue que des écrans qui l’emploient, pas tous', () => {
    const l = choisir(() => remplacer('frontend/src/ui/index.ts', "export * from './segments';\n", ''));
    assert.ok(l.length > 0 && l.length < tous().length, `${l.length} fichiers sur ${tous().length}`);
    assert.ok(l.includes(`${E2E}vaisseaux-atelier-livre-review.test.ts`), 'un écran outil emploie Segments');
    for (const exclu of ['administration-badge-entete', 'membres-pastille-largeur', 'accueil-refonte', 'recherche-avancee-ecran']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), exclu);
    }
  });
  test('ajouter l’export d’un module que personne n’emploie ne joue aucun écran', () => {
    const prep = { 'frontend/src/ui/zz-nouveau.tsx': 'export function ZzNouveau() { return null; }\n' };
    assert.deepEqual(choisir(() => { const s = lire('frontend/src/ui/index.ts'); ecrire('frontend/src/ui/index.ts', s + "export * from './zz-nouveau';\n"); }, prep), []);
  });
  test('ajouter un import de feuille de style au barrel joue tous les écrans', () => {
    const prep = { 'frontend/src/ui/zz.css': '.zz { color: red; }\n' };
    assert.deepEqual(choisir(() => remplacer('frontend/src/ui/index.ts', "import './tokens.css';\n", "import './tokens.css';\nimport './zz.css';\n"), prep), tous());
  });
});

describe('règle de frontend/src/ui/ui.css (Livre : ui.css)', () => {
  test('changer .interrupteur-piste ne joue que les écrans qui emploient Interrupteur', () => {
    const l = choisir(() => remplacer('frontend/src/ui/ui.css', '.interrupteur-piste { position: relative; width: 32px;', '.interrupteur-piste { position: relative; width: 34px;'));
    assert.ok(l.length > 0 && l.length < tous().length, `${l.length} fichiers sur ${tous().length}`);
    assert.ok(l.includes(`${E2E}alias-etiquettes-e9.test.ts`), 'l’écran fiche emploie Interrupteur');
    for (const exclu of ['administration-badge-entete', 'membres-pastille-largeur', 'recherche-avancee-ecran']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), exclu);
    }
  });
  test('changer un @keyframes joue tous les écrans', () => {
    assert.deepEqual(choisir(() => remplacer('frontend/src/ui/ui.css', 'translateY(4px)', 'translateY(5px)')), tous());
  });
  test('une règle sur une classe que personne ne cite joue tous les écrans', () => {
    assert.deepEqual(choisir(() => ecrire('frontend/src/ui/ui.css', lire('frontend/src/ui/ui.css') + '\n.zz-classe-inconnue { color: red; }\n')), tous());
  });
  test('une règle sur un élément (h1) joue tous les écrans', () => {
    assert.deepEqual(choisir(() => ecrire('frontend/src/ui/ui.css', lire('frontend/src/ui/ui.css') + '\nh1 { letter-spacing: 1px; }\n')), tous());
  });
});

describe('composant de frontend/src/ui/composants.tsx (Livre : composants.tsx)', () => {
  test('changer LigneConversion ne joue que les écrans qui l’emploient', () => {
    const l = choisir(() => remplacer('frontend/src/ui/composants.tsx', '<p id={id} className="ligne-conversion" aria-live="polite">', '<p id={id} className="ligne-conversion" aria-live="polite" data-zz="1">'));
    assert.ok(l.length > 0 && l.length < tous().length, `${l.length} fichiers sur ${tous().length}`);
    for (const exclu of ['administration-badge-entete', 'membres-pastille-largeur', 'accueil-refonte', 'recherche-avancee-ecran', 'alias-etiquettes-e9']) {
      assert.ok(!l.includes(`${E2E}${exclu}.test.ts`), exclu);
    }
  });
  test('changer BasculeMjJoueur, qu’aucun écran n’emploie, ne joue aucun écran', () => {
    assert.deepEqual(choisir(() => remplacer('frontend/src/ui/composants.tsx', '<div role="radiogroup" aria-label="Mode d’affichage"', '<div data-zz="1" role="radiogroup" aria-label="Mode d’affichage"')), []);
  });
  test('un commentaire de plus ne joue aucun écran', () => {
    assert.deepEqual(choisir(() => ecrire('frontend/src/ui/composants.tsx', lire('frontend/src/ui/composants.tsx') + '\n// note\n')), []);
  });
  test('une erreur de syntaxe joue tous les écrans qui atteignent le module, jamais moins que ceux d’un composant', () => {
    const l = choisir(() => ecrire('frontend/src/ui/composants.tsx', lire('frontend/src/ui/composants.tsx') + '\nexport function (((\n'));
    assert.ok(l.length > 100, `${l.length} fichiers`);
    assert.ok(l.includes(`${E2E}alias-etiquettes-e9.test.ts`) && l.includes(`${E2E}accueil-refonte.test.ts`));
  });
});
