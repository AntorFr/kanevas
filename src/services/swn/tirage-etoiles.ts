// The draw of the galaxy's stars (AD-etoiles-6): the only caller of the core's `generation` in the services.
// The core decides (AD-140); this file only builds its inputs: nine densities (lowest readable zone, else the
// galaxy default: `densiteHexagone`) and nine exclusions (defined, non-promoted systems and their six neighbours,
// read from `swn_systemes` unfiltered, so every reader gets the same draw, AD-etoiles-2).
import type { Db } from '../../db/db.js';
import { chargerModule } from '../../wasm/charger.js';
import { densiteHexagone, TAILLE_BLOC, type ZoneDensite } from '../../outils/swn/regles/generation.js';

interface Coeur {
  tirer_bloc(graine: string, bx: number, by: number, densites: Float64Array, exclus: Uint8Array): string;
  densite_defaut(): number;
}

// Loaded once at import so that the services stay synchronous. A failed load is not a fallback: every draw
// then throws the generic error (the route answers its generic server error, never the old SHA-256 draw).
let coeur: Coeur | undefined;
try {
  coeur = await chargerModule<Coeur>('coeur');
} catch {
  coeur = undefined;
}

function leCoeur(): Coeur {
  if (!coeur) throw new Error('Wasm module "coeur" is missing or unreadable.');
  return coeur;
}

/** The generator version of the cache key: constant until the settings slice (AD-etoiles-6). */
export const VERSION_GENERATEUR = 1;

/** Default density of a new galaxy: the core's (AD-etoiles-7). */
export const densiteParDefaut = (): number => leCoeur().densite_defaut();

const VOISINS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

/** Hexagons of the defined, non-promoted systems of the rectangle of blocks widened by one hexagon, as `q,r`. */
export function systemesExclusants(
  db: Db, galaxieId: number, de: { bx: number; by: number }, a: { bx: number; by: number },
): [number, number][] {
  return (db.prepare(`SELECT q, r FROM swn_systemes WHERE galaxie_id = ? AND promu = 0
    AND q BETWEEN ? AND ? AND r BETWEEN ? AND ? ORDER BY q, r`)
    .all(galaxieId, de.bx * TAILLE_BLOC - 1, (a.bx + 1) * TAILLE_BLOC, de.by * TAILLE_BLOC - 1, (a.by + 1) * TAILLE_BLOC) as { q: number; r: number }[])
    .map(({ q, r }) => [q, r]);
}

export interface EntreesBloc { densites: number[]; exclus: number[]; empreinteExclusions: string }

/** The nine inputs of the block, row-major over `dq, dr ∈ 1..3`; `definis` come from `systemesExclusants`. */
export function entreesBloc(
  bx: number, by: number, zones: readonly ZoneDensite[], defaut: number, definis: readonly (readonly [number, number])[],
): EntreesBloc {
  const exclusHex = new Set<string>();
  const proches: string[] = [];
  for (const [q, r] of definis) {
    if (q < bx * TAILLE_BLOC - 1 || q > bx * TAILLE_BLOC + TAILLE_BLOC || r < by * TAILLE_BLOC - 1 || r > by * TAILLE_BLOC + TAILLE_BLOC) continue;
    proches.push(`${q},${r}`);
    for (const [dq, dr] of VOISINS) exclusHex.add(`${q + dq},${r + dr}`);
  }
  const densites: number[] = [];
  const exclus: number[] = [];
  for (let dq = 1; dq <= 3; dq++) {
    for (let dr = 1; dr <= 3; dr++) {
      const q = bx * TAILLE_BLOC + dq, r = by * TAILLE_BLOC + dr;
      densites.push(densiteHexagone(q, r, zones, defaut));
      exclus.push(exclusHex.has(`${q},${r}`) ? 1 : 0);
    }
  }
  return { densites, exclus, empreinteExclusions: proches.join(';') };
}

/** The star drawn in a block, or none: `[q, r]` positions (zero or one). */
export function tirerEtoiles(graine: string, bx: number, by: number, entrees: EntreesBloc): [number, number][] {
  const json = leCoeur().tirer_bloc(graine, bx, by, Float64Array.from(entrees.densites), Uint8Array.from(entrees.exclus));
  const etoile = JSON.parse(json) as { q: number; r: number } | null;
  return etoile ? [[etoile.q, etoile.r]] : [];
}
