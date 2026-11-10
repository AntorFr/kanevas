// Besoin « preuve de test de la chaîne » (feature kanevas-preuve-tests), vu depuis le dépôt :
// la suite est déclarée dans .sdlc.yaml (tests:), aucun workflow ne la joue sur push de branche
// ni sur pull_request, l'image ne se construit que sur un tag v* après la vérification de
// l'attestation, CLAUDE.md dit la règle. Le jeu de la suite par `attester --publier` (forge) est
// hors de la suite : il se joue à la main ou en pod.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = join(import.meta.dirname, '..', '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');
const sansCommentaires = (yaml: string) => yaml.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');

/** Le bloc d'une clé de premier niveau d'un YAML : de `cle:` à la prochaine clé de premier niveau. */
function bloc(yaml: string, cle: string): string {
  const lignes = sansCommentaires(yaml).split('\n');
  const debut = lignes.findIndex((l) => l === `${cle}:` || l.startsWith(`${cle}:`) || l === `'${cle}':`);
  if (debut < 0) return '';
  const fin = lignes.findIndex((l, i) => i > debut && /^\S/.test(l));
  return lignes.slice(debut, fin < 0 ? undefined : fin).join('\n');
}

const workflows = () =>
  existsSync(join(RACINE, '.github/workflows'))
    ? readdirSync(join(RACINE, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f))
    : [];

test('.sdlc.yaml déclare la suite : commande, rapport, format tap ou junit, délai', () => {
  const tests = bloc(lire('.sdlc.yaml'), 'tests');
  assert.notEqual(tests, '', 'bloc tests: absent de .sdlc.yaml');
  const champ = (nom: string) => new RegExp(`^\\s+${nom}:\\s*(\\S.*)$`, 'm').exec(tests)?.[1].trim();
  assert.ok(champ('commande'), 'commande manquante');
  assert.ok(champ('rapport'), 'rapport manquant');
  assert.match(champ('format') ?? '', /^(tap|junit)$/);
  assert.match(champ('delai') ?? '', /^\d+[mh]$/);
});

test('la commande déclarée appelle un script npm qui existe et le rapport déclaré est ignoré par git', () => {
  const tests = bloc(lire('.sdlc.yaml'), 'tests');
  const commande = /^\s+commande:\s*(.+)$/m.exec(tests)?.[1] ?? '';
  const script = /npm run (\S+)/.exec(commande)?.[1];
  assert.ok(script, `la commande « ${commande} » n'appelle aucun script npm`);
  const scripts = JSON.parse(lire('package.json')).scripts as Record<string, string>;
  assert.ok(scripts[script], `package.json n'a pas de script ${script}`);
  const rapport = /^\s+rapport:\s*(\S+)/m.exec(tests)?.[1] ?? '';
  assert.ok(lire('.gitignore').split('\n').includes(rapport), `${rapport} n'est pas dans .gitignore`);
});

test('aucun workflow ne se déclenche sur un push de branche ni sur une pull_request', () => {
  const fichiers = workflows();
  assert.ok(fichiers.length > 0, 'aucun workflow lu : le test ne vérifierait rien');
  for (const f of fichiers) {
    const on = bloc(lire(`.github/workflows/${f}`), 'on');
    assert.ok(on, `${f} : bloc on: introuvable`);
    assert.doesNotMatch(on, /pull_request/, `${f} se déclenche sur pull_request`);
    assert.doesNotMatch(on, /^\s+branches(-ignore)?:/m, `${f} filtre des branches : il tourne sur un push de branche`);
    if (/^\s+push:/m.test(on)) assert.match(on, /^\s+tags:/m, `${f} : push sans filtre de tags`);
  }
});

test('aucun workflow ne joue un test ni la suite', () => {
  for (const f of workflows()) {
    const yaml = sansCommentaires(lire(`.github/workflows/${f}`));
    assert.doesNotMatch(yaml, /npm (run )?test|tests:attestes|--test\b|tests-attestes\.mjs|playwright/i, `${f} joue des tests`);
  }
});

test('l’image ne se construit que sur un tag v*, après un job qui lit l’attestation tests-complets', () => {
  const yaml = lire('.github/workflows/docker-publish.yml');
  const on = bloc(yaml, 'on');
  assert.match(on, /tags:\s*\['v\*'\]/);
  const jobs = sansCommentaires(yaml);
  assert.match(jobs, /build-push-action/);
  assert.match(jobs, /^\s+build:\s*\n(?:.*\n)*?\s+needs:\s*attestation\s*$/m, 'build ne dépend pas du job attestation');
  assert.match(jobs, /tests-complets/);
  assert.match(jobs, /statuses: read/);
  // Les parents de même arbre sont admis : l'historique doit être récupéré au-delà de HEAD.
  assert.match(jobs, /fetch-depth:\s*2/);
  assert.match(jobs, /\^\{tree\}/);
});

test('l’attestation vérifiée est un succès, pas un statut quelconque', () => {
  const yaml = sansCommentaires(lire('.github/workflows/docker-publish.yml'));
  assert.match(yaml, /=\s*success/);
  assert.match(yaml, /exit 1/);
});

test('CLAUDE.md dit la règle : suite déclarée, attester --publier, statut tests-complets, tag v*', () => {
  const claude = lire('CLAUDE.md');
  assert.match(claude, /\.sdlc\.yaml/);
  assert.match(claude, /tests:/);
  assert.match(claude, /attester --publier/);
  assert.match(claude, /tests-complets/);
  assert.match(claude, /tag `v\*`/);
});

test('le script de suite ne publie rien : ni statut, ni rapport, ni appel à la forge', () => {
  const script = sansCommentaires(lire('scripts/tests-attestes.mjs').replace(/\/\/.*$/gm, ''));
  assert.doesNotMatch(script, /rapport-tests|tests-complets|api\.github|\bgh\b|statuses/);
});

test('le script de suite refuse une concurrence invalide avec le code 2 sans rien jouer', () => {
  for (const valeur of ['0', 'abc', '-1', '1.5']) {
    const r = spawnSync(process.execPath, ['scripts/tests-attestes.mjs', '--concurrence', valeur], { cwd: RACINE, encoding: 'utf8' });
    assert.equal(r.status, 2, `--concurrence ${valeur}`);
    assert.match(r.stderr, /positive integer/);
  }
});
