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

// The four effects of the book are read without any rule of calculation yet (W-1): a line carrying one changes nothing.
test('W-1 les quatre effets du livre sont lus sans effet de calcul', () => {
  const nu = calculer(C2, [soute(8), L('armes', 'laser-z', { emport: 1, puissance: 10, masse: 1 })], R)
  for (const [effet, extra] of [['soutes_optimisees_livre', {}], ['blindage_renforce', { valeur: 2 }], ['montages_specialises', {}], ['surcharge_cumulable', { effet_pct: 50 }]] as const) {
    const r = calculer(C2, [soute(8), L('armes', 'laser-z', { emport: 1, puissance: 10, masse: 1 }),
      L('modifications', 'm', { effet, limite: 1, ...extra }, effet === 'montages_specialises' || effet === 'surcharge_cumulable' ? { vise: { nature: 'armes', cle: 'laser-z' } } : {})], R)
    for (const k of ['armure', 'puissanceLibre', 'masseLibre', 'soutes', 'prix'] as const) assert.deepEqual(r[k], nu[k], `${effet} ${k}`)
    assert.equal(r.lignes[2]!.ajuste, undefined, effet)
    assert.deepEqual(codes(r).filter((c) => c === 'cible_invalide'), [], effet)
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
