// Generated blocks (G-3, AD-132): pure, deterministic. No database, no clock.
import { createHash } from 'node:crypto'
import { pointDansPolygone, type Hex, type Point } from './hex.js'

export const TAILLE_BLOC = 5

export type ChampDensite = (q: number, r: number) => number

export interface ZoneDensite {
  contour: readonly Point[]
  densite: number | null
}

/** u in [0, 1): first 6 bytes of SHA-256("<graine>:<q>:<r>") over 2^48. */
export function tirage(graine: string, q: number, r: number): number {
  const h = createHash('sha256').update(`${graine}:${q}:${r}`).digest()
  return h.readUIntBE(0, 6) / 2 ** 48
}

/** Block (bx, by) holds 5bx ≤ q ≤ 5bx+4 and 5by ≤ r ≤ 5by+4; a system exists when u < density. */
export function bloc(graine: string, bx: number, by: number, champ: ChampDensite): Hex[] {
  const res: Hex[] = []
  for (let r = by * TAILLE_BLOC; r < (by + 1) * TAILLE_BLOC; r++) {
    for (let q = bx * TAILLE_BLOC; q < (bx + 1) * TAILLE_BLOC; q++) {
      if (tirage(graine, q, r) < champ(q, r)) res.push({ q, r })
    }
  }
  return res
}

/**
 * Density of a hexagon: the lowest `densite` among the given (already readable) zones
 * containing it; zones with a null density are ignored; none: the default.
 */
export function densiteHexagone(
  q: number,
  r: number,
  zones: readonly ZoneDensite[],
  defaut: number,
): number {
  let mini: number | null = null
  for (const z of zones) {
    if (z.densite === null) continue
    if (!pointDansPolygone(q, r, z.contour)) continue
    if (mini === null || z.densite < mini) mini = z.densite
  }
  return mini ?? defaut
}
