// A mass is a multiple of 0.5 (B-80, V-10 « Mass »): printed with a decimal comma only when it has a decimal, U+2212 for a
// negative. The browser has its twin in frontend/src/outils/swn/vaisseaux/format.ts, both pinned by the same table of cases.
const NBSP = ' '

export function texteMasse(n: number): string {
  const signe = n < 0 ? '−' : ''
  const [entiere = '', decimale] = String(Math.abs(n)).split('.')
  return signe + entiere.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + (decimale === undefined ? '' : `,${decimale}`)
}
