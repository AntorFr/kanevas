#!/usr/bin/env node
// Duration of the screen suite: reads the per-test TAP report written by `npm run tests:attestes`
// (`resultats.tap`) and prints the duration of every file of `src/e2e/` and their total.
//
//   node scripts/duree-tests-ecran.mjs [resultats.tap] [--markdown]
//
// Node's `tap` reporter names no file: a report is a flat list of top-level entries (a test, or a
// `describe` with its children inside), each with its `duration_ms`. A file's duration is the sum of
// the entries whose title the file declares literally at its top level (the same literal-title
// reading as `scripts/rejouer-tests.mjs`). A title declared by several files (screen or not) is split
// evenly among them and counted as shared. The total is the sum over the screen files, i.e. the work
// done, not the wall time of the run (files overlap when several run at a time).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER = 'src/e2e/';

/** Top-level entries of a TAP report: `{ nom, ok, duree }`. Nested ones are indented and ignored. */
export function lireEntrees(tap) {
  const entrees = [];
  let courante = null;
  for (const ligne of tap.split(/\r?\n/)) {
    const tete = /^(not ok|ok) \d+ - (.*?)(?: # (?:SKIP|TODO).*)?$/.exec(ligne);
    if (tete) {
      courante = { nom: tete[2], ok: tete[1] === 'ok', duree: null };
      entrees.push(courante);
      continue;
    }
    if (/^\S/.test(ligne)) courante = null;
    const d = courante && /^\s+duration_ms: ([\d.]+)/.exec(ligne);
    if (d && courante.duree === null) courante.duree = Number(d[1]);
  }
  return entrees.filter((e) => e.duree !== null);
}

/** Literal titles of the tests and suites a source declares at its top level (column 0). */
export function titresDeclares(source) {
  const titres = new Set();
  const re = /^(?:it|test|describe|suite)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/gm;
  for (const m of source.matchAll(re)) titres.add(m[2].replace(/\\(['"`\\])/g, '$1'));
  return titres;
}

/** Per-file durations (ms) of the screen files and the total, from a report and `{ fichier: source }`. */
export function dureesEcran(tap, sources) {
  const parTitre = new Map();
  for (const [fichier, source] of Object.entries(sources)) {
    for (const t of titresDeclares(source)) parTitre.set(t, [...(parTitre.get(t) ?? []), fichier]);
  }
  const ecran = Object.keys(sources).filter((f) => f.startsWith(DOSSIER));
  const duree = new Map(ecran.map((f) => [f, { chemin: f, duree: 0, ok: true }]));
  let partages = 0;
  for (const e of lireEntrees(tap)) {
    const fichiers = parTitre.get(e.nom) ?? [];
    if (fichiers.length > 1) partages++;
    for (const f of fichiers) {
      if (!duree.has(f)) continue;
      const ligne = duree.get(f);
      ligne.duree += e.duree / fichiers.length;
      if (!e.ok) ligne.ok = false;
    }
  }
  const fichiers = [...duree.values()].sort((a, b) => a.chemin.localeCompare(b.chemin));
  return { fichiers, total: fichiers.reduce((s, f) => s + f.duree, 0), partages };
}

const sec = (ms) => (ms / 1000).toFixed(1);

export function rendre({ fichiers, total, partages }, markdown = false) {
  const sortie = [];
  if (markdown) {
    sortie.push('| File | Duration (s) | Result |', '| --- | ---: | --- |');
    for (const f of fichiers) sortie.push(`| \`${f.chemin}\` | ${sec(f.duree)} | ${f.ok ? 'ok' : 'FAILED'} |`);
    sortie.push(`| **Total (${fichiers.length} files)** | **${sec(total)}** | |`);
  } else {
    for (const f of fichiers) sortie.push(`${sec(f.duree).padStart(8)} s  ${f.chemin}${f.ok ? '' : '  (FAILED)'}`);
    sortie.push(`${sec(total).padStart(8)} s  total, ${fichiers.length} file(s) of ${DOSSIER}`);
  }
  if (partages > 0) sortie.push(`${markdown ? '\n' : ''}${partages} entr${partages > 1 ? 'ies' : 'y'} with a title declared by several files: duration split evenly.`);
  return sortie.join('\n');
}

/** Test files of the repository, as `src/...` paths read from `racine`. */
function lireSources(racine) {
  const sources = {};
  for (const dossier of ['src', 'frontend/src']) {
    let noms;
    try { noms = readdirSync(join(racine, dossier), { recursive: true }); } catch { continue; }
    for (const n of noms) {
      const f = `${dossier}/${String(n).split('\\').join('/')}`;
      if (f.endsWith('.test.ts')) sources[f] = readFileSync(join(racine, f), 'utf8');
    }
  }
  return sources;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const markdown = args.includes('--markdown');
  const chemin = args.find((a) => !a.startsWith('--')) ?? 'resultats.tap';
  let tap;
  try {
    tap = readFileSync(chemin, 'utf8');
  } catch {
    console.error(`Cannot read ${chemin}: run \`npm run tests:attestes\` first.`);
    process.exit(2);
  }
  const mesure = dureesEcran(tap, lireSources('.'));
  if (!(mesure.total > 0)) {
    console.error(`No duration for any file of ${DOSSIER} in ${chemin}.`);
    process.exit(1);
  }
  console.log(rendre(mesure, markdown));
}
