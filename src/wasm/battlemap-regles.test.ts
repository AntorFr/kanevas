// AD-battlemap-editeur-9: a rule of the map (a limit constant) exists in the core only — never a second copy
// in `src/` or `frontend/src/`. The core's own generated glue (rust/pkg) is outside these two folders.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../..', import.meta.url));
function fichiers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

test('aucune constante de limite de la carte hors du cœur', () => {
  const motif = /\b(ELEMENTS_MAX|CALQUES_MAX|LARGEUR_MAX|HAUTEUR_MAX|ECHELLE_MIN|ECHELLE_MAX|DOCUMENT_OCTETS_MAX)\b/;
  const soi = fileURLToPath(import.meta.url);
  for (const f of [...fichiers(join(racine, 'src')), ...fichiers(join(racine, 'frontend/src'))]) {
    if (f === soi) continue;
    assert.ok(!motif.test(readFileSync(f, 'utf8')), `${f} carries a limit of the map core`);
  }
});
