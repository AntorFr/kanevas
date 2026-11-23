// `tests.ecrans_liste` (AD-ecrans-liste-1 et 2): the list of the screen tests `ecrans:` would play,
// declared in `.sdlc.yaml`, rendered without `npm ci`, from the one function `tests-attestes.mjs` also uses.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../../', import.meta.url));
const lire = (f: string) => readFileSync(join(racine, f), 'utf8');

const lignes = lire('.sdlc.yaml').split('\n');
const bloc: string[] = [];
for (const l of lignes.slice(lignes.findIndex((x) => x === 'tests:') + 1)) { if (/^\S/.test(l)) break; bloc.push(l); }
const cle = (nom: string) => bloc.find((l) => l.startsWith(`  ${nom}:`))?.slice(nom.length + 3).trim();

describe('ecrans_liste : déclaration', () => {
  test('est déclarée, avec npm ci --ignore-scripts mais sans build, et rend la liste de ecrans', () => {
    assert.equal(cle('ecrans_liste'), 'npm ci --ignore-scripts --loglevel=error >/dev/null && node scripts/niveaux-tests.mjs --liste ecrans {base}');
  });
  test('ecrans, fiche et local ne bougent pas', () => {
    assert.equal(cle('ecrans'), 'node scripts/tests-attestes.mjs --ecrans {base} --installe');
    assert.equal(cle('fiche'), 'npm ci && node scripts/tests-attestes.mjs --fiche {base}');
    assert.equal(cle('local'), 'npm ci && node scripts/tests-attestes.mjs --local');
  });
});

describe('ecrans_liste : une seule sélection', () => {
  test('tests-attestes.mjs tire sa sélection de niveaux-tests.mjs --liste', () => {
    const src = lire('scripts/tests-attestes.mjs');
    assert.match(src, /'scripts\/niveaux-tests\.mjs', '--liste', niveau, base/);
    assert.doesNotMatch(src, /choisirNiveau|choisirTestsEcran|ecransDeclares/);
  });
  test('le script n’importe que des modules node: ou relatifs, jamais un paquet', () => {
    const src = lire('scripts/niveaux-tests.mjs');
    const specs = [...src.matchAll(/^(?:import|export)\b[^;\n]*?(?:\bfrom\s+|^import\s+)['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.ok(specs.length > 0);
    // The one fallback is typescript, found on the image's NODE_PATH when no node_modules holds it (AD-touches-1).
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.deepEqual([...code.matchAll(/\brequire\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => a !== 'candidat' && a !== "'typescript'"), []);
    assert.doesNotMatch(src, /^\s*await import\(/m);
    for (const s of specs) assert.ok(s.startsWith('node:') || s.startsWith('.'), `import d'un paquet : ${s}`);
  });
});

describe('ecrans_liste : dans une copie git sans node_modules', () => {
  let copie: string;
  let base: string;
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: copie, encoding: 'utf8' });
  const liste = (b: string) => spawnSync('node', ['scripts/niveaux-tests.mjs', '--liste', 'ecrans', b], { cwd: copie, encoding: 'utf8' });

  before(() => {
    copie = mkdtempSync(join(tmpdir(), 'ecrans-liste-'));
    execFileSync('git', ['clone', '-q', racine, copie]);
    execFileSync('git', ['checkout', '-q', '--detach', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: racine, encoding: 'utf8' }).trim()], { cwd: copie });
    assert.equal(existsSync(join(copie, 'node_modules')), false);
    base = git('rev-parse', 'HEAD').trim();
  });
  after(() => rmSync(copie, { recursive: true, force: true }));

  test('un changement de docs/ seul : sortie vide, code 0', () => {
    writeFileSync(join(copie, 'docs', 'ecrans-liste-note.md'), 'note\n');
    git('add', 'docs/ecrans-liste-note.md');
    git('commit', '-qm', 'doc');
    const r = liste(base);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    git('reset', '-q', '--hard', base);
  });

  test('le fichier d’une page : le test d’écran de cette page, pas celui d’une autre', () => {
    writeFileSync(join(copie, 'frontend/src/ecrans/membres.tsx'), `${readFileSync(join(copie, 'frontend/src/ecrans/membres.tsx'), 'utf8')}\n// touche\n`);
    git('add', 'frontend/src/ecrans/membres.tsx');
    git('commit', '-qm', 'page');
    const r = liste(base);
    assert.equal(r.status, 0, r.stderr);
    const l = r.stdout.split('\n');
    assert.equal(l.at(-1), '', 'une ligne par fichier, retour final');
    const fichiers = l.filter(Boolean);
    assert.ok(fichiers.includes('src/e2e/reglages-membres-reessayer.test.ts'));
    assert.ok(!fichiers.includes('src/e2e/accueil-cartes-largeur.test.ts'));
    for (const f of fichiers) assert.match(f, /^src\/e2e\/.+\.test\.ts$/);
    assert.deepEqual(fichiers, [...fichiers].sort());
    git('reset', '-q', '--hard', base);
  });

  test('une base absente : code 2, rien sur stdout, message sur stderr', () => {
    const r = liste('pas-un-commit-0123');
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.notEqual(r.stderr.trim(), '');
  });

  test('sans base : code 2 et usage', () => {
    const r = spawnSync('node', ['scripts/niveaux-tests.mjs', '--liste', 'ecrans'], { cwd: copie, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /Usage/);
  });

  test('tests:ecrans joue la même liste : docs seul, rien à jouer', () => {
    writeFileSync(join(copie, 'docs', 'ecrans-liste-note.md'), 'note\n');
    git('add', 'docs/ecrans-liste-note.md');
    git('commit', '-qm', 'doc');
    const r = spawnSync('node', ['scripts/tests-attestes.mjs', '--ecrans', base], { cwd: copie, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no test chosen/);
    git('reset', '-q', '--hard', base);
  });
});
