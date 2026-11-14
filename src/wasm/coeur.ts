// Typed calls on the exports of the `coeur` module (AD-139, AD-etoiles-3), server side. No logic here:
// every function forwards to the Wasm export, which owns the decision. The browser twin is
// frontend/src/wasm/coeur.ts; both give the same bytes since there is one .wasm.
import { chargerModule } from './charger.js';

/** A star as the core serialises it. */
export interface EtoileCoeur {
  q: number;
  r: number;
  taille: number;
  lettre: string;
  x: number;
  y: number;
}

interface Coeur {
  tirer_bloc(graine: string, bx: number, by: number, densites: Float64Array, exclus: Uint8Array): string;
  hex_vers_plan(q: number, r: number): Float64Array;
  plan_vers_hex(x: number, y: number): Int32Array;
  densite_defaut(): number;
}

const coeur = (): Promise<Coeur> => chargerModule<Coeur>('coeur');

/** The exact JSON the core returns for a block: `null` or an `EtoileCoeur`. `densites` and `exclus` hold nine values. */
export async function tirerBloc(
  graine: string,
  bx: number,
  by: number,
  densites: ArrayLike<number>,
  exclus: ArrayLike<number | boolean>,
): Promise<string> {
  return (await coeur()).tirer_bloc(graine, bx, by, Float64Array.from(densites), Uint8Array.from(exclus, Number));
}

export async function hexVersPlan(q: number, r: number): Promise<[number, number]> {
  const p = (await coeur()).hex_vers_plan(q, r);
  return [p[0]!, p[1]!];
}

export async function planVersHex(x: number, y: number): Promise<[number, number]> {
  const h = (await coeur()).plan_vers_hex(x, y);
  return [h[0]!, h[1]!];
}

export async function densiteDefaut(): Promise<number> {
  return (await coeur()).densite_defaut();
}
