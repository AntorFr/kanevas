// The GM document derived from a galaxy (T-7, B-74): pure text from a view, no database, no clock.
// Everything sits inside one `:::mj` container, and every line starts with `# `, `## ` or `- `, so
// nothing typed by the GM can close the container early (AD-114).

/** Same value as `MAX_CONTENU_SECTION` (services/sections.ts); `regles/` imports nothing from services. */
export const PLAFOND_DOCUMENT = 100000

export interface SystemeDoc {
  nom: string
  q: number
  r: number
  /** Already worded: « petite », « moyenne », « grande ». */
  taille: string
  notes: string
  secret: boolean
}

export interface RouteDoc {
  depuis: string
  vers: string
  longueur: number
  publique: boolean
  /** The type of link, if the route has one. */
  typeLien?: string | null
}

export interface ZoneDoc {
  nom: string
  /** 0 to 1, or null. */
  densite: number | null
  secret: boolean
  /** Number of hexagons of a zone that is a set; absent for a polygon (Z-7). */
  hexagones?: number
}

export interface VueDocument {
  titre: string
  systemes: readonly SystemeDoc[]
  routes: readonly RouteDoc[]
  zones: readonly ZoneDoc[]
}

function aplatir(texte: string): string {
  return texte.replace(/\s+/g, ' ').trim()
}

function comparer(a: string, b: string): number {
  return a.localeCompare(b, 'fr') || (a < b ? -1 : a > b ? 1 : 0)
}

function ligneSysteme(s: SystemeDoc): string {
  const notes = aplatir(s.notes)
  return `- **${aplatir(s.nom)}** (${s.q}, ${s.r}) · ${s.taille}${s.secret ? ' (secret)' : ''}${notes ? ` — ${notes}` : ''}`
}

function ligneRoute(r: RouteDoc): string {
  return `- ${aplatir(r.depuis)} — ${aplatir(r.vers)} · ${r.longueur} ${r.longueur < 2 ? 'case' : 'cases'}${r.typeLien ? ` · ${aplatir(r.typeLien)}` : ''}${r.publique ? '' : ' · privée'}`
}

function ligneZone(z: ZoneDoc): string {
  const densite = z.densite === null ? 'densité automatique' : `densité ${Math.round(z.densite * 100)} %`
  const taille = z.hexagones === undefined ? '' : ` · ${z.hexagones} ${z.hexagones < 2 ? 'hexagone' : 'hexagones'}`
  return `- ${aplatir(z.nom)}${taille} · ${densite}${z.secret ? ' (secrète)' : ''}`
}

/** The lines that fit in `budget` characters, then a tail line counting the rest. */
function couper(lignes: string[], budget: number, un: string, plusieurs: string): string[] {
  let total = 0
  let gardees = 0
  for (const l of lignes) {
    if (total + l.length + 1 > budget) break
    total += l.length + 1
    gardees++
  }
  if (gardees === lignes.length) return lignes
  const reste = lignes.length - gardees
  const queue = reste === 1 ? `- … 1 ${un}` : `- … ${reste} ${plusieurs}`
  // Make room for the tail line itself.
  while (gardees > 0 && total + queue.length + 1 > budget) {
    gardees--
    total -= lignes[gardees]!.length + 1
  }
  const restant = lignes.length - gardees
  const fin = restant === 1 ? `- … 1 ${un}` : `- … ${restant} ${plusieurs}`
  return [...lignes.slice(0, gardees), fin]
}

export function redigerDocumentMJ(vue: VueDocument): string {
  const systemes = [...vue.systemes].sort((a, b) => comparer(a.nom, b.nom) || a.q - b.q || a.r - b.r).map(ligneSysteme)
  const routes = [...vue.routes]
    .sort((a, b) => comparer(a.depuis, b.depuis) || comparer(a.vers, b.vers) || a.longueur - b.longueur)
    .map(ligneRoute)
  const zones = [...vue.zones].sort((a, b) => comparer(a.nom, b.nom)).map(ligneZone)

  const titre = `# ${aplatir(vue.titre) || 'Galaxie'}`
  // Fixed frame: container fences, title, three headings (the room of the empty-list lines is in the margin).
  const marge = 1000
  let budget = PLAFOND_DOCUMENT - marge - titre.length
  const parts: [string[], string, string][] = [
    [systemes, 'système de plus non listé.', 'systèmes de plus non listés.'],
    [routes, 'route de plus non listée.', 'routes de plus non listées.'],
    [zones, 'zone de plus non listée.', 'zones de plus non listées.'],
  ]
  const parts2 = [0.5, 0.3, 0.2]
  const sorties: string[][] = []
  for (let i = 0; i < parts.length; i++) {
    const [lignes, un, plusieurs] = parts[i]!
    const part = i === parts.length - 1 ? budget : Math.floor(budget * (parts2[i]! / parts2.slice(i).reduce((a, b) => a + b, 0)))
    const coupees = couper(lignes, part, un, plusieurs)
    sorties.push(coupees)
    budget -= coupees.reduce((n, l) => n + l.length + 1, 0)
  }
  const [s, r, z] = sorties as [string[], string[], string[]]
  const vide = (l: string[]) => (l.length ? l : ['- Aucun.'])
  return [
    ':::mj',
    titre,
    '## Systèmes',
    ...vide(s),
    '## Routes',
    ...vide(r),
    '## Zones',
    ...vide(z),
    ':::',
  ].join('\n')
}
