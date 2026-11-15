// Outline of a zone (T-5): pure, integer arithmetic only.

export type Sommet = readonly [number, number]

export type CodeContour = 'contour_trop_court' | 'contour_croise' | 'contour_invalide'

export type ResultatContour = { ok: true } | { ok: false; code: CodeContour }

const MIN_SOMMETS = 3
const MAX_SOMMETS = 64
const BORNE = 100000

function croix(o: Sommet, a: Sommet, b: Sommet): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

function signe(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0
}

/** `p` is collinear with [a, b] and inside its bounding box. */
function surSegment(a: Sommet, b: Sommet, p: Sommet): boolean {
  return (
    croix(a, b, p) === 0 &&
    p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
  )
}

/** Two segments share at least one point (touching included). */
function seTouchent(a: Sommet, b: Sommet, c: Sommet, d: Sommet): boolean {
  const d1 = signe(croix(a, b, c))
  const d2 = signe(croix(a, b, d))
  const d3 = signe(croix(c, d, a))
  const d4 = signe(croix(c, d, b))
  if (d1 * d2 < 0 && d3 * d4 < 0) return true
  return surSegment(a, b, c) || surSegment(a, b, d) || surSegment(c, d, a) || surSegment(c, d, b)
}

/**
 * 3 to 64 vertices `[q, r]`, integers within ±100 000, no two equal consecutive vertices (the last and
 * the first included), a simple polygon: no edge meets another except neighbours at their shared
 * vertex, and the area is not zero.
 */
export function contourValide(contour: unknown): ResultatContour {
  if (!Array.isArray(contour)) return { ok: false, code: 'contour_invalide' }
  if (contour.length < MIN_SOMMETS) return { ok: false, code: 'contour_trop_court' }
  if (contour.length > MAX_SOMMETS) return { ok: false, code: 'contour_invalide' }
  for (const s of contour) {
    if (!Array.isArray(s) || s.length !== 2) return { ok: false, code: 'contour_invalide' }
    for (const v of s) {
      if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > BORNE) {
        return { ok: false, code: 'contour_invalide' }
      }
    }
  }
  const p = contour as Sommet[]
  const n = p.length
  for (let i = 0; i < n; i++) {
    const s = p[i]!
    const t = p[(i + 1) % n]!
    if (s[0] === t[0] && s[1] === t[1]) return { ok: false, code: 'contour_invalide' }
  }
  let aire2 = 0
  for (let i = 0; i < n; i++) {
    const s = p[i]!
    const t = p[(i + 1) % n]!
    aire2 += s[0] * t[1] - t[0] * s[1]
  }
  if (aire2 === 0) return { ok: false, code: 'contour_croise' }
  for (let i = 0; i < n; i++) {
    const a = p[i]!
    const b = p[(i + 1) % n]!
    for (let j = i + 1; j < n; j++) {
      const c = p[j]!
      const d = p[(j + 1) % n]!
      if (j === i + 1) {
        // Neighbours (b === c): they may only share that vertex, not fold back on each other.
        if (croix(a, b, d) === 0 && (d[0] - b[0]) * (a[0] - b[0]) + (d[1] - b[1]) * (a[1] - b[1]) > 0) {
          return { ok: false, code: 'contour_croise' }
        }
      } else if (i === 0 && j === n - 1) {
        // Neighbours through the closing edge (d === a).
        if (croix(c, d, b) === 0 && (b[0] - a[0]) * (c[0] - a[0]) + (b[1] - a[1]) * (c[1] - a[1]) > 0) {
          return { ok: false, code: 'contour_croise' }
        }
      } else if (seTouchent(a, b, c, d)) {
        return { ok: false, code: 'contour_croise' }
      }
    }
  }
  return { ok: true }
}
