import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Coherence of the interior fixtures with the rest of the repository: the twenty entries are stars of the
// galaxy fixtures, and the draw literals are what the documented hash32 / mulberry32 give (AD-systeme-1).
const lire = (f: string) => JSON.parse(readFileSync(new URL(`../../../../rust/modules/coeur/tests/fixtures/${f}`, import.meta.url), 'utf8'))
const sys = lire('generation-systemes.json')
const gal = lire('generation-galaxie.json')

function hash32(texte: string): number {
  let h = (1779033703 ^ texte.length) >>> 0
  for (let i = 0; i < texte.length; i++) {
    h = Math.imul(h ^ texte.charCodeAt(i), 3432918353)
    h = ((h << 13) | (h >>> 19)) >>> 0
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}
function rng(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('fixtures des systèmes : cohérence', () => {
  it('chaque entrée est une étoile des fixtures de la galaxie, même taille et même lettre', () => {
    const etoiles = new Map<string, { taille: number; lettre: string }>()
    for (const b of gal.blocs) if (b.etoile) etoiles.set(`${b.etoile.q},${b.etoile.r}`, b.etoile)
    for (const { entree } of sys.systemes) {
      const e = etoiles.get(`${entree.q},${entree.r}`)
      assert.ok(e, `${entree.q},${entree.r} absent de la galaxie`)
      assert.equal(entree.taille, e.taille)
      assert.equal(entree.lettre, e.lettre)
    }
  })

  it('les littéraux sont ceux de rng(hash32(cle|aspect))', () => {
    for (const l of sys.litteraux.tirage) {
      const R = rng(hash32(`${l.cle}|${l.aspect}`))
      assert.deepEqual(l.suite.map(() => R()), l.suite, `${l.cle}|${l.aspect}`)
    }
  })

  it('la cle de chaque astre et formation est dans l’espace de l’entrée, et chaque étoile a un rang unique', () => {
    for (const { entree, sortie } of sys.systemes) {
      const rangs = sortie.astres.filter((a: { genre: string }) => a.genre === 'etoile').map((a: { etoile_rang: number }) => a.etoile_rang).sort()
      assert.deepEqual(rangs, rangs.map((_: number, i: number) => i), `${entree.q},${entree.r}`)
      for (const f of sortie.formations) assert.ok(f.etoile_rang <= rangs.length - 1)
    }
  })
})
