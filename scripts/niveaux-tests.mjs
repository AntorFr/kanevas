// Pure logic shared by `tests-attestes.mjs` (levels of the suite) and `rejouer-tests.mjs`
// (replay of named tests). Plain .mjs: `node scripts/rejouer-tests.mjs` runs without tsx.
import { readFileSync } from 'node:fs';

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
      parFichier.get(f).add(nomPropre(nom));
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

/** Anchored regex source for `--test-name-pattern`: the name alone or after its suites' names. */
export function motif(nom) {
  return `(^| )${nom.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}$`;
}
