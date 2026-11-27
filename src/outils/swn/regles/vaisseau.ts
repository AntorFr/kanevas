// Ship calculation (V-2, B-75): pure, no database, no clock, no file read.
import { EFFETS, type CodeEffet } from './effets.js'
import { texteMasse } from './masse.js'

/** Credits of ship price built per day of construction, the default of the `cadence_chantier` setting (H-capacites-1 (3)). */
export const CADENCE_CHANTIER_DEFAUT = 25000
/** H-5: the defaults of the crew settings, and the one-off cost of a robot. */
export const SOLDE_JOUR_DEFAUT = 100
export const VIVRES_JOUR_DEFAUT = 20
export const COUT_ROBOT = 1000
/** H-4: hidden hold in tonnes, and the exodus bay's hold, by hull class 1 to 4. */
const FRET_CACHE = [0.2, 2, 20, 200]
const SOUTE_EXODE = [0, 0, 1000, 5000]
/** Yearly upkeep as a share of the price. */
export const TAUX_ENTRETIEN = 0.05
/** Mass of one extra magazine of a launcher (book mechanics, E-3). */
export const MASSE_MAGASIN = 1

/** H-mods-1 (3): the book's step of installation days, a constant of the rules (the shipyard's pace is the setting). */
export const PAS_INSTALLATION = 5000

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
  /** H-2: 0 for a station (no Spike drive, no speed); absent = 1, a hull stored before the slice (B-94). */
  moteur_spike?: number
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
  /** H-3: the count is capped by the total quantity of the design's weapon lines (`armes` only); absent = no such cap. */
  limite_par?: string
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
  /** Stated by the catalogue only (Z-1); the sheets print them, the calculation reads them (Z-3). */
  effet_pct?: number
  echange_arrondi?: string
  reduction_base?: string
  /** H-4/H-5: a code of `CODES_CAPACITE`, and the book's « Effect » text, never evaluated. */
  capacite?: string
  effet_jeu?: string
  /** H-mods-1 (1): pretech components of a modification, per installation; absent = 0 (B-94). `composants_par_classe` multiplies by the hull's rank. */
  composants?: number
  composants_par_classe?: number
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
  /** H-8: one pair per installation, for the effects that aim at elements of the design. */
  cibles?: { nature: NatureVaisseau; cle: string; quantite: number }[]
  /** H-9: installations of a modification line rebuilt into the hull (0..quantite; absent = 0). */
  integre?: number
  element: ElementResolu
}

export interface ReglagesVaisseau {
  porteeSaut: number
  /** H-capacites-1 (3)/(4): absent = the defaults, so a caller that does not pass them computes as before. */
  cadenceChantier?: number
  diviseurPrix?: number
  soldeJour?: number
  vivresJour?: number
}

/** H-4: a capacity of the result, in the order of `CODES_CAPACITE`. */
export interface CapaciteVaisseau { code: string; libelle: string; valeur: number; unite: string }

export interface AlerteVaisseau {
  niveau: 'bloquante' | 'a_surveiller'
  code: string
  texte: string
  ligne?: number
  /** H-mods-1 (4)/(5): the two figures of `maintenance_depassee` (mods kept up, Maintenance) and of `refonte_depassee` (refitted, 2 × Réparation). */
  nombres?: { a: number; b: number }
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
    cibles?: { nature: NatureVaisseau; cle: string; quantite: number }[]
    /** Z-3: only on a targeted modification (cargo mass, mounting, overload): the signed deltas actually applied to its target. */
    ajuste?: { masse?: number; puissance?: number; emports?: number; armure?: number }
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
  /** H-4: absent in a result stored before the slice, read as `null`. */
  capacites?: CapaciteVaisseau[] | null
  /** H-4: the `effet_jeu` of each chosen element, by line index, in the order of the lines; absent before the slice. */
  effetsJeu?: { ligne: number; nature: NatureVaisseau; cle: string; nom: string; texte: string }[] | null
  /** H-5: `null` without a chosen crew, absent before the slice. `jour` is credits per day; `robots` one-off, not divided, outside the price. */
  fraisEquipage?: { jour: number; robots: number } | null
  /** H-capacites-1 (3): the divisor the price was divided by; absent before the slice (read as 1). */
  diviseurPrix?: number
  /** H-mods-1: absent in a result stored before the slice, read as `null`. */
  composants?: number | null
  /** `jours`: crew days (cost / 5 000); `joursChantier`: shipyard days (cost / `cadence_chantier`); both 0 without a modification. */
  installation?: { jours: number; joursChantier: number } | null
  maintenance?: number | null
  refonte?: { cout: number; composants: number } | null
  alertes: AlerteVaisseau[]
}

/** Y-3: the cargo of an element for a hull class (the per-class value wins), `null` when it states none. */
const souteDe = (e: ElementResolu, classe: number): number | null => e.soute_par_classe?.[classe - 1] ?? e.soute ?? null

/** Y-3: the repair skill an element asks for, by the field or by the effect, `null` when none. */
const exigence = (e: ElementResolu): number | null => e.reparation_min ?? (e.effet === 'reparation_min' ? (e.valeur ?? 0) : null)

/** The one rounding of the halving of `montages_specialises` (W-3, decided 15/11): down, to a whole unit, at least 1. */
const ARRONDI_MOITIE = Math.floor
/** The rank cap of a Spike drive (`moteur_niveau`). */
const RANG_MAX = 6

/** H-8: the effects whose line carries `cibles` (the natures they may aim at come from their declaration). */
const naturesVisees = (effet: string | undefined): readonly string[] | undefined =>
  effet !== undefined && Object.hasOwn(EFFETS, effet) ? EFFETS[effet as CodeEffet].cible : undefined

/** H-8 (3): the half a mounting leaves of a unit value: never raises it, never below 1, a value of 0 stays. */
function moitie(v: number): number {
  return v <= 0 ? v : Math.min(v, Math.max(1, ARRONDI_MOITIE(v / 2 + 1e-9)))
}

function moins(n: number): string {
  return n < 0 ? `−${-n}` : String(n)
}

/** H-1: an element with a diesis weighs `⌈base × factor⌉` for ONE installation (the quantity multiplies afterwards); without it the value stays exact. */
function parInstallation(base: number, diese: boolean, facteur: number): number {
  return diese ? Math.ceil(base * facteur - 1e-9) : base
}

const LIBELLES_CAPACITE: Record<string, [string, string]> = {
  fret_cache: ['Fret caché', 't'], equipage_max_pct: ['Équipage maximum', 'personnes'], provisions: ['Provisions', 'mois'],
  hydroponie: ['Hydroponie', 'personnes'], sommeil_froid: ['Sommeil froid', 'personnes'], soute_exode: ['Soute d\'exode', 'personnes'],
  canots: ['Canots de sauvetage', 'canots'], cabines_luxe: ['Cabines de luxe', 'cabines'], colonie: ['Colonie', 'personnes'],
}

/*
 * Order of `calculer` (H-10 (1)):
 *   1. per line: cost, per-installation power and mass (diesis rounded before the quantity, H-1), hit points, armour class,
 *      munitions and magazines, engines;
 *   2. effects of modifications on elements (halving, overcharge, class lift, drive rank, magazines doubled) — computed with step 4;
 *   3. system engine returns, then the exchange of points;
 *   4. targeted adjustments (halving, then overcharge), then the optimised holds (last mass step);
 *   5. maximum crew (`equipage_max_pct`, H-4), then the capacities (H-4, reading that maximum), then the crew cost and its
 *      blocking checks (H-5, only with a chosen crew);
 *   6. alerts: blocking (power, mass, emports, limits, engine, class incl. weapons' `classe_min`, targets), then watch
 *      (reserves, crew, repair, negative speed);
 *   7. speed (simple sum, may be negative, H-6; `null` without a hull speed) and armour (floored at 0);
 *   8. the price divisor on the totals (H-capacites-1 (3)): displayed price, upkeep and build days follow it;
 *   9. last, the modification rules (H-mods-1): pretech components, installation days, Maintenance, refit, and their two watch
 *      alerts. They read the lines and the settings only, before the divisor and nothing downstream reads them.
 */
export function calculer(
  coque: CoqueResolue,
  lignes: LigneResolue[],
  reglages: ReglagesVaisseau = { porteeSaut: 5 },
  equipage: number | null = null,
  reparation = 0,
  pj = 0,
  robots = 0,
  modIntCon = 0,
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
  // H-mods-1 (2): the cost of every modification line, before the divisor (the one `coutLigne` below, not a second formula).
  const coutsMods = new Map<number, number>()
  const echanges = new Map<number, { puissance: number; masse: number }>()
  const cibleDe = (l: LigneResolue) => l.vise === undefined ? undefined : lignes.find((m) => m.nature === l.vise!.nature && m.cle === l.vise!.cle)
  const trouver = (c: { nature: string; cle: string }) => lignes.find((m) => m.nature === c.nature && m.cle === c.cle)
  // H-cibles-1 (1): the pairs of a line; an old single `vise` is one pair holding every installation.
  const ciblesDe = (l: LigneResolue): { nature: NatureVaisseau; cle: string; quantite: number }[] =>
    l.cibles ?? (l.vise ? [{ nature: l.vise.nature, cle: l.vise.cle, quantite: l.quantite }] : [])
  const masseDeLigne = (l: LigneResolue) => parInstallation(l.element.masse, l.element.x_masse, coque.facteur_masse) * l.quantite
  const puissanceDeLigne = (l: LigneResolue) => parInstallation(l.element.puissance, l.element.x_puissance, coque.facteur_puissance) * l.quantite
  // X-2: a doubling aims at one line of the design, named by its pair.
  const visee = (cible: LigneResolue | undefined, nature: NatureVaisseau, effet: string) =>
    cible !== undefined && cible.nature === nature && lignes.some((m) => m.element.effet === effet && m.vise?.nature === cible.nature && m.vise.cle === cible.cle)
  // H-8 (4): the doubling of the magazines has no target: every ammunition weapon, the magazines' mass unchanged.
  const munitionsDoublees = lignes.some((m) => m.element.effet === 'magasins_doubles' && m.quantite > 0)

  lignes.forEach((l, i) => {
    const e = l.element
    const q = l.quantite
    let coutLigne = e.cout * (e.x_cout ? coque.facteur_cout : 1) * q
    if (e.cout_pct !== undefined) coutLigne += Math.floor((coque.cout * e.cout_pct + 50) / 100) * q
    // Y-3: the system engine's reduction is rounded half up on the reduction, taken off the line before the sums.
    // Z-3: the base is the hull's cost (`coque`) or the line's own cost (default); the line costs at least 0.
    const reduit = e.effet === 'moteur_systeme' && e.reduction_cout_pct !== undefined
    if (reduit) {
      const assiette = e.reduction_base === 'coque' ? coque.cout : coutLigne
      coutLigne = Math.max(0, coutLigne - Math.floor((assiette * e.reduction_cout_pct! + 50) / 100))
    }
    // B-95: a modification's cost stays on its own line (and the install / refit totals), never in the price or upkeep.
    if (l.nature === 'modifications') coutsMods.set(i, coutLigne)
    else prix += coutLigne
    if (e.cout_pct !== undefined || reduit) coutsLigne.set(i, coutLigne)
    if (e.effet === 'vitesse') effetVitesse += (e.valeur ?? 0) * q
    if (e.effet === 'armure') effetArmure += (e.valeur ?? 0) * q
    const exig = exigence(e)
    if (exig !== null) reparationMin = Math.max(reparationMin ?? 0, exig)
    const soute = souteDe(e, coque.classe)
    if (soute !== null) soutes = (soutes ?? 0) + soute * q * (visee(l, 'amenagements', 'soutes_doublees') ? 2 : 1)
    puissanceUsee += puissanceDeLigne(l)
    masseUsee += masseDeLigne(l)
    pv += e.pv * q
    ca += e.ca * q
    if (l.nature === 'defenses') bonusVitesse += (e.bonus_vitesse ?? 0) * q
    if (l.nature === 'armes') {
      const doublements = e.classe_min === undefined ? 0 : Math.max(0, coque.classe - e.classe_min)
      const munitions = (e.munitions ?? 0) * (e.cout_munition ?? 0) * 2 ** doublements
      const magasins = l.magasins ?? 0
      const double = munitionsDoublees && (e.munitions ?? 0) > 0 ? 2 : 1
      prix += munitions * (1 + magasins) * q * double
      masseUsee += MASSE_MAGASIN * magasins * q
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
    // Z-3: a rounded exchange is per installation (q of them), its mass rounded down; the power side is already whole.
    const arrondi = e.echange_arrondi === 'installation'
    const puissance = p * (e.echange_puissance ?? 0) * (arrondi ? l.quantite : 1)
    const masse = arrondi ? Math.floor(p * (e.echange_masse ?? 0) + 1e-9) * l.quantite : p * (e.echange_masse ?? 0)
    const vers = e.sens === 'masse_vers_puissance'
    const delta = { puissance: vers ? puissance : 0 - puissance, masse: vers ? 0 - masse : masse }
    puissanceLibre += delta.puissance
    masseLibre += delta.masse
    echanges.set(i, delta)
  })
  // H-10 (1), step 2: the effects of the modifications on elements, read on the unit of the target before any of them (W-2).
  // Halving first (per installation, on ONE unit of the target), then the overcharge on the halved unit.
  const ajustes = new Map<number, { masse?: number; puissance?: number; armure?: number }>()
  const sansObjet = new Map<number, string>()
  const cleDe = (c: { nature: string; cle: string }) => `${c.nature}/${c.cle}`
  const uniteP = (c: LigneResolue) => parInstallation(c.element.puissance, c.element.x_puissance, coque.facteur_puissance)
  const uniteM = (c: LigneResolue) => parInstallation(c.element.masse, c.element.x_masse, coque.facteur_masse)
  // A pair counts when its element is in the design and of a nature the effect may aim at (the others are `cible_invalide`).
  const pairesValides = (l: LigneResolue) => ciblesDe(l).flatMap((c) => {
    const t = trouver(c)
    return t !== undefined && c.quantite >= 1 && (naturesVisees(l.element.effet)?.includes(t.nature) ?? false) ? [{ c, t }] : []
  })
  const moities = new Map<string, { p: number; m: number }>()
  lignes.forEach((l, i) => {
    if (l.element.effet !== 'montages_specialises' || l.quantite <= 0) return
    let dP = 0
    let dM = 0
    const valides = pairesValides(l)
    if (valides.length === 0) return
    for (const { c, t } of valides) {
      const cle = cleDe(c)
      if (moities.has(cle)) continue // aimed twice: refused (`cible_deja_visee`), halved once all the same
      const p = moitie(uniteP(t))
      const m = moitie(uniteM(t))
      moities.set(cle, { p, m })
      // A second installation on the element is refused (`cible_deja_visee`) and never halves it twice (never below its floor).
      dP += uniteP(t) - p
      dM += uniteM(t) - m
    }
    puissanceLibre += dP
    masseLibre += dM
    ajustes.set(i, { masse: 0 - dM, puissance: 0 - dP })
    if (dP === 0 && dM === 0) sansObjet.set(i, 'ce montage ne change rien.')
  })
  let blindage = 0
  let blindageVu = false
  lignes.forEach((l, i) => {
    const e = l.element
    if (l.quantite <= 0) return
    if (e.effet === 'surcharge_cumulable') {
      let plus = 0
      const valides = pairesValides(l)
      if (valides.length === 0) return
      for (const { c, t } of valides) {
        const p = moities.get(cleDe(c))?.p ?? uniteP(t)
        plus += c.quantite * Math.floor((p * (e.effet_pct ?? 0) + 50) / 100 + 1e-9)
      }
      puissanceLibre -= plus
      ajustes.set(i, { puissance: plus })
      if (plus === 0) sansObjet.set(i, 'cette surcharge ne change rien.')
    } else if (e.effet === 'blindage_renforce' && !blindageVu) {
      blindageVu = true
      blindage = (e.valeur ?? 0) + reparation
      ajustes.set(i, { armure: blindage })
    }
  })
  // W-2, last mass step: the optimised holds act once, on the final free mass; a free mass of 0 or below is unchanged.
  const optimisee = lignes.findIndex((l) => l.element.effet === 'soutes_optimisees_livre' && l.quantite > 0)
  if (optimisee >= 0) {
    if (masseLibre > 0) {
      const avant = masseLibre
      masseLibre = Math.ceil(Math.round(masseLibre * 2) * 9 / 10) / 2
      ajustes.set(optimisee, { masse: masseLibre - avant })
    }
    if (soutes !== null) soutes = (soutes as number) * 2
  }
  const emports = { utilises: emportsUtilises, total: coque.emports }

  // H-4: the maximum crew first (`equipage_max_pct`: +100 % of the hull's own per installation), the capacities read it.
  const installations = (code: string) => lignes.reduce((n, l) => n + (l.element.capacite === code && l.quantite > 0 ? l.quantite : 0), 0)
  const maxCoque = coque.equipage_max ?? null
  const max = maxCoque === null ? null : maxCoque + maxCoque * installations('equipage_max_pct')
  const capacites: CapaciteVaisseau[] = []
  for (const code of Object.keys(LIBELLES_CAPACITE)) {
    const n = installations(code)
    if (n === 0) continue
    const lecture = code !== 'fret_cache' && code !== 'provisions' && code !== 'soute_exode'
    if (lecture && max === null) continue
    const m = max ?? 0
    const valeur = code === 'fret_cache' ? Math.round(FRET_CACHE[coque.classe - 1]! * n * 10) / 10
      : code === 'equipage_max_pct' ? m
      : code === 'provisions' ? 2 * 2 ** n
      : code === 'hydroponie' ? m * 2 ** (n - 1)
      : code === 'sommeil_froid' ? m * n
      : code === 'soute_exode' ? SOUTE_EXODE[coque.classe - 1]! * 2 ** (n - 1)
      : code === 'canots' ? Math.ceil(m / 20) * n
      : code === 'cabines_luxe' ? Math.ceil(m / 10) * n
      : 5 * m * n
    if (valeur === 0) continue
    const [libelle, unite] = LIBELLES_CAPACITE[code]!
    capacites.push({ code, libelle, valeur, unite })
  }
  const effetsJeu = lignes.flatMap((l, i) => l.element.effet_jeu === undefined ? []
    : [{ ligne: i, nature: l.nature, cle: l.cle, nom: l.nom, texte: l.element.effet_jeu }])

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
  const station = coque.moteur_spike === 0
  const armesTotal = lignes.reduce((n, l) => n + (l.nature === 'armes' ? l.quantite : 0), 0)
  lignes.forEach((l, i) => {
    if (l.element.limite_par === 'armes' && l.quantite > armesTotal) {
      bloquantes.push({ niveau: 'bloquante', code: 'limite_depassee',
        texte: `Limite dépassée : ${l.quantite} système(s) d'auto-ciblage pour ${armesTotal} arme(s)`, ligne: i })
    }
    if (station && l.quantite > 0 && (l.nature === 'moteurs' || l.element.effet === 'moteurs' || l.element.effet === 'moteur_systeme')) {
      bloquantes.push({ niveau: 'bloquante', code: 'moteur_sur_station',
        texte: `« ${l.nom} » : une station n'a pas de moteur de saut ni de moteur système.`, ligne: i })
    }
  })
  if (uniteMoteur > 1) {
    bloquantes.push({ niveau: 'bloquante', code: 'moteur_multiple', texte: 'Un seul moteur par vaisseau.' })
  }
  // H-cibles-1 (4): `surdimensionne` lifts the minimum class bar by one class for the element it aims at, never the maximum.
  const levees = new Set<string>()
  lignes.forEach((l) => {
    if (l.element.effet === 'surdimensionne' && l.quantite > 0) pairesValides(l).forEach(({ c }) => levees.add(cleDe(c)))
  })
  lignes.forEach((l, i) => {
    const { classe_min: mini, classe_max: maxi } = l.element
    const petite = mini !== undefined && coque.classe < (levees.has(cleDe(l)) ? mini - 1 : mini)
    const grande = maxi !== undefined && coque.classe > maxi
    if (!petite && !grande) return
    const borne = mini !== undefined && maxi !== undefined && mini === maxi ? `${mini} seulement` : petite ? `${mini} au moins` : `${maxi} au plus`
    bloquantes.push({ niveau: 'bloquante', code: 'classe_inadaptee', texte: `« ${l.nom} » : classe de coque ${borne}.`, ligne: i })
  })
  if (unitesSysteme > 1) {
    bloquantes.push({ niveau: 'bloquante', code: 'moteur_systeme_multiple', texte: 'Un seul moteur système par vaisseau.' })
  }
  lignes.forEach((l, i) => {
    const effet = l.element.effet
    if (effet !== 'soutes_doublees') return
    let raison: string
    const cible = cibleDe(l)
    if (l.vise === undefined) raison = 'choisissez l\'élément visé.'
    else if (cible === undefined) raison = 'l\'élément visé n\'est pas dans cette conception.'
    else if (!(cible.nature === 'amenagements' && souteDe(cible.element, coque.classe) !== null)) raison = 'cet élément ne peut pas être visé.'
    else return
    bloquantes.push({ niveau: 'bloquante', code: 'cible_invalide', texte: `« ${l.nom} » : ${raison}`, ligne: i })
  })
  // H-cibles-1 (2): one `cible_invalide` per line, then `cible_deja_visee` on the line that comes second.
  const montees = new Set<string>()
  lignes.forEach((l, i) => {
    const natures = naturesVisees(l.element.effet)
    if (natures === undefined) return
    const paires = ciblesDe(l)
    let raison: string | null = null
    if (l.quantite > 0 && paires.length === 0) raison = 'choisissez l\'élément visé.'
    else if (paires.some((c) => !(c.quantite >= 1))) raison = 'quantité visée invalide.'
    else if (new Set(paires.map(cleDe)).size !== paires.length) raison = 'un même élément ne peut être visé qu\'une fois par ligne.'
    else if (paires.some((c) => trouver(c) === undefined)) raison = 'l\'élément visé n\'est pas dans cette conception.'
    else if (paires.some((c) => !natures.includes(c.nature))) raison = 'cet élément ne peut pas être visé.'
    else if (paires.reduce((n, c) => n + c.quantite, 0) !== l.quantite) raison = 'choisissez l\'élément visé.'
    if (raison !== null) bloquantes.push({ niveau: 'bloquante', code: 'cible_invalide', texte: `« ${l.nom} » : ${raison}`, ligne: i })
    if (l.element.effet === 'montages_specialises' && l.quantite > 0) {
      const deja = paires.some((c) => c.quantite > 1 || montees.has(cleDe(c)))
      paires.forEach((c) => montees.add(cleDe(c)))
      if (deja) bloquantes.push({ niveau: 'bloquante', code: 'cible_deja_visee', texte: `« ${l.nom} » : un seul montage spécialisé par élément.`, ligne: i })
    }
  })
  // H-cibles-1 (5): the drive counts one rank higher (cap 6) for the jump range; nothing to raise = `effet_sans_objet`.
  const rangMoteur = niveauMoteur
  const rehausse = rangMoteur !== null && !station && unitesSysteme === 0 && rangMoteur < RANG_MAX
  lignes.forEach((l, i) => {
    if (l.quantite <= 0) return
    const e = l.element
    let raison: string | undefined = sansObjet.get(i)
    if (e.effet === 'moteur_niveau' && !rehausse) {
      raison = station ? 'une station n\'a pas de moteur de saut.' : unitesSysteme > 0 ? 'le moteur est un moteur système.'
        : rangMoteur === null ? 'aucun moteur de saut à relever.' : 'le moteur est déjà de rang 6.'
    }
    if (e.effet === 'surdimensionne') {
      const paires = pairesValides(l)
      const besoin = paires.some(({ t }) => t.element.classe_min !== undefined && coque.classe < t.element.classe_min)
      if (!besoin) raison = 'cet élément n\'a pas besoin d\'une coque plus grande.'
    }
    if (raison !== undefined) surveiller.push({ niveau: 'a_surveiller', code: 'effet_sans_objet', texte: `« ${l.nom} » : ${raison}`, ligne: i })
  })
  // H-5: with no chosen crew, none of the crew checks runs.
  let fraisEquipage: { jour: number; robots: number } | null = null
  if (equipage !== null) {
    const vivants = equipage - robots
    const alerteEquipage = (texte: string) => bloquantes.push({ niveau: 'bloquante', code: 'equipage_robots', texte })
    if (robots > 0 && !lignes.some((l) => l.element.effet === 'support_automatisation' && l.quantite > 0)) {
      alerteEquipage('Des robots exigent un système d\'automatisation.')
    }
    // A crew of 0 with no robot is only « insuffisant » (B-82, existing behaviour): the living-member check starts with robots.
    if (robots > 0 && vivants < 1) alerteEquipage('Au moins un membre d\'équipage doit rester vivant.')
    else if (pj > vivants) alerteEquipage('Plus de personnages-joueurs que de membres d\'équipage vivants.')
    fraisEquipage = {
      jour: (reglages.soldeJour ?? SOLDE_JOUR_DEFAUT) * Math.max(0, vivants - pj) + (reglages.vivresJour ?? VIVRES_JOUR_DEFAUT) * Math.max(0, vivants),
      robots: COUT_ROBOT * robots,
    }
  }
  if (uniteMoteur === 0 && !station) {
    surveiller.push({ niveau: 'a_surveiller', code: 'moteur_absent', texte: 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.' })
  }
  if (puissanceLibre === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'reserve_nulle', texte: 'Plus aucune réserve de puissance.' })
  }
  if (masseLibre === 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'reserve_nulle', texte: 'Plus aucune réserve de masse.' })
  }
  const vitesseSimple = coque.vitesse === undefined ? null : coque.vitesse + bonusVitesse + effetVitesse
  if (vitesseSimple !== null && vitesseSimple < 0) {
    surveiller.push({ niveau: 'a_surveiller', code: 'vitesse_negative', texte: 'Vitesse négative : malus aux jets de Pilotage' })
  }
  const min = coque.equipage_min ?? null
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

  const vitesseBase = vitesseSimple
  const armureBase = coque.armure === undefined ? null : Math.max(0, coque.armure + effetArmure) + blindage

  // H-capacites-1 (3): the divisor comes last, on the totals only; the line part prices above stay whole.
  const diviseur = reglages.diviseurPrix ?? 1
  const prixAffiche = Math.ceil(prix / diviseur)

  // H-mods-1: the last stage. The rank is the hull's class itself (the registry's 1–4 scale, L-48), no "+ 1".
  const rang = coque.classe
  const composantsDe = (l: LigneResolue) => (l.element.composants ?? 0) * (l.element.composants_par_classe ? rang : 1)
  let coutMods = 0
  let composants = 0
  let entretenus = 0
  let integres = 0
  let coutRefonte = 0
  let composantsRefonte = 0
  lignes.forEach((l, i) => {
    if (l.nature !== 'modifications') return
    const q = l.quantite
    const integre = q > 0 ? Math.max(0, Math.min(l.integre ?? 0, q)) : 0
    const cout = coutsMods.get(i) ?? 0
    coutMods += cout
    composants += composantsDe(l) * q
    entretenus += q - integre
    integres += integre
    if (q > 0) coutRefonte += (cout / q) * integre
    composantsRefonte += composantsDe(l) * integre
  })
  const maintenance = Math.max(0, modIntCon + 3 * reparation)
  if (entretenus > maintenance) {
    surveiller.push({ niveau: 'a_surveiller', code: 'maintenance_depassee', nombres: { a: entretenus, b: maintenance },
      texte: `${entretenus} ${entretenus < 2 ? 'mod entretenu' : 'mods entretenus'}, Maintenance ${maintenance}` })
  }
  if (integres > 2 * reparation) {
    surveiller.push({ niveau: 'a_surveiller', code: 'refonte_depassee', nombres: { a: integres, b: 2 * reparation },
      texte: 'Plus de mods intégrés que 2 × Réparation' })
  }

  return {
    coque: { cle: coque.cle, nom: coque.nom, classe: coque.classe },
    lignes: lignes.map((l, i) => ({
      nature: l.nature, cle: l.cle, nom: l.nom, quantite: l.quantite, ...(l.magasins ? { magasins: l.magasins } : {}),
      ...(coutsLigne.has(i) ? { cout: coutsLigne.get(i)! } : {}),
      ...(echanges.has(i) ? { points: l.points ?? 0, echange: echanges.get(i)! } : {}),
      ...(l.cibles ? { cibles: l.cibles } : l.vise ? { vise: { nature: l.vise.nature, cle: l.vise.cle } } : {}),
      ...(ajustes.has(i) ? { ajuste: ajustes.get(i)! } : {}),
    })),
    prix: prixAffiche,
    pv,
    ca,
    puissanceLibre,
    masseLibre,
    emports,
    chantierJours: Math.max(1, Math.ceil(prixAffiche / (reglages.cadenceChantier ?? CADENCE_CHANTIER_DEFAUT))),
    entretien: Math.floor(prixAffiche * TAUX_ENTRETIEN + 0.5 + 1e-9),
    porteeSaut: station || niveauMoteur === null ? null : reglages.porteeSaut * (niveauMoteur + (rehausse && lignes.some((l) => l.element.effet === 'moteur_niveau' && l.quantite > 0) ? 1 : 0) + 1),
    vitesse: vitesseBase,
    armure: armureBase,
    equipage: equipage === null ? null : { choisi: equipage, min, max },
    soutes,
    capacites,
    effetsJeu,
    fraisEquipage,
    diviseurPrix: diviseur,
    reparation: reparationMin === null && reparation === 0 ? null : { choisie: reparation, min: reparationMin },
    composants,
    installation: { jours: Math.max(0, Math.ceil(coutMods / PAS_INSTALLATION - 1e-9)), joursChantier: Math.max(0, Math.ceil(coutMods / (reglages.cadenceChantier ?? CADENCE_CHANTIER_DEFAUT) - 1e-9)) },
    maintenance,
    refonte: { cout: Math.round(5 * coutRefonte), composants: 2 * composantsRefonte },
    alertes: [...bloquantes, ...surveiller],
  }
}
