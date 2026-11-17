import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs without types
import { dureesEcran, lireEntrees, rendre, titresDeclares } from '../../scripts/duree-tests-ecran.mjs';

const TAP = `TAP version 13
# Subtest: Ouvrir une fiche
    # Subtest: nested
    ok 1 - nested
      ---
      duration_ms: 999
      ...
ok 1 - Ouvrir une fiche
  ---
  duration_ms: 1500.5
  ...
not ok 2 - Renommer
  ---
  duration_ms: 2000
  ...
ok 3 - Partagé
  ---
  duration_ms: 1000
  ...
ok 4 - Gabarit 7
  ---
  duration_ms: 500
  ...
ok 5 - Ailleurs
  ---
  duration_ms: 4000
  ...
ok 6 - Ignoré # SKIP
  ---
  duration_ms: 0
  ...
`;

const SOURCES = {
  'src/e2e/a.test.ts': `describe('Ouvrir une fiche', () => { test('nested', () => {}); });\ntest("Renommer", async () => {});\ntest('Partagé', () => {});\n`,
  'src/e2e/b.test.ts': `test('Partagé', () => {});\nfor (const n of [7]) {\n  test(\`Gabarit \${n}\`, () => {});\n}\n`,
  'src/routes/c.test.ts': `test('Ailleurs', () => {});\ntest('Partagé', () => {});\n`,
};

describe('duree-tests-ecran', () => {
  test('reads only top-level entries and their durations', () => {
    const e = lireEntrees(TAP);
    assert.deepEqual(e.map((x: { nom: string }) => x.nom), ['Ouvrir une fiche', 'Renommer', 'Partagé', 'Gabarit 7', 'Ailleurs', 'Ignoré']);
    assert.equal(e[0].duree, 1500.5);
    assert.equal(e[1].ok, false);
  });

  test('literal, quoted and template titles are read', () => {
    const { litteraux, modeles } = titresDeclares(SOURCES['src/e2e/b.test.ts']);
    assert.ok(litteraux.has('Partagé'));
    assert.equal(modeles.length, 1);
    assert.ok(modeles[0].test('Gabarit 7'));
  });

  test('sums per screen file, splits shared titles, ignores non-screen files', () => {
    const m = dureesEcran(TAP, SOURCES);
    const par = Object.fromEntries(m.fichiers.map((f: { chemin: string; duree: number }) => [f.chemin, f.duree]));
    assert.deepEqual(Object.keys(par), ['src/e2e/a.test.ts', 'src/e2e/b.test.ts']);
    // Partagé is declared by 3 files (2 screen): each file gets a third.
    assert.ok(Math.abs(par['src/e2e/a.test.ts'] - (1500.5 + 2000 + 1000 / 3)) < 1e-6);
    assert.ok(Math.abs(par['src/e2e/b.test.ts'] - (500 + 1000 / 3)) < 1e-6);
    assert.ok(Math.abs(m.total - (par['src/e2e/a.test.ts'] + par['src/e2e/b.test.ts'])) < 1e-6);
    assert.equal(m.partages, 1);
    assert.equal(m.fichiers[0].ok, false);
  });

  test('renders per-file lines and a total, plain and markdown', () => {
    const m = dureesEcran(TAP, SOURCES);
    const t = rendre(m);
    assert.match(t, /src\/e2e\/a\.test\.ts  \(FAILED\)/);
    assert.match(t, /total, 2 file\(s\) of src\/e2e\//);
    assert.match(rendre(m, true), /\*\*Total \(2 files\)\*\*/);
  });

  test('CLI prints the per-file duration and the total on a sample report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'duree-'));
    const absent = spawnSync('node', ['scripts/duree-tests-ecran.mjs', join(dir, 'nope.tap')], { encoding: 'utf8' });
    assert.equal(absent.status, 2);
    // a sample report: one entry titled like a test that a real screen file declares
    const fichier = readdirSync('src/e2e').filter((f) => f.endsWith('.test.ts')).sort()
      .find((f) => [...titresDeclares(readFileSync(join('src/e2e', f), 'utf8')).litteraux].some((t) => t.length > 3 && !/\n/.test(t as string)));
    assert.ok(fichier);
    const titre = [...titresDeclares(readFileSync(join('src/e2e', fichier as string), 'utf8')).litteraux].find((t) => (t as string).length > 3) as string;
    const tap = join(dir, 'resultats.tap');
    writeFileSync(tap, `ok 1 - ${titre}\n  ---\n  duration_ms: 1234\n  ...\n`);
    const r = spawnSync('node', ['scripts/duree-tests-ecran.mjs', tap], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /total, \d+ file\(s\) of src\/e2e\//);
    assert.match(r.stdout, /src\/e2e\/.*\.test\.ts/);
    const total = Number(/^\s*([\d.]+) s  total/m.exec(r.stdout)?.[1]);
    assert.ok(total > 0);
  });
});
