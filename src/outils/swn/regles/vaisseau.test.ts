// Tests du calcul d'un vaisseau (V-2), de sa version texte (V-6) et des catalogues d'essai (V-11).
// Les valeurs attendues sont écrites en dur depuis le tableau de V-11, jamais calculées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculer, CADENCE_CHANTIER, TAUX_ENTRETIEN } from './vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'
import { texteVaisseau } from './texte-vaisseau.js'
import { rendreMarkdown } from '../../../services/markdown.js'

const lire = (f: string) => JSON.parse(readFileSync(new URL(`../exemples/${f}`, import.meta.url), 'utf8'))
const essai = lire('catalogue-essai.json')
const univers = lire('catalogue-essai-univers.json')
const NATURES: NatureVaisseau[] = ['moteurs', 'amenagements', 'defenses', 'armes', 'modifications']

function coque(cle: string): CoqueResolue {
  return essai.coques.find((c: CoqueResolue) => c.cle === cle)
}
function ligne(nature: NatureVaisseau, cle: string, quantite = 1): LigneResolue {
  const e = [...(essai[nature] ?? []), ...(univers[nature] ?? [])].find((x: { cle: string }) => x.cle === cle)
  assert.ok(e, `élément inconnu ${cle}`)
  return { nature, cle, nom: e.nom, quantite, element: e as ElementResolu }
}
function exemple(cle: string, porteeSaut = 5) {
  const ex = essai.exemples.find((x: { cle: string }) => x.cle === cle)
  const lignes = ex.choix.map((c: { nature: NatureVaisseau; cle: string; quantite: number }) => ligne(c.nature, c.cle, c.quantite))
  return calculer(coque(ex.coque), lignes, { porteeSaut })
}
const NBSP = ' '

// [exemple, prix, pv, ca, puissanceLibre, masseLibre, emports utilisés, total, jours, entretien, portée]
const TABLEAU: [string, number, number, number, number, number, number, number, number, number, number | null][] = [
  ['eclaireur-nu', 25000, 8, 14, 8, 7, 0, 1, 1, 1250, 10],
  ['eclaireur-arme', 54000, 13, 15, 6, 4, 1, 1, 3, 2700, 10],
  ['fregate-de-ligne', 700000, 30, 14, 5, 1, 2, 3, 28, 35000, 15],
  ['fregate-a-l-extreme', 815000, 30, 14, 0, 3, 3, 3, 33, 40750, 15],
  ['fregate-gourmande', 855000, 30, 14, -1, -3, 3, 3, 35, 42750, 15],
  ['croiseur-de-transport', 1966000, 69, 16, 27, 3, 3, 5, 79, 98300, 15],
  ['fregate-sans-moteur', 465000, 30, 14, 15, 13, 1, 3, 19, 23250, null],
]
for (const [cle, prix, pv, ca, pl, ml, u, t, j, ent, portee] of TABLEAU) {
  test(`exemple ${cle} : valeurs du tableau V-11`, () => {
    const r = exemple(cle)
    assert.equal(r.prix, prix)
    assert.equal(r.pv, pv)
    assert.equal(r.ca, ca)
    assert.equal(r.puissanceLibre, pl)
    assert.equal(r.masseLibre, ml)
    assert.deepEqual(r.emports, { utilises: u, total: t })
    assert.equal(r.chantierJours, j)
    assert.equal(r.entretien, ent)
    assert.equal(r.porteeSaut, portee)
  })
}

test('alertes des exemples : seules celles du tableau', () => {
  const codes = (c: string) => exemple(c).alertes.map((a) => `${a.niveau}:${a.code}`)
  for (const c of ['eclaireur-nu', 'eclaireur-arme', 'fregate-de-ligne', 'croiseur-de-transport']) assert.deepEqual(codes(c), [], c)
  assert.deepEqual(exemple('fregate-a-l-extreme').alertes.map((a) => [a.niveau, a.code, a.texte]), [
    ['a_surveiller', 'reserve_nulle', 'Plus aucune réserve de puissance.'],
  ])
  assert.deepEqual(exemple('fregate-gourmande').alertes.map((a) => [a.niveau, a.code, a.texte]), [
    ['bloquante', 'puissance_insuffisante', 'Puissance insuffisante : −1'],
    ['bloquante', 'masse_insuffisante', 'Masse insuffisante : −3'],
  ])
  const sm = exemple('fregate-sans-moteur')
  assert.deepEqual(sm.alertes.map((a) => [a.niveau, a.code, a.texte]), [
    ['a_surveiller', 'moteur_absent', 'Aucun moteur de saut : ce vaisseau ne peut pas voyager.'],
  ])
  assert.equal(sm.porteeSaut, null)
})

test('deux soutes sur une frégate avec moteur-2 : « Soute » : 1 au plus.', () => {
  const r = calculer(coque('fregate'), [ligne('moteurs', 'moteur-2'), ligne('amenagements', 'soute', 2)], { porteeSaut: 5 })
  const a = r.alertes.find((x) => x.code === 'limite_depassee')
  assert.ok(a)
  assert.equal(a.niveau, 'bloquante')
  assert.equal(a.texte, '« Soute » : 1 au plus.')
  assert.equal(a.ligne, 1)
})

test('une soute (à la limite) ne déclenche pas limite_depassee', () => {
  const r = calculer(coque('fregate'), [ligne('moteurs', 'moteur-2'), ligne('amenagements', 'soute', 1)], { porteeSaut: 5 })
  assert.equal(r.alertes.some((x) => x.code === 'limite_depassee'), false)
})

test('deux moteur-1 : Un seul moteur par vaisseau.', () => {
  const r = calculer(coque('croiseur'), [ligne('moteurs', 'moteur-1', 2)], { porteeSaut: 5 })
  assert.ok(r.alertes.some((a) => a.niveau === 'bloquante' && a.code === 'moteur_multiple' && a.texte === 'Un seul moteur par vaisseau.'))
})

test('moteur-1 puis moteur-2 en deux lignes : moteur_multiple aussi', () => {
  const r = calculer(coque('croiseur'), [ligne('moteurs', 'moteur-1'), ligne('moteurs', 'moteur-2')], { porteeSaut: 5 })
  assert.ok(r.alertes.some((a) => a.code === 'moteur_multiple'))
})

test('emports insuffisants : 4 sur 3', () => {
  const r = calculer(coque('fregate'), [ligne('moteurs', 'moteur-2'), ligne('armes', 'laser', 4)], { porteeSaut: 5 })
  assert.ok(r.alertes.some((a) => a.niveau === 'bloquante' && a.code === 'emports_insuffisants' && a.texte === 'Emports insuffisants : 4 sur 3'))
})

test('Vent d\'Orak : 685 000 cr, 28 jours, 34 250, puissance 4, masse 7, portée 15', () => {
  const lignes = [ligne('moteurs', 'moteur-2'), ligne('amenagements', 'soute'), ligne('armes', 'laser'), ligne('armes', 'lance-d-essai')]
  const r = calculer(coque('fregate'), lignes, { porteeSaut: 5 })
  assert.equal(r.prix, 685000)
  assert.equal(r.chantierJours, 28)
  assert.equal(r.entretien, 34250)
  assert.equal(r.puissanceLibre, 4)
  assert.equal(r.masseLibre, 7)
  assert.equal(r.porteeSaut, 15)
  assert.deepEqual(r.alertes, [])
})

test('Vent d\'Orak avec une seconde lance-d-essai (quantité 2) : Puissance insuffisante : −2', () => {
  const lignes = [ligne('moteurs', 'moteur-2'), ligne('amenagements', 'soute'), ligne('armes', 'laser'), ligne('armes', 'lance-d-essai', 2)]
  const r = calculer(coque('fregate'), lignes, { porteeSaut: 5 })
  assert.equal(r.puissanceLibre, -2)
  assert.ok(r.alertes.some((a) => a.niveau === 'bloquante' && a.texte === 'Puissance insuffisante : −2'))
})

test('chantier : 700 000 cr = 28 jours exactement, 954 000 cr = 39, bord 25 000 et 25 001', () => {
  assert.equal(exemple('fregate-de-ligne').prix, 700000)
  assert.equal(exemple('fregate-de-ligne').chantierJours, 28)
  assert.equal(exemple('eclaireur-nu').chantierJours, 1) // 25 000 exactement
  // 954 000 : frégate (300 000) + moteur-2 (60 000) + soute (50 000) + cabines (40 000) + 2 lasers (125 000)... on isole par la coque
  const c = { ...coque('croiseur'), cout: 954000 }
  const r = calculer(c, [], { porteeSaut: 5 })
  assert.equal(r.prix, 954000)
  assert.equal(r.chantierJours, 39)
  assert.equal(calculer({ ...c, cout: 949000 }, [], { porteeSaut: 5 }).chantierJours, 38)
  assert.equal(calculer({ ...c, cout: 25001 }, [], { porteeSaut: 5 }).chantierJours, 2)
  assert.equal(CADENCE_CHANTIER, 25000)
  assert.equal(TAUX_ENTRETIEN, 0.05)
})

test('entretien : 5 % arrondi au plus proche (949 000 → 47 450)', () => {
  assert.equal(calculer({ ...coque('croiseur'), cout: 949000 }, [], { porteeSaut: 5 }).entretien, 47450)
})

test('portée de saut : suit le réglage (6 → 18 pour la frégate de ligne)', () => {
  assert.equal(exemple('fregate-de-ligne', 6).porteeSaut, 18)
  assert.equal(exemple('fregate-de-ligne', 5).porteeSaut, 15)
  assert.equal(exemple('eclaireur-nu', 6).porteeSaut, 12)
})

test('canon léger : les munitions comptent dans le prix, sans facteur de coque', () => {
  // frégate 300 000 + moteur-2 (12 000 × 5) + canon (12 000 × 5 + 10 × 100)
  const r = calculer(coque('fregate'), [ligne('moteurs', 'moteur-2'), ligne('armes', 'canon-leger')], { porteeSaut: 5 })
  assert.equal(r.prix, 300000 + 60000 + 60000 + 1000)
})

test('alertes : bloquantes d\'abord, puis surveillées, dans l\'ordre de V-2', () => {
  // coque sans budget, emports dépassés, deux soutes, pas de moteur
  const c = { ...coque('fregate'), puissance: 0, masse: 0 }
  const r = calculer(c, [ligne('armes', 'laser', 4), ligne('amenagements', 'soute', 2)], { porteeSaut: 5 })
  const codes = r.alertes.map((a) => a.code)
  assert.deepEqual(codes, ['puissance_insuffisante', 'masse_insuffisante', 'emports_insuffisants', 'limite_depassee', 'moteur_absent'])
  // réserves nulles : après moteur_absent
  const z = calculer({ ...coque('eclaireur'), puissance: 2, masse: 1 }, [ligne('moteurs', 'moteur-1')], { porteeSaut: 5 })
  assert.deepEqual(z.alertes.map((a) => a.texte), ['Plus aucune réserve de puissance.', 'Plus aucune réserve de masse.'])
})

test('une bloquante passe avant une à surveiller, quel que soit l\'ordre de construction', () => {
  // sans moteur (surveiller) + puissance négative (bloquante)
  const r = calculer(coque('eclaireur'), [ligne('armes', 'lance-d-essai', 2)], { porteeSaut: 5 })
  assert.equal(r.alertes[0].niveau, 'bloquante')
  assert.equal(r.alertes[r.alertes.length - 1].code, 'moteur_absent')
})

test('purete : calculer ne modifie pas ses entrées', () => {
  const c = coque('fregate')
  const l = [ligne('moteurs', 'moteur-2')]
  const avant = JSON.stringify([c, l])
  calculer(c, l, { porteeSaut: 5 })
  assert.equal(JSON.stringify([c, l]), avant)
})

test('texte de eclaireur-nu : exact', () => {
  const t = texteVaisseau(exemple('eclaireur-nu'))
  const lignes = t.split('\n')
  assert.equal(lignes[0], '**Éclaireur** — classe 1')
  assert.equal(lignes[1], '')
  assert.equal(lignes[2], '| Mesure | Valeur |')
  assert.match(lignes[3], /^\|[-: ]+\|[-: ]+\|$/)
  assert.deepEqual(lignes.slice(4), [
    `| Prix | 25${NBSP}000${NBSP}cr |`,
    '| PV | 8 |',
    '| CA | 14 |',
    '| Chantier | 1 jour |',
    `| Entretien | 1${NBSP}250${NBSP}cr / an |`,
    '| Portée de saut | 10 cases |',
    '| Puissance libre | 8 |',
    '| Masse libre | 7 |',
    '| Emports | 0 / 1 |',
    '',
    '**Choix**',
    '- 1 × Moteur 1',
    '',
  ])
  assert.ok(!t.includes('**Alertes**'))
  assert.ok(t.endsWith('\n') && !t.endsWith('\n\n'))
})

test('texte de fregate-gourmande : bloc Alertes, bloquantes d\'abord, U+2212', () => {
  const t = texteVaisseau(exemple('fregate-gourmande'))
  const i = t.indexOf('**Alertes**')
  assert.ok(i > 0)
  assert.equal(
    t.slice(i),
    '**Alertes**\n- **Bloquante** : Puissance insuffisante : −1\n- **Bloquante** : Masse insuffisante : −3\n',
  )
  assert.ok(t.includes('| Puissance libre | −1 |'))
  assert.ok(t.includes('| Masse libre | −3 |'))
})

test('texte : à surveiller, portée absente « — », ordre des choix', () => {
  const t = texteVaisseau(exemple('fregate-sans-moteur'))
  assert.ok(t.includes('| Portée de saut | — |'))
  assert.ok(t.endsWith('- **À surveiller** : Aucun moteur de saut : ce vaisseau ne peut pas voyager.\n'))
  const c = texteVaisseau(exemple('croiseur-de-transport'))
  const debut = c.indexOf('**Choix**')
  assert.deepEqual(c.slice(debut).split('\n'), [
    '**Choix**', '- 1 × Moteur 2', '- 1 × Cabines', '- 1 × Soute', '- 1 × Blindage', '- 1 × Canon léger', '- 2 × Laser', '- 1 × Renfort de coque', '',
  ])
})

test('texte : chantier au pluriel, deux jours, grand prix groupé', () => {
  const t = texteVaisseau(exemple('croiseur-de-transport'))
  assert.ok(t.includes(`| Prix | 1${NBSP}966${NBSP}000${NBSP}cr |`))
  assert.ok(t.includes('| Chantier | 79 jours |'))
  assert.ok(texteVaisseau(calculer({ ...coque('eclaireur'), cout: 30000 }, [], { porteeSaut: 5 })).includes('| Chantier | 2 jours |'))
})

test('texte rendu en section : aucun conteneur ::: et pas de lien', () => {
  for (const [cle] of TABLEAU) {
    const html = rendreMarkdown(texteVaisseau(exemple(cle)), { nature: 'section' })
    assert.ok(!html.includes(':::'), cle)
    assert.ok(!html.includes('<a '), cle)
  }
  assert.ok(!texteVaisseau(exemple('fregate-gourmande')).includes(':::'))
})

test('catalogues JSON : clés et comptes de V-11', () => {
  assert.equal(essai.version, '2026-11-essai-vaisseaux')
  assert.deepEqual(essai.coques.map((c: { cle: string }) => c.cle), ['eclaireur', 'fregate', 'croiseur'])
  assert.deepEqual(essai.moteurs.map((c: { cle: string }) => c.cle), ['moteur-1', 'moteur-2'])
  assert.deepEqual(essai.amenagements.map((c: { cle: string }) => c.cle), ['soute', 'cabines'])
  assert.deepEqual(essai.defenses.map((c: { cle: string }) => c.cle), ['blindage'])
  assert.deepEqual(essai.armes.map((c: { cle: string }) => c.cle), ['laser', 'canon-leger'])
  assert.deepEqual(essai.modifications.map((c: { cle: string }) => c.cle), ['renfort'])
  assert.deepEqual(essai.exemples.map((c: { cle: string }) => c.cle), TABLEAU.map((t) => t[0]))
  assert.deepEqual(essai.moteurs.map((m: { niveau: number }) => m.niveau), [1, 2])
  assert.equal(essai.amenagements[0].limite, 1)
  assert.equal(essai.armes[1].munitions, 10)
  assert.equal(essai.armes[1].cout_munition, 100)
  assert.equal(univers.armes.length, 1)
  assert.equal(univers.armes[0].cle, 'lance-d-essai')
  assert.equal(univers.armes[0].cout, 30000)
  assert.equal(univers.armes[0].puissance, 6)
  assert.equal(univers.armes[0].x_puissance, false)
  for (const n of NATURES) if (n !== 'armes') assert.equal(univers[n], undefined)
})
