// Review of kanevas-outils-format-vaisseaux-ecarts-calcul (Y-3, Y-5, Y-6): the pure calculation, expected values written by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import { texteVaisseau } from './texte-vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (classe: number, cout: number): CoqueResolue =>
  ({ cle: `c${classe}`, nom: `C${classe}`, classe, cout, pv: 5, ca: 10, puissance: 10, masse: 10, emports: 2, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5 }) as CoqueResolue
const C2 = coque(2, 300000)
const C3 = coque(3, 400000)
const L = (nature: NatureVaisseau, nom: string, e: Partial<ElementResolu>, extra: Partial<LigneResolue> = {}): LigneResolue =>
  ({ nature, cle: nom, nom, quantite: 1, element: { ...base, ...e }, ...extra })
const R = { porteeSaut: 5 }
const rotors = (v: number) => L('modifications', 'rotors', { effet: 'vitesse', valeur: v })

test('Y-3 : vitesse signée, plancher 0 sur le total', () => {
  assert.equal(calculer(C2, [rotors(-2)], R).vitesse, 1)
  assert.equal(calculer(C2, [rotors(-5)], R).vitesse, 0)
  assert.equal(calculer(C2, [rotors(2)], R).vitesse, 5)
  // one floor on the total: −5 then +4 is 2, not 4
  assert.equal(calculer(C2, [rotors(-5), L('modifications', 'r2', { effet: 'vitesse', valeur: 4 })], R).vitesse, 2)
})

test('Y-3 : exigence de réparation, par champ ou par effet, alerte exacte à la borne', () => {
  const rep = (ls: LigneResolue[], c: number) => calculer(C2, ls, R, null, c)
  const al = (ls: LigneResolue[], c: number) => rep(ls, c).alertes.filter((a) => a.code === 'reparation_insuffisante').map((a) => a.texte)
  const blind = L('modifications', "Blindage d'essai", { effet: 'armure', valeur: 2, cout: 30000, reparation_min: 2 })
  const r = rep([blind], 1)
  assert.equal(r.armure, 7); assert.equal(r.prix, 330000)
  assert.deepEqual(r.reparation, { choisie: 1, min: 2 })
  assert.deepEqual(al([blind], 1), ["« Blindage d'essai » : réparation 2 au moins (1 choisie)."])
  for (const c of [2, 3]) assert.deepEqual(al([blind], c), [])
  const eff = L('modifications', 'E', { effet: 'reparation_min', valeur: 2 })
  assert.deepEqual(rep([eff], 1).reparation, { choisie: 1, min: 2 })
  assert.equal(al([eff], 1).length, 1)
  assert.equal(al([L('modifications', 'F', { reparation_min: 2 })], 1).length, 1)
  assert.deepEqual(al([L('modifications', 'G', { effet: 'reparation_min', valeur: 5, reparation_min: 1 })], 1), [])
  const deux = [L('modifications', 'A', { reparation_min: 2 }), L('modifications', 'B', { reparation_min: 3 })]
  assert.deepEqual(al(deux, 2), ['« B » : réparation 3 au moins (2 choisie).'])
  assert.equal(rep(deux, 2).reparation?.min, 3)
  assert.equal(rep([], 0).reparation, null)
})

test('Y-3 : soute par classe, doublement', () => {
  const s = L('amenagements', 'soute-r2', { soute: 5, soute_par_classe: [10, 20, 40, 80] })
  assert.equal(calculer(C2, [s], R).soutes, 20)
  assert.equal(calculer(C3, [s], R).soutes, 40)
  const cale = L('amenagements', 'cale', { effet: 'soutes_doublees' }, { vise: { nature: 'amenagements', cle: 'soute-r2' } })
  const d = calculer(C2, [s, cale], R)
  assert.equal(d.soutes, 40); assert.deepEqual(d.alertes.filter((a) => a.code === 'cible_invalide'), [])
  assert.equal(calculer(C2, [L('amenagements', 'z', { soute_par_classe: [0, 0, 0, 0] })]).soutes, 0)
  assert.equal(calculer(C3, [L('amenagements', 's', { soute: 10 })], R).soutes, 10)
  assert.equal(calculer(C2, [L('amenagements', 'n', {})], R).soutes, null)
  // a per-class soute alone makes a valid doubling target
  const seul = calculer(C2, [L('amenagements', 'p', { soute_par_classe: [1, 2, 3, 4] }), { ...cale, vise: { nature: 'amenagements', cle: 'p' } }])
  assert.equal(seul.soutes, 4)
})

test('Y-3 : réduction du moteur système, demi supérieur, dans prix, chantier, entretien', () => {
  const m = (cout: number, pct: number) => L('moteurs', 'moteur-sys', { effet: 'moteur_systeme', cout, reduction_cout_pct: pct, puissance: 3, masse: 1.5 })
  const r = calculer(C2, [m(40000, 10)], R)
  assert.equal(r.lignes[0]!.cout, 36000); assert.equal(r.prix, 336000)
  assert.equal(r.chantierJours, 14); assert.equal(r.entretien, 16800)
  assert.equal(r.puissanceLibre, 7); assert.equal(r.masseLibre, 8.5)
  assert.equal(calculer(C2, [m(12345, 10)], R).lignes[0]!.cout, 11110)
  assert.equal(calculer(C2, [m(12344, 10)], R).lignes[0]!.cout, 11110)
  assert.equal(calculer(C2, [m(40000, 100)], R).lignes[0]!.cout, 0)
  assert.equal(calculer(C2, [m(40000, 100)], R).prix, 300000)
  // no reduction: no cout key
  assert.equal('cout' in calculer(C2, [L('moteurs', 'x', { cout: 100 })], R).lignes[0]!, false)
})

test('Y-3 : un catalogue sans ces champs donne le résultat d\'avant', () => {
  const lignes = [L('moteurs', 'm', { cout: 1000, effet: 'moteur_systeme' }), L('amenagements', 'a', { soute: 5 }), L('modifications', 'r', { effet: 'reparation_min', valeur: 1 })]
  const r = calculer(C2, lignes, R, null, 1)
  assert.equal(r.prix, 301000); assert.equal(r.soutes, 5); assert.deepEqual(r.reparation, { choisie: 1, min: 1 })
  assert.equal('cout' in r.lignes[0]!, false)
})

test('Y-6 : le texte porte Soutes et le coût réduit', () => {
  const r = calculer(C2, [L('moteurs', 'Moteur sys', { effet: 'moteur_systeme', cout: 40000, reduction_cout_pct: 10 }), L('amenagements', 'S', { soute_par_classe: [1, 2, 3, 4] })], R)
  const t = texteVaisseau(r)
  assert.match(t, /\| Soutes \| 2 \|/)
  assert.match(t, /- 1 × Moteur sys — 36 000 cr/)
})
