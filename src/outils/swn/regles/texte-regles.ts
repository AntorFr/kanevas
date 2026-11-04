// Text of the rule and example sheets (R-3, AD-131): pure Markdown, no `:::` block, no link, no database.
// Inputs are already resolved (the reader's level is chosen by the caller).
import type { CoqueResolue, ElementResolu, NatureVaisseau, ResultatVaisseau } from './vaisseau.js'
import { credits, entier, listeChoix, tableMesures } from './texte-vaisseau.js'

export type NatureRegles = 'coques' | NatureVaisseau

export interface ElementRegle extends ElementResolu {
  cle: string
  nom: string
  /** `univers` marks a local element with « (Univers) ». */
  proprietaire?: 'systeme' | 'univers'
}

export interface CoqueRegle extends CoqueResolue {
  proprietaire?: 'systeme' | 'univers'
}

export interface ExempleResolu {
  cle?: string
  nom: string
  resultat: ResultatVaisseau
}

const LIBELLES: Record<NatureRegles, string> = {
  coques: 'Coques',
  moteurs: 'Moteurs',
  amenagements: 'Aménagements',
  defenses: 'Défenses',
  armes: 'Armes',
  modifications: 'Modifications',
}

type Cellule<T> = [string, (e: T) => string]

const cmp = (a: string, b: string): number => a.localeCompare(b, 'fr') || (a < b ? -1 : a > b ? 1 : 0)
const drapeau = (b: boolean): string => (b ? '× coque' : '—')
const nombre = (n: number): string => entier(n)
const echapper = (s: string): string => s.replace(/\|/g, '\\|')
const nomAffiche = (e: { nom: string; proprietaire?: string }): string =>
  echapper(e.nom) + (e.proprietaire === 'univers' ? ' (Univers)' : '')

const COLONNES_COQUE: Cellule<CoqueRegle>[] = [
  ['Classe', (e) => nombre(e.classe)],
  ['Coût', (e) => credits(e.cout)],
  ['PV', (e) => nombre(e.pv)],
  ['CA', (e) => nombre(e.ca)],
  ['Puissance', (e) => nombre(e.puissance)],
  ['Masse', (e) => nombre(e.masse)],
  ['Emports', (e) => nombre(e.emports)],
  ['Facteur de coût', (e) => nombre(e.facteur_cout)],
  ['Facteur de puissance', (e) => nombre(e.facteur_puissance)],
  ['Facteur de masse', (e) => nombre(e.facteur_masse)],
]

const COLONNES_ELEMENT: Cellule<ElementRegle>[] = [
  ['Coût', (e) => credits(e.cout)],
  ['Puissance', (e) => nombre(e.puissance)],
  ['Masse', (e) => nombre(e.masse)],
  ['PV', (e) => nombre(e.pv)],
  ['CA', (e) => nombre(e.ca)],
  ['Limite', (e) => (e.limite === 0 ? '—' : nombre(e.limite))],
  ['Coût × coque', (e) => drapeau(e.x_cout)],
  ['Puissance × coque', (e) => drapeau(e.x_puissance)],
  ['Masse × coque', (e) => drapeau(e.x_masse)],
]

const PREFIXE: Partial<Record<NatureRegles, Cellule<ElementRegle>[]>> = {
  moteurs: [['Niveau', (e) => nombre(e.niveau ?? 0)]],
  armes: [
    ['Emport', (e) => nombre(e.emport ?? 0)],
    ['Munitions', (e) => nombre(e.munitions ?? 0)],
    ["Coût d'une munition", (e) => credits(e.cout_munition ?? 0)],
  ],
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

function tableau<T extends { nom: string; cle: string }>(elements: T[], colonnes: Cellule<T>[]): string {
  const lignes = [...elements]
    .sort((a, b) => cmp(a.nom, b.nom) || cmp(a.cle, b.cle))
    .map((e) => `| ${[nomAffiche(e), ...colonnes.map(([, f]) => f(e))].join(' | ')} |`)
  return [`| ${['Nom', ...colonnes.map(([t]) => t)].join(' | ')} |`, `|${'---|'.repeat(colonnes.length + 1)}`, ...lignes].join('\n')
}

export function texteRegles(nature: 'coques', elements: CoqueRegle[]): string
export function texteRegles(nature: NatureVaisseau, elements: ElementRegle[]): string
export function texteRegles(nature: NatureRegles, elements: (CoqueRegle | ElementRegle)[]): string {
  const entete = `**${LIBELLES[nature]}** — ${pluriel(elements.length, 'élément')}`
  if (elements.length === 0) return `${entete}\n\nAucun élément dans le catalogue.\n`
  const table =
    nature === 'coques'
      ? tableau(elements as CoqueRegle[], COLONNES_COQUE)
      : tableau(elements as ElementRegle[], [...(PREFIXE[nature] ?? []), ...COLONNES_ELEMENT])
  return `${entete}\n\n${table}\n`
}

export function texteExemples(exemples: ExempleResolu[]): string {
  const entete = `**Exemples** — ${exemples.length}`
  if (exemples.length === 0) return `${entete}\n\nAucun exemple.\n`
  const blocs = [...exemples]
    .sort((a, b) => cmp(a.nom, b.nom) || cmp(a.cle ?? '', b.cle ?? ''))
    .map((x) =>
      [`### ${x.nom}`, `${x.resultat.coque.nom} — classe ${x.resultat.coque.classe}`, listeChoix(x.resultat), tableMesures(x.resultat)].join('\n\n'),
    )
  return `${[entete, ...blocs].join('\n\n')}\n`
}
