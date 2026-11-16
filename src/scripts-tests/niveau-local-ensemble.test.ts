// Tests d'ensemble de `kanevas-niveau-local`, écrits depuis le besoin (fiche, « Livre » et critère de sortie) :
// `.sdlc.yaml` déclare `local:` et `rejouer:`, `local:` joue la suite sans les tests d'écran,
// `rejouer:` rejoue un test nommé seul, `commande:` (la suite attestée) est inchangée.
// Les vrais scripts tournent sur un mini-dépôt jetable (dossier temporaire) : aucun fichier suivi n'est touché.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const yaml = readFileSync(join(RACINE, '.sdlc.yaml'), 'utf8');
const bloc = (nom: string): string[] => {
  const lignes = yaml.split('\n');
  const i = lignes.findIndex((l) => l === `${nom}:`);
  const sortie: string[] = [];
  for (const l of lignes.slice(i + 1)) { if (/^\S/.test(l)) break; sortie.push(l); }
  return sortie;
};
const champ = (nom: string): string | undefined => {
  const l = bloc('tests').find((x) => x.trim().startsWith(`${nom}:`));
  return l?.trim().slice(nom.length + 1).trim();
};

const jetables: string[] = [];
after(() => { for (const d of jetables) rmSync(d, { recursive: true, force: true }); });

/** Mini-dépôt : les vrais scripts/, le node_modules du dépôt, des fichiers de test à nous. */
function minidepot(fichiers: Record<string, string>, scripts: Record<string, string> = {}): string {
  const d = mkdtempSync(join(tmpdir(), 'niveau-local-'));
  jetables.push(d);
  cpSync(join(RACINE, 'scripts'), join(d, 'scripts'), { recursive: true });
  symlinkSync(join(RACINE, 'node_modules'), join(d, 'node_modules'));
  mkdirSync(join(d, 'rust/pkg'), { recursive: true });
  writeFileSync(join(d, 'rust/pkg/x.wasm'), '');
  mkdirSync(join(d, 'frontend/src'), { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({
    type: 'module',
    scripts: {
      'build:wasm': 'node -e 0', typecheck: 'node -e 0', build: 'node -e "process.exit(7)"',
      'tests:local': 'node scripts/tests-attestes.mjs --local', ...scripts,
    },
  }));
  for (const [f, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(d, f, '..'), { recursive: true });
    writeFileSync(join(d, f), contenu);
  }
  return d;
}
const joue = (d: string, cmd: string, args: string[]) => {
  // Le test tourne lui-même sous `node --test` : sans ce retrait, le `node --test` fils se croit sous-processus.
  const env = { ...process.env, NODE_OPTIONS: '' };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(cmd, args, { cwd: d, encoding: 'utf8', env });
};
const executes = (sortie: string): string[] => [...sortie.matchAll(/^(?:# )?EXECUTE:(.*)$/gm)].map((m) => m[1]).sort();
const marque = (nom: string, ok = true) => `console.log('EXECUTE:${nom}');${ok ? '' : " assert.fail('rouge');"}`;
const en_tete = "import assert from 'node:assert/strict';\nimport { describe, test } from 'node:test';\n";

describe('niveau local : déclaration dans .sdlc.yaml', () => {
  test('local: et rejouer: sont déclarés, avec leur gabarit', () => {
    assert.equal(champ('local'), 'npm ci && npm run tests:local');
    assert.equal(champ('rejouer'), 'npm ci && node scripts/rejouer-tests.mjs {tests}');
  });
  test('la suite attestée est inchangée : commande, rapport, format, délai', () => {
    assert.equal(champ('commande'), 'npm ci && npm run tests:attestes');
    assert.equal(champ('rapport'), 'resultats.tap');
    assert.equal(champ('format'), 'tap');
    assert.equal(champ('delai'), '90m');
  });
  test('les commandes déclarées existent comme scripts npm et fichiers', () => {
    const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts['tests:local'], 'script tests:local absent');
    assert.ok(pkg.scripts['tests:attestes'], 'script tests:attestes absent');
    assert.ok(existsSync(join(RACINE, 'scripts/rejouer-tests.mjs')));
  });
});

describe('niveau local : npm run tests:local', () => {
  const fichiers = {
    'src/a.test.ts': `${en_tete}test('unitaire a', () => { ${marque('unitaire-a')} });`,
    'src/b/b.test.ts': `${en_tete}describe('s', () => { test('unitaire b', () => { ${marque('unitaire-b')} }); });`,
    'frontend/src/f.test.ts': `${en_tete}test('front f', () => { ${marque('front-f')} });`,
    'src/e2e/ecran.test.ts': `${en_tete}test('ecran rouge', () => { ${marque('ecran', false)} });`,
  };

  test('joue tous les fichiers hors src/e2e, sans build, et sort 0', () => {
    const d = minidepot(fichiers);
    const r = joue(d, 'npm', ['run', 'tests:local']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(executes(r.stdout), ['front-f', 'unitaire-a', 'unitaire-b']);
  });

  test("n'installe pas Playwright et n'appelle pas build", () => {
    const d = minidepot(fichiers);
    const r = joue(d, 'npm', ['run', 'tests:local']);
    assert.ok(!/Playwright not found|playwright install/i.test(r.stdout + r.stderr), r.stdout);
    assert.equal(r.status, 0, 'build (qui sort 7 dans ce mini-dépôt) a été appelé');
  });

  test('écrit resultats.tap avec une ligne par test joué, sans test d\'écran', () => {
    const d = minidepot(fichiers);
    joue(d, 'npm', ['run', 'tests:local']);
    const tap = readFileSync(join(d, 'resultats.tap'), 'utf8');
    assert.match(tap, /ok \d+ - unitaire a/);
    assert.match(tap, /ok \d+ - unitaire b/);
    assert.match(tap, /ok \d+ - front f/);
    assert.ok(!tap.includes('ecran rouge'));
  });

  test('un test rouge hors src/e2e fait sortir non zéro', () => {
    const d = minidepot({ ...fichiers, 'src/c.test.ts': `${en_tete}test('rouge c', () => { ${marque('rouge-c', false)} });` });
    const r = joue(d, 'npm', ['run', 'tests:local']);
    assert.notEqual(r.status, 0);
  });

  test("un typecheck rouge arrête le niveau local avant tout test", () => {
    const d = minidepot(fichiers, { typecheck: 'node -e "process.exit(3)"' });
    const r = joue(d, 'npm', ['run', 'tests:local']);
    assert.notEqual(r.status, 0);
    assert.deepEqual(executes(r.stdout), []);
  });

  test('un dossier src/e2e vide de test ne change rien : seuls les tests hors écran sont joués', () => {
    const d = minidepot({ 'src/a.test.ts': fichiers['src/a.test.ts'] });
    const r = joue(d, 'npm', ['run', 'tests:local']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(executes(r.stdout), ['unitaire-a']);
  });
});

describe('niveau local : rejouer un test nommé', () => {
  const fichiers = {
    'src/a.test.ts': `${en_tete}describe('groupe A', () => {\n test('premier', () => { ${marque('A-premier')} });\n test('second', () => { ${marque('A-second')} });\n test('casse', () => { ${marque('A-casse', false)} });\n});`,
    'src/b.test.ts': `${en_tete}test('isolé b', () => { ${marque('b-isole')} });\ntest('casse b', () => { ${marque('b-casse', false)} });`,
    'frontend/src/f.test.ts': `${en_tete}test('front f', () => { ${marque('front-f')} });`,
  };
  const rejoue = (d: string, ...noms: string[]) => joue(d, process.execPath, ['scripts/rejouer-tests.mjs', ...noms]);

  test('un test nommé est rejoué seul, ses voisins du même fichier non', () => {
    const d = minidepot(fichiers);
    const r = rejoue(d, 'groupe A > premier');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(executes(r.stdout), ['A-premier']);
  });

  test('un test de premier niveau (sans describe) est rejoué seul', () => {
    const d = minidepot(fichiers);
    const r = rejoue(d, 'isolé b');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(executes(r.stdout), ['b-isole']);
  });

  test('plusieurs noms, dans des fichiers différents, sont rejoués ensemble et eux seuls', () => {
    const d = minidepot(fichiers);
    const r = rejoue(d, 'groupe A > second', 'front f');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(executes(r.stdout), ['A-second', 'front-f']);
  });

  test('un test nommé qui est rouge fait sortir non zéro', () => {
    const d = minidepot(fichiers);
    const r = rejoue(d, 'groupe A > casse');
    assert.notEqual(r.status, 0);
    assert.deepEqual(executes(r.stdout), ['A-casse']);
  });

  test("un test rouge non nommé ne rougit pas le rejeu d'un test vert", () => {
    const d = minidepot(fichiers);
    const r = rejoue(d, 'isolé b');
    assert.equal(r.status, 0);
    assert.ok(!executes(r.stdout).includes('b-casse'));
  });

  test("un titre qui n'est que le début d'un autre ne rejoue pas l'autre", () => {
    const d = minidepot({
      'src/e.test.ts': `${en_tete}test('liste', () => { ${marque('liste')} });\ntest('liste vide', () => { ${marque('liste-vide', false)} });`,
    });
    const r = rejoue(d, 'liste');
    assert.deepEqual(executes(r.stdout), ['liste']);
    assert.equal(r.status, 0, r.stdout);
  });

  test('deux describe qui portent un test de même titre : seul celui nommé est rejoué', () => {
    const d = minidepot({
      'src/d.test.ts': `${en_tete}describe('X', () => { test('même titre', () => { ${marque('X-meme')} }); });\ndescribe('Y', () => { test('même titre', () => { ${marque('Y-meme', false)} }); });`,
    });
    const r = rejoue(d, 'X > même titre');
    assert.deepEqual(executes(r.stdout), ['X-meme']);
    assert.equal(r.status, 0, r.stdout);
  });
});
