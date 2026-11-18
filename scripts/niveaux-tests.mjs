// Pure logic shared by `tests-attestes.mjs` (levels of the suite) and `rejouer-tests.mjs`
// (replay of named tests). Plain .mjs: `node scripts/rejouer-tests.mjs` runs without tsx.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEP = ' > ';

/** Files of the suite: every `*.test.ts`; the local level leaves out `src/e2e/` (server + browser). */
export function choisirFichiers(fichiers, { local = false } = {}) {
  return fichiers
    .map((f) => f.split('\\').join('/'))
    .filter((f) => f.endsWith('.test.ts'))
    .filter((f) => !(local && (f.startsWith('src/e2e/') || f.includes('/src/e2e/'))))
    .sort();
}

/** Splits what `{tests}` rendered into names: on `|` and line ends, never on spaces. */
export function decouperTests(arguments_) {
  const noms = arguments_.join('\n').split(/[|\r\n]+/).map((n) => n.trim()).filter(Boolean);
  return [...new Set(noms)];
}

/** The test's own name: the last segment of `describe > test`. */
export function nomPropre(nom) {
  const i = nom.lastIndexOf(SEP);
  return i >= 0 ? nom.slice(i + SEP.length) : nom;
}

/** True when `source` declares a test or suite titled exactly `propre`: `it('…'`, `test("…"`, `describe(`…``. */
export function declare(source, propre) {
  const formes = new Set([propre, propre.replace(/'/g, "\\'"), propre.replace(/"/g, '\\"'), propre.replace(/`/g, '\\`')]);
  for (const forme of formes) {
    const re = new RegExp(`\\b(?:it|test|describe|suite)(?:\\.\\w+)?\\(\\s*(['"\`])${forme.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}\\1`);
    if (re.test(source)) return true;
  }
  return false;
}

/** Files (among `fichiers`, read through `lire`) that declare a test or suite titled with the test's own name. */
export function trouverFichiers(nom, fichiers, lire = (f) => readFileSync(f, 'utf8')) {
  // A title may itself contain ' > ': try every suffix after a separator, longest first.
  const morceaux = nom.split(SEP);
  const candidats = morceaux.map((_, i) => morceaux.slice(i).join(SEP)).reverse();
  return fichiers.filter((f) => { const src = lire(f); return candidats.some((c) => declare(src, c)); });
}

/**
 * Resolves each requested name to files. A token not found as is falls back to the raw arguments
 * taken one by one. Returns `{ parFichier: Map<file, Set<name>>, introuvables: string[] }`.
 */
export function resoudre(arguments_, fichiers, lire) {
  const parFichier = new Map();
  const introuvables = [];
  const poser = (nom) => {
    const trouves = trouverFichiers(nom, fichiers, lire);
    for (const f of trouves) {
      if (!parFichier.has(f)) parFichier.set(f, new Set());
      parFichier.get(f).add(nom);
    }
    return trouves.length > 0;
  };
  for (const nom of decouperTests(arguments_)) {
    if (poser(nom)) continue;
    const reprises = arguments_.map((a) => a.trim()).filter(Boolean);
    const ok = reprises.length > 1 && reprises.every((a) => trouverFichiers(a, fichiers, lire).length > 0);
    if (ok) reprises.forEach(poser);
    else introuvables.push(nom);
  }
  return { parFichier, introuvables };
}

/**
 * Anchored regex source for `--test-name-pattern`. The engine matches the full name (suite names and
 * test name joined by spaces): a qualified `describe > test` keeps its path, so a same-titled test under
 * another describe is not replayed. A bare title also matches after any suites' names. A title that itself
 * contains ' > ' is matched literally as the last alternative.
 */
export function motif(nom) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  if (!nom.includes(SEP)) return `(^| )${esc(nom)}$`;
  return `^${esc(nom.split(SEP).join(' '))}$|(^| )${esc(nom)}$`;
}

/**
 * True when `source` can hold the qualified `nom`: some split of it at ' > ' leaves a declared title and
 * declared describe titles before it. A path naming no describe of the file names no test (used by the replay).
 */
export function cheminDeclare(nom, source) {
  const m = nom.split(SEP);
  return m.some((_, i) => declare(source, m.slice(i).join(SEP)) && m.slice(0, i).every((s) => declare(source, s)));
}

// ---------------------------------------------------------------------------------------------
// Levels `ecrans:` and `fiche:` (AD-niveau-1 to 5): which screen tests a `{base}..HEAD` change plays.
// Pure functions over a list of repository paths and a `lire(path)` reader; the CLI at the bottom
// (`--liste ecrans|fiche <base>`) feeds them from git and prints the chosen files, one per line.
// ---------------------------------------------------------------------------------------------

const PAGE = /^frontend\/src\/ecrans\/([^/]+)\.tsx$/;
const TEST_ECRAN = /^src\/e2e\/[^/]+\.test\.ts$/;
const HARNAIS = /^src\/e2e\/(harnais[^/]*\.ts|fixtures\/.*)$/;

/**
 * AD-niveau-3: paths no page reaches that touch no screen. Matched by path, after the import graph
 * (a server module a page imports is reached, hence not here). `rust/` is deliberately absent.
 */
export const HORS_ECRAN = [
  (f) => f.startsWith('docs/'),
  (f) => ['README.md', 'ARCHITECTURE.md', 'CLAUDE.md'].includes(f),
  (f) => f.startsWith('.agent/'),
  (f) => f.startsWith('.github/'),
  (f) => f.startsWith('scripts/'),
  (f) => f.endsWith('.test.ts'), // a screen test is handled before this list
  (f) => f.startsWith('src/') && !f.startsWith('src/e2e/'),
];

/** AD-niveau-1: screen name → page file, from the repository's paths. */
export function ecransDe(fichiers) {
  const ecrans = new Map();
  for (const f of fichiers) { const m = PAGE.exec(f); if (m) ecrans.set(m[1], f); }
  return ecrans;
}

/** True for a screen test file (a test under `src/e2e/`). */
export function estTestEcran(f) { return TEST_ECRAN.test(f); }

const EXTENSIONS = ['', '.ts', '.tsx', '.css', '/index.ts', '/index.tsx'];

/** Relative specifiers of a source: `import … from`, `import '…'`, `export … from`, `import('…')`. */
export function specifieurs(source) {
  const res = [
    /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  ];
  const out = new Set();
  for (const re of res) for (const m of source.matchAll(re)) if (m[2].startsWith('.')) out.add(m[2]);
  return [...out];
}

function normaliser(chemin) {
  const sortie = [];
  for (const p of chemin.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') { if (!sortie.length) return null; sortie.pop(); } else sortie.push(p);
  }
  return sortie.join('/');
}

/** Resolves `spec` imported from `depuis` to a file of `existants`, or null. `./x.js` may be `x.ts`/`x.tsx`. */
export function resoudreImport(spec, depuis, existants) {
  const base = normaliser(depuis.split('/').slice(0, -1).join('/') + '/' + spec.split('?')[0]);
  if (base === null) return null;
  const formes = [base];
  if (/\.m?js$/.test(base)) formes.push(base.replace(/\.m?js$/, '.ts'), base.replace(/\.m?js$/, '.tsx'));
  for (const f of formes) for (const ext of EXTENSIONS) if (existants.has(f + ext)) return f + ext;
  return null;
}

/** AD-niveau-2: screen name → set of files its page reaches (itself included), read from the sources. */
export function grapheDesPages(fichiers, lire = (f) => readFileSync(f, 'utf8')) {
  const existants = new Set(fichiers);
  const suivants = new Map();
  const voisins = (f) => {
    if (!suivants.has(f)) {
      const cibles = /\.(tsx?|mjs|js)$/.test(f)
        ? specifieurs(lire(f)).map((s) => resoudreImport(s, f, existants)).filter(Boolean)
        : [];
      suivants.set(f, cibles);
    }
    return suivants.get(f);
  };
  const graphe = new Map();
  for (const [nom, page] of ecransDe(fichiers)) {
    const vus = new Set([page]);
    const pile = [page];
    while (pile.length) for (const g of voisins(pile.pop())) if (!vus.has(g)) { vus.add(g); pile.push(g); }
    graphe.set(nom, vus);
  }
  return graphe;
}

/** AD-niveau-4: the screens a screen test names in its leading `// ecrans: a, b` line; null when it has none. */
export function ecransDeclares(source, ecransConnus, fichier = '') {
  for (const ligne of source.split(/\r?\n/)) {
    const l = ligne.trim();
    if (l === '') continue;
    if (!l.startsWith('//')) return null;
    const m = /^\/\/\s*ecrans\s*:(.*)$/.exec(l);
    if (!m) continue;
    const noms = m[1].split(',').map((n) => n.trim());
    if (noms.some((n) => n === '')) throw new Error(`${fichier}: « // ecrans: » names an empty screen.`);
    const inconnus = noms.filter((n) => !ecransConnus.has(n));
    if (inconnus.length) throw new Error(`${fichier}: unknown screen ${inconnus.map((n) => `« ${n} »`).join(', ')} in « // ecrans: ».`);
    return [...new Set(noms)];
  }
  return null;
}

/** The screens touched by the changed files `touches` (AD-niveau-2 and 3): a Set of screen names. */
export function ecransTouches(touches, fichiers, lire) {
  const ecrans = ecransDe(fichiers);
  const graphe = grapheDesPages(fichiers, lire);
  const touchesTous = new Set(ecrans.keys());
  const atteints = new Set();
  for (const f of touches) {
    if (HARNAIS.test(f)) { touchesTous.forEach((n) => atteints.add(n)); continue; }
    if (TEST_ECRAN.test(f)) continue; // selected itself, touches no screen
    const lies = [...graphe].filter(([, vus]) => vus.has(f)).map(([n]) => n);
    if (lies.length) { lies.forEach((n) => atteints.add(n)); continue; }
    const m = PAGE.exec(f);
    if (m) { atteints.add(m[1]); continue; } // a deleted page
    if (HORS_ECRAN.some((regle) => regle(f))) continue;
    touchesTous.forEach((n) => atteints.add(n)); // unknown path: when in doubt, we play
  }
  return atteints;
}

/** AD-niveau-4 and 5: the screen test files to play for `touches`, sorted. */
export function choisirTestsEcran(touches, fichiers, lire = (f) => readFileSync(f, 'utf8')) {
  const connus = ecransDe(fichiers);
  const atteints = ecransTouches(touches, fichiers, lire);
  const modifies = new Set(touches);
  return fichiers
    .map((f) => f.split('\\').join('/'))
    .filter((f) => TEST_ECRAN.test(f))
    .filter((f) => {
      const declares = ecransDeclares(lire(f), connus, f); // an unknown name is an error, chosen or not
      if (modifies.has(f)) return true;
      if (!atteints.size) return false;
      return declares === null || declares.some((n) => atteints.has(n));
    })
    .sort();
}

/** Files of a level: `ecrans` = the chosen screen tests; `fiche` = the suite minus the screen tests not chosen. */
export function choisirNiveau(niveau, touches, fichiers, lire) {
  const ecrans = choisirTestsEcran(touches, fichiers, lire);
  if (niveau === 'ecrans') return ecrans;
  const gardes = new Set(ecrans);
  return choisirFichiers(fichiers.filter((f) => f.startsWith('src/') || f.startsWith('frontend/src/')))
    .filter((f) => !TEST_ECRAN.test(f) || gardes.has(f));
}

// CLI: node scripts/niveaux-tests.mjs --liste ecrans|fiche <base>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [drapeau, niveau, base] = process.argv.slice(2);
  if (drapeau !== '--liste' || !['ecrans', 'fiche'].includes(niveau) || !base) {
    console.error('Usage: node scripts/niveaux-tests.mjs --liste ecrans|fiche <base>');
    process.exit(2);
  }
  const git = (...a) => {
    const r = spawnSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) { console.error(`git ${a.join(' ')} failed: ${(r.stderr || '').trim()}`); process.exit(2); }
    return r.stdout.split('\n').filter(Boolean);
  };
  const touches = git('diff', '--name-only', base, 'HEAD');
  const fichiers = git('ls-files');
  try {
    const choisis = choisirNiveau(niveau, touches, fichiers, (f) => readFileSync(f, 'utf8'));
    if (choisis.length) console.log(choisis.join('\n'));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
