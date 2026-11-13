// Image check (AD-rust-5): copied to dist/wasm/verifier.mjs by `npm run build`, run by the last Dockerfile step.
// Loads the example module from its own directory and exits non-zero on a missing module or a wrong value.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Pinned by the Rust test of rust/modules/exemple (fnv1a_kanevas_epingle).
const ATTENDU = 3_485_111_814;

try {
  const dossier = join(dirname(fileURLToPath(import.meta.url)), 'exemple');
  const octets = readFileSync(join(dossier, 'exemple_bg.wasm'));
  const glue = await import(pathToFileURL(join(dossier, 'exemple.js')).href);
  glue.initSync({ module: octets });
  const valeur = glue.fnv1a('kanevas');
  if (valeur !== ATTENDU) throw new Error('valeur');
  if (typeof glue.version() !== 'string' || glue.version() === '') throw new Error('version');
} catch {
  console.error('Wasm check failed: the example module is missing, unreadable or returns a wrong value.');
  process.exit(1);
}
console.log('Wasm check passed.');
