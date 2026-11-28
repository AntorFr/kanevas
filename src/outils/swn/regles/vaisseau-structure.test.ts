// Review of kanevas-concepteur-vaisseaux-regles-calcul-structure (H-2, H-3, B-94): the pure calculation, expected values written by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (extra: Partial<CoqueResolue> = {}): CoqueResolue =>
  ({ cle: 'c', nom: 'C', classe: 3, cout: 1000, pv: 5, ca: 10, puissance: 100, masse: 100, emports: 5, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 2, armure: 1, ...extra }) as CoqueResolue
const L = (nature: NatureVaisseau, nom: string, e: Partial<ElementResolu>, quantite = 1): LigneResolue =>
  ({ nature, cle: nom, nom, quantite, element: { ...base, ...e } })
const R = { porteeSaut: 5 }
const arme = (q = 1, nom = 'Canon') => L('armes', nom, { emport: 0 } as Partial<ElementResolu>, q)
const cible = (q: number) => L('amenagements', 'Auto', { limite_par: 'armes' }, q)
const code = (c: CoqueResolue, ls: LigneResolue[], k: string) => calculer(c, ls, R).alertes.filter((a) => a.code === k)

test('H-2 : une station sans moteur est acceptée, portée de saut null, vitesse null, aucun moteur_absent', () => {
  const r = calculer(coque({ moteur_spike: 0, vitesse: undefined }), [], R)
  assert.equal(r.porteeSaut, null)
  assert.equal(r.vitesse, null)
  assert.deepEqual(r.alertes.filter((a) => a.code === 'moteur_absent' || a.niveau === 'bloquante'), [])
})

test('H-2 : un bonus de vitesse sur une station sans vitesse reste null', () => {
  const r = calculer(coque({ moteur_spike: 0, vitesse: undefined }), [L('defenses', 'V', { bonus_vitesse: 2 })], R)
  assert.equal(r.vitesse, null)
})

test('H-2 : moteur, ou aménagement à effet moteur_systeme, sur une station : bloquante moteur_sur_station sur la ligne désignée', () => {
  const s = coque({ moteur_spike: 0 })
  const a = code(s, [L('amenagements', 'Pont', {}), L('moteurs', 'Spike', { niveau: 1 })], 'moteur_sur_station')
  assert.deepEqual(a.map((x) => [x.niveau, x.texte, x.ligne]), [['bloquante', "« Spike » : une station n'a pas de moteur de saut ni de moteur système.", 1]])
  const b = code(s, [L('amenagements', 'Tuyère', { effet: 'moteur_systeme' })], 'moteur_sur_station')
  assert.deepEqual(b.map((x) => [x.niveau, x.texte, x.ligne]), [['bloquante', "« Tuyère » : une station n'a pas de moteur de saut ni de moteur système.", 0]])
  const c = code(s, [L('amenagements', 'Aux', { effet: 'moteurs' })], 'moteur_sur_station')
  assert.equal(c.length, 1)
})

test('H-2 : une coque à moteur_spike 1 ou sans le champ, sans moteur, lève moteur_absent à surveiller (jamais bloquante) ; pas de moteur_sur_station', () => {
  for (const c of [coque({ moteur_spike: 1 }), coque()]) {
    const r = calculer(c, [], R)
    assert.deepEqual(r.alertes.filter((a) => a.code === 'moteur_absent').map((a) => a.niveau), ['a_surveiller'])
    assert.equal(r.vitesse, 2)
  }
  const avec = calculer(coque({ moteur_spike: 1 }), [L('moteurs', 'M', { niveau: 2 })], R)
  assert.equal(avec.porteeSaut, 15)
  assert.equal(avec.alertes.filter((a) => a.code === 'moteur_sur_station').length, 0)
})

test('H-3 : deux auto-ciblages pour une arme → limite_depassee au texte exact ; pour deux armes rien ; sans arme un seul est bloqué', () => {
  const a = code(coque(), [arme(1), cible(2)], 'limite_depassee')
  assert.deepEqual(a.map((x) => [x.niveau, x.texte, x.ligne]), [['bloquante', "Limite dépassée : 2 système(s) d'auto-ciblage pour 1 arme(s)", 1]])
  assert.equal(code(coque(), [arme(2), cible(2)], 'limite_depassee').length, 0)
  assert.equal(code(coque(), [arme(1), cible(1)], 'limite_depassee').length, 0)
  const z = code(coque(), [cible(1)], 'limite_depassee')
  assert.deepEqual(z.map((x) => x.texte), ["Limite dépassée : 1 système(s) d'auto-ciblage pour 0 arme(s)"])
})

test('H-3 : une arme en deux lignes compte pour la somme de leurs quantités ; une ligne non arme ne compte pas', () => {
  assert.equal(code(coque(), [arme(1, 'A'), arme(2, 'B'), cible(3)], 'limite_depassee').length, 0)
  assert.equal(code(coque(), [arme(1, 'A'), arme(2, 'B'), cible(4)], 'limite_depassee')[0].texte, "Limite dépassée : 4 système(s) d'auto-ciblage pour 3 arme(s)")
  // a defence line of quantity 5 is not a weapon
  assert.equal(code(coque(), [L('defenses', 'D', {}, 5), cible(1)], 'limite_depassee').length, 1)
})

test('H-3 : la limite ordinaire reste évaluée à part ; un aménagement sans limite_par n’est pas plafonné par les armes', () => {
  const ordinaire = L('amenagements', 'Soute', { limite: 1 }, 2)
  assert.equal(code(coque(), [arme(5), ordinaire], 'limite_depassee').length, 1)
  assert.equal(code(coque(), [L('amenagements', 'Libre', {}, 4)], 'limite_depassee').length, 0)
  // both rules on one line: two alerts
  const les2 = L('amenagements', 'Auto2', { limite_par: 'armes', limite: 1 }, 2)
  assert.equal(code(coque(), [arme(1), les2], 'limite_depassee').length, 2)
})

test('B-94 : une conception d’avant (coque sans moteur_spike, aménagement sans limite_par) se calcule comme avant', () => {
  const r = calculer(coque(), [L('moteurs', 'M', { niveau: 1 }), L('amenagements', 'X', {}, 3)], R)
  assert.equal(r.porteeSaut, 10)
  assert.deepEqual(r.alertes.filter((a) => a.niveau === 'bloquante'), [])
})
