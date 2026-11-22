// Review of kanevas-concepteur-vaisseaux-cibles-calcul (H-8, H-10 (2) to (4), H-cibles-1 (2) to (6)): pure calculation on an invented
// catalogue, every expected value written by hand from the task's criterion (W-3: halving rounded down, at least 1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import { texteVaisseau } from './texte-vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (classe: number, extra: Partial<CoqueResolue> = {}): CoqueResolue =>
  ({ cle: `c${classe}`, nom: `C${classe}`, classe, cout: 300000, pv: 5, ca: 10, puissance: 40, masse: 40, emports: 9, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5, ...extra }) as CoqueResolue
const C1 = coque(1)
const C2 = coque(2)
const R = { porteeSaut: 5 }
const L = (nature: NatureVaisseau, cle: string, e: Partial<ElementResolu>, extra: Partial<LigneResolue> = {}): LigneResolue =>
  ({ nature, cle, nom: cle, quantite: 1, element: { ...base, ...e }, ...extra })
const arme = (cle: string, puissance: number, masse: number, e: Partial<ElementResolu> = {}) => L('armes', cle, { emport: 1, puissance, masse, ...e })
const ref = (cle: string, quantite = 1, nature: NatureVaisseau = 'armes') => ({ nature, cle, quantite })
const montage = (cibles: { nature: NatureVaisseau; cle: string; quantite: number }[], quantite = cibles.reduce((n, c) => n + c.quantite, 0)) =>
  L('modifications', 'montage', { effet: 'montages_specialises', limite: 9 }, { quantite, cibles })
const surcharge = (cibles: { nature: NatureVaisseau; cle: string; quantite: number }[], pct = 50) =>
  L('modifications', 'surcharge', { effet: 'surcharge_cumulable', effet_pct: pct, limite: 9 }, { quantite: cibles.reduce((n, c) => n + c.quantite, 0), cibles })
const surdim = (cibles: { nature: NatureVaisseau; cle: string; quantite: number }[]) =>
  L('modifications', 'surdim', { effet: 'surdimensionne', limite: 1 }, { quantite: cibles.reduce((n, c) => n + c.quantite, 0), cibles })
const codes = (r: ReturnType<typeof calculer>) => r.alertes.map((a) => a.code)
const niveau = (r: ReturnType<typeof calculer>, code: string) => r.alertes.filter((a) => a.code === code).map((a) => a.niveau)

test('deux montages visant les armes 3/3 et 5/5 : besoins 1 et 2, baisse de 2 et 3 en puissance comme en masse (l’arrondi supérieur, 2 et 3, est refusé)', () => {
  const armes = [arme('a3', 3, 3), arme('a5', 5, 5)]
  const nu = calculer(C2, armes, R)
  // one line, two rows
  const r = calculer(C2, [...armes, montage([ref('a3'), ref('a5')])], R)
  assert.deepEqual(r.lignes[2]!.ajuste, { masse: -5, puissance: -5 })
  assert.equal(r.puissanceLibre, nu.puissanceLibre + 5)
  assert.equal(r.masseLibre, nu.masseLibre + 5)
  assert.equal(nu.puissanceLibre, 40 - 8)
  assert.equal(r.puissanceLibre, 40 - (1 + 2))
  assert.equal(r.masseLibre, 40 - (1 + 2))
  // two lines, one target each: the same
  const deux = calculer(C2, [...armes, montage([ref('a3')]), montage([ref('a5')])], R)
  assert.equal(deux.puissanceLibre, 37); assert.equal(deux.masseLibre, 37)
  assert.deepEqual(deux.lignes[2]!.ajuste, { masse: -2, puissance: -2 })
  assert.deepEqual(deux.lignes[3]!.ajuste, { masse: -3, puissance: -3 })
  assert.deepEqual(codes(deux).filter((c) => c === 'cible_deja_visee' || c === 'cible_invalide'), [])
})

test('montage : un élément de puissance 0 reste inchangé, un élément de 1 aussi (effet_sans_objet) ; la masse 2,5 devient 1', () => {
  const zero = calculer(C2, [arme('z', 0, 0), montage([ref('z')])], R)
  assert.equal(zero.puissanceLibre, 40); assert.equal(zero.masseLibre, 40)
  assert.deepEqual(niveau(zero, 'effet_sans_objet'), ['a_surveiller'])
  const un = calculer(C2, [arme('u', 1, 1), montage([ref('u')])], R)
  assert.equal(un.puissanceLibre, 39); assert.equal(un.masseLibre, 39)
  assert.deepEqual(niveau(un, 'effet_sans_objet'), ['a_surveiller'])
  // 7 / 2.5 → 3 / 1: the drop is 4 and 1.5
  const m = calculer(C2, [arme('m', 7, 2.5), montage([ref('m')])], R)
  assert.deepEqual(m.lignes[1]!.ajuste, { masse: -1.5, puissance: -4 })
  assert.deepEqual(codes(m).filter((c) => c === 'effet_sans_objet'), [])
  // a fitting may be aimed at
  const f = calculer(C2, [L('amenagements', 'f', { masse: 6 }), montage([ref('f', 1, 'amenagements')])], R)
  assert.equal(f.masseLibre, 40 - 3)
})

test('montage : un seul par installation d’une unité — deux armes sur la ligne cible n’en font pas deux', () => {
  const r = calculer(C2, [{ ...arme('a5', 5, 5), quantite: 2 }, montage([ref('a5')])], R)
  assert.deepEqual(r.lignes[1]!.ajuste, { masse: -3, puissance: -3 })
  assert.equal(r.puissanceLibre, 40 - 10 + 3)
})

test('surcharge de 50 % : puissance 4 → +2, deux installations → +4 (chaque sur le même P'+') ; P 1 → +1 ; P 0 → effet_sans_objet', () => {
  const un = calculer(C2, [arme('a4', 4, 1), surcharge([ref('a4')])], R)
  assert.deepEqual(un.lignes[1]!.ajuste, { puissance: 2 }); assert.equal(un.puissanceLibre, 40 - 4 - 2)
  const deux = calculer(C2, [arme('a4', 4, 1), surcharge([ref('a4', 2)])], R)
  assert.deepEqual(deux.lignes[1]!.ajuste, { puissance: 4 }); assert.equal(deux.puissanceLibre, 40 - 4 - 4)
  assert.deepEqual(codes(deux).filter((c) => c === 'cible_deja_visee'), [], 'the overcharge is cumulative')
  const p1 = calculer(C2, [arme('a1', 1, 1), surcharge([ref('a1')])], R)
  assert.deepEqual(p1.lignes[1]!.ajuste, { puissance: 1 }); assert.deepEqual(codes(p1).filter((c) => c === 'effet_sans_objet'), [])
  const p0 = calculer(C2, [arme('a0', 0, 1), surcharge([ref('a0')])], R)
  assert.deepEqual(niveau(p0, 'effet_sans_objet'), ['a_surveiller'])
  // on the halved value: 10 → 5, then ⌊5 × 50 / 100 + ½⌋ = 3
  const m = calculer(C2, [arme('a10', 10, 1), montage([ref('a10')]), surcharge([ref('a10')])], R)
  assert.deepEqual(m.lignes[2]!.ajuste, { puissance: 3 })
  assert.equal(m.puissanceLibre, 40 - 10 + 5 - 3)
})

test('surcharge visant une armure ou un moteur : cible_invalide (armes seules), bloquante, avec la ligne', () => {
  const r = calculer(C2, [L('amenagements', 'f', { masse: 1 }), surcharge([ref('f', 1, 'amenagements')])], R)
  const a = r.alertes.filter((x) => x.code === 'cible_invalide')
  assert.deepEqual(a.map((x) => [x.niveau, x.ligne]), [['bloquante', 1]])
})

test('cible_deja_visee : {arme, 2} sur une ligne, ou deux lignes ; levée sur la ligne qui vient seconde', () => {
  const a = arme('a', 6, 2)
  const rangees = calculer(C2, [a, montage([ref('a', 2)])], R)
  assert.deepEqual(rangees.alertes.filter((x) => x.code === 'cible_deja_visee').map((x) => [x.niveau, x.ligne]), [['bloquante', 1]])
  assert.deepEqual(codes(rangees).filter((c) => c === 'cible_invalide'), [])
  // the halving applies once all the same
  assert.deepEqual(rangees.lignes[1]!.ajuste, { masse: -1, puissance: -3 })
  const lignes = calculer(C2, [a, montage([ref('a')]), montage([ref('a')])], R)
  assert.deepEqual(lignes.alertes.filter((x) => x.code === 'cible_deja_visee').map((x) => x.ligne), [2])
  assert.equal(lignes.puissanceLibre, 40 - 6 + 3)
})

test('cible_invalide : somme ≠ quantité, doublon, quantité < 1, nature hors liste, paire absente, sans cible — une alerte par ligne', () => {
  const a = arme('a', 6, 2)
  const pasLa = (cibles: { nature: NatureVaisseau; cle: string; quantite: number }[], quantite: number) =>
    calculer(C2, [a, L('modifications', 'surcharge', { effet: 'surcharge_cumulable', effet_pct: 50, limite: 9 }, { quantite, cibles })], R)
  const compte = (r: ReturnType<typeof calculer>) => r.alertes.filter((x) => x.code === 'cible_invalide').map((x) => [x.niveau, x.ligne])
  assert.deepEqual(compte(pasLa([ref('a', 1)], 2)), [['bloquante', 1]], 'sum short')
  assert.deepEqual(compte(pasLa([ref('a', 3)], 2)), [['bloquante', 1]], 'sum over')
  assert.deepEqual(compte(pasLa([ref('a', 1), ref('a', 1)], 2)), [['bloquante', 1]], 'duplicate')
  assert.deepEqual(compte(pasLa([ref('a', 0), ref('a', 2)], 2)), [['bloquante', 1]], 'quantity 0 (and a duplicate): one alert')
  assert.deepEqual(compte(pasLa([ref('a', 3), ref('b', -1)], 2)), [['bloquante', 1]], 'quantity below 1 and an absent pair: one alert')
  assert.deepEqual(compte(pasLa([ref('a', 1), ref('zz', 1)], 2)), [['bloquante', 1]], 'pair absent from the design')
  assert.deepEqual(compte(pasLa([{ nature: 'defenses', cle: 'a', quantite: 2 }], 2)), [['bloquante', 1]], 'nature outside the list')
  assert.deepEqual(compte(pasLa([], 1)), [['bloquante', 1]], 'no target')
  assert.deepEqual(compte(pasLa([ref('a', 2)], 2)), [], 'valid')
})

test('surdimensionne : une arme de classe 2 sur une coque de classe 1 passe visée, reste bloquée sinon ; classe_max jamais levée', () => {
  const canon = arme('canon', 3, 1, { classe_min: 2 })
  assert.deepEqual(codes(calculer(C1, [canon], R)).filter((c) => c === 'classe_inadaptee'), ['classe_inadaptee'])
  const lev = calculer(C1, [canon, surdim([ref('canon')])], R)
  assert.deepEqual(codes(lev).filter((c) => c === 'classe_inadaptee' || c === 'effet_sans_objet'), [])
  // one class only: a class 3 weapon on a class 1 hull stays blocked
  const trois = calculer(C1, [arme('c3', 3, 1, { classe_min: 3 }), surdim([ref('c3')])], R)
  assert.deepEqual(codes(trois).filter((c) => c === 'classe_inadaptee'), ['classe_inadaptee'])
  // classe_max is never lifted: a weapon of class 1 at most, on a class 2 hull
  const petit = arme('p', 3, 1, { classe_max: 1 })
  assert.deepEqual(codes(calculer(C2, [petit], R)).filter((c) => c === 'classe_inadaptee'), ['classe_inadaptee'])
  assert.deepEqual(codes(calculer(C2, [petit, surdim([ref('p')])], R)).filter((c) => c === 'classe_inadaptee'), ['classe_inadaptee'])
  // an element aimed by another installation than the blocked one lifts only its own
  const deux = calculer(C1, [canon, arme('autre', 3, 1, { classe_min: 2 }), surdim([ref('canon')])], R)
  assert.deepEqual(deux.alertes.filter((x) => x.code === 'classe_inadaptee').map((x) => x.ligne), [1])
  // a fitting too
  const f = L('amenagements', 'f', { classe_min: 2, masse: 1 })
  assert.deepEqual(codes(calculer(C1, [f, surdim([ref('f', 1, 'amenagements')])], R)).filter((c) => c === 'classe_inadaptee'), [])
})

test('surdimensionne sur un élément sans besoin : effet_sans_objet à surveiller, sans bloquer', () => {
  const r = calculer(C2, [arme('a', 3, 1, { classe_min: 2 }), surdim([ref('a')])], R)
  assert.deepEqual(niveau(r, 'effet_sans_objet'), ['a_surveiller'])
  assert.equal(r.alertes.some((x) => x.niveau === 'bloquante'), false)
  const sans = calculer(C2, [arme('b', 3, 1), surdim([ref('b')])], R)
  assert.deepEqual(niveau(sans, 'effet_sans_objet'), ['a_surveiller'])
})

const moteur = (niveau: number) => L('moteurs', `m${niveau}`, { niveau })
const niv = L('modifications', 'mniv', { effet: 'moteur_niveau', limite: 1 })

test('moteur_niveau : un moteur de rang 3 compte comme rang 4 pour la portée de saut (5 × (3+1) = 20 → 5 × (4+1) = 25), plafond 6', () => {
  assert.equal(calculer(C2, [moteur(3)], R).porteeSaut, 20)
  const r = calculer(C2, [moteur(3), niv], R)
  assert.equal(r.porteeSaut, 25)
  assert.deepEqual(codes(r).filter((c) => c === 'effet_sans_objet'), [])
  assert.equal(calculer(C2, [moteur(5), niv], R).porteeSaut, 5 * 7)
  // the speed does not move with it
  assert.equal(r.vitesse, calculer(C2, [moteur(3)], R).vitesse)
})

test('moteur_niveau sans objet (non bloquant) : rang déjà 6, coque sans Spike, moteur système, aucun moteur', () => {
  const six = calculer(C2, [moteur(6), niv], R)
  assert.equal(six.porteeSaut, 5 * 7); assert.deepEqual(niveau(six, 'effet_sans_objet'), ['a_surveiller'])
  assert.equal(six.alertes.some((x) => x.niveau === 'bloquante'), false)
  const station = calculer(coque(2, { moteur_spike: 0 }), [niv], R)
  assert.equal(station.porteeSaut, null); assert.deepEqual(niveau(station, 'effet_sans_objet'), ['a_surveiller'])
  const sys = L('amenagements', 'sys', { effet: 'moteur_systeme', rend_puissance: [1, 1, 1, 1], rend_masse: [1, 1, 1, 1] })
  const systeme = calculer(C2, [sys, niv], R)
  assert.deepEqual(niveau(systeme, 'effet_sans_objet'), ['a_surveiller'])
  assert.equal(calculer(C2, [niv], R).porteeSaut, null)
  assert.deepEqual(niveau(calculer(C2, [niv], R), 'effet_sans_objet'), ['a_surveiller'])
})

test('magasins_doubles : double les munitions de toutes les armes à munitions, sans cible, masse des magasins inchangée', () => {
  const a = arme('a', 1, 1, { munitions: 10, cout_munition: 100 })
  const b = arme('b', 1, 1, { munitions: 5, cout_munition: 200 })
  const sec = arme('sec', 1, 1)
  const mag = (e: Partial<LigneResolue> = {}) => L('modifications', 'dbl', { effet: 'magasins_doubles', limite: 1 }, e)
  const sans = calculer(C2, [{ ...a, magasins: 1 }, b, sec], R)
  const avec = calculer(C2, [{ ...a, magasins: 1 }, b, sec, mag()], R)
  // a: 10 × 100 = 1 000 per magazine, 2 magazines' worth (1 + 1) → 2 000 ; b: 5 × 200 = 1 000
  assert.equal(sans.prix, 300000 + 2000 + 1000)
  assert.equal(avec.prix, 300000 + 4000 + 2000)
  assert.equal(avec.masseLibre, sans.masseLibre)
  assert.deepEqual(codes(avec).filter((c) => c === 'cible_invalide' || c === 'effet_sans_objet'), [])
  // a stray target is ignored
  const vise = calculer(C2, [{ ...a, magasins: 1 }, b, sec, mag({ vise: ref('a') })], R)
  assert.equal(vise.prix, avec.prix)
})

test('soutes_doublees garde son vise (cible_invalide sans lui)', () => {
  const soute = L('amenagements', 'soute', { soute: 10, masse: 2 })
  const dbl = (vise?: { nature: NatureVaisseau; cle: string }) => L('modifications', 'dsoute', { effet: 'soutes_doublees', limite: 1 }, vise ? { vise } : {})
  assert.equal(calculer(C2, [soute, dbl(ref('soute', 1, 'amenagements'))], R).soutes, 20)
  assert.deepEqual(codes(calculer(C2, [soute, dbl()], R)).filter((c) => c === 'cible_invalide'), ['cible_invalide'])
})

test('une conception d’avant, à un seul vise sur une ligne de quantité 2, rend les mêmes totaux qu’une paire de quantité 2', () => {
  const a = arme('a4', 4, 1)
  const ancien = L('modifications', 'surcharge', { effet: 'surcharge_cumulable', effet_pct: 50, limite: 9 }, { quantite: 2, vise: ref('a4') })
  const neuf = L('modifications', 'surcharge', { effet: 'surcharge_cumulable', effet_pct: 50, limite: 9 }, { quantite: 2, cibles: [ref('a4', 2)] })
  const x = calculer(C2, [a, ancien], R); const y = calculer(C2, [a, neuf], R)
  assert.equal(x.puissanceLibre, y.puissanceLibre); assert.deepEqual(x.lignes[1]!.ajuste, y.lignes[1]!.ajuste)
  assert.deepEqual(x.lignes[1]!.ajuste, { puissance: 4 })
  // and for a mounting of quantity 1
  const m1 = calculer(C2, [arme('a', 6, 4), L('modifications', 'montage', { effet: 'montages_specialises', limite: 9 }, { vise: ref('a') })], R)
  const m2 = calculer(C2, [arme('a', 6, 4), montage([ref('a')])], R)
  assert.equal(m1.puissanceLibre, m2.puissanceLibre); assert.equal(m1.masseLibre, m2.masseLibre)
})

test('texte de la conception : « → Laser ×2 · Canon » groupé, « → Laser » pour une installation, ×n seulement si n > 1', () => {
  const armes = [arme('laser', 4, 1), arme('canon', 4, 1)]
  const t = (cibles: { nature: NatureVaisseau; cle: string; quantite: number }[]) => texteVaisseau(calculer(C2, [...armes, surcharge(cibles)], R))
  assert.match(t([ref('laser', 2), ref('canon', 1)]), /surcharge \(→ laser ×2 · canon\)/)
  assert.match(t([ref('laser', 1)]), /surcharge \(→ laser\)/)
  assert.match(t([ref('laser', 1), ref('canon', 1)]), /surcharge \(→ laser · canon\)/)
  assert.doesNotMatch(t([ref('laser', 1)]), /×1/)
})
