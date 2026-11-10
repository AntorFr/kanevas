// Text of the rule and example sheets (R-3, AD-131): pure Markdown, no `:::` block, no link, no database.
// Inputs are already resolved (the reader's level is chosen by the caller).
import type { CoqueResolue, ElementResolu, NatureVaisseau, ResultatVaisseau } from './vaisseau.js'
import { libelleEffet } from './effets.js'
import { texteMasse } from './masse.js'
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
/** A column stated by the catalogue (F-1): it prints only when some row states it, `—` for a row that does not. */
type Facultative<T> = [string, (e: T) => string | null]

const cmp = (a: string, b: string): number => a.localeCompare(b, 'fr') || (a < b ? -1 : a > b ? 1 : 0)
const drapeau = (b: boolean): string => (b ? '× coque' : '—')
const nombre = (n: number): string => entier(n)
const echapper = (s: string): string => s.replace(/\|/g, '\\|')
/** Free text of the catalogue is plain text: the pipe and the backslash are escaped, line breaks flattened. */
const texteBrut = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ')
const nombreF = (n: number | undefined): string | null => (n === undefined ? null : nombre(n))
const texteF = (s: string | undefined): string | null => (s === undefined ? null : texteBrut(s))
const nomAffiche = (e: { nom: string; proprietaire?: string }): string =>
  echapper(e.nom) + (e.proprietaire === 'univers' ? ' (Univers)' : '')

const COLONNES_COQUE: Cellule<CoqueRegle>[] = [
  ['Classe', (e) => nombre(e.classe)],
  ['Coût', (e) => credits(e.cout)],
  ['PV', (e) => nombre(e.pv)],
  ['CA', (e) => nombre(e.ca)],
  ['Puissance', (e) => nombre(e.puissance)],
  ['Masse', (e) => texteMasse(e.masse)],
  ['Emports', (e) => nombre(e.emports)],
  ['Facteur de coût', (e) => nombre(e.facteur_cout)],
  ['Facteur de puissance', (e) => nombre(e.facteur_puissance)],
  ['Facteur de masse', (e) => nombre(e.facteur_masse)],
]

const COLONNES_ELEMENT: Cellule<ElementRegle>[] = [
  ['Coût', (e) => credits(e.cout)],
  ['Puissance', (e) => nombre(e.puissance)],
  ['Masse', (e) => texteMasse(e.masse)],
  ['PV', (e) => nombre(e.pv)],
  ['CA', (e) => nombre(e.ca)],
  ['Limite', (e) => (e.limite === 0 ? '—' : nombre(e.limite))],
  ['Coût × coque', (e) => drapeau(e.x_cout)],
  ['Puissance × coque', (e) => drapeau(e.x_puissance)],
  ['Masse × coque', (e) => drapeau(e.x_masse)],
]

const FACULTATIVES_COQUE: Facultative<CoqueRegle>[] = [
  ['Vitesse', (e) => nombreF(e.vitesse)],
  ['Armure', (e) => nombreF(e.armure)],
  ['Équipage min', (e) => nombreF(e.equipage_min)],
  ['Équipage max', (e) => nombreF(e.equipage_max)],
]

const PLAGE: Facultative<ElementRegle>[] = [
  ['Classe min', (e) => nombreF(e.classe_min)],
  ['Classe max', (e) => nombreF(e.classe_max)],
  ['Condition', (e) => texteF(e.condition)],
]

const EFFET: Facultative<ElementRegle> = ['Effet', (e) => (e.effet === undefined ? null : texteBrut(libelleEffet(e.effet)))]

const FACULTATIVES: Partial<Record<NatureRegles, Facultative<ElementRegle>[]>> = {
  moteurs: PLAGE,
  amenagements: [...PLAGE, EFFET, ['Soute', (e) => nombreF(e.soute)]],
  defenses: [...PLAGE, ['Bonus de vitesse', (e) => nombreF(e.bonus_vitesse)]],
  modifications: [
    ['Coût %', (e) => nombreF(e.cout_pct)],
    EFFET,
    ['Valeur / points max', (e) => nombreF(e.valeur ?? e.points_max)],
  ],
  armes: [
    ['Dégâts', (e) => texteF(e.degats)],
    ['Perforation', (e) => nombreF(e.perforation)],
    ['Qualités', (e) => texteF(e.qualites)],
    ['Niveau tech.', (e) => nombreF(e.niveau_tech)],
  ],
}

/** The optional columns that at least one row states, as ordinary cells (`—` where a row is silent). */
function presentes<T>(elements: T[], facultatives: Facultative<T>[] = []): Cellule<T>[] {
  return facultatives
    .filter(([, f]) => elements.some((e) => f(e) !== null))
    .map(([titre, f]): Cellule<T> => [titre, (e) => f(e) ?? '—'])
}

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
      ? tableau(elements as CoqueRegle[], [...COLONNES_COQUE, ...presentes(elements as CoqueRegle[], FACULTATIVES_COQUE)])
      : tableau(elements as ElementRegle[], [
          ...(PREFIXE[nature] ?? []),
          ...COLONNES_ELEMENT,
          ...presentes(elements as ElementRegle[], FACULTATIVES[nature]),
        ])
  return `${entete}\n\n${table}\n`
}

export function texteExemples(exemples: ExempleResolu[]): string {
  const entete = `**Exemples** — ${exemples.length}`
  if (exemples.length === 0) return `${entete}\n\nAucun exemple.\n`
  const blocs = [...exemples]
    .sort((a, b) => cmp(a.nom, b.nom) || cmp(a.cle ?? '', b.cle ?? ''))
    .map((x) =>
      [`### ${x.nom}`, `${x.resultat.coque.nom} — classe ${x.resultat.coque.classe}`, listeChoix(x.resultat), tableMesures(x.resultat, false)].join('\n\n'),
    )
  return `${[entete, ...blocs].join('\n\n')}\n`
}
