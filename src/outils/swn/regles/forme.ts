// Shape of a zone (T-5, Z-1 to Z-4): a simple polygon, or a set of hexagons stored as canonical ranges.
// Pure. This file is the only reader of the ranges format: `[[r, q0, q1], …]`, sorted by `r` then `q0`,
// ranges of a row disjoint and never adjacent (q1 + 1 < next q0), q0 ≤ q1.
import { contourValide, type CodeContour } from './zone.js'
import { pointDansPolygone, type Point } from './hex.js'

export type Plage = readonly [number, number, number]

export const MAX_HEXAGONES = 5000
const BORNE = 100000

export type CodeForme = CodeContour | 'hexagones_vides' | 'hexagones_trop_nombreux' | 'hexagones_invalide'
export type ResultatForme = { ok: true } | { ok: false; code: CodeForme }

const estEntier = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= BORNE

/** `{ hexagones: [[q, r], …] }` and nothing else. */
export function estEnsemble(forme: unknown): forme is { hexagones: unknown } {
  return forme !== null && typeof forme === 'object' && !Array.isArray(forme) && Object.hasOwn(forme, 'hexagones')
}

/** A polygon (array of vertices, as before) or a set `{ hexagones }` of 1 to 5 000 hexagons within ±100 000. */
export function formeValide(forme: unknown): ResultatForme {
  if (!estEnsemble(forme)) return contourValide(forme)
  if (Object.keys(forme).length !== 1) return { ok: false, code: 'hexagones_invalide' }
  const h = forme.hexagones
  if (!Array.isArray(h)) return { ok: false, code: 'hexagones_invalide' }
  if (h.length === 0) return { ok: false, code: 'hexagones_vides' }
  if (h.length > MAX_HEXAGONES) return { ok: false, code: 'hexagones_trop_nombreux' }
  for (const p of h) {
    if (!Array.isArray(p) || p.length !== 2 || !estEntier(p[0]) || !estEntier(p[1])) {
      return { ok: false, code: 'hexagones_invalide' }
    }
  }
  return { ok: true }
}

/** Canonical ranges of a valid set (duplicates collapse, order of the input does not matter). */
export function plagesDe(hexagones: readonly Point[]): Plage[] {
  const lignes = new Map<number, number[]>()
  for (const [q, r] of hexagones) {
    const l = lignes.get(r)
    if (l) l.push(q); else lignes.set(r, [q])
  }
  const res: Plage[] = []
  for (const r of [...lignes.keys()].sort((a, b) => a - b)) {
    const qs = [...new Set(lignes.get(r)!)].sort((a, b) => a - b)
    let debut = qs[0]!, fin = debut
    for (let i = 1; i < qs.length; i++) {
      const q = qs[i]!
      if (q === fin + 1) { fin = q; continue }
      res.push([r, debut, fin])
      debut = fin = q
    }
    res.push([r, debut, fin])
  }
  return res
}

/** The ranges as stored. */
export const serialiserPlages = (plages: readonly Plage[]): string => JSON.stringify(plages)
export const lirePlages = (texte: string): Plage[] => JSON.parse(texte) as Plage[]

/** Number of hexagons. */
export function compterPlages(plages: readonly Plage[]): number {
  let n = 0
  for (const p of plages) n += p[2] - p[1] + 1
  return n
}

/** The hexagons `[q, r]`, row by row. */
export function developper(plages: readonly Plage[]): Point[] {
  const res: Point[] = []
  for (const [r, q0, q1] of plages) for (let q = q0; q <= q1; q++) res.push([q, r])
  return res
}

/** Bounding box `[qMin, qMax, rMin, rMax]` of a non-empty set of ranges. */
export function boiteDePlages(plages: readonly Plage[]): [number, number, number, number] {
  let qMin = Infinity, qMax = -Infinity
  for (const [, q0, q1] of plages) { if (q0 < qMin) qMin = q0; if (q1 > qMax) qMax = q1 }
  return [qMin, qMax, plages[0]![0], plages[plages.length - 1]![0]]
}

/** The two shapes of a zone as read from the table: `plages` null for a polygon. */
export interface FormeZone { contour: readonly Point[]; plages?: readonly Plage[] | null }

const lignesDe = new WeakMap<readonly Plage[], Map<number, Plage[]>>()
function indexer(plages: readonly Plage[]): Map<number, Plage[]> {
  let m = lignesDe.get(plages)
  if (!m) {
    m = new Map()
    for (const p of plages) { const l = m.get(p[0]); if (l) l.push(p); else m.set(p[0], [p]) }
    lignesDe.set(plages, m)
  }
  return m
}

/** Does the zone cover the hexagon (Z-4)? Polygon as before; ranges by a row index built once per array. */
export function contient(forme: FormeZone, q: number, r: number): boolean {
  if (!forme.plages) return pointDansPolygone(q, r, forme.contour)
  const l = indexer(forme.plages).get(r)
  if (!l) return false
  for (const p of l) if (q >= p[1] && q <= p[2]) return true
  return false
}
