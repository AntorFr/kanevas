// Ensemble tests of kanevas-outillage-tests, written from the « Livre » and its exit criterion only:
// `tests.outillage` names the four scripts that judge and nothing that installs or builds; the levels call those
// scripts directly; a branch whose manifest differs from main's is judged with its own dependencies and build,
// the four judges laid over it changing nothing.
// The chain's overlay is simulated: a clone, a dependency bumped in its package.json, the judges laid over it.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const RACINE = resolve('.');
const { NODE_TEST_CONTEXT: _ctx, ...ENV } = process.env;
const QUATRE = ['scripts/tests-attestes.mjs', 'scripts/niveaux-tests.mjs', 'scripts/rejouer-tests.mjs', 'scripts/playwright.mjs'];

function declarations(): Map<string, string> {
  const lignes = readFileSync(join(RACINE, '.sdlc.yaml'), 'utf8').split('\n');
  const m = new Map<string, string>();
  for (const l of lignes.slice(lignes.indexOf('tests:') + 1)) {
    if (/^\S/.test(l)) break;
    const r = l.match(/^ {2}(\w+):\s*(.*)$/);
    if (r) m.set(r[1], r[2].trim());
  }
  return m;
}
const liste = (v: string) => v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);

describe('outillage de test : ce que .sdlc.yaml déclare', () => {
  test('outillage_est_exactement_les_quatre_scripts_qui_jugent', () => {
    // Fails if package.json, a directory or a build script is added, or one of the judges dropped.
    assert.deepEqual(liste(declarations().get('outillage') ?? ''), QUATRE);
  });

  test('chaque_chemin_est_un_fichier_pas_un_dossier_ni_un_script_dinstallation', () => {
    for (const c of liste(declarations().get('outillage') ?? '')) {
      assert.ok(statSync(join(RACINE, c)).isFile(), `${c} is a file`);
      assert.doesNotMatch(c, /package(-lock)?\.json|rust-wasm|copier-wasm|install/);
      assert.ok(!c.endsWith('/'));
    }
  });

  test('les_quatre_niveaux_appellent_les_juges_directement_sans_npm_run', () => {
    const d = declarations();
    assert.equal(d.get('commande'), 'npm ci && node scripts/tests-attestes.mjs');
    assert.equal(d.get('local'), 'npm ci && node scripts/tests-attestes.mjs --local');
    assert.equal(d.get('fiche'), 'npm ci && node scripts/tests-attestes.mjs --fiche {base}');
    assert.equal(d.get('ecrans'), 'node scripts/tests-attestes.mjs --ecrans {base} --installe');
  });

  test('ecrans_et_rejouer_ne_lancent_pas_npm_ci_et_installe_vient_apres_la_base', () => {
    const d = declarations();
    assert.doesNotMatch(d.get('ecrans') ?? '', /npm/);
    assert.doesNotMatch(d.get('rejouer') ?? '', /npm/);
    assert.ok((d.get('ecrans') ?? '').indexOf('{base}') < (d.get('ecrans') ?? '').indexOf('--installe'));
    assert.equal(d.get('rejouer'), 'node scripts/rejouer-tests.mjs {tests} --installe');
  });

  test('les_cles_non_concernees_restent_celles_dhier', () => {
    const d = declarations();
    assert.equal(d.get('installation'), 'npm ci && npm run build:wasm');
    assert.equal(d.get('fichiers'), 'node scripts/rejouer-tests.mjs --fichiers {tests}');
    assert.equal(d.get('ecrans_liste'), 'npm ci --ignore-scripts --loglevel=error >/dev/null && node scripts/niveaux-tests.mjs --liste ecrans {base}');
  });

  test('tout_script_mjs_lance_par_une_commande_declaree_est_dans_loutillage', () => {
    const d = declarations();
    const outillage = liste(d.get('outillage') ?? '');
    const lances = new Set<string>();
    for (const [cle, v] of d) if (cle !== 'outillage') for (const m of v.matchAll(/node\s+(\S+\.mjs)/g)) lances.add(m[1]);
    assert.ok(lances.size >= 3);
    for (const s of lances) assert.ok(outillage.includes(s), `${s} runs but is not in the tooling`);
  });

  test('les_entrees_tests_de_package_json_restent_pour_la_main', () => {
    const scripts = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')).scripts;
    for (const n of ['tests:local', 'tests:fiche', 'tests:ecrans', 'tests:attestes']) assert.ok(scripts[n], `${n} stays`);
  });
});

describe('outillage de test : une branche au manifeste différent de main', () => {
  let copie: string;
  const lister = (cwd: string, niveau: string, base: string) =>
    spawnSync(process.execPath, ['scripts/niveaux-tests.mjs', '--liste', niveau, base], { cwd, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 });
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: copie, encoding: 'utf8' }).trim();
  let base: string;

  before(() => {
    copie = mkdtempSync(join(tmpdir(), 'outillage-isole-'));
    execFileSync('git', ['clone', '-q', '--no-hardlinks', RACINE, copie]);
    symlinkSync(join(RACINE, 'node_modules'), join(copie, 'node_modules'));
    base = git('rev-parse', 'HEAD');
    // a dependency raised on the branch: its manifest no longer is main's
    const p = JSON.parse(readFileSync(join(copie, 'package.json'), 'utf8'));
    p.dependencies.zod = '^4.99.0';
    writeFileSync(join(copie, 'package.json'), JSON.stringify(p, null, 2) + '\n');
    writeFileSync(join(copie, 'frontend/src/ecrans/membres.tsx'), readFileSync(join(copie, 'frontend/src/ecrans/membres.tsx'), 'utf8') + '\n// touched\n');
    git('commit', '-qam', 'dependance montee + page');
  });
  after(() => rmSync(copie, { recursive: true, force: true }));

  test('poser_les_juges_ne_touche_ni_package_json_ni_le_lock_ni_les_scripts_de_construction', () => {
    const avant = ['package.json', 'package-lock.json', 'scripts/rust-wasm.sh', 'scripts/copier-wasm.mjs'].map((f) => readFileSync(join(copie, f), 'utf8'));
    for (const c of liste(declarations().get('outillage') ?? '')) copyFileSync(join(RACINE, c), join(copie, c));
    const apres = ['package.json', 'package-lock.json', 'scripts/rust-wasm.sh', 'scripts/copier-wasm.mjs'].map((f) => readFileSync(join(copie, f), 'utf8'));
    assert.deepEqual(apres, avant);
    assert.match(JSON.parse(avant[0]).dependencies.zod, /^\^4\.99\.0$/);
    assert.equal(git('status', '--porcelain'), '');
  });

  test('les_juges_poses_rendent_un_choix_valide_pour_ecrans_et_fiche_malgre_le_manifeste_different', () => {
    // A raised dependency touches every screen: the list is the screen tests, one per line, and the command exits 0.
    for (const niveau of ['ecrans', 'fiche']) {
      const r = lister(copie, niveau, base);
      assert.equal(r.status, 0, r.stderr);
      const l = r.stdout.split('\n').filter((f) => f.startsWith('src/e2e/'));
      assert.ok(l.length > 200, `${niveau}: ${l.length} screen tests`);
      assert.ok(l.includes('src/e2e/reglages-membres-reessayer.test.ts'), niveau);
    }
  });

  test('tous_les_juges_declares_existent_dans_la_copie_sans_dossier_dinstallation', () => {
    for (const c of QUATRE) assert.ok(existsSync(join(copie, c)), c);
  });
});
