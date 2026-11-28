// Review of rouge-kanevas-concepteur-vaisseaux-2-prix-sans-mods (B-95, § 6 and § 13.1): the price of a modification stays on its own line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculer } from './vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue } from './vaisseau.js'

const base: ElementResolu = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }
const navette = { cle: 'navette', nom: 'Navette', classe: 1, cout: 200000, pv: 5, ca: 10, puissance: 1000, masse: 1000, emports: 5, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 0, armure: 1 } as CoqueResolue
const reacteur = (extra: Partial<ElementResolu> = {}, quantite = 1): LigneResolue =>
  ({ nature: 'modifications', cle: 'reacteur-eternel', nom: 'Réacteur éternel', quantite, element: { ...base, cout: 0, cout_pct: 5, ...extra } })
const autre = (cout: number): LigneResolue => ({ nature: 'amenagements', cle: 'a', nom: 'A', quantite: 1, element: { ...base, cout } })
const R = { porteeSaut: 5 }
// 200 000 cr of bare hull + 55 000 cr of fittings = the book's 255 000; the mod is 5 % of the bare hull = 10 000 cr.
const fit = autre(55000)

test('navette + Réacteur éternel : prix 255 000, entretien 12 750, ligne 10 000, installation 2 jours (faux avant : 265 000 / 13 250)', () => {
  const sans = calculer(navette, [fit], R)
  const r = calculer(navette, [fit, reacteur()], R)
  assert.equal(r.prix, 255000)
  assert.equal(r.entretien, 12750)
  assert.equal(r.lignes[1]!.cout, 10000)
  assert.deepEqual(r.installation, { jours: 2, joursChantier: 1 })
  assert.equal(r.chantierJours, sans.chantierJours)
})

test('la ligne de mod porte son coût de quantité 2, hors prix ; une ligne non-mod reste dans le prix', () => {
  const r = calculer(navette, [fit, reacteur({}, 2), autre(5000)], R)
  assert.equal(r.prix, 260000)
  assert.equal(r.entretien, 13000)
  assert.equal(r.lignes[1]!.cout, 20000)
  assert.equal(r.installation?.jours, 4)
})

test('refonte : le coût d’un mod intégré compte toujours pour la refonte, pas pour le prix', () => {
  const sans = calculer(navette, [fit, reacteur()], R, undefined, 1)
  const integre = calculer(navette, [fit, { ...reacteur(), integre: 1 }], R, undefined, 1)
  assert.equal(integre.prix, 255000)
  assert.deepEqual(integre.installation, sans.installation)
  assert.equal(JSON.stringify(integre).includes('refonte'), JSON.stringify(sans).includes('refonte'))
})

test('diviseur de prix 2 : le diviseur ne s’applique qu’à la coque, la ligne de mod reste entière', () => {
  const r = calculer(navette, [fit, reacteur()], { ...R, diviseurPrix: 2 })
  assert.equal(r.prix, 127500)
  assert.equal(r.lignes[1]!.cout, 10000)
  assert.equal(r.installation?.jours, 2)
})
