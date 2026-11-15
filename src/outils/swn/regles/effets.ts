// The closed list of the effects a catalogue element may state (X-2, AD-130): validated at the import and named on display
// (French labels). The calculation and the screen name their own effects; they do not derive from this list. Adding an effect
// is a code change with its test, never a data change.
// Pure: no database. No formula or code ever travels in the data.

export type CodeEffet = 'vitesse' | 'armure' | 'echange' | 'soutes_doublees' | 'magasins_doubles' | 'reparation_min' | 'moteur_systeme'
  | 'soutes_optimisees_livre' | 'blindage_renforce' | 'montages_specialises' | 'surcharge_cumulable'
export type ParametreEffet =
  | 'valeur' | 'points_max' | 'sens' | 'echange_puissance' | 'echange_masse' | 'rend_puissance' | 'rend_masse'
  | 'effet_pct' | 'echange_arrondi'

export interface DeclarationEffet {
  /** The one nature that may carry the effect. */
  nature: 'modifications' | 'amenagements'
  libelle: string
  /** Parameters required with the effect and refused without it. */
  parametres: readonly ParametreEffet[]
  /** Parameters the effect accepts without requiring them (Z-3: the rounding of the exchange). */
  facultatifs?: readonly ParametreEffet[]
  /** The file must say `limite` 1: one line per design, so a target or a number of points has one meaning. */
  limiteUne?: true
  /** W-1: the file states `vise` (a weapon line of the design), required with the effect and refused without it. */
  cible?: true
}

export const EFFETS: Readonly<Record<CodeEffet, DeclarationEffet>> = {
  vitesse: { nature: 'modifications', libelle: 'Vitesse', parametres: ['valeur'] },
  armure: { nature: 'modifications', libelle: 'Armure', parametres: ['valeur'] },
  echange: {
    nature: 'modifications', libelle: 'Échange de points', limiteUne: true,
    parametres: ['points_max', 'sens', 'echange_puissance', 'echange_masse'], facultatifs: ['echange_arrondi'],
  },
  soutes_doublees: { nature: 'modifications', libelle: 'Soutes doublées', parametres: [], limiteUne: true },
  magasins_doubles: { nature: 'modifications', libelle: 'Magasins doublés', parametres: [], limiteUne: true },
  reparation_min: { nature: 'modifications', libelle: 'Réparation minimale', parametres: ['valeur'] },
  soutes_optimisees_livre: { nature: 'modifications', libelle: 'Soutes optimisées', parametres: [], limiteUne: true },
  blindage_renforce: { nature: 'modifications', libelle: 'Blindage renforcé', parametres: ['valeur'], limiteUne: true },
  montages_specialises: { nature: 'modifications', libelle: 'Montages spécialisés', parametres: [], limiteUne: true, cible: true },
  surcharge_cumulable: { nature: 'modifications', libelle: "Surcharge d'arme", parametres: ['effet_pct'], cible: true },
  moteur_systeme: { nature: 'amenagements', libelle: 'Moteur système', parametres: ['rend_puissance', 'rend_masse'] },
}

export const CODES_EFFET = Object.keys(EFFETS) as CodeEffet[]
export const SENS_ECHANGE = ['puissance_vers_masse', 'masse_vers_puissance'] as const
export const estEffet = (v: unknown): v is CodeEffet => typeof v === 'string' && Object.hasOwn(EFFETS, v)
/** French label of a code; an unknown code (cannot be stored) prints as written. */
export const libelleEffet = (code: string): string => (estEffet(code) ? EFFETS[code].libelle : code)
export const PARAMETRES_EFFET: readonly ParametreEffet[] = [...new Set(CODES_EFFET.flatMap((c) => [...EFFETS[c].parametres, ...(EFFETS[c].facultatifs ?? [])]))]
