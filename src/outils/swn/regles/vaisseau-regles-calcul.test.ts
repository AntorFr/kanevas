// Review of kanevas-concepteur-vaisseaux-regles-calcul-regles (H-1, H-6, H-7): the pure calculation, expected values written by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (classe: number, facteur: number, extra: Partial<CoqueResolue> = {}): CoqueResolue =>
  ({ cle: `c${classe}`, nom: `C${classe}`, classe, cout: 1000, pv: 5, ca: 10, puissance: 100, masse: 100, emports: 5, facteur_cout: 1, facteur_puissance: facteur, facteur_masse: facteur, vitesse: 0, armure: 1, ...extra }) as CoqueResolue
const L = (nature: NatureVaisseau, nom: string, e: Partial<ElementResolu>, quantite = 1): LigneResolue =>
  ({ nature, cle: nom, nom, quantite, element: { ...base, ...e }, })
const R = { porteeSaut: 5 }
const masseUsee = (c: CoqueResolue, ls: LigneResolue[]) => 100 - (calculer(c, ls, R).masseLibre as number)
const puissanceUsee = (c: CoqueResolue, ls: LigneResolue[]) => 100 - (calculer(c, ls, R).puissanceLibre as number)

test('H-1 : un dièse de masse 0,5 pèse 1 / 2 / 2 sur les facteurs 2 / 3 / 4', () => {
  const e = L('amenagements', 'd', { masse: 0.5, x_masse: true })
  assert.equal(masseUsee(coque(2, 2), [e]), 1)
  assert.equal(masseUsee(coque(2, 3), [e]), 2)
  assert.equal(masseUsee(coque(2, 4), [e]), 2)
})

test('H-1 : trois dièses de 0,5 sur le facteur 3 pèsent 6 (jamais 4,5) ; 1,5 sur le facteur 3 prend 5 par installation', () => {
  assert.equal(masseUsee(coque(2, 3), [L('amenagements', 'd', { masse: 0.5, x_masse: true }, 3)]), 6)
  assert.equal(masseUsee(coque(2, 3), [L('amenagements', 'g', { masse: 1.5, x_masse: true })]), 5)
  assert.equal(masseUsee(coque(2, 3), [L('amenagements', 'g', { masse: 1.5, x_masse: true }, 2)]), 10)
})

test('H-1 : un élément sans dièse garde sa valeur exacte (0,5 ; 1,5 × 3)', () => {
  assert.equal(masseUsee(coque(2, 3), [L('amenagements', 'n', { masse: 0.5 })]), 0.5)
  assert.equal(masseUsee(coque(2, 3), [L('amenagements', 'n', { masse: 0.5 }, 3)]), 1.5)
})

test('H-1 : la puissance d’un dièse s’arrondit de même, par installation', () => {
  assert.equal(puissanceUsee(coque(2, 3), [L('amenagements', 'p', { puissance: 0.5, x_puissance: true }, 3)]), 6)
  assert.equal(puissanceUsee(coque(2, 3), [L('amenagements', 'p', { puissance: 1.5, x_puissance: true })]), 5)
  assert.equal(puissanceUsee(coque(2, 3), [L('amenagements', 'p', { puissance: 0.5 }, 3)]), 1.5)
})

test('H-1 : un produit entier n’est pas relevé (masse 2 × facteur 3 = 6, 0,1 × 30 = 3)', () => {
  assert.equal(masseUsee(coque(2, 3), [L('amenagements', 'e', { masse: 2, x_masse: true })]), 6)
  assert.equal(masseUsee(coque(2, 30), [L('amenagements', 'f', { masse: 0.1, x_masse: true })]), 3)
})

test('H-6 : vitesse 0 avec bonus −1 → −1 et vitesse_negative ; +1 → 1 sans alerte', () => {
  const moins = calculer(coque(2, 1), [L('defenses', 'd', { bonus_vitesse: -1 })], R)
  assert.equal(moins.vitesse, -1)
  const a = moins.alertes.filter((x) => x.code === 'vitesse_negative')
  assert.deepEqual(a.map((x) => [x.niveau, x.texte]), [['a_surveiller', 'Vitesse négative : malus aux jets de Pilotage']])
  const plus = calculer(coque(2, 1), [L('defenses', 'd', { bonus_vitesse: 1 })], R)
  assert.equal(plus.vitesse, 1)
  assert.equal(plus.alertes.filter((x) => x.code === 'vitesse_negative').length, 0)
  assert.equal(calculer(coque(2, 1), [], R).alertes.filter((x) => x.code === 'vitesse_negative').length, 0)
})

test('H-6 : la vitesse 0 exacte ne lève pas l’alerte ; une coque sans vitesse reste null, sans alerte', () => {
  const zero = calculer(coque(2, 1), [L('defenses', 'd', { bonus_vitesse: -1 }), L('defenses', 'e', { bonus_vitesse: 1 })], R)
  assert.equal(zero.vitesse, 0)
  assert.equal(zero.alertes.filter((x) => x.code === 'vitesse_negative').length, 0)
  const sans = calculer(coque(2, 1, { vitesse: undefined }), [L('defenses', 'd', { bonus_vitesse: -3 })], R)
  assert.equal(sans.vitesse, null)
  assert.equal(sans.alertes.filter((x) => x.code === 'vitesse_negative').length, 0)
})

test('H-6 : l’armure garde son plancher à 0', () => {
  const r = calculer(coque(2, 1, { armure: 1 }), [L('modifications', 'a', { effet: 'armure', valeur: -5 })], R)
  assert.equal(r.armure, 0)
})

test('H-7 : arme classe_min 3 sur classe 2 bloquée (ligne, texte) ; passe sur 3 et 4 ; classe_min 1 passe partout', () => {
  const arme = L('armes', 'Canon', { classe_min: 3, emport: 1 } as Partial<ElementResolu>)
  const bloque = calculer(coque(2, 1), [L('moteurs', 'm', {}), arme], R).alertes.filter((x) => x.code === 'classe_inadaptee')
  assert.deepEqual(bloque.map((x) => [x.niveau, x.texte, x.ligne]), [['bloquante', '« Canon » : classe de coque 3 au moins.', 1]])
  for (const c of [3, 4]) assert.equal(calculer(coque(c, 1), [arme], R).alertes.filter((x) => x.code === 'classe_inadaptee').length, 0)
  const defaut = L('armes', 'Laser', { emport: 1 } as Partial<ElementResolu>)
  const defaut1 = L('armes', 'Laser1', { classe_min: 1, emport: 1 } as Partial<ElementResolu>)
  for (const c of [1, 2, 3, 4]) for (const a of [defaut, defaut1]) assert.equal(calculer(coque(c, 1), [a], R).alertes.filter((x) => x.code === 'classe_inadaptee').length, 0)
})

test('H-7 : une arme bloquée bloque (alerte bloquante) et le doublement des munitions de classe_min 1 sur la classe 3 reste ×4', () => {
  const m = L('armes', 'Mun', { classe_min: 1, munitions: 2, cout_munition: 10, emport: 1 } as Partial<ElementResolu>)
  assert.equal(calculer(coque(1, 1), [m], R).prix, 1000 + 20)
  assert.equal(calculer(coque(3, 1), [m], R).prix, 1000 + 80)
  assert.ok(calculer(coque(1, 1), [L('armes', 'Z', { classe_min: 2, emport: 1 } as Partial<ElementResolu>)], R).alertes.some((x) => x.niveau === 'bloquante'))
})
