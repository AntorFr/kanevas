import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hexVersPlan } from './hex.js'

interface Etoile { q: number; r: number; taille: number; lettre: string; x: number; y: number }
interface Fixtures {
  graine: string
  bloc: number
  densites: { defaut: number; zones: { nom: string; densite: number; hexagones: [number, number][] }[] }
  systemes_definis: { q: number; r: number; promu: boolean }[]
  litteraux: {
    hash32: { chaine: string; valeur: number }[]
    rng: { graine: number; suite: number[] }[]
  }
  blocs: { bx: number; by: number; etoile: Etoile | null }[]
}

const fx: Fixtures = JSON.parse(
  readFileSync(new URL('../../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json', import.meta.url), 'utf8'),
)

describe('fixtures de génération de la galaxie', () => {
  it('a la forme d’AD-etoiles-5', () => {
    assert.deepEqual(Object.keys(fx).sort(), ['bloc', 'blocs', 'densites', 'graine', 'litteraux', 'systemes_definis'])
    assert.equal(fx.graine, 'kanevas-neutre-1')
    assert.equal(fx.bloc, 5)
    assert.ok(fx.litteraux.hash32.length > 0 && fx.litteraux.rng.length > 0)
    for (const l of fx.litteraux.hash32) assert.ok(Number.isInteger(l.valeur) && l.valeur >= 0 && l.valeur < 2 ** 32)
    for (const l of fx.litteraux.rng) for (const v of l.suite) assert.ok(v >= 0 && v < 1)
  })

  it('couvre assez de blocs, d’étoiles, de densités et de systèmes définis', () => {
    assert.ok(fx.blocs.length >= 400)
    assert.equal(new Set(fx.blocs.map((b) => `${b.bx},${b.by}`)).size, fx.blocs.length)
    assert.ok(fx.blocs.filter((b) => b.etoile).length >= 100)
    const densites = new Set([fx.densites.defaut, ...fx.densites.zones.map((z) => z.densite)])
    assert.ok(densites.size >= 3)
    assert.ok(fx.densites.zones.some((z) => z.densite < fx.densites.defaut))
    assert.ok(fx.densites.zones.some((z) => z.densite > fx.densites.defaut))
    assert.ok(fx.systemes_definis.some((s) => s.promu))
    assert.ok(fx.systemes_definis.some((s) => !s.promu))
  })

  it('ne pose aucune étoile au bord d’un bloc', () => {
    for (const { bx, by, etoile } of fx.blocs) {
      if (!etoile) continue
      const dq = etoile.q - fx.bloc * bx
      const dr = etoile.r - fx.bloc * by
      assert.ok(dq >= 1 && dq <= 3, `dq ${dq} du bloc ${bx},${by}`)
      assert.ok(dr >= 1 && dr <= 3, `dr ${dr} du bloc ${bx},${by}`)
      assert.match(etoile.lettre, /^[MKGFAB]$/)
      assert.ok(etoile.taille >= 0.65 && etoile.taille <= 2.1)
    }
  })

  it('porte pour chaque étoile le plan de hexVersPlan à 1e-9 (AD-etoiles-4)', () => {
    for (const { etoile } of fx.blocs) {
      if (!etoile) continue
      const p = hexVersPlan({ q: etoile.q, r: etoile.r })
      assert.ok(Math.abs(p.x - etoile.x) < 1e-9, `x de ${etoile.q},${etoile.r}`)
      assert.ok(Math.abs(p.y - etoile.y) < 1e-9, `y de ${etoile.q},${etoile.r}`)
    }
  })
})
