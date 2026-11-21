// Ensemble tests of kanevas-niveau-fiche, written from the « Livre » and the exit criterion only:
// `ecrans:` and `fiche:` choose the right files on a real `{base}` of THIS repository (a scratch clone of
// the committed tree), their durations are said in the README next to the suite's, `rejouer:` replays a named
// test from a fresh extraction, a status without a level is refused by the tag build.
// No network: node_modules is linked into the extraction instead of `npm ci`.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const RACINE = resolve('.');
// Run inside `node --test`: without this the nested runner reports to its parent instead of stdout.
const { NODE_TEST_CONTEXT: _ctx, ...ENV } = process.env;
let copie: string;
const git = (...a: string[]) => execFileSync('git', a, { cwd: copie, encoding: 'utf8' }).trim();

before(() => {
  copie = mkdtempSync(join(tmpdir(), 'niveaux-ensemble-'));
  execFileSync('git', ['clone', '-q', '--no-hardlinks', RACINE, copie]);
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  symlinkSync(join(RACINE, 'node_modules'), join(copie, 'node_modules'));
});
after(() => rmSync(copie, { recursive: true, force: true }));

/** Appends a comment to `fichier`, commits, and lists what `niveau` chooses on the commit before it. */
function choisir(niveau: 'ecrans' | 'fiche', fichier: string): string[] {
  const base = git('rev-parse', 'HEAD');
  appendFileSync(join(copie, fichier), '\n// touched by a test\n');
  git('commit', '-qam', 'change');
  const r = spawnSync(process.execPath, ['scripts/niveaux-tests.mjs', '--liste', niveau, base], { cwd: copie, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  git('reset', '-q', '--hard', base);
  return r.stdout.split('\n').filter(Boolean);
}

describe('niveaux ecrans et fiche : le choix sur une base réelle', () => {
  test('l’écran Administration touché : ses tests, pas ceux d’un autre écran', () => {
    const l = choisir('ecrans', 'frontend/src/ecrans/administration.tsx');
    assert.ok(l.includes('src/e2e/administration-badge-entete.test.ts'), 'un test qui déclare administration');
    assert.ok(!l.includes('src/e2e/cartes-formulaire.test.ts'), 'un test qui ne déclare que cartes ne joue plus pour Administration');
    assert.ok(!l.includes('src/e2e/recherche-avancee-ecran.test.ts'), 'un test qui ne déclare que recherche');
    assert.ok(l.every((f) => /^src\/e2e\/[^/]+\.test\.ts$/.test(f)), 'ecrans: ne liste que des tests d’écran');
  });

  test('l’écran Administration touché : fiche = la suite moins les tests d’écran non touchés', () => {
    const l = choisir('fiche', 'frontend/src/ecrans/administration.tsx');
    assert.ok(l.includes('src/e2e/administration-badge-entete.test.ts'));
    assert.ok(!l.includes('src/e2e/cartes-formulaire.test.ts'));
    assert.ok(!l.includes('src/e2e/recherche-avancee-ecran.test.ts'));
    assert.ok(l.includes('src/scripts-tests/niveaux-tests.test.ts'), 'les tests hors écran restent');
  });

  test('un fichier partagé touche tous les écrans : tous les tests d’écran, et la suite entière pour fiche', () => {
    const tous = git('ls-files', 'src/e2e').split('\n').filter((f) => f.endsWith('.test.ts'));
    assert.ok(tous.length > 200);
    assert.deepEqual(choisir('ecrans', 'package.json').sort(), tous.sort());
    const f = choisir('fiche', 'frontend/src/Cadre.tsx');
    for (const t of tous) assert.ok(f.includes(t), t);
    assert.ok(f.includes('src/scripts-tests/niveaux-tests.test.ts'));
  });

  test('un changement serveur seul ne touche aucun écran : ecrans vide, fiche sans test d’écran', () => {
    assert.deepEqual(choisir('ecrans', 'src/services/swn/catalogue-vaisseaux.ts'), []);
    const f = choisir('fiche', 'src/services/swn/catalogue-vaisseaux.ts');
    assert.ok(f.length > 100);
    assert.deepEqual(f.filter((x) => x.startsWith('src/e2e/')), []);
    assert.ok(f.includes('src/scripts-tests/niveaux-tests.test.ts'));
  });

  test('une base qui n’est pas un commit du dépôt est refusée, code 2, avant de jouer quoi que ce soit', () => {
    for (const niveau of ['--ecrans', '--fiche']) {
      const r = spawnSync(process.execPath, ['scripts/tests-attestes.mjs', niveau, 'cette-base-nexiste-pas'], { cwd: copie, encoding: 'utf8' });
      assert.equal(r.status, 2, r.stdout + r.stderr);
    }
  });

  test('ecrans et fiche sans base sont refusés, code 2', () => {
    const r = spawnSync(process.execPath, ['scripts/tests-attestes.mjs', '--fiche'], { cwd: copie, encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
  });
});

describe('niveaux : déclarations et durées', () => {
  test('.sdlc.yaml déclare ecrans:, fiche: et rejouer: avec leurs paramètres', () => {
    const y = readFileSync(join(RACINE, '.sdlc.yaml'), 'utf8');
    assert.match(y, /^ {2}ecrans: .*\{base\}/m);
    assert.match(y, /^ {2}fiche: .*\{base\}/m);
    assert.match(y, /^ {2}rejouer: .*\{tests\}/m);
  });

  test('le README dit la durée mesurée de ecrans:, fiche: et rejouer: à côté de celle de la suite', () => {
    const readme = readFileSync(join(RACINE, 'README.md'), 'utf8');
    for (const niveau of ['ecrans', 'fiche', 'commande', 'rejouer']) {
      const ligne = readme.split('\n').find((l) => l.startsWith(`| \`${niveau}:\``));
      assert.ok(ligne, `ligne du niveau ${niveau}`);
      assert.match(ligne, /\b\d[\d\s,.]* ?s\b/, `une durée en secondes pour ${niveau}:`);
    }
  });
});

describe('rejouer : un test nommé depuis une extraction neuve', () => {
  const NOM = 'niveaux de la suite > la suite entière garde tous les fichiers de test';
  test('rejoue le test nommé, avec son fichier, depuis une extraction sans dist ni état gardé', () => {
    assert.equal(existsSync(join(copie, 'dist')), false, 'extraction neuve : pas de dist/');
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', NOM], { cwd: copie, encoding: 'utf8', timeout: 120000, env: ENV });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Replaying 1 test name\(s\) in 1 file\(s\)/);
    assert.match(r.stdout, /# tests 1\b/);
    assert.match(r.stdout, /# pass 1\b/);
    assert.match(r.stdout, /la suite entière garde tous les fichiers de test/);
  });

  test('un nom qu’aucun fichier ne déclare sort non nul', () => {
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', 'un test qui n’existe nulle part'], { cwd: copie, encoding: 'utf8', timeout: 120000, env: ENV });
    assert.notEqual(r.status, 0);
  });

  test('un nom qualifié par un describe que le fichier ne déclare pas ne rejoue rien et sort non nul', () => {
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', 'autre suite > la suite entière garde tous les fichiers de test'], { cwd: copie, encoding: 'utf8', timeout: 120000, env: ENV });
    assert.notEqual(r.status, 0);
  });

  test('sans nom : usage, code 2', () => {
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs'], { cwd: copie, encoding: 'utf8' });
    assert.equal(r.status, 2);
  });
});

describe('build du tag : le statut tests-complets doit dire son niveau', () => {
  let dir: string;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'statut-ensemble-'));
    const yaml = readFileSync(join(RACINE, '.github/workflows/docker-publish.yml'), 'utf8');
    const job = yaml.slice(yaml.indexOf('\n  attestation:'), yaml.indexOf('\n  build:'));
    const m = job.match(/\n( +)run: \|\n([\s\S]*)$/);
    assert.ok(m);
    const retrait = m[1].length + 2;
    writeFileSync(join(dir, 'job.sh'), m[2].split('\n').map((l) => l.slice(retrait)).join('\n')
      .replace(/\$\{\{ github\.repository \}\}/g, 'o/r').replace(/\$\{\{ github\.sha \}\}/g, 'SHA'));
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\n[ -n "$FAUX_STATUT" ] && echo "$FAUX_STATUT"\nexit 0\n');
    chmodSync(join(dir, 'gh'), 0o755);
    execFileSync('sh', ['-c', 'git init -q . && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m un'], { cwd: dir });
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const jouer = (statut: string) =>
    spawnSync('bash', ['-e', 'job.sh'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAUX_STATUT: statut } });

  test('un statut success « niveau fiche · … » est accepté', () => {
    assert.equal(jouer('success niveau fiche · 1634 tests').status, 0);
  });
  test('un statut success sans « niveau » en tête est refusé', () => {
    assert.notEqual(jouer('success 1634 tests').status, 0);
  });
  test('un statut sans aucun état est refusé', () => {
    assert.notEqual(jouer('').status, 0);
  });
});
