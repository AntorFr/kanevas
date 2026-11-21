// Besoin (kanevas-ecrans-installation): .sdlc.yaml declares tests.installation, tests.fichiers and
// tests.outillage; ecrans:/ecrans_liste:/rejouer: no longer install; `fichiers` names the right file
// for a named test and plays nothing; `--installe` skips only build:wasm.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');
const yaml = readFileSync(join(RACINE, '.sdlc.yaml'), 'utf8');
const ligne = (cle: string) => yaml.split('\n').find((l) => l.startsWith(`  ${cle}:`)) ?? '';

// An npm that records its arguments and succeeds: nothing is installed or built for real.
function faussNpm() {
  const dir = mkdtempSync(join(tmpdir(), 'faux-npm-'));
  const journal = join(dir, 'appels.log');
  writeFileSync(join(dir, 'npm'), `#!/bin/sh\necho "$@" >> "${journal}"\nexit 0\n`);
  chmodSync(join(dir, 'npm'), 0o755);
  writeFileSync(journal, '');
  return { env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` }, appels: () => readFileSync(journal, 'utf8') };
}

describe('declaration de l\'installation dans .sdlc.yaml', () => {
  test('installation: joue npm ci puis build:wasm', () => {
    assert.equal(ligne('installation').trim(), 'installation: npm ci && npm run build:wasm');
  });
  test('fichiers: appelle le script de rejeu avec --fichiers et {tests}', () => {
    assert.equal(ligne('fichiers').trim(), 'fichiers: node scripts/rejouer-tests.mjs --fichiers {tests}');
  });
  test('outillage: nomme package.json et scripts/', () => {
    assert.equal(ligne('outillage').trim(), 'outillage: [package.json, scripts/]');
  });
  test('ecrans: et rejouer: ne lancent plus npm ci', () => {
    for (const cle of ['ecrans', 'rejouer']) {
      assert.ok(ligne(cle) !== '', `${cle}: absent`);
      assert.doesNotMatch(ligne(cle), /npm ci/, `${cle} installe encore`);
    }
  });
  test('ecrans_liste: installe sans scripts (le graphe est lu par typescript, AD-touches-1)', () => {
    assert.equal(
      ligne('ecrans_liste').trim(),
      'ecrans_liste: npm ci --ignore-scripts --loglevel=error >/dev/null && node scripts/niveaux-tests.mjs --liste ecrans {base}',
    );
  });
  test('ecrans: et rejouer: passent --installe, apres leur argument', () => {
    assert.equal(ligne('ecrans').trim(), 'ecrans: npm run tests:ecrans -- {base} --installe');
    assert.equal(ligne('rejouer').trim(), 'rejouer: node scripts/rejouer-tests.mjs {tests} --installe');
  });
  test('les niveaux commande:, local: et fiche: gardent leur npm ci', () => {
    for (const cle of ['commande', 'local', 'fiche']) assert.match(ligne(cle), /npm ci/, `${cle} sans npm ci`);
  });
});

describe('fichiers: rend le fichier de chaque test nomme', () => {
  const lancer = (noms: string[], env = process.env) =>
    spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', '--fichiers', noms.join('|')], { cwd: RACINE, encoding: 'utf8', env });

  test('trois tests nommes: une ligne « nom<TAB>fichier » chacun', () => {
    const r = lancer([
      'rejouer : aucun état gardé > un nom inconnu sort non nul sans rien construire',
      'niveaux de la suite > la suite entière garde tous les fichiers de test',
      'declaration de l\'installation dans .sdlc.yaml > installation: joue npm ci puis build:wasm',
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split('\n').sort(), [
      'declaration de l\'installation dans .sdlc.yaml > installation: joue npm ci puis build:wasm\tsrc/scripts-tests/installation-declaree-besoin.test.ts',
      'niveaux de la suite > la suite entière garde tous les fichiers de test\tsrc/scripts-tests/niveaux-tests.test.ts',
      'rejouer : aucun état gardé > un nom inconnu sort non nul sans rien construire\tsrc/scripts-tests/rejouer-sans-etat-garde.test.ts',
    ]);
  });
  test('un nom qu\'aucun fichier ne declare: sortie 1, nom sur stderr, le nom connu reste imprime', () => {
    const r = lancer(['nom qui n existe nulle part > zzz', 'rejouer : aucun état gardé > le build et le wasm suivent les fichiers rejoués, sans condition sur le disque']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nom qui n existe nulle part > zzz/);
    assert.match(r.stdout, /rejouer : aucun état gardé > le build et le wasm[^\t]*\tsrc\/scripts-tests\/rejouer-sans-etat-garde\.test\.ts/);
  });
  test('un test d\'ecran nomme: rien n\'est installe, construit ni joue', () => {
    const f = faussNpm();
    const nom = 'le garde reconnaît une attente fixe de page, un sommeil en instruction seule, et laisse le délai d’un gestionnaire route';
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', '--fichiers', nom], { cwd: RACINE, encoding: 'utf8', env: f.env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\tsrc\/e2e\/harnais-sans-delai\.test\.ts$/m);
    assert.equal(f.appels(), '');
    assert.doesNotMatch(r.stdout, /Replaying/);
  });
});

describe('rejouer --installe saute build:wasm et lui seul', () => {
  const NOM = 'WASM_DIR vers un dossier vide : erreur sans aucun chemin, même quand rust/pkg existe';
  const rejouer = (extra: string[]) => {
    const f = faussNpm();
    const r = spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', NOM, ...extra], { cwd: RACINE, encoding: 'utf8', env: f.env });
    return { r, appels: f.appels() };
  };
  test('sans --installe, un test src/wasm/ construit le wasm', () => {
    const { r, appels } = rejouer([]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(appels.trim(), 'run build:wasm');
  });
  test('avec --installe, aucun npm n\'est lance et le test est joue', () => {
    const { r, appels } = rejouer(['--installe']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(appels, '');
    assert.match(r.stdout, /Replaying 1 test name\(s\) in 1 file\(s\)/);
  });
});

describe('README dit les durees de l\'installation', () => {
  test('la ligne installation: du README donne la duree de l\'installation en secondes', () => {
    const readme = readFileSync(join(RACINE, 'README.md'), 'utf8');
    assert.match(readme, /installation alone \(`npm ci` \+ `build:wasm`\) took \d+ s/);
  });
});
