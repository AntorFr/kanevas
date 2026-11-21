// Pure logic of the screen-test inventory guard (`src/scripts-tests/inventaire-ecrans.test.ts`).
// The inventory is `docs/tests-ecran/lot-*.md`, one table row per test of `src/e2e/` (method:
// `docs/tests-ecran/README.md`). Titles are read as `scripts/rejouer-tests.mjs` does: literal titles of
// `describe` / `test` / `it` calls, the `${…}` of a template kept as written.
import { cheminDeclare } from './niveaux-tests.mjs';

const SEP = ' > ';
const CLASSES = ['affichage', 'effet', 'les deux'];
const APPEL = /(?<![.\w$])(describe|suite|it|test)(?:\.(?:skip|only|todo))?\(\s*(['"`])((?:\\.|(?!\2)[^\\\n])*)\2/g;

/** Unescapes the quote and backslash escapes of a literal title. */
function defaire(titre) {
  return titre.replace(/\\(['"`\\])/g, '$1');
}

/** The literal titles of the tests (`test` / `it`) a source declares, in order of appearance. */
export function titresDeTests(source) {
  const titres = [];
  for (const m of source.matchAll(APPEL)) if (m[1] === 'test' || m[1] === 'it') titres.push(defaire(m[3]));
  return titres;
}

/** The rows of the inventory tables found in a Markdown text: `{ fichier, test, classe, porte, decision }`. */
export function lignesInventaire(markdown) {
  const lignes = [];
  for (const l of markdown.split('\n')) {
    if (!l.startsWith('| `src/e2e/')) continue;
    const p = l.replace(/^\| /, '').replace(/ \|\s*$/, '').split(' | ');
    if (p.length !== 5) throw new Error(`Inventory row without five cells: ${l.slice(0, 120)}`);
    // A cell is Markdown: `\|` is a pipe, and a parameterised test carries a trailing « *(parameterised)* » note.
    const nu = (t) => t.replace(/\\\|/g, '|').replace(/^`|`$/g, '').replace(/ \*\(parameterised\)\*$/, '');
    lignes.push({ fichier: nu(p[0]), test: nu(p[1]), classe: p[2], porte: p[3].replace(/\\\|/g, '|'), decision: p[4] });
  }
  return lignes;
}

/** One door, `{ fichier, titre }`. Two shapes exist: `` `f` : `t` `` and `` `f : t` ``; `titre` is '' when only a file is named. */
function uneporte(texte) {
  const m = /^`?(src\/[^\s`]+\.test\.ts)`?(?:\s*:\s*(.*))?$/.exec(texte.trim());
  if (!m) return { fichier: null, titre: texte };
  return { fichier: m[1], titre: (m[2] ?? '').replace(/^`|`$/g, '') };
}

/** The doors of a row's cell: `[]` for `—`, else one per `` ` ; ` `` separated door. */
export function portesDe(cellule) {
  if (cellule.trim() === '—') return [];
  return cellule.split(/`?\s;\s`?(?=src\/)/).map(uneporte);
}

/**
 * The faults of an inventory against the repository. `fichiersEcran`: the paths of `src/e2e/*.test.ts`;
 * `lire(path)`: the source of a file, or null when it does not exist. Returns a list of sentences, empty when whole.
 */
export function controler(lignes, fichiersEcran, lire) {
  const fautes = [];
  const parFichier = new Map();
  for (const l of lignes) {
    if (!parFichier.has(l.fichier)) parFichier.set(l.fichier, []);
    parFichier.get(l.fichier).push(l);
  }
  for (const f of fichiersEcran) {
    const source = lire(f);
    const lignesDuFichier = parFichier.get(f) ?? [];
    const titres = new Set(titresDeTests(source ?? ''));
    if (titres.size === 0) continue; // helpers and document checks with no literal test: nothing to list
    if (lignesDuFichier.length === 0) {
      fautes.push(`${f}: no line in docs/tests-ecran/lot-*.md`);
      continue;
    }
    for (const titre of titres) {
      const couvert = lignesDuFichier.some((l) => l.test === titre || l.test.endsWith(SEP + titre));
      if (!couvert) fautes.push(`${f}: test « ${titre} » has no line in the inventory`);
    }
  }
  for (const l of lignes) {
    if (!CLASSES.includes(l.classe)) fautes.push(`${l.fichier}: unknown class « ${l.classe} » for « ${l.test} »`);
    if (l.classe === 'affichage') continue;
    const portes = portesDe(l.porte);
    if (portes.length === 0) {
      // An effect with no door is kept on screen and says why (README: `gardé — no door: …`); a « les deux »
      // line with no door says, after its decision, what could not be carried over.
      const motif = l.decision.includes(' — ');
      if (l.classe === 'effet' && !l.decision.startsWith('gardé')) fautes.push(`${l.fichier}: « ${l.test} » is an effect with no door and is not « gardé »`);
      if (l.classe === 'les deux' && !motif) fautes.push(`${l.fichier}: « ${l.test} » has no door and gives no reason after its decision`);
      continue;
    }
    for (const porte of portes) {
      if (!porte.fichier || porte.fichier.startsWith('src/e2e/')) {
        fautes.push(`${l.fichier}: door of « ${l.test} » is not an out-of-screen test file: ${l.porte.slice(0, 120)}`);
        continue;
      }
      const source = lire(porte.fichier);
      if (source === null) fautes.push(`${l.fichier}: door file ${porte.fichier} of « ${l.test} » does not exist`);
      else if (porte.titre === '') fautes.push(`${l.fichier}: door of « ${l.test} » names the file ${porte.fichier} but no test`);
      else if (!cheminDeclare(porte.titre, source)) fautes.push(`${l.fichier}: door « ${porte.titre.slice(0, 100)} » of « ${l.test.slice(0, 80)} » is not declared in ${porte.fichier}`);
    }
  }
  return fautes;
}
