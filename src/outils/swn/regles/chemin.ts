// Shortest journey under range (G-5, B-72): pure. No database, no clock.

export interface Route {
  a: string
  b: string
  longueur: number
}

export interface Troncon {
  de: string
  vers: string
  longueur: number
}

export type Trajet =
  | { trouve: true; systemes: string[]; troncons: Troncon[]; cases: number; jours: number }
  | { trouve: false }

export const PORTEE_PAR_DEFAUT = 5

/** Range of a leg: p × (n + 1) cases. */
export function portee(moteur: number, porteeSaut = PORTEE_PAR_DEFAUT): number {
  return porteeSaut * (moteur + 1)
}

/** Duration: Σ (longueur / n + 1) days, one day of transit per leg. */
export function duree(longueurs: readonly number[], moteur: number): number {
  return longueurs.reduce((s, l) => s + l / moteur + 1, 0)
}

interface Etiquette {
  cases: number
  chemin: string[]
  longueurs: number[]
}

function compareChemins(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i]! < b[i]!) return -1
    if (a[i]! > b[i]!) return 1
  }
  return a.length - b.length
}

/** Total length, then fewer legs, then lexicographic list of keys. */
function compare(a: Etiquette, b: Etiquette): number {
  if (a.cases !== b.cases) return a.cases - b.cases
  if (a.chemin.length !== b.chemin.length) return a.chemin.length - b.chemin.length
  return compareChemins(a.chemin, b.chemin)
}

export function plusCourtChemin(
  routes: readonly Route[],
  depart: string,
  arrivee: string,
  moteur: number,
  porteeSaut = PORTEE_PAR_DEFAUT,
): Trajet {
  const max = portee(moteur, porteeSaut)
  const voisins = new Map<string, { vers: string; longueur: number }[]>()
  for (const r of routes) {
    if (r.longueur > max) continue
    if (!voisins.has(r.a)) voisins.set(r.a, [])
    if (!voisins.has(r.b)) voisins.set(r.b, [])
    voisins.get(r.a)!.push({ vers: r.b, longueur: r.longueur })
    voisins.get(r.b)!.push({ vers: r.a, longueur: r.longueur })
  }
  const meilleur = new Map<string, Etiquette>()
  meilleur.set(depart, { cases: 0, chemin: [depart], longueurs: [] })
  const fait = new Set<string>()
  for (;;) {
    let courant: string | null = null
    for (const [cle, et] of meilleur) {
      if (fait.has(cle)) continue
      if (courant === null || compare(et, meilleur.get(courant)!) < 0) courant = cle
    }
    if (courant === null) break
    fait.add(courant)
    if (courant === arrivee) break
    const et = meilleur.get(courant)!
    for (const v of voisins.get(courant) ?? []) {
      if (fait.has(v.vers)) continue
      const cand: Etiquette = {
        cases: et.cases + v.longueur,
        chemin: [...et.chemin, v.vers],
        longueurs: [...et.longueurs, v.longueur],
      }
      const actuel = meilleur.get(v.vers)
      if (!actuel || compare(cand, actuel) < 0) meilleur.set(v.vers, cand)
    }
  }
  const fin = meilleur.get(arrivee)
  if (!fin || depart === arrivee || !fait.has(arrivee)) return { trouve: false }
  return {
    trouve: true,
    systemes: fin.chemin,
    troncons: fin.longueurs.map((longueur, i) => ({
      de: fin.chemin[i]!,
      vers: fin.chemin[i + 1]!,
      longueur,
    })),
    cases: fin.cases,
    jours: duree(fin.longueurs, moteur),
  }
}
