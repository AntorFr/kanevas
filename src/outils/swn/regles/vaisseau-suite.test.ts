// Review of kanevas-outils-format-vaisseaux-suite-calcul (Z-3, Z-4, Z-5): pure calculation, expected values written by hand from Z-5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import { texteVaisseau } from './texte-vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (classe: number, cout: number, armure = 5): CoqueResolue =>
  ({ cle: `c${classe}`, nom: `C${classe}`, classe, cout, pv: 5, ca: 10, puissance: 20, masse: 20, emports: 3, facteur_cout: 5, facteur_puissance: 2, facteur_masse: 3, vitesse: 3, armure }) as CoqueResolue
const C2 = coque(2, 300000)
const L = (nature: NatureVaisseau, nom: string, e: Partial<ElementResolu>, extra: Partial<LigneResolue> = {}): LigneResolue =>
  ({ nature, cle: nom, nom, quantite: 1, element: { ...base, ...e }, ...extra })
const R = { porteeSaut: 5 }
const codes = (r: ReturnType<typeof calculer>) => r.alertes.map((a) => a.code)

const sys = (pct: number, b?: string) => L('moteurs', 'moteur-sys', { effet: 'moteur_systeme', cout: 40000, reduction_cout_pct: pct, puissance: 3, masse: 1.5, ...(b ? { reduction_base: b } : {}) })

test('Z-3 base de la réduction', () => {
  for (const b of [undefined, 'amenagement']) {
    const r = calculer(C2, [sys(10, b)], R)
    assert.equal(r.lignes[0]!.cout, 36000); assert.equal(r.prix, 336000)
  }
  const r = calculer(C2, [sys(10, 'coque')], R)
  assert.equal(r.lignes[0]!.cout, 10000); assert.equal(r.prix, 310000)
  assert.equal(r.puissanceLibre, 17); assert.equal(r.masseLibre, 18.5)
  assert.equal(r.chantierJours, calculer({ ...C2, cout: 300000 }, [L('moteurs', 'x', { cout: 10000 })], R).chantierJours)
  assert.equal(r.entretien, 15500)
  const h = calculer(coque(2, 333335), [sys(10, 'coque')], R)
  assert.equal(h.lignes[0]!.cout, 6666); assert.equal(h.prix, 340001)
  const f = calculer(C2, [L('moteurs', 'm', { effet: 'moteur_systeme', cout: 20000, reduction_cout_pct: 10, reduction_base: 'coque' })], R)
  assert.equal(f.lignes[0]!.cout, 0); assert.equal(f.prix, 300000)
  assert.equal(calculer(C2, [sys(100, 'coque')], R).lignes[0]!.cout, 0)
})

const soute = (m: number) => L('amenagements', 'soute-z', { soute: 10, masse: m })
const opt = (pct: number, vise = 'soute-z', nat: NatureVaisseau = 'amenagements') =>
  L('modifications', 'optimise-z', { effet: 'soutes_optimisees', effet_pct: pct, limite: 1 }, { vise: { nature: nat, cle: vise } })

test('Z-3 masse de soute', () => {
  const r = calculer(C2, [soute(8), opt(10)], R)
  assert.equal(r.masseLibre, 13); assert.deepEqual(r.lignes[1]!.ajuste, { masse: -1 }); assert.equal(r.soutes, 10)
  assert.equal(codes(r).includes('cible_invalide'), false)
  for (const [m, p, libre] of [[5, 10, 15.5], [1, 10, 19], [8, 25, 14], [8, 100, 20]] as const) {
    assert.equal(calculer(C2, [soute(m), opt(p)], R).masseLibre, libre, `${m}@${p}`)
  }
  assert.equal(calculer(C2, [soute(1), opt(10)], R).masseLibre, 19)
  assert.deepEqual(calculer(C2, [soute(5), opt(10)], R).lignes[1]!.ajuste, { masse: -0.5 })
  assert.ok(codes(calculer(C2, [L('modifications', 'o', { effet: 'soutes_optimisees', effet_pct: 10 })], R)).includes('cible_invalide'))
  assert.ok(codes(calculer(C2, [L('amenagements', 'nu', { masse: 8 }), opt(10, 'nu')], R)).includes('cible_invalide'))
  assert.ok(codes(calculer(C2, [soute(8), opt(10, 'absent')], R)).includes('cible_invalide'))
})

test('Z-3 armure par classe', () => {
  const b = L('modifications', 'blindage-z', { effet: 'armure_par_classe', armure_par_classe: [1, 2, 3, 4] })
  assert.equal(calculer(C2, [b], R).armure, 7)
  assert.equal(calculer(coque(3, 400000), [b], R).armure, 8)
  assert.equal(calculer(coque(1, 100000), [b], R).armure, 6)
  assert.equal(calculer(C2, [{ ...b, quantite: 2 }], R).armure, 9)
  assert.equal(calculer(C2, [L('modifications', 'z', { effet: 'armure_par_classe', armure_par_classe: [0, 0, 0, 0] })], R).armure, 5)
  // adds to a plain armour effect
  assert.equal(calculer(C2, [b, L('modifications', 'a', { effet: 'armure', valeur: 1 })], R).armure, 8)
})

const laser = (extra: Partial<LigneResolue> = {}) => L('armes', 'laser-z', { emport: 1, puissance: 10, masse: 1, munitions: 0 }, extra)
const mont = (v: number) => L('modifications', 'montage-z', { effet: 'montage_specialise', valeur: v, limite: 1 }, { vise: { nature: 'armes', cle: 'laser-z' } })
test('Z-3 montage spécialisé', () => {
  let r = calculer(C2, [laser(), mont(-1)], R)
  assert.equal(r.emports.utilises, 0); assert.deepEqual(r.lignes[1]!.ajuste, { emports: -1 })
  assert.equal(calculer(C2, [laser(), mont(1)], R).emports.utilises, 2)
  r = calculer(C2, [laser(), mont(-2)], R)
  assert.equal(r.emports.utilises, 0); assert.deepEqual(r.lignes[1]!.ajuste, { emports: -1 })
  assert.equal(calculer(C2, [laser({ quantite: 2 }), mont(-1)], R).emports.utilises, 1)
  assert.ok(codes(calculer(C2, [L('amenagements', 'laser-z', {}), mont(1)], R)).includes('cible_invalide'))
})

const sur = (p: number, nom = 'surcharge-z') => L('modifications', nom, { effet: 'surcharge_arme', effet_pct: p, limite: 1 }, { vise: { nature: 'armes', cle: 'laser-z' } })
test('Z-3 surcharge', () => {
  const r = calculer(C2, [laser(), sur(50)], R)
  assert.deepEqual(r.lignes[1]!.ajuste, { puissance: 5 }); assert.equal(r.puissanceLibre, 5)
  const l3 = L('armes', 'laser-z', { emport: 1, puissance: 3 })
  assert.equal(calculer(C2, [l3, sur(50)], R).puissanceLibre, 15)
  assert.equal(calculer(C2, [l3, sur(10)], R).puissanceLibre, 17)
  assert.equal(calculer(C2, [laser(), sur(50), sur(20, 's2')], R).puissanceLibre, 3)
  assert.ok(codes(calculer(C2, [L('modifications', 's', { effet: 'surcharge_arme', effet_pct: 50 })], R)).includes('cible_invalide'))
  assert.ok(codes(calculer(C2, [L('moteurs', 'laser-z', {}), sur(50)], R)).includes('cible_invalide'))
})

test('Z-3 sommes jamais sous 0', () => {
  // two mounts of −1 on a single emport: 1−2 → 0, extra −1
  const r = calculer(C2, [laser(), mont(-1), { ...mont(-1), cle: 'm2', nom: 'm2' }], R)
  assert.equal(r.emports.utilises, 0)
  // each computed on the pre-adjustment value: 8 mass, 100 % twice → 8−8 floored at 0, not −8
  const r2 = calculer(C2, [soute(8), opt(100), { ...opt(100), cle: 'o2', nom: 'o2' }], R)
  assert.equal(r2.masseLibre, 20)
})

const reac = (arr: boolean, sens = 'puissance_vers_masse') => L('modifications', 'reacteur-i', { effet: 'echange', sens, points_max: 5, echange_puissance: 1, echange_masse: 0.5, ...(arr ? { echange_arrondi: 'installation' } : {}), limite: 3 })
test('Z-3 échange arrondi', () => {
  const ex = (p: number, q = 1, arr = true, sens?: string) => calculer(C2, [{ ...reac(arr, sens), points: p, quantite: q }], R).lignes[0]!.echange
  assert.deepEqual(ex(1), { puissance: -1, masse: 0 })
  assert.deepEqual(ex(3), { puissance: -3, masse: 1 })
  assert.deepEqual(ex(4), { puissance: -4, masse: 2 })
  assert.deepEqual(ex(5), { puissance: -5, masse: 2 })
  assert.deepEqual(ex(3, 2), { puissance: -6, masse: 2 })
  assert.deepEqual(ex(1, 3), { puissance: -3, masse: 0 })
  assert.deepEqual(ex(3, 1, true, 'masse_vers_puissance'), { puissance: 3, masse: -1 })
  assert.deepEqual(ex(3, 1, false), { puissance: -3, masse: 1.5 })
  const r = calculer(C2, [{ ...reac(true), points: 3, quantite: 2 }], R)
  assert.equal(r.puissanceLibre, 14); assert.equal(r.masseLibre, 22)
})

test('Z-7 texte du vaisseau', () => {
  const t = texteVaisseau(calculer(C2, [soute(8), opt(10)], R))
  assert.match(t, /\(→ soute-z\)/)
})

import { controlerChoix } from '../../../services/swn/calcul-vaisseau.js'
import type { Resolution } from '../../../services/swn/calcul-vaisseau.js'
const res = (l: LigneResolue): Resolution => ({ coque: C2, lignes: [l], equipage: null, retirees: [], nomsRetires: [], inconnu: null, reparation: 0 })
const refus = (l: LigneResolue) => { try { controlerChoix(res(l)) } catch (e) { return (e as { champ?: string }).champ } return null }
const V = { nature: 'armes' as NatureVaisseau, cle: 'laser-z' }
test('Z-4 points et vise refusés sans leur effet, vise admis pour les cinq effets ciblés', () => {
  assert.equal(refus({ ...L('modifications', 'x', { effet: 'vitesse', valeur: 1 }), points: 2 }), 'points')
  assert.equal(refus({ ...L('modifications', 'x', {}), points: 2 }), 'points')
  assert.equal(refus({ ...reac(true), points: 6 }), 'points')
  assert.equal(refus({ ...reac(true), points: 5 }), null)
  assert.equal(refus({ ...L('modifications', 'x', { effet: 'armure_par_classe', armure_par_classe: [1, 2, 3, 4] }), vise: V }), 'vise')
  assert.equal(refus({ ...L('modifications', 'x', {}), vise: V }), 'vise')
  for (const effet of ['soutes_doublees', 'magasins_doubles', 'soutes_optimisees', 'montage_specialise', 'surcharge_arme']) {
    assert.equal(refus({ ...L('modifications', 'x', { effet }), vise: V }), null, effet)
  }
})
