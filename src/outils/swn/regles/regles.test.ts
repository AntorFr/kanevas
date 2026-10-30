import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { distanceHex, hexVersPlan, planVersHex, pointDansPolygone } from './hex.js'
import { bloc, densiteHexagone } from './generation.js'
import { plusCourtChemin } from './chemin.js'
import { libelleTrajet, libelleDuree } from './format.js'

test('distance hexagonale des cas du critère', () => {
  assert.equal(distanceHex({ q: 0, r: 0 }, { q: 7, r: 0 }), 7)
  assert.equal(distanceHex({ q: 0, r: 0 }, { q: 1, r: 5 }), 6)
  assert.equal(distanceHex({ q: 7, r: 0 }, { q: 1, r: 5 }), 6)
  assert.equal(distanceHex({ q: 3, r: -2 }, { q: 3, r: -2 }), 0)
})

test('conversion hexagone <-> plan : aller-retour sur −20..20', () => {
  for (let q = -20; q <= 20; q++)
    for (let r = -20; r <= 20; r++) {
      const { x, y } = hexVersPlan({ q, r })
      assert.deepEqual(planVersHex(x, y), { q, r })
    }
})

test('bloc : même liste deux fois, blocs négatifs compris, bornes du bloc', () => {
  for (const [bx, by] of [[0, 0], [-1, -1], [-3, 2], [4, -7]] as const) {
    const a = bloc('essai-1', bx, by, () => 0.5)
    assert.deepEqual(a, bloc('essai-1', bx, by, () => 0.5))
    for (const h of a) {
      assert.ok(h.q >= 5 * bx && h.q <= 5 * bx + 4, `q ${h.q} bloc ${bx}`)
      assert.ok(h.r >= 5 * by && h.r <= 5 * by + 4, `r ${h.r} bloc ${by}`)
    }
  }
  assert.ok(bloc('essai-1', -1, -1, () => 0.5).length > 0)
})

test('bloc : densité 0 rien, densité 1 les 25 cases', () => {
  assert.deepEqual(bloc('essai-1', 0, 0, () => 0), [])
  assert.deepEqual(bloc('essai-1', -2, 3, () => 0), [])
  const tout = bloc('essai-1', -2, 3, () => 1)
  assert.equal(tout.length, 25)
  assert.equal(new Set(tout.map((h) => `${h.q},${h.r}`)).size, 25)
})

test('bloc : positions figées pour « essai-1 » (0,0) à 0,2 ; autre graine, autre liste', () => {
  assert.deepEqual(bloc('essai-1', 0, 0, () => 0.2), [
    { q: 0, r: 0 }, { q: 2, r: 0 }, { q: 2, r: 3 }, { q: 4, r: 3 },
    { q: 2, r: 4 }, { q: 3, r: 4 }, { q: 4, r: 4 },
  ])
  assert.deepEqual(bloc('essai-2', 0, 0, () => 0.2).slice(0, 3), [
    { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 },
  ])
})

test('bloc : le champ est interrogé case par case (densité par case)', () => {
  const r = bloc('essai-1', 0, 0, (q, rr) => (q === 2 && rr === 0 ? 1 : 0))
  assert.deepEqual(r, [{ q: 2, r: 0 }])
})

const carre = (d: number | null, x0 = 0) => ({
  contour: [[x0, 0], [x0 + 10, 0], [x0 + 10, 10], [x0, 10]] as [number, number][],
  densite: d,
})

test('densité : la plus basse de deux zones, null ignorée, 0 comptée', () => {
  assert.equal(densiteHexagone(5, 5, [carre(0.5), carre(0.1)], 0.2), 0.1)
  assert.equal(densiteHexagone(5, 5, [carre(0.1), carre(0.5)], 0.2), 0.1)
  assert.equal(densiteHexagone(5, 5, [carre(null)], 0.2), 0.2)
  assert.equal(densiteHexagone(5, 5, [carre(null), carre(0.7)], 0.2), 0.7)
  assert.equal(densiteHexagone(5, 5, [carre(0), carre(0.5)], 0.2), 0)
  assert.equal(densiteHexagone(50, 5, [carre(0)], 0.2), 0.2)
  assert.equal(densiteHexagone(5, 5, [], 0.3), 0.3)
})

test('polygone du critère : sommets, bord dedans ; hors contour dehors', () => {
  const c: [number, number][] = [[-12, 2], [-4, 2], [-4, 8], [-12, 8]]
  assert.equal(pointDansPolygone(-4, 2, c), true)
  assert.equal(pointDansPolygone(-12, 8, c), true)
  assert.equal(pointDansPolygone(-8, 2, c), true)
  assert.equal(pointDansPolygone(-8, 5, c), true)
  assert.equal(pointDansPolygone(-13, 2, c), false)
  assert.equal(pointDansPolygone(-8, 9, c), false)
  assert.equal(pointDansPolygone(-3, 5, c), false)
})

test('polygone non convexe : l’encoche est dehors', () => {
  const l: [number, number][] = [[0, 0], [10, 0], [10, 10], [5, 10], [5, 5], [0, 5]]
  assert.equal(pointDansPolygone(2, 8, l), false)
  assert.equal(pointDansPolygone(2, 2, l), true)
  assert.equal(pointDansPolygone(8, 8, l), true)
})

const R = [
  { a: 'port-sel', b: 'vael', longueur: 7 },
  { a: 'vael', b: 'hesper', longueur: 6 },
  { a: 'port-sel', b: 'hesper', longueur: 6 },
]

test('trajet direct Port-Sel → Hesper : 6 cases, 4 jours moteur 2', () => {
  const t = plusCourtChemin(R, 'port-sel', 'hesper', 2)
  assert.ok(t.trouve)
  if (t.trouve) {
    assert.deepEqual(t.systemes, ['port-sel', 'hesper'])
    assert.equal(t.cases, 6)
    assert.equal(t.jours, 4)
  }
})

test('sans la dernière route : par Vael, 13 cases, 8,5 j moteur 2, 15 j moteur 1', () => {
  const t2 = plusCourtChemin(R.slice(0, 2), 'port-sel', 'hesper', 2)
  assert.ok(t2.trouve)
  if (t2.trouve) {
    assert.deepEqual(t2.systemes, ['port-sel', 'vael', 'hesper'])
    assert.equal(t2.cases, 13)
    assert.equal(t2.jours, 8.5)
    assert.deepEqual(t2.troncons.map((x) => x.longueur), [7, 6])
  }
  const t1 = plusCourtChemin(R.slice(0, 2), 'port-sel', 'hesper', 1)
  assert.ok(t1.trouve)
  if (t1.trouve) assert.equal(t1.jours, 15)
})

test('route de 12 cases : inutilisable moteur 1, utilisable moteur 2, non découpée', () => {
  const r = [{ a: 'x', b: 'y', longueur: 12 }]
  assert.deepEqual(plusCourtChemin(r, 'x', 'y', 1), { trouve: false })
  assert.deepEqual(plusCourtChemin(r, 'y', 'x', 1), { trouve: false })
  const t = plusCourtChemin(r, 'x', 'y', 2)
  assert.ok(t.trouve)
  // portée réglable : 12 ≤ 6×2 moteur 1
  assert.ok(plusCourtChemin(r, 'x', 'y', 1, 6).trouve)
  assert.deepEqual(plusCourtChemin(r, 'x', 'y', 1, 5), { trouve: false })
})

test('route à la portée exacte (10 moteur 1) utilisable', () => {
  assert.ok(plusCourtChemin([{ a: 'x', b: 'y', longueur: 10 }], 'x', 'y', 1).trouve)
  assert.equal(plusCourtChemin([{ a: 'x', b: 'y', longueur: 11 }], 'x', 'y', 1).trouve, false)
})

test('égalité de longueur : moins de tronçons gagne', () => {
  const r = [
    { a: 'a', b: 'b', longueur: 4 },
    { a: 'b', b: 'z', longueur: 4 },
    { a: 'a', b: 'z', longueur: 8 },
  ]
  const t = plusCourtChemin(r, 'a', 'z', 3)
  assert.ok(t.trouve)
  if (t.trouve) assert.deepEqual(t.systemes, ['a', 'z'])
})

test('égalité de longueur et de tronçons : ordre des clés, indépendant de l’ordre des routes', () => {
  const r = [
    { a: 'a', b: 'y', longueur: 3 },
    { a: 'y', b: 'z', longueur: 3 },
    { a: 'a', b: 'x', longueur: 3 },
    { a: 'x', b: 'z', longueur: 3 },
  ]
  for (const liste of [r, [...r].reverse()]) {
    const t = plusCourtChemin(liste, 'a', 'z', 2)
    assert.ok(t.trouve)
    if (t.trouve) assert.deepEqual(t.systemes, ['a', 'x', 'z'])
  }
})

test('chemin : plus court en longueur même avec plus de tronçons', () => {
  const r = [
    { a: 'a', b: 'z', longueur: 10 },
    { a: 'a', b: 'm', longueur: 3 },
    { a: 'm', b: 'z', longueur: 3 },
  ]
  const t = plusCourtChemin(r, 'a', 'z', 2)
  assert.ok(t.trouve)
  if (t.trouve) assert.deepEqual(t.systemes, ['a', 'm', 'z'])
})

test('chemin : arrivée inconnue ou non reliée, pas de chemin', () => {
  assert.deepEqual(plusCourtChemin(R, 'port-sel', 'nulle-part', 2), { trouve: false })
  assert.deepEqual(plusCourtChemin([], 'a', 'b', 2), { trouve: false })
})

test('libellés du critère', () => {
  assert.equal(libelleTrajet(7, 4.5), '7 cases · 4,5 jours')
  assert.equal(libelleTrajet(6, 4), '6 cases · 4 jours')
  assert.equal(libelleDuree(1), '1 jour')
  assert.equal(libelleDuree(2), '2 jours')
  assert.equal(libelleDuree(8.5), '8,5 jours')
  assert.equal(libelleDuree(1.25), '1,3 jour')
  assert.equal(libelleDuree(2 / 3 + 1), '1,7 jour')
})

test('regles/ n’importe ni base ni services', () => {
  for (const f of ['hex', 'generation', 'chemin', 'format']) {
    const src = readFileSync(new URL(`./${f}.ts`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /better-sqlite3|services\//)
  }
})
