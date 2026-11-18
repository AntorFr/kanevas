// Journey wording (G-5): pure.

/** Rounded to the nearest tenth (half up), comma, trailing « ,0 » dropped. */
export function nombreFr(x: number): string {
  const dixiemes = Math.floor(x * 10 + 0.5 + 1e-9)
  const entier = Math.trunc(dixiemes / 10)
  const frac = dixiemes % 10
  return frac === 0 ? String(entier) : `${entier},${frac}`
}

/** « 4,5 jours », « 1 jour » (singular below 2). */
export function libelleDuree(jours: number): string {
  return `${nombreFr(jours)} ${jours < 2 ? 'jour' : 'jours'}`
}

/** « 7 cases · 4,5 jours ». */
export function libelleTrajet(cases: number, jours: number): string {
  return `${cases} ${cases < 2 ? 'case' : 'cases'} · ${libelleDuree(jours)}`
}
