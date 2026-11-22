import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

// AD-ecrans-ui-5, 6: `ui.css` is read rule by rule; a changed rule plays the screens whose files use its classes.
const SCRIPT = process.env.NIVEAUX_SCRIPT ?? resolve('scripts/niveaux-tests.mjs');

const CSS = [
  '/* Boutons */',
  'h1 { margin: 0; }',
  '.bouton { padding: 0; }',
  '.bouton.principal { color: red; }',
  '.s-entete { display: flex; }',
  '.s-entete .s-titre { font-weight: 600; }',
  '.rare { color: blue; }',
  '.serveur { color: green; }',
  '.liste-ligne { margin: 0; }',
  '@media (max-width: 600px) { .s-entete { display: block; } }',
  '@keyframes tourne { from { opacity: 0; } to { opacity: 1; } }',
  '',
].join('\n');

const ARBRE: Record<string, string> = {
  'frontend/src/ecrans/fiche.tsx': "import '../ui/ui.css';\nconst v = 'principal';\nexport default () => <button className={`bouton ${v}`}>ok</button>;",
  'frontend/src/ecrans/carte.tsx': "import '../ui/ui.css';\nexport default () => <header className=\"s-entete\"><b className=\"bouton\">x</b><i className={'liste-' + 'ligne'} /><u className=\"serveur\" /></header>;",
  'frontend/src/ecrans/nouveau.tsx': "import '../ui/ui.css';\nexport default () => <p className=\"autre s-titre\">n</p>;",
  'frontend/src/ui/ui.css': CSS,
  'frontend/src/registre.ts': "const m = import.meta.glob('./ecrans/*.tsx');",
  'src/services/page.ts': "export const html = '<div class=\"serveur\"></div>';",
  'src/e2e/fiche.test.ts': "// ecrans: fiche\ntest('a', () => {})",
  'src/e2e/carte.test.ts': "// ecrans: carte\ntest('b', () => {})",
  'src/e2e/nouveau.test.ts': "// ecrans: nouveau\ntest('c', () => {})",
};
const TOUS = ['src/e2e/carte.test.ts', 'src/e2e/fiche.test.ts', 'src/e2e/nouveau.test.ts'];
const F = 'frontend/src/ui/ui.css';

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
const css = (de: string, par: string) => { assert.ok(CSS.includes(de), de); return { [F]: CSS.replace(de, par) }; };

describe('niveaux : une règle de ui.css lue par ses classes', () => {
  beforeEach(() => {
    depot = mkdtempSync(join(tmpdir(), 'niveaux-css-'));
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    for (const [f, c] of Object.entries(ARBRE)) ecrire(f, c);
    git('add', '-A');
    git('commit', '-qm', 'depart');
  });
  afterEach(() => rmSync(depot, { recursive: true, force: true }));

  test('.bouton.principal ne choisit que l’écran dont les sources citent bouton et principal (bouton ${variante})', () => {
    assert.deepEqual(liste(css('.bouton.principal { color: red; }', '.bouton.principal { color: pink; }')), ['src/e2e/fiche.test.ts']);
  });

  test('une règle de .s-entete seule choisit son écran', () => {
    assert.deepEqual(liste(css('.s-entete { display: flex; }', '.s-entete { display: grid; }')), ['src/e2e/carte.test.ts']);
  });

  test('un descendant .s-entete .s-titre exige les deux classes', () => {
    assert.deepEqual(liste(css('font-weight: 600', 'font-weight: 700')), []);
  });

  test('une règle dans un @media se lit par ses classes', () => {
    assert.deepEqual(liste(css('display: block', 'display: none')), ['src/e2e/carte.test.ts']);
  });

  test('une classe construite à l’exécution (préfixe à tiret) est employée', () => {
    assert.deepEqual(liste(css('.liste-ligne { margin: 0; }', '.liste-ligne { margin: 1px; }')), ['src/e2e/carte.test.ts']);
  });

  test('un commentaire de ui.css changé ne choisit personne', () => {
    assert.deepEqual(liste(css('/* Boutons */', '/* Les boutons */')), []);
  });

  test('garde-fou : une règle sans classe (h1) choisit tous les écrans', () => {
    assert.deepEqual(liste(css('h1 { margin: 0; }', 'h1 { margin: 1px; }')), TOUS);
  });

  test('garde-fou : un @keyframes changé choisit tous les écrans', () => {
    assert.deepEqual(liste(css('opacity: 1', 'opacity: .9')), TOUS);
  });

  test('garde-fou : une règle déplacée choisit tous les écrans', () => {
    const [a, b] = ['.bouton { padding: 0; }\n', '.bouton.principal { color: red; }\n'];
    assert.deepEqual(liste({ [F]: CSS.replace(a + b, b + a) }), TOUS);
  });

  test('garde-fou : une classe qu’aucune source ne cite choisit tous les écrans', () => {
    assert.deepEqual(liste(css('.rare { color: blue; }', '.rare { color: navy; }')), TOUS);
  });

  test('garde-fou : une classe que le serveur cite choisit tous les écrans', () => {
    assert.deepEqual(liste(css('.serveur { color: green; }', '.serveur { color: lime; }')), TOUS);
  });

  test('garde-fou : un fichier illisible choisit tous les écrans', () => {
    assert.deepEqual(liste({ [F]: CSS + '.casse { color: red;\n' }), TOUS);
  });
});
