import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// AD-masquer-1: `swn_systemes.secret` decides a read in `lisibilite.ts` only. The files below write it or read it for the GM's
// own screens; any other file of `src/services/` naming the column of a system fails here.
const DOSSIER = fileURLToPath(new URL('..', import.meta.url));
const EXCEPTIONS = new Set([
  'swn/lisibilite.ts',        // the predicate, its SQL twin, `estMasque`
  'swn/ecriture-systeme.ts',  // `masquerSysteme` and `etatMasque` (the GM's state read)
  'swn/ecriture-carte.ts',    // writes of a system and of a zone
  'swn/import-galaxie.ts',    // import of a galaxy: writes and compares, GM level
  'swn/document-source.ts',   // the GM's document source
  'swn/galaxies.ts',          // row types, the trial galaxies, the zones' filter
]);

function fichiers(dossier: string, base = ''): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(`${dossier}/${e.name}`, `${base}${e.name}/`) : [`${base}${e.name}`]);
}

test('AD-masquer-1 : aucun fichier de src/services/ ne lit le secret d\'un système hors du prédicat', () => {
  const trouves: string[] = [];
  for (const f of fichiers(DOSSIER)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts') || EXCEPTIONS.has(f)) continue;
    const lignes = readFileSync(`${DOSSIER}/${f}`, 'utf8').split('\n');
    lignes.forEach((l, i) => {
      if (/\b(?:s|d|v|ligne|systeme)\.secret\b|secret\s+FROM\s+swn_systemes|SELECT[^;]*\bsecret\b[^;]*FROM\s+swn_systemes/i.test(l)) trouves.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(trouves, []);
});

test('AD-masquer-1 : lireInterieur et lecture-carte passent par le prédicat commun', () => {
  const interieur = readFileSync(`${DOSSIER}/swn/interieur.ts`, 'utf8');
  assert.match(interieur, /systemeLisible\(db, acteur, ligne\.id\)/);
  assert.doesNotMatch(interieur, /\.secret/);
});
