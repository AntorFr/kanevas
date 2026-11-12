// The closed list of the effects a catalogue element may state (X-2, AD-130): validated at the import and named on display
// (French labels). The calculation and the screen name their own effects; they do not derive from this list. Adding an effect
// is a code change with its test, never a data change.
// Pure: no database. No formula or code ever travels in the data.

export type CodeEffet = 'vitesse' | 'armure' | 'echange' | 'soutes_doublees' | 'magasins_doubles' | 'reparation_min' | 'moteur_systeme'
  | 'soutes_optimisees' | 'armure_par_classe' | 'montage_specialise' | 'surcharge_arme'
export type ParametreEffet =
  | 'valeur' | 'points_max' | 'sens' | 'echange_puissance' | 'echange_masse' | 'rend_puissance' | 'rend_masse'
  | 'effet_pct' | 'armure_par_classe' | 'echange_arrondi'

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
  soutes_optimisees: { nature: 'modifications', libelle: 'Soutes optimisées', parametres: ['effet_pct'], limiteUne: true },
  armure_par_classe: { nature: 'modifications', libelle: 'Armure par classe', parametres: ['armure_par_classe'] },
  montage_specialise: { nature: 'modifications', libelle: 'Montage spécialisé', parametres: ['valeur'], limiteUne: true },
  surcharge_arme: { nature: 'modifications', libelle: "Surcharge d'arme", parametres: ['effet_pct'], limiteUne: true },
  moteur_systeme: { nature: 'amenagements', libelle: 'Moteur système', parametres: ['rend_puissance', 'rend_masse'] },
}

export const CODES_EFFET = Object.keys(EFFETS) as CodeEffet[]
export const SENS_ECHANGE = ['puissance_vers_masse', 'masse_vers_puissance'] as const
export const estEffet = (v: unknown): v is CodeEffet => typeof v === 'string' && Object.hasOwn(EFFETS, v)
/** French label of a code; an unknown code (cannot be stored) prints as written. */
export const libelleEffet = (code: string): string => (estEffet(code) ? EFFETS[code].libelle : code)
export const PARAMETRES_EFFET: readonly ParametreEffet[] = [...new Set(CODES_EFFET.flatMap((c) => [...EFFETS[c].parametres, ...(EFFETS[c].facultatifs ?? [])]))]
