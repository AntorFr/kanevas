// Review of kanevas-concepteur-vaisseaux-capacites-equipage-calcul (H-4, H-5, H-capacites-1): pure calculation, values written by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import { texteVaisseau } from './texte-vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const coque = (classe: number, extra: Partial<CoqueResolue> = {}): CoqueResolue =>
  ({ cle: `c${classe}`, nom: `C${classe}`, classe, cout: 300000, pv: 5, ca: 10, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1,
    vitesse: 3, armure: 5, equipage_min: 1, equipage_max: 6, ...extra }) as CoqueResolue
const cap = (code: string, q = 1, extra: Partial<ElementResolu> = {}): LigneResolue =>
  ({ nature: 'amenagements', cle: `${code}-${q}-${Math.random()}`, nom: code, quantite: q, element: { ...base, capacite: code, ...extra } })
const R = { porteeSaut: 5 }
const val = (r: ReturnType<typeof calculer>, code: string) => r.capacites?.find((c) => c.code === code)?.valeur

test('H-4 : fret caché et soute d\'exode selon la classe 1 à 4, pas de ligne pour 0', () => {
  const fret = [0.2, 2, 20, 200], exode = [undefined, undefined, 1000, 5000]
  for (const k of [1, 2, 3, 4]) {
    const r = calculer(coque(k), [cap('fret_cache'), cap('soute_exode')], R)
    assert.equal(val(r, 'fret_cache'), fret[k - 1])
    assert.equal(val(r, 'soute_exode'), exode[k - 1])
  }
  assert.equal(calculer(coque(2), [cap('soute_exode')], R).capacites!.length, 0)
})

test('H-4 : équipage maximal +100 %, canots, cabines, sommeil, colonie, hydroponie lisent 12', () => {
  const r = calculer(coque(2), [cap('equipage_max_pct'), cap('canots'), cap('cabines_luxe'), cap('sommeil_froid'), cap('colonie'), cap('hydroponie')], R, 6)
  assert.equal(r.equipage!.max, 12)
  assert.deepEqual(r.capacites!.map((c) => [c.code, c.valeur]),
    [['equipage_max_pct', 12], ['hydroponie', 12], ['sommeil_froid', 12], ['canots', 1], ['cabines_luxe', 2], ['colonie', 60]])
  assert.ok(!r.alertes.some((a) => a.code === 'equipage_excessif'))
  assert.ok(calculer(coque(2), [cap('equipage_max_pct')], R, 12).alertes.every((a) => a.code !== 'equipage_excessif'))
  assert.ok(calculer(coque(2), [], R, 12).alertes.some((a) => a.code === 'equipage_excessif'))
})

test('H-4 : provisions étendues — deux lignes rendent 8 mois, une en rend 4 (2 mois × 2^n)', () => {
  assert.equal(val(calculer(coque(2), [cap('provisions'), cap('provisions')], R), 'provisions'), 8)
  assert.equal(val(calculer(coque(2), [cap('provisions', 2)], R), 'provisions'), 8)
  assert.equal(val(calculer(coque(2), [cap('provisions')], R), 'provisions'), 4)
})

test('H-4 : soute d\'exode ×3 en classe 3 = 4 000 ; hydroponie doublée par installation', () => {
  assert.equal(val(calculer(coque(3), [cap('soute_exode'), cap('soute_exode'), cap('soute_exode')], R), 'soute_exode'), 4000)
  assert.equal(val(calculer(coque(2), [cap('hydroponie', 2)], R), 'hydroponie'), 12)
})

test('H-capacites-1 (2) : sans équipage maximal, aucune ligne de lecture d\'équipage, mais fret et provisions restent', () => {
  const c = coque(2, { equipage_max: null as any })
  const r = calculer(c, [cap('equipage_max_pct'), cap('canots'), cap('cabines_luxe'), cap('sommeil_froid'), cap('colonie'), cap('hydroponie'), cap('fret_cache'), cap('provisions')], R)
  assert.deepEqual(r.capacites!.map((x) => x.code), ['fret_cache', 'provisions'])
  assert.equal(r.equipage, null)
})

test('H-5 : équipage 10, pj 2, robots 3 + automatisation : 640 cr/jour, robots 3 000 hors prix', () => {
  const auto = { nature: 'amenagements' as const, cle: 'auto', nom: 'Auto', quantite: 1, element: { ...base, effet: 'support_automatisation' } }
  const c = coque(2, { equipage_max: 20 })
  const r = calculer(c, [auto], R, 10, 0, 2, 3)
  assert.deepEqual(r.fraisEquipage, { jour: 640, robots: 3000 })
  assert.equal(r.prix, calculer(c, [auto], R, 10).prix)
  assert.ok(!r.alertes.some((a) => a.code === 'equipage_robots'))
  const r2 = calculer(c, [auto], { ...R, soldeJour: 7, vivresJour: 3 }, 10, 0, 2, 3)
  assert.equal(r2.fraisEquipage!.jour, 7 * 5 + 3 * 7)
})

test('H-5 : alertes equipage_robots exactes et bloquantes', () => {
  const auto = { nature: 'amenagements' as const, cle: 'auto', nom: 'Auto', quantite: 1, element: { ...base, effet: 'support_automatisation' } }
  const c = coque(2, { equipage_max: 20 })
  const t = (r: ReturnType<typeof calculer>) => r.alertes.filter((a) => a.code === 'equipage_robots').map((a) => [a.niveau, a.texte])
  assert.deepEqual(t(calculer(c, [], R, 10, 0, 0, 1)), [['bloquante', 'Des robots exigent un système d\'automatisation.']])
  assert.deepEqual(t(calculer(c, [auto], R, 10, 0, 0, 10)), [['bloquante', 'Au moins un membre d\'équipage doit rester vivant.']])
  assert.deepEqual(t(calculer(c, [auto], R, 10, 0, 9, 2)), [['bloquante', 'Plus de personnages-joueurs que de membres d\'équipage vivants.']])
  assert.deepEqual(t(calculer(c, [auto], R, 10, 0, 8, 2)), [])
  // no chosen crew: no check, no cost
  const n = calculer(c, [], R, null, 0, 9, 2)
  assert.equal(n.fraisEquipage, null); assert.deepEqual(t(n), [])
})

test('H-capacites-1 (3) : diviseur 2 sur 610 000 → 305 000, entretien 15 250, chantier 13 j ; cadence 50 000 → 7 j', () => {
  const c = coque(2, { cout: 610000 })
  const r = calculer(c, [], { ...R, diviseurPrix: 2 })
  assert.equal(r.prix, 305000); assert.equal(r.entretien, 15250); assert.equal(r.chantierJours, 13); assert.equal(r.diviseurPrix, 2)
  assert.equal(calculer(c, [], { ...R, diviseurPrix: 2, cadenceChantier: 50000 }).chantierJours, 7)
  assert.equal(calculer(c, [], R).diviseurPrix, 1)
  assert.equal(calculer(coque(2, { cout: 7 }), [], { ...R, diviseurPrix: 4 }).prix, 2)
  assert.equal(calculer(coque(2, { cout: 0 }), [], R).chantierJours, 1)
  // line part prices of a cout_pct line are not divided; the robots are not either
  const pct = { nature: 'modifications' as const, cle: 'b', nom: 'B', quantite: 1, element: { ...base, cout_pct: 10, effet: 'armure', valeur: 2 } }
  const d = calculer(c, [pct as any], { ...R, diviseurPrix: 2 })
  assert.equal(d.lignes[0]!.cout, 61000); assert.equal(d.prix, 335500)
})

test('H-4 : effetsJeu dans l\'ordre des lignes, rien pour un élément sans effet ; texte de section', () => {
  const a = cap('canots', 1, { effet_jeu: 'Deux canots.' }), b = cap('fret_cache'), c2 = cap('colonie', 1, { effet_jeu: 'Colonie.' })
  const r = calculer(coque(2), [a, b, c2], R, 6)
  assert.deepEqual(r.effetsJeu!.map((e) => [e.ligne, e.texte]), [[0, 'Deux canots.'], [2, 'Colonie.']])
  const t = texteVaisseau(r)
  assert.match(t, /\n {2}- Deux canots\./)
  assert.match(t, /\*\*Capacités\*\*/)
  // a result stored before the slice: no block, no indented line
  const ancien = { ...r, capacites: undefined, effetsJeu: undefined, fraisEquipage: undefined }
  const tAncien = texteVaisseau(ancien as any)
  assert.doesNotMatch(tAncien, /Capacités|Deux canots/)
})

// The synthetic set: three designs modelled on the shape of the examples of § 13 (a fighter, a shuttle, a free merchant), invented figures,
// every expected value written by hand.
const hull = (cle: string, classe: number, cout: number, puissance: number, masse: number, emin: number, emax: number): CoqueResolue =>
  ({ ...coque(classe), cle, nom: cle, cout, puissance, masse, equipage_min: emin, equipage_max: emax, emports: 2 }) as CoqueResolue
const fit = (nom: string, e: Partial<ElementResolu>): LigneResolue => ({ nature: 'amenagements', cle: nom, nom, quantite: 1, element: { ...base, ...e } })

test('jeu synthétique : chasseur 305 000 / 13 j ; navette 210 000 / 9 j équipage max 20 ; marchand 775 000 / 31 j, 260 cr par jour', () => {
  const a = calculer(hull('chasseur', 1, 250000, 5, 2, 1, 1), [fit('noyau', { cout: 55000, puissance: 4 })], R, 1)
  assert.deepEqual([a.prix, a.entretien, a.chantierJours, a.puissanceLibre, a.masseLibre, a.fraisEquipage], [305000, 15250, 13, 1, 2, { jour: 120, robots: 0 }])
  assert.equal(a.capacites!.length, 0)
  const b = calculer(hull('navette', 1, 150000, 3, 5, 1, 10), [fit('vie-etendue', { cout: 60000, capacite: 'equipage_max_pct', effet_jeu: 'Équipage maximal doublé.' }), fit('canot', { capacite: 'canots' })], R, 1)
  assert.deepEqual([b.prix, b.entretien, b.chantierJours, b.equipage], [210000, 10500, 9, { choisi: 1, min: 1, max: 20 }])
  assert.deepEqual(b.capacites!.map((c) => [c.code, c.valeur]), [['equipage_max_pct', 20], ['canots', 1]])
  assert.deepEqual(b.effetsJeu!.map((e) => e.ligne), [0])
  const c = calculer(hull('marchand', 1, 600000, 10, 15, 1, 6), [fit('cache', { cout: 175000, capacite: 'fret_cache' })], R, 3, 0, 1)
  assert.deepEqual([c.prix, c.entretien, c.chantierJours], [775000, 38750, 31])
  assert.deepEqual(c.fraisEquipage, { jour: 100 * 2 + 20 * 3, robots: 0 })
  assert.deepEqual(c.capacites!.map((x) => [x.code, x.valeur]), [['fret_cache', 0.2]])
})
