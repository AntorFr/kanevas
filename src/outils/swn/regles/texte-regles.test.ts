// Tests du texte des fiches de règles et des exemples (R-3), attendus écrits en dur depuis le catalogue d'essai de V-11.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { texteRegles, texteExemples } from './texte-regles.js'
import { texteVaisseau } from './texte-vaisseau.js'
import { calculer } from './vaisseau.js'
import type { CoqueResolue, ElementResolu, LigneResolue, NatureVaisseau } from './vaisseau.js'
import { rendreMarkdown } from '../../../services/markdown.js'

const lire = (f: string) => JSON.parse(readFileSync(new URL(`../exemples/${f}`, import.meta.url), 'utf8'))
const essai = lire('catalogue-essai.json')
const univers = lire('catalogue-essai-univers.json')
const N = '\u00A0'

function exemples() {
  return essai.exemples.map((ex: { cle: string; nom: string; coque: string; choix: { nature: NatureVaisseau; cle: string; quantite: number }[] }) => {
    const c: CoqueResolue = essai.coques.find((x: CoqueResolue) => x.cle === ex.coque)
    const lignes: LigneResolue[] = ex.choix.map((ch) => {
      const e = [...(essai[ch.nature] ?? []), ...(univers[ch.nature] ?? [])].find((x: { cle: string }) => x.cle === ch.cle)
      return { nature: ch.nature, cle: ch.cle, nom: e.nom, quantite: ch.quantite, element: e as ElementResolu }
    })
    return { cle: ex.cle, nom: ex.nom, resultat: calculer(c, lignes, { porteeSaut: 5 }) }
  })
}

test('armes : texte complet, tri par nom, crédits insécables, drapeaux', () => {
  const lance = { ...univers.armes[0], proprietaire: 'univers' as const }
  const t = texteRegles('armes', [lance, ...essai.armes].reverse())
  const attendu = [
    '**Armes** — 3 éléments',
    '',
    "| Nom | Emport | Munitions | Coût d'une munition | Coût | Puissance | Masse | PV | CA | Limite | Coût × coque | Puissance × coque | Masse × coque |",
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    `| Canon léger | 1 | 10 | 100${N}cr | 12${N}000${N}cr | 1 | 1 | 0 | 0 | — | × coque | — | — |`,
    `| Lance d'essai (Univers) | 1 | 0 | 0${N}cr | 30${N}000${N}cr | 6 | 1 | 0 | 0 | — | × coque | — | — |`,
    `| Laser | 1 | 0 | 0${N}cr | 25${N}000${N}cr | 2 | 1 | 0 | 0 | — | × coque | × coque | — |`,
    '',
  ].join('\n')
  assert.equal(t, attendu)
})

test('coques : colonnes et lignes', () => {
  const t = texteRegles('coques', essai.coques)
  const l = t.split('\n')
  assert.equal(l[0], '**Coques** — 3 éléments')
  assert.equal(l[2], '| Nom | Classe | Coût | PV | CA | Puissance | Masse | Emports | Facteur de coût | Facteur de puissance | Facteur de masse |')
  assert.equal(l[4], `| Croiseur d'essai | 3 | 1${N}000${N}000${N}cr | 60 | 15 | 50 | 40 | 5 | 10 | 3 | 4 |`)
})

test('moteurs : colonne Niveau en tête', () => {
  const l = texteRegles('moteurs', essai.moteurs).split('\n')
  assert.equal(l[2], '| Nom | Niveau | Coût | Puissance | Masse | PV | CA | Limite | Coût × coque | Puissance × coque | Masse × coque |')
  assert.equal(l[4], `| Moteur 1 | 1 | 5${N}000${N}cr | 2 | 1 | 0 | 0 | — | × coque | — | — |`)
})

test('amenagements : limite non nulle imprimée', () => {
  const l = texteRegles('amenagements', essai.amenagements).split('\n')
  assert.equal(l[4], `| Cabines | 8${N}000${N}cr | 1 | 2 | 0 | 0 | — | × coque | — | × coque |`)
  assert.equal(l[5], `| Soute | 10${N}000${N}cr | 0 | 3 | 0 | 0 | 1 | × coque | — | × coque |`)
})

test('nature vide : exactement deux lignes, pas de tableau', () => {
  assert.equal(texteRegles('defenses', []), '**Défenses** — 0 élément\n\nAucun élément dans le catalogue.\n')
})

test('un seul élément : « 1 élément »', () => {
  assert.ok(texteRegles('defenses', essai.defenses).startsWith('**Défenses** — 1 élément\n'))
})

test('exemples : sept, entête, bloc par nom, table identique à texteVaisseau', () => {
  const ex = exemples()
  const t = texteExemples(ex)
  assert.ok(t.startsWith('**Exemples** — 7\n\n'))
  const noms = [...t.matchAll(/^### (.*)$/gm)].map((m) => m[1])
  assert.deepEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, 'fr')))
  assert.equal(noms.length, 7)
  for (const x of ex) {
    const tv = texteVaisseau(x.resultat)
    const table = tv.slice(tv.indexOf('| Mesure'), tv.indexOf('\n\n**Choix**'))
    const choix = tv.slice(tv.indexOf('**Choix**')).replace(/\n\n\*\*Alertes\*\*[\s\S]*$/, '').trimEnd()
    const bloc = t.slice(t.indexOf(`### ${x.nom}\n`))
    assert.ok(bloc.startsWith(`### ${x.nom}\n\n${x.resultat.coque.nom} — classe ${x.resultat.coque.classe}\n\n${choix}\n\n${table}\n`), x.nom)
  }
  assert.ok(t.includes(`| Prix | 700${N}000${N}cr |`))
})

test('exemples : zéro', () => {
  assert.equal(texteExemples([]), '**Exemples** — 0\n\nAucun exemple.\n')
})

test('déterministe, entrée dans le désordre, sans conteneur ni lien', () => {
  const ex = exemples()
  assert.equal(texteExemples(ex), texteExemples([...ex].reverse()))
  assert.equal(texteExemples(ex), texteExemples(ex))
  assert.equal(texteRegles('armes', essai.armes), texteRegles('armes', [...essai.armes].reverse()))
  for (const t of [texteExemples(ex), texteRegles('coques', essai.coques), texteRegles('armes', essai.armes)]) {
    assert.ok(!t.includes(':::'))
    const html = rendreMarkdown(t, { nature: 'section' })
    assert.ok(!/<a[\s>]/.test(html))
    assert.ok(!html.includes(':::'))
  }
})
