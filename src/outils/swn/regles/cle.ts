// Key of an element (T-3, T-5): the slug of its name, suffixed on a clash. Pure.

const LONGUEUR_MAX = 64

/** Lower case, accents folded, `-` for any run of other characters (`Éclat d'Arès` → `eclat-d-ares`). */
function identifiant(nom: string): string {
  const base = nom
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.slice(0, LONGUEUR_MAX - 8).replace(/-+$/, '') || 'element'
}

/** The key of `nom` within a galaxy: `port-noir`, then `port-noir-2`, `port-noir-3`… when taken. */
export function cleDe(nom: string, existantes: readonly string[]): string {
  const prises = new Set(existantes)
  const base = identifiant(nom)
  if (!prises.has(base)) return base
  for (let n = 2; ; n++) {
    const cle = `${base}-${n}`
    if (!prises.has(cle)) return cle
  }
}
