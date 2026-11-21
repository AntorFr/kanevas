// Ensemble tests of kanevas-ecrans-liste, written from the « Livre » and its exit criterion only:
// `.sdlc.yaml` declares `tests.ecrans_liste`, a command on `{base}` that prints, one file per line and nothing
// else, the screen test files `ecrans:` would play; empty for a change to `docs/` alone; run in an extraction
// without `node_modules`; its duration is said in the README.
// The declared command itself is played, through `sh -c`, with `{base}` replaced, as the chain's tool does.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const RACINE = resolve('.');
// Run inside `node --test`: without this the nested runner reports to its parent.
// NODE_PATH stays: the runner image carries typescript there (/opt/sdlc-node, AD-touches-1), the copy has no node_modules.
const { NODE_TEST_CONTEXT: _ctx, ...ENV } = process.env;
let copie: string;
let base: string;
const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: copie, encoding: 'utf8' }).trim();

/** The command declared under `tests:` for `nom`, read from the extraction's `.sdlc.yaml`. */
function declaree(nom: string): string | undefined {
  const lignes = readFileSync(join(copie, '.sdlc.yaml'), 'utf8').split('\n');
  const debut = lignes.indexOf('tests:');
  for (const l of lignes.slice(debut + 1)) {
    if (/^\S/.test(l)) break;
    if (l.startsWith(`  ${nom}:`)) return l.slice(nom.length + 3).trim();
  }
  return undefined;
}

/** Plays the declared `ecrans_liste` command for `b`, as a shell line. */
function jouerListe(b: string) {
  const cmd = declaree('ecrans_liste');
  assert.ok(cmd, 'tests.ecrans_liste is declared in .sdlc.yaml');
  assert.ok(cmd.includes('{base}'), 'the command takes {base}');
  return spawnSync('sh', ['-c', cmd.replaceAll('{base}', b)], { cwd: copie, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 });
}

/** Applies `changer`, commits, plays the declared command on the commit before, then restores. */
function liste(changer: () => void): string[] {
  changer();
  git('add', '-A');
  git('commit', '-qm', 'change');
  const r = jouerListe(base);
  git('reset', '-q', '--hard', base);
  git('clean', '-qfd');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'nothing on stderr when it succeeds');
  assert.ok(r.stdout === '' || r.stdout.endsWith('\n'), 'a final newline after the last file');
  return r.stdout === '' ? [] : r.stdout.slice(0, -1).split('\n');
}

const toucher = (f: string) => () => appendFileSync(join(copie, f), '\n// touched by a test\n');
const ecrire = (f: string, t: string) => () => { mkdirSync(join(copie, f, '..'), { recursive: true }); writeFileSync(join(copie, f), t); };

function fichiersDeTest(l: string[]) {
  assert.ok(l.every((f) => /^src\/e2e\/[^/]+\.test\.ts$/.test(f)), `only screen test files, one per line: ${JSON.stringify(l.slice(0, 3))}`);
  assert.equal(new Set(l).size, l.length, 'no file twice');
  for (const f of l) assert.ok(existsSync(join(copie, f)), `${f} exists`);
}

before(() => {
  copie = mkdtempSync(join(tmpdir(), 'ecrans-liste-ensemble-'));
  execFileSync('git', ['clone', '-q', '--no-hardlinks', RACINE, copie]);
  assert.equal(existsSync(join(copie, 'node_modules')), false, 'an extraction without node_modules');
  base = git('rev-parse', 'HEAD');
});
after(() => rmSync(copie, { recursive: true, force: true }));

describe('ecrans_liste : le besoin, commande déclarée jouée sans node_modules', () => {
  test('un changement de docs/ seul : rien sur la sortie, code 0', () => {
    assert.deepEqual(liste(ecrire('docs/une-note-de-test.md', 'note\n')), []);
    assert.deepEqual(liste(toucher('docs/parcours.md')), []);
  });

  test('le README, ARCHITECTURE.md et status.md seuls : rien non plus', () => {
    assert.deepEqual(liste(toucher('README.md')), []);
    assert.deepEqual(liste(toucher('ARCHITECTURE.md')), []);
    assert.deepEqual(liste(toucher('.agent/status.md')), []);
  });

  test('le fichier d’une page : les tests de cette page, jamais ceux d’une autre', () => {
    const l = liste(toucher('frontend/src/ecrans/membres.tsx'));
    fichiersDeTest(l);
    assert.ok(l.includes('src/e2e/reglages-membres-reessayer.test.ts'));
    assert.ok(!l.includes('src/e2e/accueil-cartes-largeur.test.ts'));
    assert.ok(!l.includes('src/e2e/recherche-avancee-ecran.test.ts'));
    assert.ok(l.length > 0 && l.length < 256, 'a part of the screen tests, not all');
  });

  test('docs/ ajouté à un changement de page ne change pas la liste', () => {
    const seule = liste(toucher('frontend/src/ecrans/membres.tsx'));
    const avecDoc = liste(() => { toucher('frontend/src/ecrans/membres.tsx')(); ecrire('docs/une-note-de-test.md', 'note\n')(); });
    assert.deepEqual(avecDoc, seule);
  });

  test('un test d’écran modifié se joue lui-même, même sans écran touché', () => {
    const l = liste(toucher('src/e2e/accueil-cartes-largeur.test.ts'));
    assert.ok(l.includes('src/e2e/accueil-cartes-largeur.test.ts'));
    fichiersDeTest(l);
  });

  test('un changement de serveur seul (src/services) : aucun test d’écran', () => {
    const service = execFileSync('git', ['ls-files', 'src/services'], { cwd: copie, encoding: 'utf8' }).split('\n').find((f) => /\.ts$/.test(f) && !/\.test\./.test(f));
    assert.ok(service);
    assert.deepEqual(liste(toucher(service)), []);
  });

  test('.sdlc.yaml modifié (chemin inconnu) : tous les tests d’écran, un par ligne, rien d’autre', () => {
    const l = liste(toucher('.sdlc.yaml'));
    const tous = execFileSync('git', ['ls-files', 'src/e2e'], { cwd: copie, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.test.ts'));
    assert.ok(tous.length > 200);
    fichiersDeTest(l);
    assert.deepEqual([...l].sort(), [...tous].sort());
  });

  test('la liste de ecrans est exactement la part src/e2e/ de celle de fiche', () => {
    const dans = (n: string) => {
      const r = spawnSync(process.execPath, ['scripts/niveaux-tests.mjs', '--liste', n, base], { cwd: copie, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 });
      return r.stdout.split('\n').filter((f) => f.startsWith('src/e2e/'));
    };
    // the commit under test must be the one of `base`..HEAD: commit a page change, compare, restore
    toucher('frontend/src/ecrans/membres.tsx')();
    git('commit', '-qam', 'page');
    const ecrans = liste2(base);
    assert.deepEqual([...dans('fiche')].sort(), [...ecrans].sort());
    git('reset', '-q', '--hard', base);
  });
});

/** The declared command's list on the current HEAD against `b`, no commit made. */
function liste2(b: string): string[] {
  const r = jouerListe(b);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean);
}

describe('ecrans_liste : les échecs ne rendent jamais de liste partielle', () => {
  test('une base inconnue : code non nul, stdout vide, message sur stderr', () => {
    const r = jouerListe('0123456789abcdef-pas-un-commit');
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    assert.notEqual(r.stderr.trim(), '');
  });

  test('la tête comme base : rien à jouer, sortie vide, code 0', () => {
    const r = jouerListe(base);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  });
});

describe('ecrans_liste : la durée est dite dans le README', () => {
  test('la ligne ecrans_liste du tableau des niveaux donne la commande et une durée en secondes', () => {
    const ligne = readFileSync(join(copie, 'README.md'), 'utf8').split('\n').find((l) => l.startsWith('| `ecrans_liste:`'));
    assert.ok(ligne, 'a row for ecrans_liste: in the levels table');
    assert.ok(ligne.includes('node scripts/niveaux-tests.mjs --liste ecrans {base}'));
    assert.match(ligne, /\| *\d+(?:[.,]\d+)? ?s\b[^|]*\|?\s*$/, 'a duration in seconds in the last column');
  });
});
