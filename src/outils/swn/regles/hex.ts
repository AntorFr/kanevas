// Pure hexagon rules (G-3, G-5): axial coordinates, pointy-top. No database, no clock.

export interface Hex {
  q: number
  r: number
}

export type Point = readonly [number, number]

/** Hexagon distance: (|Δq| + |Δr| + |Δq+Δr|) / 2. */
export function distanceHex(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

const RACINE_3 = Math.sqrt(3)

/** Centre of an hexagon in the plane (pointy-top, unit size). */
export function hexVersPlan(h: Hex, taille = 1): { x: number; y: number } {
  return { x: taille * RACINE_3 * (h.q + h.r / 2), y: taille * 1.5 * h.r }
}

/** The hexagon containing a plane point (cube rounding). */
export function planVersHex(x: number, y: number, taille = 1): Hex {
  const qf = ((RACINE_3 / 3) * x - y / 3) / taille
  const rf = ((2 / 3) * y) / taille
  const sf = -qf - rf
  let q = Math.round(qf)
  let r = Math.round(rf)
  const s = Math.round(sf)
  const dq = Math.abs(q - qf)
  const dr = Math.abs(r - rf)
  const ds = Math.abs(s - sf)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return { q: q + 0, r: r + 0 }
}

function surSegment(p: Point, a: Point, b: Point): boolean {
  const croix = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  if (croix !== 0) return false
  return (
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  )
}

/** Point in polygon, in axial coordinates; an edge or a vertex counts as inside. */
export function pointDansPolygone(q: number, r: number, contour: readonly Point[]): boolean {
  const p: Point = [q, r]
  const n = contour.length
  if (n === 0) return false
  for (let i = 0; i < n; i++) {
    const a = contour[i]!
    if (surSegment(p, a, contour[(i + 1) % n]!)) return true
  }
  let dedans = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = contour[i]!
    const [xj, yj] = contour[j]!
    if (yi > r !== yj > r && q < ((xj - xi) * (r - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}
