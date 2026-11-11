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
  /** Stated by the catalogue only (X-1); absent = not stated. */
  cout_pct?: number
  effet?: string
  valeur?: number
  points_max?: number
  sens?: string
  echange_puissance?: number
  echange_masse?: number
  rend_puissance?: number[]
  rend_masse?: number[]
  soute?: number
  /** Stated by the catalogue only (Y-1); the sheets print them and the calculation reads them (Y-3). */
  soute_par_classe?: number[]
  reduction_cout_pct?: number
  reparation_min?: number
  /** Stated by the catalogue only (Z-1); the sheets print them, the calculation of the next task reads them. */
  effet_pct?: number
  armure_par_classe?: number[]
  echange_arrondi?: string
  reduction_base?: string
}

export interface LigneResolue {
  nature: NatureVaisseau
  cle: string
  nom: string
  quantite: number
  /** Weapons only: extra magazines per unit (E-3), each one `MASSE_MAGASIN` of mass and its munitions. */
  magasins?: number
  /** X-4: points of an `echange` line (default 0) and the line a doubling aims at. */
  points?: number
  vise?: { nature: NatureVaisseau; cle: string }
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
  lignes: {
    nature: NatureVaisseau; cle: string; nom: string; quantite: number; magasins?: number
    /** X-3: only on a line whose element states `cout_pct`. */
    cout?: number
    points?: number
    echange?: { puissance: number; masse: number }
    vise?: { nature: NatureVaisseau; cle: string }
  }[]
  prix: number
  pv: number
  ca: number
  puissanceLibre: number
  masseLibre: number
  emports: { utilises: number; total: number }
  chantierJours: number
  entretien: number
  porteeSaut: number | null
  /** F-3: absent in a result stored before the slice, read as `null`. */
  vitesse?: number | null
  armure?: number | null
  equipage?: { choisi: number; min: number | null; max: number | null } | null
  /** X-3: absent in a result stored before the slice, read as `null`. */
  soutes?: number | null
  reparation?: { choisie: number; min: number | null } | null
  alertes: AlerteVaisseau[]
}

/** Y-3: the cargo of an element for a hull class (the per-class value wins), `null` when it states none. */
const souteDe = (e: ElementResolu, classe: number): number | null => e.soute_par_classe?.[classe - 1] ?? e.soute ?? null

/** Y-3: the repair skill an element asks for, by the field or by the effect, `null` when none. */
const exigence = (e: ElementResolu): number | null => e.reparation_min ?? (e.effet === 'reparation_min' ? (e.valeur ?? 0) : null)

function moins(n: number): string {
  return n < 0 ? `−${-n}` : String(n)
}


export function calculer(
  coque: CoqueResolue,
  lignes: LigneResolue[],
  reglages: ReglagesVaisseau,
  equipage: number | null = null,
  reparation = 0,
): ResultatVaisseau {
  let prix = coque.cout
  let pv = coque.pv
  let ca = coque.ca
  let puissanceUsee = 0
  let masseUsee = 0
  let emportsUtilises = 0
  let uniteMoteur = 0
  let niveauMoteur: number | null = null
  let bonusVitesse = 0
  let effetVitesse = 0
  let effetArmure = 0
  let soutes = null as number | null
  let reparationMin = null as number | null
  const coutsLigne = new Map<number, number>()
  const echanges = new Map<number, { puissance: number; masse: number }>()
  // X-2: a doubling aims at one line of the design, named by its pair.
  const visee = (cible: LigneResolue | undefined, nature: NatureVaisseau, effet: string) =>
    cible !== undefined && cible.nature === nature && lignes.some((m) => m.element.effet === effet && m.vise?.nature === cible.nature && m.vise.cle === cible.cle)

  lignes.forEach((l, i) => {
    const e = l.element
    const q = l.quantite
    let coutLigne = e.cout * (e.x_cout ? coque.facteur_cout : 1) * q
    if (e.cout_pct !== undefined) coutLigne += Math.floor((coque.cout * e.cout_pct + 50) / 100) * q
    // Y-3: the system engine's reduction is rounded half up on the reduction, taken off the line before the sums.
    const reduit = e.effet === 'moteur_systeme' && e.reduction_cout_pct !== undefined
    if (reduit) coutLigne = Math.max(0, coutLigne - Math.floor((coutLigne * e.reduction_cout_pct! + 50) / 100))
    prix += coutLigne
    if (e.cout_pct !== undefined || reduit) coutsLigne.set(i, coutLigne)
    if (e.effet === 'vitesse') effetVitesse += (e.valeur ?? 0) * q
    if (e.effet === 'armure') effetArmure += (e.valeur ?? 0) * q
    const exig = exigence(e)
    if (exig !== null) reparationMin = Math.max(reparationMin ?? 0, exig)
    const soute = souteDe(e, coque.classe)
    if (soute !== null) soutes = (soutes ?? 0) + soute * q * (visee(l, 'amenagements', 'soutes_doublees') ? 2 : 1)
    puissanceUsee += e.puissance * (e.x_puissance ? coque.facteur_puissance : 1) * q
    masseUsee += e.masse * (e.x_masse ? coque.facteur_masse : 1) * q
    pv += e.pv * q
    ca += e.ca * q
    if (l.nature === 'defenses') bonusVitesse += (e.bonus_vitesse ?? 0) * q
    if (l.nature === 'armes') {
      const doublements = e.classe_min === undefined ? 0 : Math.max(0, coque.classe - e.classe_min)
      const munitions = (e.munitions ?? 0) * (e.cout_munition ?? 0) * 2 ** doublements
      const magasins = l.magasins ?? 0
      const double = visee(l, 'armes', 'magasins_doubles') ? 2 : 1
      prix += munitions * (1 + magasins) * q * double
      masseUsee += MASSE_MAGASIN * magasins * q * double
      emportsUtilises += (e.emport ?? 0) * q
    }
    if (l.nature === 'moteurs' && q > 0) {
      uniteMoteur += q
      niveauMoteur = Math.max(niveauMoteur ?? 0, e.niveau ?? 0)
    }
  })

  let puissanceLibre = coque.puissance - puissanceUsee
  let masseLibre = coque.masse - masseUsee
  let unitesSysteme = 0
  // X-3, in order: the sums above, then the system engine, then the exchange of points.
  lignes.forEach((l) => {
    const e = l.element
    if (e.effet !== 'moteur_systeme') return
    unitesSysteme += l.quantite
    puissanceLibre += (e.rend_puissance?.[coque.classe - 1] ?? 0) * l.quantite
    masseLibre += (e.rend_masse?.[coque.classe - 1] ?? 0) * l.quantite
  })
  lignes.forEach((l, i) => {
    const e = l.element
    if (e.effet !== 'echange') return
    const p = l.points ?? 0
    const puissance = p * (e.echange_puissance ?? 0)
    const masse = p * (e.echange_masse ?? 0)
    const vers = e.sens === 'masse_vers_puissance'
    const delta = { puissance: vers ? puissance : 0 - puissance, masse: vers ? 0 - masse : masse }
    puissanceLibre += delta.puissance
    masseLibre += delta.masse
    echanges.set(i, delta)
  })
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
  lignes.forEach((l, i) => {
    if (l.nature === 'armes') return
    const { classe_min: mini, classe_max: maxi } = l.element
    let borne: string | null = null
    if (mini !== undefined && maxi !== undefined && mini === maxi && coque.classe !== mini) borne = `${mini} seulement`
    else if (mini !== undefined && coque.classe < mini) borne = `${mini} au moins`
    else if (maxi !== undefined && coque.classe > maxi) borne = `${maxi} au plus`
    if (borne !== null) {
      bloquantes.push({ niveau: 'bloquante', code: 'classe_inadaptee', texte: `« ${l.nom} » : classe de coque ${borne}.`, ligne: i })
    }
  })
  if (unitesSysteme > 1) {
    bloquantes.push({ niveau: 'bloquante', code: 'moteur_systeme_multiple', texte: 'Un seul moteur système par vaisseau.' })
  }
  lignes.forEach((l, i) => {
    const effet = l.element.effet
    if (effet !== 'soutes_doublees' && effet !== 'magasins_doubles') return
    let raison: string
    const cible = l.vise === undefined ? undefined : lignes.find((m) => m.nature === l.vise!.nature && m.cle === l.vise!.cle)
    if (l.vise === undefined) raison = 'choisissez l\'élément visé.'
    else if (cible === undefined) raison = 'l\'élément visé n\'est pas dans cette conception.'
    else if (effet === 'soutes_doublees' ? !(cible.nature === 'amenagements' && souteDe(cible.element, coque.classe) !== null) : cible.nature !== 'armes') {
      raison = 'cet élément ne peut pas être visé.'
    } else return
    bloquantes.push({ niveau: 'bloquante', code: 'cible_invalide', texte: `« ${l.nom} » : ${raison}`, ligne: i })
  })
  if (uniteMoteur === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'moteur_absent', texte: 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.' })
  }
  if (puissanceLibre === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'reserve_nulle', texte: 'Plus aucune réserve de puissance.' })
  }
  if (masseLibre === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'reserve_nulle', texte: 'Plus aucune réserve de masse.' })
  }
  const min = coque.equipage_min ?? null
  const max = coque.equipage_max ?? null
  if (equipage !== null && min !== null && equipage < min) {
    surveiller.push({ niveau: 'a_surveiller', code: 'equipage_insuffisant', texte: `Équipage insuffisant : ${equipage} sur ${min} au moins.` })
  }
  if (equipage !== null && max !== null && equipage > max) {
    surveiller.push({ niveau: 'a_surveiller', code: 'equipage_excessif', texte: `Équipage excessif : ${equipage} sur ${max} au plus.` })
  }
  lignes.forEach((l, i) => {
    const min = exigence(l.element) ?? 0
    if (min > reparation) {
      surveiller.push({ niveau: 'a_surveiller', code: 'reparation_insuffisante', texte: `« ${l.nom} » : réparation ${min} au moins (${reparation} choisie).`, ligne: i })
    }
  })

  const vitesseBase = coque.vitesse === undefined ? null : Math.max(0, coque.vitesse + bonusVitesse + effetVitesse)
  const armureBase = coque.armure === undefined ? null : Math.max(0, coque.armure + effetArmure)

  return {
    coque: { cle: coque.cle, nom: coque.nom, classe: coque.classe },
    lignes: lignes.map((l, i) => ({
      nature: l.nature, cle: l.cle, nom: l.nom, quantite: l.quantite, ...(l.magasins ? { magasins: l.magasins } : {}),
      ...(coutsLigne.has(i) ? { cout: coutsLigne.get(i)! } : {}),
      ...(echanges.has(i) ? { points: l.points ?? 0, echange: echanges.get(i)! } : {}),
      ...(l.vise ? { vise: { nature: l.vise.nature, cle: l.vise.cle } } : {}),
    })),
    prix,
    pv,
    ca,
    puissanceLibre,
    masseLibre,
    emports,
    chantierJours: Math.ceil(prix / CADENCE_CHANTIER),
    entretien: Math.floor(prix * TAUX_ENTRETIEN + 0.5 + 1e-9),
    porteeSaut: niveauMoteur === null ? null : reglages.porteeSaut * (niveauMoteur + 1),
    vitesse: vitesseBase,
    armure: armureBase,
    equipage: equipage === null ? null : { choisi: equipage, min, max },
    soutes,
    reparation: reparationMin === null && reparation === 0 ? null : { choisie: reparation, min: reparationMin },
    alertes: [...bloquantes, ...surveiller],
  }
}
