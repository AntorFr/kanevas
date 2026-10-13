#!/usr/bin/env node
// Attested tests: run the WHOLE suite on the committed tree, write a report, and — on green,
// with --publier — post the commit status « tests-complets » that the image build requires.
//
// Why (decision of 2026-10-13): the image is built only from a commit whose full suite was
// played, wherever it was played — a laptop, a pod of the chain, or the manual « tests »
// workflow. A commit pushed by hand without tests never becomes an image, and the proof
// says where and on what tree the suite ran.
//
//   npm run tests:attestes                       # run, write rapport-tests.json
//   npm run tests:attestes -- --publier          # and post the status on GitHub when green
//   npm run tests:attestes -- --concurrence 2    # screen tests two at a time (small hosts)
//
// The status needs a token allowed to write commit statuses: GH_TOKEN, GITHUB_TOKEN, or
// `gh auth token`. TESTS_LIEU names where the suite ran (default: the host name), TESTS_LIEN
// a link to the run (the workflow passes its own).
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

const CONTEXTE = 'tests-complets';
const RAPPORT = 'rapport-tests.json';

const args = process.argv.slice(2);
const publier = args.includes('--publier');
const iConc = args.indexOf('--concurrence');
const concurrence = iConc >= 0 ? Number(args[iConc + 1]) : 0;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

// The proof is about what is committed: a dirty tree would attest a commit with code it
// does not contain.
const sale = git('status', '--porcelain', '--untracked-files=normal');
if (sale) {
  console.error(`Arbre de travail modifié : committer ou mettre de côté avant d'attester.\n${sale}`);
  process.exit(2);
}
const commit = git('rev-parse', 'HEAD');
const arbre = git('rev-parse', 'HEAD^{tree}');

// The same files as `npm test`.
const fichiers = ['src', 'frontend/src']
  .flatMap((racine) => readdirSync(racine, { recursive: true }).map((f) => join(racine, String(f))))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

const version = (cmd, a) => {
  try {
    return execFileSync(cmd, a, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};
const playwright = (() => {
  for (const r of [process.cwd() + '/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try {
      return JSON.parse(readFileSync(join(r, 'playwright/package.json'), 'utf8')).version;
    } catch {
      /* next */
    }
  }
  return null;
})();

const debut = new Date();
const typecheck = spawnSync('npm', ['run', 'typecheck'], { stdio: 'inherit' });

const tap = join(mkdtempSync(join(tmpdir(), 'tests-attestes-')), 'resultats.tap');
const commande = [
  '--import', 'tsx', '--test',
  ...(concurrence > 0 ? [`--test-concurrency=${concurrence}`] : []),
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=tap', `--test-reporter-destination=${tap}`,
  ...fichiers,
];
const suite = typecheck.status === 0 ? spawnSync(process.execPath, commande, { stdio: 'inherit' }) : null;

// Totals from the TAP summary (`# pass 12`…), the last occurrence of each.
const totaux = { tests: 0, pass: 0, fail: 0, skipped: 0, todo: 0, cancelled: 0 };
try {
  for (const l of readFileSync(tap, 'utf8').split('\n')) {
    const m = /^# (tests|pass|fail|skipped|todo|cancelled) (\d+)$/.exec(l);
    if (m) totaux[m[1]] = Number(m[2]);
  }
} catch {
  /* no TAP: the suite did not run */
}

// Green means: typecheck passed, the suite exited 0, something ran, nothing failed, and
// NOTHING was skipped — a screen test skips without a browser, and a partial suite is not
// the suite.
const raisons = [];
if (typecheck.status !== 0) raisons.push('typecheck en échec');
if (suite && suite.status !== 0) raisons.push(`suite sortie ${suite.status}`);
if (totaux.tests === 0) raisons.push('aucun test joué');
if (totaux.fail > 0) raisons.push(`${totaux.fail} en échec`);
if (totaux.skipped + totaux.todo + totaux.cancelled > 0)
  raisons.push(`${totaux.skipped} sautés, ${totaux.todo} à faire, ${totaux.cancelled} annulés`);
const vert = raisons.length === 0;

const rapport = {
  format: 1,
  commit,
  arbre,
  resultat: vert ? 'vert' : 'rouge',
  raisons,
  totaux,
  fichiers: fichiers.length,
  concurrence: concurrence || null,
  lieu: process.env.TESTS_LIEU || hostname(),
  lien: process.env.TESTS_LIEN || null,
  debut: debut.toISOString(),
  fin: new Date().toISOString(),
  versions: { node: process.version, playwright, git: version('git', ['--version']) },
};
writeFileSync(RAPPORT, JSON.stringify(rapport, null, 2) + '\n');
console.log(`\n${RAPPORT} : ${rapport.resultat} — ${totaux.pass}/${totaux.tests} sur ${commit.slice(0, 7)} (arbre ${arbre.slice(0, 7)})${vert ? '' : ' — ' + raisons.join(', ')}`);

if (!vert) process.exit(1);
if (!publier) process.exit(0);

// The status goes on the commit; its description carries the tree and the place, so the
// proof reads on its own in the commit's checks.
const token =
  process.env.GH_TOKEN || process.env.GITHUB_TOKEN || version('gh', ['auth', 'token']);
if (!token) {
  console.error('Aucun jeton pour publier le statut (GH_TOKEN, GITHUB_TOKEN ou gh auth token).');
  process.exit(3);
}
const depot =
  process.env.GITHUB_REPOSITORY ||
  git('remote', 'get-url', 'origin').replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
const description = `${totaux.pass}/${totaux.tests} verts · arbre ${arbre.slice(0, 7)} · ${rapport.lieu}`.slice(0, 140);
const rep = await fetch(`https://api.github.com/repos/${depot}/statuses/${commit}`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  body: JSON.stringify({ state: 'success', context: CONTEXTE, description, ...(rapport.lien ? { target_url: rapport.lien } : {}) }),
});
if (!rep.ok) {
  console.error(`Statut non publié : ${rep.status} ${await rep.text()}`);
  process.exit(3);
}
console.log(`Statut « ${CONTEXTE} » publié sur ${depot}@${commit.slice(0, 7)}.`);
