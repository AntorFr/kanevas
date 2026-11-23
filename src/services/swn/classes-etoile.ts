// The star classes the writers accept: the core's list (AD-galaxie-systemes-1), read once at import so that
// the writers stay synchronous. A failed load is not a fallback: validating a class then throws the generic error.
import { chargerModule } from '../../wasm/charger.js';

interface Coeur { classes_etoile(): string }

let lettres: ReadonlySet<string> | undefined;
try {
  const coeur = await chargerModule<Coeur>('coeur');
  lettres = new Set((JSON.parse(coeur.classes_etoile()) as { lettre: string }[]).map((c) => c.lettre));
} catch {
  lettres = undefined;
}

/** True when `v` is the letter of one of the core's classes. */
export function classeConnue(v: unknown): v is string {
  if (!lettres) throw new Error('Wasm module "coeur" is missing or unreadable.');
  return typeof v === 'string' && lettres.has(v);
}
