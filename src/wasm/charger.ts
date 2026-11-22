// Server loader of the Wasm modules (AD-rust-4). A module is loaded when the loader is first asked for it
// and cached per name (the server asks for the core when it imports services/swn/tirage-etoiles). Errors carry a fixed message: no host path, no cause.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wasmDir } from '../config/env.js';

interface Glue {
  initSync(module: { module: Uint8Array }): unknown;
}

const cache = new Map<string, unknown>();

// WASM_DIR alone when set (tests); else dist/wasm next to the compiled server, then rust/pkg of the working tree.
function dossiers(): string[] {
  const force = wasmDir();
  if (force) return [force];
  const ici = dirname(fileURLToPath(import.meta.url));
  return [ici, join(ici, '../../dist/wasm'), join(ici, '../../rust/pkg')];
}

export async function chargerModule<T = unknown>(nom: string): Promise<T> {
  const connu = cache.get(nom);
  if (connu) return connu as T;
  const erreur = () => new Error(`Wasm module "${nom}" is missing or unreadable.`);
  if (!/^[a-z][a-z0-9_]*$/.test(nom)) throw erreur();
  const dossier = dossiers()
    .map((d) => join(d, nom))
    .find((d) => existsSync(join(d, `${nom}_bg.wasm`)));
  if (!dossier) throw erreur();
  try {
    const octets = readFileSync(join(dossier, `${nom}_bg.wasm`));
    const glue = (await import(pathToFileURL(join(dossier, `${nom}.js`)).href)) as Glue;
    glue.initSync({ module: octets });
    const deja = cache.get(nom); // two concurrent first calls: keep the first instance
    if (deja) return deja as T;
    cache.set(nom, glue);
    return glue as T;
  } catch {
    throw erreur();
  }
}
