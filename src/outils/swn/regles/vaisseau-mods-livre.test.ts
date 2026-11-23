// Review of kanevas-concepteur-vaisseaux-mods-livre-calcul (H-9, H-10 (1), H-mods-1 (1) to (6)): expected values written by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (classe: number): CoqueResolue =>
  ({ cle: `c${classe}`, nom: `C${classe}`, classe, cout: 1000, pv: 5, ca: 10, puissance: 1000, masse: 1000, emports: 5, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 0, armure: 1 }) as CoqueResolue
const mod = (cout: number, quantite = 1, extra: Partial<ElementResolu> = {}, integre?: number): LigneResolue =>
  ({ nature: 'modifications', cle: `m${cout}`, nom: `M${cout}`, quantite, ...(integre === undefined ? {} : { integre }), element: { ...base, cout, ...extra } })
const R = { porteeSaut: 5 }
const codes = (r: ReturnType<typeof calculer>) => r.alertes.map((a) => a.code).filter((c) => c === 'maintenance_depassee' || c === 'refonte_depassee')

test('installation : 20 000 cr = 4 jours d’équipage, 1 jour de chantier à 25 000 ; 20 001 = 5 ; sans mod 0 et 0', () => {
  const r = calculer(coque(2), [mod(20000)], { ...R, cadenceChantier: 25000 })
  assert.deepEqual(r.installation, { jours: 4, joursChantier: 1 })
  assert.equal(calculer(coque(2), [mod(20001)], { ...R, cadenceChantier: 25000 }).installation?.jours, 5)
  assert.deepEqual(calculer(coque(2), [], R).installation, { jours: 0, joursChantier: 0 })
})

test('installation : somme des coûts des lignes (2 × 12 000 + 3 000 = 27 000 → 6 jours), quantité comprise', () => {
  assert.equal(calculer(coque(2), [mod(12000, 2), mod(3000)], R).installation?.jours, 6)
})

test('le diviseur de prix 2 ne change ni les jours ni la Maintenance', () => {
  const sans = calculer(coque(2), [mod(20000)], R, undefined, 1)
  const avec = calculer(coque(2), [mod(20000)], { ...R, diviseurPrix: 2 }, undefined, 1)
  assert.deepEqual(avec.installation, sans.installation)
  assert.equal(avec.maintenance, sans.maintenance)
  assert.equal(avec.installation?.jours, 4)
})

test('Maintenance : reparation 1, mod_int_con 0 → 3 ; 4 non refondues lèvent l’alerte, 3 non, égalité muette', () => {
  const quatre = calculer(coque(2), [mod(100, 4)], R, undefined, 1)
  assert.equal(quatre.maintenance, 3)
  const a = quatre.alertes.find((x) => x.code === 'maintenance_depassee')
  assert.equal(a?.niveau, 'a_surveiller')
  assert.equal(a?.texte, '4 mods entretenus, Maintenance 3')
  assert.deepEqual(a?.nombres, { a: 4, b: 3 })
  assert.deepEqual(codes(calculer(coque(2), [mod(100, 3)], R, undefined, 1)), [])
})

test('Maintenance : en refondre deux sur quatre fait taire l’alerte', () => {
  assert.deepEqual(codes(calculer(coque(2), [mod(100, 4, {}, 2)], R, undefined, 1)), [])
})

test('Maintenance : mod_int_con −5 avec reparation 1 donne 0, jamais négatif ; mod_int_con 2 avec reparation 1 donne 5', () => {
  assert.equal(calculer(coque(2), [], R, undefined, 1, 0, 0, -5).maintenance, 0)
  assert.equal(calculer(coque(2), [], R, undefined, 1, 0, 0, 2).maintenance, 5)
})

test('rang de coque = classe (1 à 4), sans + 1 : par classe 2 composants → 2 / 4 / 6 / 8 ; à nombre fixe 2 partout', () => {
  const parClasse = (classe: number, q = 1) => calculer(coque(classe), [mod(0, q, { composants: 2, composants_par_classe: 1 })], R, undefined, 9).composants
  assert.equal(parClasse(1), 2)
  assert.equal(parClasse(2), 4)
  assert.equal(parClasse(2, 2), 8)
  assert.equal(parClasse(3), 6)
  assert.equal(parClasse(4), 8)
  for (const c of [1, 2, 3, 4]) assert.equal(calculer(coque(c), [mod(0, 1, { composants: 2 })], R).composants, 2)
})

test('composants : une modification sans composants compte 0 ; deux lignes s’additionnent', () => {
  assert.equal(calculer(coque(2), [mod(500)], R).composants, 0)
  assert.equal(calculer(coque(3), [mod(0, 1, { composants: 1, composants_par_classe: 1 }), mod(1, 2, { composants: 5 })], R).composants, 13)
})

test('refonte : integre 2 sur une mod de 10 000 par installation (reparation 1) → cout 100 000, composants 2 × (c × 2), sans alerte', () => {
  const r = calculer(coque(3), [mod(10000, 2, { composants: 1, composants_par_classe: 1 }, 2)], R, undefined, 1)
  assert.deepEqual(r.refonte, { cout: 100000, composants: 12 })
  assert.deepEqual(codes(r), [])
})

test('refonte : seules les installations intégrées comptent (1 sur 3 à 10 000 → 50 000)', () => {
  assert.equal(calculer(coque(2), [mod(10000, 3, {}, 1)], R, undefined, 5).refonte?.cout, 50000)
})

test('refonte_depassee : integre 3 avec reparation 1 ou 0 la lève (non bloquante) ; integre 2 avec reparation 1 non', () => {
  const trois1 = calculer(coque(2), [mod(100, 3, {}, 3)], R, undefined, 1)
  assert.deepEqual(trois1.alertes.find((x) => x.code === 'refonte_depassee')?.nombres, { a: 3, b: 2 })
  assert.equal(trois1.alertes.find((x) => x.code === 'refonte_depassee')?.niveau, 'a_surveiller')
  assert.equal(trois1.alertes.some((x) => x.niveau === 'bloquante'), false)
  assert.ok(codes(calculer(coque(2), [mod(100, 3, {}, 3)], R, undefined, 0)).includes('refonte_depassee'))
  assert.ok(!codes(calculer(coque(2), [mod(100, 2, {}, 2)], R, undefined, 1)).includes('refonte_depassee'))
})

test('integre n’ôte rien au prix ni aux composants du premier chiffre', () => {
  const sans = calculer(coque(2), [mod(10000, 2, { composants: 3 })], R, undefined, 3)
  const avec = calculer(coque(2), [mod(10000, 2, { composants: 3 }, 2)], R, undefined, 3)
  assert.equal(avec.prix, sans.prix)
  assert.equal(avec.composants, sans.composants)
  assert.equal(avec.composants, 6)
})

test('integre au-delà de la quantité est borné à la quantité (pas de refonte au-delà de ce qui est installé)', () => {
  assert.equal(calculer(coque(2), [mod(10000, 1, {}, 5)], R, undefined, 3).refonte?.cout, 50000)
})
