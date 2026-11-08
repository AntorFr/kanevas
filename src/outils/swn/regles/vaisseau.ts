// Ship calculation (V-2, B-75): pure, no database, no clock, no file read.
import { texteMasse } from './masse.js'

/** Credits of ship price built per day of construction (book mechanics, not catalogue data). */
export const CADENCE_CHANTIER = 25000
/** Yearly upkeep as a share of the price. */
export const TAUX_ENTRETIEN = 0.05
/** Mass of one extra magazine of a launcher (book mechanics, E-3). */
export const MASSE_MAGASIN = 1

export type NatureVaisseau = 'moteurs' | 'amenagements' | 'defenses' | 'armes' | 'modifications'

export interface CoqueResolue {
  cle: string
  nom: string
  classe: number
  cout: number
  pv: number
  ca: number
  puissance: number
  masse: number
  emports: number
  facteur_cout: number
  facteur_puissance: number
  facteur_masse: number
  /** Stated by the catalogue only (F-1); absent = not stated. */
  vitesse?: number
  armure?: number
  equipage_min?: number
  equipage_max?: number
}

export interface ElementResolu {
  cout: number
  puissance: number
  masse: number
  x_cout: boolean
  x_puissance: boolean
  x_masse: boolean
  pv: number
  ca: number
  limite: number
  /** Engines only. */
  niveau?: number
  /** Weapons only. */
  emport?: number
  munitions?: number
  cout_munition?: number
  /** Weapons only: the smallest hull class the weapon is made for; munitions double per class above it (E-2). Absent: never multiplied. */
  classe_min?: number
  /** Stated by the catalogue only (F-1); absent = not stated. `classe_min` above is also the weapon's own (E-2). */
  classe_max?: number
  condition?: string
  bonus_vitesse?: number
  degats?: string
  perforation?: number
  qualites?: string
  niveau_tech?: number
}

export interface LigneResolue {
  nature: NatureVaisseau
  cle: string
  nom: string
  quantite: number
  /** Weapons only: extra magazines per unit (E-3), each one `MASSE_MAGASIN` of mass and its munitions. */
  magasins?: number
  element: ElementResolu
}

export interface ReglagesVaisseau {
  porteeSaut: number
}

export interface AlerteVaisseau {
  niveau: 'bloquante' | 'a_surveiller'
  code: string
  texte: string
  ligne?: number
}

export interface ResultatVaisseau {
  coque: { cle: string; nom: string; classe: number }
  lignes: { nature: NatureVaisseau; cle: string; nom: string; quantite: number; magasins?: number }[]
  prix: number
  pv: number
  ca: number
  puissanceLibre: number
  masseLibre: number
  emports: { utilises: number; total: number }
  chantierJours: number
  entretien: number
  porteeSaut: number | null
  alertes: AlerteVaisseau[]
}

function moins(n: number): string {
  return n < 0 ? `−${-n}` : String(n)
}


export function calculer(
  coque: CoqueResolue,
  lignes: LigneResolue[],
  reglages: ReglagesVaisseau,
): ResultatVaisseau {
  let prix = coque.cout
  let pv = coque.pv
  let ca = coque.ca
  let puissanceUsee = 0
  let masseUsee = 0
  let emportsUtilises = 0
  let uniteMoteur = 0
  let niveauMoteur: number | null = null

  lignes.forEach((l) => {
    const e = l.element
    const q = l.quantite
    prix += e.cout * (e.x_cout ? coque.facteur_cout : 1) * q
    puissanceUsee += e.puissance * (e.x_puissance ? coque.facteur_puissance : 1) * q
    masseUsee += e.masse * (e.x_masse ? coque.facteur_masse : 1) * q
    pv += e.pv * q
    ca += e.ca * q
    if (l.nature === 'armes') {
      const doublements = e.classe_min === undefined ? 0 : Math.max(0, coque.classe - e.classe_min)
      const munitions = (e.munitions ?? 0) * (e.cout_munition ?? 0) * 2 ** doublements
      const magasins = l.magasins ?? 0
      prix += munitions * (1 + magasins) * q
      masseUsee += MASSE_MAGASIN * magasins * q
      emportsUtilises += (e.emport ?? 0) * q
    }
    if (l.nature === 'moteurs' && q > 0) {
      uniteMoteur += q
      niveauMoteur = Math.max(niveauMoteur ?? 0, e.niveau ?? 0)
    }
  })

  const puissanceLibre = coque.puissance - puissanceUsee
  const masseLibre = coque.masse - masseUsee
  const emports = { utilises: emportsUtilises, total: coque.emports }

  const bloquantes: AlerteVaisseau[] = []
  const surveiller: AlerteVaisseau[] = []
  if (puissanceLibre < 0) {
    bloquantes.push({ niveau: 'bloquante', code: 'puissance_insuffisante', texte: `Puissance insuffisante : ${moins(puissanceLibre)}` })
  }
  if (masseLibre < 0) {
    bloquantes.push({ niveau: 'bloquante', code: 'masse_insuffisante', texte: `Masse insuffisante : ${texteMasse(masseLibre)}` })
  }
  if (emports.utilises > emports.total) {
    bloquantes.push({ niveau: 'bloquante', code: 'emports_insuffisants', texte: `Emports insuffisants : ${emports.utilises} sur ${emports.total}` })
  }
  lignes.forEach((l, i) => {
    if (l.element.limite > 0 && l.quantite > l.element.limite) {
      bloquantes.push({ niveau: 'bloquante', code: 'limite_depassee', texte: `« ${l.nom} » : ${l.element.limite} au plus.`, ligne: i })
    }
  })
  if (uniteMoteur > 1) {
    bloquantes.push({ niveau: 'bloquante', code: 'moteur_multiple', texte: 'Un seul moteur par vaisseau.' })
  }
  if (uniteMoteur === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'moteur_absent', texte: 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.' })
  }
  if (puissanceLibre === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'reserve_nulle', texte: 'Plus aucune réserve de puissance.' })
  }
  if (masseLibre === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'reserve_nulle', texte: 'Plus aucune réserve de masse.' })
  }

  return {
    coque: { cle: coque.cle, nom: coque.nom, classe: coque.classe },
    lignes: lignes.map((l) => ({ nature: l.nature, cle: l.cle, nom: l.nom, quantite: l.quantite, ...(l.magasins ? { magasins: l.magasins } : {}) })),
    prix,
    pv,
    ca,
    puissanceLibre,
    masseLibre,
    emports,
    chantierJours: Math.ceil(prix / CADENCE_CHANTIER),
    entretien: Math.floor(prix * TAUX_ENTRETIEN + 0.5 + 1e-9),
    porteeSaut: niveauMoteur === null ? null : reglages.porteeSaut * (niveauMoteur + 1),
    alertes: [...bloquantes, ...surveiller],
  }
}
