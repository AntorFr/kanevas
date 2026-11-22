// Pure logic shared by `tests-attestes.mjs` (levels of the suite) and `rejouer-tests.mjs`
// (replay of named tests). Plain .mjs: `node scripts/rejouer-tests.mjs` runs without tsx.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Found by walking up from this file, then required by absolute path: a bare `require('typescript')` reads the
// nearest package.json, and one under edit (even broken) must not stop the choice.
function chargerTypeScript() {
  const require = createRequire(import.meta.url);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidat = join(dir, 'node_modules', 'typescript', 'lib', 'typescript.js');
    if (existsSync(candidat)) return createRequire(candidat)(candidat); // parent = typescript itself, not this repository
    const haut = dirname(dir);
    if (haut === dir) return require('typescript');
    dir = haut;
  }
}
const ts = chargerTypeScript();

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
 * (a server module a page imports is reached, hence not here). `rust/` is here for what no `wasm:*` node links
 * (AD-touches-5): a module no page loads, the Cargo files when no page loads any; the graph decides first.
 */
export const HORS_ECRAN = [
  (f) => f.startsWith('docs/'),
  (f) => ['README.md', 'ARCHITECTURE.md', 'CLAUDE.md'].includes(f),
  (f) => f.startsWith('.agent/'),
  (f) => f.startsWith('.github/'),
  (f) => f.startsWith('scripts/'),
  (f) => f.startsWith('rust/'),
  (f) => f === 'frontend/src/wasm/charger.ts', // the loader follows the ordinary graph (AD-touches-5): reached by a page it touches that page, else no screen
  (f) => f.startsWith('frontend/src/wasm/essai/'), // the proof page of the Wasm path (AD-rust-7), served by its test only
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

const SOURCE_JS = /\.(mjs|js)$/;
const SOURCE = /\.(tsx?|mjs|js)$/;

function nomDe(n) { return n.text ?? n.escapedText; }

function nomsLies(nom, sortie) {
  if (nom.kind === ts.SyntaxKind.Identifier) { sortie.add(nom.text); return; }
  for (const e of nom.elements) if (e.name) nomsLies(e.name, sortie);
}

/**
 * AD-touches-1: what a source declares, read with the TypeScript parser (a comment, a string or a template
 * that looks like an import is not one).
 * - `imports`: edges `{ spec, noms }`, `noms` = the named symbols taken, or `true` for « all » (side effect,
 *   default, namespace, `import()`, `import x = require()`); type-only imports are not edges (AD-touches-3).
 * - `reexports`: `{ spec, type, star }`, `{ spec, type, paires: [[original, exported]] }` or `{ spec, type, ns }`.
 * - `exportes`: names this file declares; `doute`: a form the parser cannot enumerate (`export =`).
 * - `modules`: literal names of `chargerModule('<m>')` calls; `modulesTous`: a call whose name is not literal (AD-touches-5).
 * - `globs`: `import.meta.glob` calls, `{ motifs }` (strings) or `{ motifs: null }` when not literal (AD-touches-4).
 */
export function analyser(source, fichier = 'x.ts') {
  const genre = /\.tsx$/.test(fichier) ? ts.ScriptKind.TSX : SOURCE_JS.test(fichier) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, false, genre);
  const out = { imports: [], reexports: [], exportes: new Set(), doute: false, globs: [], types: [], modules: [], modulesTous: false };
  const K = ts.SyntaxKind;
  const exporte = (n) => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []).some((m) => m.kind === K.ExportKeyword);
  const defaut = (n) => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []).some((m) => m.kind === K.DefaultKeyword);
  for (const s of sf.statements) {
    if (s.kind === K.ImportDeclaration && ts.isStringLiteralLike(s.moduleSpecifier)) {
      const spec = s.moduleSpecifier.text;
      const c = s.importClause;
      if (!c) { out.imports.push({ spec, noms: true }); continue; }
      if (c.isTypeOnly) { out.types.push(spec); continue; }
      if (c.name || (c.namedBindings && c.namedBindings.kind === K.NamespaceImport)) { out.imports.push({ spec, noms: true }); continue; }
      const elements = c.namedBindings ? c.namedBindings.elements : [];
      const valeurs = elements.filter((e) => !e.isTypeOnly);
      if (elements.length && !valeurs.length) { out.types.push(spec); continue; } // every specifier typed: erased by the build
      out.imports.push({ spec, noms: new Set(valeurs.map((e) => nomDe(e.propertyName ?? e.name))) });
    } else if (s.kind === K.ImportEqualsDeclaration) {
      const r = s.moduleReference;
      if (r.kind === K.ExternalModuleReference && ts.isStringLiteralLike(r.expression)) out.imports.push({ spec: r.expression.text, noms: true });
      if (exporte(s)) out.exportes.add(s.name.text);
    } else if (s.kind === K.ExportDeclaration) {
      const c = s.exportClause;
      if (s.moduleSpecifier && ts.isStringLiteralLike(s.moduleSpecifier)) {
        const spec = s.moduleSpecifier.text;
        const type = !!s.isTypeOnly;
        if (type) out.types.push(spec);
        if (!c) out.reexports.push({ spec, type, star: true });
        else if (c.kind === K.NamespaceExport) { out.reexports.push({ spec, type, ns: nomDe(c.name) }); out.exportes.add(nomDe(c.name)); }
        else {
          const paires = c.elements.map((e) => [nomDe(e.propertyName ?? e.name), nomDe(e.name), type || e.isTypeOnly]);
          for (const p of paires) out.exportes.add(p[1]);
          out.reexports.push({ spec, type, paires });
        }
      } else if (c && c.kind === K.NamedExports) {
        for (const e of c.elements) out.exportes.add(nomDe(e.name));
      }
    } else if (s.kind === K.ExportAssignment) {
      if (s.isExportEquals) out.doute = true; else out.exportes.add('default');
    } else if (exporte(s)) {
      if (defaut(s)) out.exportes.add('default');
      else if (s.kind === K.VariableStatement) for (const d of s.declarationList.declarations) nomsLies(d.name, out.exportes);
      else if (s.name) out.exportes.add(nomDe(s.name));
    }
  }
  const visiter = (n) => {
    if (n.kind === K.CallExpression) {
      const e = n.expression;
      if (e.kind === K.ImportKeyword) {
        const a = n.arguments[0];
        if (a && ts.isStringLiteralLike(a)) out.imports.push({ spec: a.text, noms: true });
      } else if (e.kind === K.Identifier && e.text === 'chargerModule') {
        const a = n.arguments[0];
        if (a && ts.isStringLiteralLike(a)) out.modules.push(a.text); else out.modulesTous = true;
      } else if (ts.isPropertyAccessExpression(e) && e.name.text === 'glob' && ts.isMetaProperty(e.expression)
        && e.expression.keywordToken === K.ImportKeyword) {
        const a = n.arguments[0];
        let motifs = null;
        if (a && ts.isStringLiteralLike(a)) motifs = [a.text];
        else if (a && ts.isArrayLiteralExpression(a) && a.elements.every((x) => ts.isStringLiteralLike(x))) motifs = a.elements.map((x) => x.text);
        out.globs.push({ motifs });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out;
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

/** A glob (`*`, `**`, `?`, `{a,b}`) as an anchored regex over a normalised path. */
export function globVersRegex(motif) {
  let re = '';
  let accolades = 0;
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i];
    if (c === '*') {
      if (motif[i + 1] === '*') {
        i++;
        if (motif[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { accolades++; re += '(?:'; }
    else if (c === '}' && accolades) { accolades--; re += ')'; }
    else if (c === ',' && accolades) re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Files a glob call loads (AD-touches-4): its patterns resolved from `depuis`, `!` subtracting; not literal = the whole folder. */
export function fichiersDuGlob(motifs, depuis, fichiers) {
  const dossier = depuis.split('/').slice(0, -1).join('/');
  if (!motifs) return fichiers.filter((f) => f !== depuis && (dossier === '' || f.startsWith(dossier + '/')));
  const resolu = (m) => (m.startsWith('.') ? normaliser(dossier + '/' + m) : null);
  const garder = [];
  const retirer = [];
  for (const m of motifs) {
    const neg = m.startsWith('!');
    const r = resolu(neg ? m.slice(1) : m);
    if (r === null) return fichiersDuGlob(null, depuis, fichiers); // not resolvable from here: in doubt, the folder
    (neg ? retirer : garder).push(globVersRegex(r));
  }
  return fichiers.filter((f) => garder.some((re) => re.test(f)) && !retirer.some((re) => re.test(f)));
}

const CHARGEUR = 'frontend/src/wasm/charger.ts';
const MODULE_RUST = /^rust\/modules\/([^/]+)\//;
/** The directory `rust/modules/battlemap-core` holds the crate `battlemap_core`: the loader and the glue name it with underscores (`chargerModule` only accepts `[a-z0-9_]`). */
const nomDeModule = (dossier) => dossier.replace(/-/g, '_');
const GLUE_RUST = /^rust\/pkg\/([^/]+)\//;
const CARGO = ['rust/Cargo.toml', 'rust/Cargo.lock', 'rust/rust-toolchain.toml'];

/** AD-touches-5: the `wasm:<m>` nodes a file is linked to (its literal `chargerModule` calls, its imports of the glue); the loader names every module in one table and links to none. */
function noeudsWasm(f, a, modulesConnus) {
  if (f === CHARGEUR) return [];
  const noms = new Set(a.modules);
  if (a.modulesTous) modulesConnus.forEach((m) => noms.add(m));
  const dossier = f.split('/').slice(0, -1).join('/');
  for (const spec of [...a.imports.map((i) => i.spec), ...a.reexports.filter((r) => !r.type).map((r) => r.spec)]) {
    if (!spec.startsWith('.')) continue;
    const m = GLUE_RUST.exec(normaliser(dossier + '/' + spec) ?? '');
    if (m) noms.add(m[1]);
  }
  return [...noms].map((m) => `wasm:${m}`);
}

/** AD-niveau-2 and AD-touches-1 to 5: screen name → set of files its page reaches (itself included), read from the sources. */
export function grapheDesPages(fichiers, lire = (f) => readFileSync(f, 'utf8')) {
  return lireGraphe(fichiers, lire).graphe;
}

/**
 * The graph and the `ecartes`: files a page sees only through a link the build erases or a symbol it does not
 * import (type-only import, unused member of a barrel). They touch no screen, instead of the « unknown path » default.
 */
/** Parse, resolution and export enumeration over a reader (shared by the graph and by the barrel rule, AD-ecrans-ui-3). */
function outilsModules(fichiers, lire) {
  const existants = new Set(fichiers);
  const analyses = new Map();
  const analyse = (f) => {
    if (!analyses.has(f)) analyses.set(f, SOURCE.test(f) ? analyser(lire(f), f) : null);
    return analyses.get(f);
  };
  const cible = (spec, f) => (spec.startsWith('.') ? resoudreImport(spec, f, existants) : null);
  const exports_ = new Map();
  /** Names a module exports, following its re-exports; `doute` when a link cannot be enumerated. */
  const exportsDe = (f) => {
    if (exports_.has(f)) return exports_.get(f);
    const res = { noms: new Set(), doute: false };
    exports_.set(f, res); // a cycle sees the partial answer
    const a = analyse(f);
    if (!a) return res;
    a.exportes.forEach((n) => res.noms.add(n));
    if (a.doute) res.doute = true;
    for (const r of a.reexports) {
      if (!r.star) continue;
      const t = cible(r.spec, f);
      if (!t || !analyse(t)) { res.doute = true; continue; }
      const e = exportsDe(t);
      e.noms.forEach((n) => { if (n !== 'default') res.noms.add(n); });
      if (e.doute) res.doute = true;
    }
    return res;
  };
  return { analyse, cible, exportsDe };
}

export function lireGraphe(fichiers, lire) {
  const { analyse, cible, exportsDe } = outilsModules(fichiers, lire);
  const modulesConnus = new Set(fichiers.map((f) => MODULE_RUST.exec(f)?.[1]).filter(Boolean).map(nomDeModule));
  const graphe = new Map();
  const demandes = new Map(); // screen → (file → Set of names demanded, or true), AD-ecrans-ui-1
  for (const [nom, page] of ecransDe(fichiers)) {
    const demande = new Map(); // file → Set of names demanded, or true (all)
    const demander = (f, noms) => {
      const cur = demande.get(f);
      let delta;
      if (cur === true) return;
      if (!cur) { demande.set(f, noms === true ? true : new Set(noms)); delta = noms; }
      else if (noms === true) { demande.set(f, true); delta = true; }
      else { delta = new Set([...noms].filter((n) => !cur.has(n))); if (!delta.size) return; delta.forEach((n) => cur.add(n)); }
      const a = analyse(f);
      if (!a) return;
      if (!cur) {
        for (const i of a.imports) { const t = cible(i.spec, f); if (t) demander(t, i.noms); }
        for (const g of a.globs) for (const t of fichiersDuGlob(g.motifs, f, fichiers)) demander(t, true);
        for (const w of noeudsWasm(f, a, modulesConnus)) demander(w, true);
      }
      const tous = delta === true;
      const dispo = tous ? null : exportsDe(f);
      // A symbol no module of the chain declares: in doubt, every re-export is followed.
      const doute = !tous && [...delta].some((n) => !dispo.noms.has(n));
      for (const r of a.reexports) {
        if (r.type) continue;
        const t = cible(r.spec, f);
        if (!t) continue;
        if (r.star) {
          if (tous || doute || dispo.doute || [...delta].some((n) => exportsDe(t).noms.has(n) || exportsDe(t).doute)) demander(t, delta);
        } else if (r.ns !== undefined) {
          if (tous || doute || delta.has(r.ns)) demander(t, true);
        } else {
          const pris = r.paires.filter(([, exp, type]) => !type && (tous || doute || delta.has(exp)));
          if (pris.length) demander(t, new Set(pris.map(([orig]) => orig)));
        }
      }
    };
    demander(page, true);
    graphe.set(nom, new Set(demande.keys()));
    demandes.set(nom, demande);
  }
  // Everything the pages see with no filter: every import, type-only ones and every re-export included.
  const vusTous = new Set();
  const pile = [...ecransDe(fichiers).values()];
  while (pile.length) {
    const f = pile.pop();
    if (vusTous.has(f)) continue;
    vusTous.add(f);
    const a = analyse(f);
    if (!a) continue;
    const specs = [...a.imports.map((i) => i.spec), ...a.reexports.map((r) => r.spec), ...a.types];
    for (const spec of specs) { const t = cible(spec, f); if (t) pile.push(t); }
    for (const g of a.globs) pile.push(...fichiersDuGlob(g.motifs, f, fichiers));
  }
  const utiles = new Set();
  for (const v of graphe.values()) v.forEach((f) => utiles.add(f));
  const ecartes = new Set([...vusTous].filter((f) => !utiles.has(f)));
  return { graphe, ecartes, demandes };
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


const SURS_PACKAGE = new Set(['name', 'description', 'keywords', 'license', 'author', 'repository', 'homepage', 'bugs', 'private']);
const SURS_SCRIPTS = (n) => ['test', 'typecheck', 'controle-langue'].includes(n) || n.startsWith('tests:') || n.startsWith('import:');

/** AD-ecrans-ui-2: true when only whitelisted keys of `package.json` differ between the two texts; false in any doubt. */
function packageSans(base, tete) {
  let a, b;
  try { a = JSON.parse(base); b = JSON.parse(tete); } catch { return false; }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    if (k === 'scripts') {
      const sa = a.scripts ?? {}, sb = b.scripts ?? {};
      if (typeof sa !== 'object' || typeof sb !== 'object' || Array.isArray(sa) || Array.isArray(sb)) return false;
      for (const n of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
        if (sa[n] !== sb[n] && !SURS_SCRIPTS(n)) return false;
      }
    } else if (!SURS_PACKAGE.has(k)) return false;
  }
  return true;
}

const BARREL = 'frontend/src/ui/index.ts';

/** Top-level statements of a source, split into `export … from` statements (texts) and the rest (texts, in order). */
function instructions(source, fichier) {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const exports = [], reste = [];
  for (const s of sf.statements) {
    if (s.kind === ts.SyntaxKind.ExportDeclaration && s.moduleSpecifier) exports.push(s.getText(sf)); else reste.push(s.getText(sf));
  }
  return { exports, reste };
}

/**
 * AD-ecrans-ui-3: the names touched by a barrel whose only change is `export … from` statements, or null in any doubt
 * (another statement changed, a module that cannot be enumerated or read).
 */
function nomsDuBarrel(fichiers, lire, lireBase) {
  try {
    const base = lireBase(BARREL), tete = lire(BARREL);
    if (base == null || tete == null) return null;
    const b = instructions(base, BARREL), t = instructions(tete, BARREL);
    if (b.reste.length !== t.reste.length || b.reste.some((x, i) => x !== t.reste[i])) return null;
    // A reordering of the statements both versions hold is not an addition or a removal: in doubt, every screen.
    const dansB = new Set(b.exports), dansT = new Set(t.exports);
    const ordreB = b.exports.filter((x) => dansT.has(x)), ordreT = t.exports.filter((x) => dansB.has(x));
    if (ordreB.length !== ordreT.length || ordreB.some((x, i) => x !== ordreT[i])) return null;
    const compte = new Map();
    for (const x of t.exports) compte.set(x, (compte.get(x) ?? 0) + 1);
    for (const x of b.exports) compte.set(x, (compte.get(x) ?? 0) - 1);
    const outilsTete = outilsModules(fichiers, lire);
    const outilsBase = outilsModules(fichiers, (f) => { const c = lireBase(f); if (c == null) throw new Error('unreadable'); return c; });
    const noms = new Set();
    for (const [texte, n] of compte) {
      if (n === 0) continue;
      const outils = n > 0 ? outilsTete : outilsBase;
      const r = analyser(texte, BARREL).reexports[0];
      if (!r) return null;
      if (r.ns !== undefined) { noms.add(r.ns); continue; }
      if (r.paires) { r.paires.forEach((p) => noms.add(p[1])); continue; }
      const cib = outils.cible(r.spec, BARREL);
      if (!cib || !outils.analyse(cib)) return null;
      const e = outils.exportsDe(cib);
      if (e.doute) return null;
      e.noms.forEach((x) => { if (x !== 'default') noms.add(x); });
    }
    const declares = new Set([...outilsTete.exportsDe(BARREL).noms, ...outilsBase.exportsDe(BARREL).noms]);
    return { noms, declares };
  } catch {
    return null;
  }
}


const DOSSIER_UI = 'frontend/src/ui/';

/** Binding of a top-level statement, for the declaration rule: `noms` bound (exported names for an export clause), `propage` (it can depend on a local name), `type` (erased by the build); null when it binds no name. */
function liaisonDe(s) {
  const K = ts.SyntaxKind;
  const mods = ts.canHaveModifiers(s) ? ts.getModifiers(s) ?? [] : [];
  const noms = new Set();
  if (s.kind === K.ImportDeclaration) {
    const c = s.importClause;
    if (!c) return null;
    if (c.name) noms.add(c.name.text);
    if (c.namedBindings) { if (c.namedBindings.kind === K.NamespaceImport) noms.add(c.namedBindings.name.text); else c.namedBindings.elements.forEach((e) => noms.add(e.name.text)); }
    return { noms, propage: false, type: false };
  }
  if (s.kind === K.ImportEqualsDeclaration) return { noms: new Set([s.name.text]), propage: true, type: false };
  if (s.kind === K.ExportDeclaration) {
    const c = s.exportClause;
    if (s.moduleSpecifier && !c) return null;
    if (c && c.kind === K.NamespaceExport) noms.add(nomDe(c.name));
    else if (c) c.elements.forEach((e) => noms.add(nomDe(e.name)));
    return { noms, propage: !s.moduleSpecifier, type: false };
  }
  if (s.kind === K.ExportAssignment) return s.isExportEquals ? null : { noms: new Set(['default']), propage: true, type: false };
  if (mods.some((m) => m.kind === K.DeclareKeyword) && s.kind === K.ModuleDeclaration) return null;
  if (s.kind === K.VariableStatement) s.declarationList.declarations.forEach((d) => nomsLies(d.name, noms));
  else if (s.kind === K.InterfaceDeclaration || s.kind === K.TypeAliasDeclaration) return { noms: new Set([s.name.text]), propage: true, type: true };
  else if ([K.FunctionDeclaration, K.ClassDeclaration, K.EnumDeclaration].includes(s.kind) || (s.kind === K.ModuleDeclaration && ts.isIdentifier(s.name))) {
    if (s.name) noms.add(s.name.text);
    if (mods.some((m) => m.kind === K.DefaultKeyword)) noms.add('default');
  } else return null;
  return noms.size ? { noms, propage: true, type: false } : null;
}

function identifiants(n, sortie) {
  if (n.kind === ts.SyntaxKind.Identifier) sortie.add(n.text);
  ts.forEachChild(n, (c) => { identifiants(c, sortie); });
  return sortie;
}

/**
 * AD-ecrans-ui-4: the exported names a touched module changes between `base` and `tete`, or null in any doubt
 * (a file that does not parse, a changed statement that binds no name, `export =`, `export *`).
 */
function nomsDeclares(base, tete, fichier) {
  try {
    const genre = fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const lire_ = (src) => ts.createSourceFile(fichier, src, ts.ScriptTarget.Latest, false, genre);
    const sb = lire_(base), st = lire_(tete);
    if ((sb.parseDiagnostics ?? []).length || (st.parseDiagnostics ?? []).length) return null;
    const textes = (sf) => sf.statements.map((s) => ({ s, t: s.getText(sf) }));
    const lb = textes(sb), lt = textes(st);
    const compte = new Map();
    for (const { t } of lt) compte.set(t, (compte.get(t) ?? 0) + 1);
    for (const { t } of lb) compte.set(t, (compte.get(t) ?? 0) - 1);
    const changes = new Set();
    const types = new Map(); // name → true while every statement binding it is a type
    const noter = (x) => { const l = liaisonDe(x.s); if (l) for (const n of l.noms) types.set(n, (types.get(n) ?? true) && l.type); return l; };
    const restant = new Map(compte);
    for (const x of lb) {
      const l = noter(x);
      if (compte.get(x.t) < 0 && restant.get(x.t) < 0) {
        restant.set(x.t, restant.get(x.t) + 1);
        if (!l) return null;
        l.noms.forEach((n) => changes.add(n));
      }
    }
    const reste2 = new Map(compte);
    const entete = lt.map((x) => ({ ...x, l: noter(x), ids: null }));
    const nouveaux = new Set();
    for (const x of entete) {
      if (compte.get(x.t) > 0 && reste2.get(x.t) > 0) {
        reste2.set(x.t, reste2.get(x.t) - 1);
        if (!x.l) return null;
        x.l.noms.forEach((n) => changes.add(n));
        nouveaux.add(x);
      }
    }
    // Propagation: a declaration that mentions a changed name is changed too (transitively).
    for (let bouge = true; bouge;) {
      bouge = false;
      for (const x of entete) {
        if (nouveaux.has(x) || (x.l && !x.l.propage)) continue;
        x.ids ??= identifiants(x.s, new Set());
        if (![...x.ids].some((n) => changes.has(n))) continue;
        if (!x.l) return null; // a statement with no name that uses a changed name
        nouveaux.add(x);
        x.l.noms.forEach((n) => changes.add(n));
        bouge = true;
      }
    }
    const exportes = new Set([...analyser(base, fichier).exportes, ...analyser(tete, fichier).exportes]);
    if (analyser(base, fichier).doute || analyser(tete, fichier).doute) return null;
    const noms = new Set([...changes].filter((n) => exportes.has(n) && !types.get(n)));
    return { noms, declares: exportes };
  } catch {
    return null;
  }
}

const UI_CSS = 'frontend/src/ui/ui.css';

/** AD-ecrans-ui-5: a source text cut into rules `{ cle, selecteurs }` (`selecteurs` null = unbounded), throws on anything it cannot read. */
function lireRegles(texte) {
  const sans = texte.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const regles = [];
  const fin = (s, i) => { // index of the `}` closing the `{` at i, strings skipped
    let prof = 0;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '"' || c === "'") { const q = c; for (j++; j < s.length && s[j] !== q; j++) if (s[j] === '\\') j++; if (j >= s.length) throw new Error('string'); }
      else if (c === '{') prof++;
      else if (c === '}') { prof--; if (prof === 0) return j; if (prof < 0) throw new Error('brace'); }
    }
    throw new Error('unbalanced');
  };
  const corps = (b) => b.replace(/\s+/g, ' ').trim().replace(/\s*([;:{},])\s*/g, '$1').replace(/;(?=\})|;$/g, '');
  const lire = (s, prelude) => {
    let i = 0;
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) return;
      let j = i, par = 0;
      for (; j < s.length; j++) {
        const c = s[j];
        if (c === '"' || c === "'") { const q = c; for (j++; j < s.length && s[j] !== q; j++) if (s[j] === '\\') j++; }
        else if (c === '(') par++;
        else if (c === ')') par--;
        else if (par <= 0 && (c === '{' || c === ';')) break;
        else if (c === '}') throw new Error('brace');
      }
      if (j >= s.length) throw new Error('unterminated');
      const tete = s.slice(i, j).replace(/\s+/g, ' ').trim();
      if (s[j] === ';') { regles.push({ cle: `${prelude}${tete};`, selecteurs: null }); i = j + 1; continue; }
      const f = fin(s, j);
      const interieur = s.slice(j + 1, f);
      i = f + 1;
      if (tete === '') throw new Error('empty prelude');
      if (/^@(media|supports)\b/i.test(tete)) { lire(interieur, `${prelude}${tete} | `); continue; }
      const cle = `${prelude}${tete}{${corps(interieur)}}`;
      if (tete.startsWith('@') || interieur.includes('{')) { regles.push({ cle, selecteurs: null }); continue; }
      const sels = [];
      let prof = 0, debut = 0;
      for (let k = 0; k <= tete.length; k++) {
        const c = tete[k];
        if (c === '(' || c === '[') prof++;
        else if (c === ')' || c === ']') prof--;
        else if (k === tete.length || (c === ',' && prof === 0)) { sels.push(tete.slice(debut, k).trim()); debut = k + 1; }
      }
      regles.push({ cle, selecteurs: sels });
    }
  };
  lire(sans, '');
  return regles;
}

/** The classes a selector requires (those inside `:not(`, `:has(`, `:is(`, `:where(` ignored), or null when it holds a form read in doubt. */
function classesDe(selecteur) {
  if (/[\\&]|\[\s*class\b/i.test(selecteur)) return null;
  let s = selecteur.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/\[[^\]]*\]/g, '');
  for (;;) {
    const m = /:(?:not|has|is|where|matches)\(/i.exec(s);
    if (!m) break;
    let prof = 1, k = m.index + m[0].length;
    for (; k < s.length && prof; k++) { if (s[k] === '(') prof++; else if (s[k] === ')') prof--; }
    s = s.slice(0, m.index) + ' ' + s.slice(k);
  }
  return new Set([...s.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]));
}

const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
/** « Possibly used »: the class as a whole token, or one of its hyphen prefixes ending with `-` (a name built at run time). */
function peutEtreEmployee(classe, texte) {
  if (new RegExp(`(?<![\\w-])${echapper(classe)}(?![\\w-])`).test(texte)) return true;
  const parts = classe.split('-');
  for (let n = 1; n < parts.length; n++) {
    const prefixe = parts.slice(0, n).join('-') + '-';
    if (prefixe.length > 1 && new RegExp(`(?<![\\w-])${echapper(prefixe)}(?![\\w])`).test(texte)) return true;
  }
  return false;
}

/** Items of `a` and `b` outside their longest common subsequence: `{ retires, ajoutes }`. */
function differences(a, b) {
  const n = a.length, m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const retires = [], ajoutes = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) retires.push(a[i++]); else ajoutes.push(b[j++]);
  }
  while (i < n) retires.push(a[i++]);
  while (j < m) ajoutes.push(b[j++]);
  return { retires, ajoutes };
}

/**
 * AD-ecrans-ui-5: the screens (among those reaching `ui.css`) touched by the rules that changed between the two
 * versions, or null in any doubt (every screen reaching the sheet).
 */
function ecransDuCss(base, tete, fichiers, lire, graphe) {
  try {
    const rb = lireRegles(base), rt = lireRegles(tete);
    const { retires, ajoutes } = differences(rb.map((r) => r.cle), rt.map((r) => r.cle));
    const dejaRetires = new Set(retires);
    if (ajoutes.some((c) => dejaRetires.has(c))) return null; // a move changes the cascade
    const changees = [...rb.filter((r) => retires.includes(r.cle)), ...rt.filter((r) => ajoutes.includes(r.cle))];
    const alternatives = []; // each: the classes one selector requires
    for (const r of changees) {
      if (!r.selecteurs) return null;
      for (const sel of r.selecteurs) {
        const c = classesDe(sel);
        if (!c || !c.size) return null;
        alternatives.push(c);
      }
    }
    if (!alternatives.length) return new Set();
    const frontend = fichiers.filter((f) => f.startsWith('frontend/src/') && SOURCE.test(f) && !f.endsWith('.test.ts'));
    const serveur = fichiers.filter((f) => f.startsWith('src/') && f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('src/e2e/'));
    const textes = new Map();
    const texte = (f) => { if (!textes.has(f)) textes.set(f, lire(f) ?? ''); return textes.get(f); };
    const tousFront = frontend.map(texte).join('\n');
    const tousServeur = serveur.map(texte).join('\n');
    for (const classe of new Set(alternatives.flatMap((c) => [...c]))) {
      if (!peutEtreEmployee(classe, tousFront) || peutEtreEmployee(classe, tousServeur)) return null;
    }
    const atteints = new Set();
    for (const [nom, vus] of graphe) {
      if (!vus.has(UI_CSS)) continue;
      const sources = [...vus].filter((f) => SOURCE.test(f)).map(texte).join('\n');
      if (alternatives.some((c) => [...c].every((x) => peutEtreEmployee(x, sources)))) atteints.add(nom);
    }
    return atteints;
  } catch {
    return null;
  }
}

/** The screens touched by the changed files `touches` (AD-niveau-2 and 3): a Set of screen names. */
export function ecransTouches(touches, fichiers, lire, lireBase = () => null) {
  const ecrans = ecransDe(fichiers);
  const { graphe, ecartes, demandes } = lireGraphe(fichiers, lire);
  const touchesTous = new Set(ecrans.keys());
  const atteints = new Set();
  for (const f of touches) {
    if (HARNAIS.test(f)) { touchesTous.forEach((n) => atteints.add(n)); continue; }
    if (TEST_ECRAN.test(f)) continue; // selected itself, touches no screen
    if (f === 'package.json') {
      const avant = lireBase(f), apres = lire(f);
      if (avant != null && apres != null && packageSans(avant, apres)) continue; // AD-ecrans-ui-2
    }
    if (f === BARREL) {
      const lus = nomsDuBarrel(fichiers, lire, lireBase);
      if (lus) {
        for (const [nom, d] of demandes) {
          const demande = d.get(f);
          if (demande === undefined) continue;
          if (demande === true || [...demande].some((n) => lus.noms.has(n) || !lus.declares.has(n))) atteints.add(nom);
        }
        continue;
      }
    }
    if (f === UI_CSS && [...graphe.values()].some((vus) => vus.has(f))) {
      const avant = lireBase(f), apres = lire(f);
      const lus = avant != null && apres != null ? ecransDuCss(avant, apres, fichiers, lire, graphe) : null;
      if (lus) { lus.forEach((n) => atteints.add(n)); continue; }
    }
    if (f !== BARREL && f.startsWith(DOSSIER_UI) && /\.tsx?$/.test(f) && !f.endsWith('.test.ts')) {
      const reçus = [...demandes.values()].filter((d) => d.has(f));
      const avant = reçus.length ? lireBase(f) : null, apres = avant != null ? lire(f) : null;
      const lus = apres != null ? nomsDeclares(avant, apres, f) : null;
      if (lus) {
        for (const [nom, d] of demandes) {
          const demande = d.get(f);
          if (demande === undefined) continue;
          if (demande === true || [...demande].some((n) => lus.noms.has(n) || !lus.declares.has(n))) atteints.add(nom);
        }
        continue;
      }
    }
    const noeud = MODULE_RUST.exec(f);
    const atteint = (vus) => (noeud ? vus.has(`wasm:${nomDeModule(noeud[1])}`) : CARGO.includes(f) ? [...vus].some((v) => v.startsWith('wasm:')) : vus.has(f));
    const lies = [...graphe].filter(([, vus]) => atteint(vus)).map(([n]) => n);
    if (lies.length) { lies.forEach((n) => atteints.add(n)); continue; }
    const m = PAGE.exec(f);
    if (m) { atteints.add(m[1]); continue; } // a deleted page
    if (ecartes.has(f)) continue; // seen by a page only through an erased type link or a symbol it does not import
    if (HORS_ECRAN.some((regle) => regle(f))) continue;
    touchesTous.forEach((n) => atteints.add(n)); // unknown path: when in doubt, we play
  }
  return atteints;
}

/** AD-niveau-4 and 5: the screen test files to play for `touches`, sorted. */
export function choisirTestsEcran(touches, fichiers, lire = (f) => readFileSync(f, 'utf8'), lireBase = () => null) {
  const connus = ecransDe(fichiers);
  const atteints = ecransTouches(touches, fichiers, lire, lireBase);
  const modifies = new Set(touches);
  return fichiers
    .map((f) => f.split('\\').join('/'))
    .filter((f) => TEST_ECRAN.test(f))
    .filter((f) => {
      const declares = ecransDeclares(lire(f), connus, f); // an unknown name is an error, chosen or not
      if (declares === null) throw new Error(`${f}: a screen test with no « // ecrans: » line (AD-touches-6); run scripts/proposer-ecrans.mjs and keep its line.`);
      if (modifies.has(f)) return true;
      if (!atteints.size) return false;
      return declares.some((n) => atteints.has(n));
    })
    .sort();
}

/** Files of a level: `ecrans` = the chosen screen tests; `fiche` = the suite minus the screen tests not chosen. */
export function choisirNiveau(niveau, touches, fichiers, lire, lireBase = () => null) {
  const ecrans = choisirTestsEcran(touches, fichiers, lire, lireBase);
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
    const choisis = choisirNiveau(niveau, touches, fichiers, (f) => readFileSync(f, 'utf8'), (f) => {
      const r = spawnSync('git', ['show', `${base}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
      return r.status === 0 ? r.stdout : null;
    });
    if (choisis.length) console.log(choisis.join('\n'));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
