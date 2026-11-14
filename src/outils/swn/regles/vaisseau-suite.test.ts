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
const doublee = () => L('modifications', 'double-z', { effet: 'soutes_doublees', limite: 1 }, { vise: { nature: 'amenagements', cle: 'soute-z' } })

// W-2 / W-4: the four effects of the book, pure calculation, expected values written by hand from W-4.
const laser = (q = 1) => L('armes', 'laser-z', { emport: 1, puissance: 10, masse: 1 }, { quantite: q })
const mod = (effet: string, extra: Partial<ElementResolu> = {}, vise = false, q = 1) =>
  L('modifications', effet, { effet, limite: 1, ...extra }, { quantite: q, ...(vise ? { vise: { nature: 'armes' as NatureVaisseau, cle: 'laser-z' } } : {}) })
test('W-2 les quatre effets du livre : valeurs de W-4', () => {
  const nu = calculer(C2, [], R)
  const opt = calculer(C2, [mod('soutes_optimisees_livre')], R)
  assert.equal(opt.masseLibre, 18); assert.deepEqual(opt.lignes[0]!.ajuste, { masse: -2 }); assert.equal(opt.soutes, null)
  const s = calculer(C2, [soute(8), mod('soutes_optimisees_livre')], R)
  assert.equal(s.masseLibre, 11); assert.equal(s.soutes, 20)
  assert.equal(calculer(C2, [soute(7.5), mod('soutes_optimisees_livre')], R).masseLibre, 11.5)
  assert.equal(calculer(C2, [L('amenagements', 'a', { masse: 3 }), mod('soutes_optimisees_livre')], R).masseLibre, 15.5)
  assert.equal(calculer(C2, [L('amenagements', 'a', { masse: 19.5 }), mod('soutes_optimisees_livre')], R).masseLibre, 0.5)
  assert.equal(calculer(C2, [L('amenagements', 'a', { masse: 22 }), mod('soutes_optimisees_livre')], R).masseLibre, -2)
  assert.equal(calculer(C2, [{ ...reac(true), points: 4 }, mod('soutes_optimisees_livre')], R).masseLibre, 20)
  assert.equal(calculer(C2, [mod('soutes_optimisees_livre'), mod('soutes_optimisees_livre')], R).masseLibre, 18)
  for (const [valeur, rep, armure] of [[2, 0, 7], [2, 3, 10], [0, 4, 9], [2, 20, 27]] as const) {
    assert.equal(calculer(C2, [mod('blindage_renforce', { valeur })], R, null, rep).armure, armure)
    assert.equal(calculer(coque(4, 300000), [mod('blindage_renforce', { valeur })], R, null, rep).armure, armure)
  }
  assert.equal(nu.armure, 5)
  for (const [p, m, ep, em] of [[10, 1, 5, 1], [7, 3, 4, 1.5], [6, 4, 3, 2], [1, 1, 1, 1], [4, 2.5, 2, 1.5]] as const) {
    const r = calculer(C2, [L('armes', 'laser-z', { emport: 1, puissance: p, masse: m }), mod('montages_specialises', {}, true)], R)
    assert.deepEqual(r.lignes[1]!.ajuste, { masse: em, puissance: ep }, `${p}/${m}`)
  }
  const m2 = calculer(C2, [laser(2), mod('montages_specialises', {}, true)], R)
  assert.deepEqual(m2.lignes[1]!.ajuste, { masse: 1, puissance: 10 })
  assert.equal(calculer(C2, [laser(), mod('montages_specialises', {}, true)], R).puissanceLibre, 5)
  for (const [q, plus, libre] of [[1, 5, 5], [2, 10, 0], [3, 15, -5]] as const) {
    const r = calculer(C2, [laser(), mod('surcharge_cumulable', { effet_pct: 50, limite: 3 }, true, q)], R)
    assert.deepEqual(r.lignes[1]!.ajuste, { puissance: plus }); assert.equal(r.puissanceLibre, libre)
  }
  assert.ok(codes(calculer(C2, [laser(), mod('surcharge_cumulable', { effet_pct: 50, limite: 3 }, true, 3)], R)).includes('puissance_insuffisante'))
  for (const effet of ['montages_specialises', 'surcharge_cumulable']) {
    assert.ok(codes(calculer(C2, [laser(), mod(effet, { effet_pct: 50 })], R)).includes('cible_invalide'), effet)
    assert.ok(codes(calculer(C2, [laser(), { ...mod(effet, { effet_pct: 50 }), vise: { nature: 'amenagements', cle: 'soute-z' } }, soute(8)], R)).includes('cible_invalide'), effet)
  }
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
  const t = texteVaisseau(calculer(C2, [soute(8), doublee()], R))
  assert.match(t, /\(→ soute-z\)/)
})

import { controlerChoix } from '../../../services/swn/calcul-vaisseau.js'
import type { Resolution } from '../../../services/swn/calcul-vaisseau.js'
const res = (l: LigneResolue): Resolution => ({ coque: C2, lignes: [l], equipage: null, retirees: [], nomsRetires: [], inconnu: null, reparation: 0 })
const refus = (l: LigneResolue) => { try { controlerChoix(res(l)) } catch (e) { return (e as { champ?: string }).champ } return null }
const V = { nature: 'armes' as NatureVaisseau, cle: 'laser-z' }
test('Z-4 points et vise refusés sans leur effet, vise admis pour les quatre effets ciblés', () => {
  assert.equal(refus({ ...L('modifications', 'x', { effet: 'vitesse', valeur: 1 }), points: 2 }), 'points')
  assert.equal(refus({ ...L('modifications', 'x', {}), points: 2 }), 'points')
  assert.equal(refus({ ...reac(true), points: 6 }), 'points')
  assert.equal(refus({ ...reac(true), points: 5 }), null)
  assert.equal(refus({ ...L('modifications', 'x', { effet: 'blindage_renforce', valeur: 2 }), vise: V }), 'vise')
  assert.equal(refus({ ...L('modifications', 'x', {}), vise: V }), 'vise')
  for (const effet of ['soutes_doublees', 'magasins_doubles', 'montages_specialises', 'surcharge_cumulable']) {
    assert.equal(refus({ ...L('modifications', 'x', { effet }), vise: V }), null, effet)
  }
})
