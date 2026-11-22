import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Forme du fichier de fixtures de l'intérieur des systèmes (AD-systeme-1, AD-systeme-2), produit par le générateur
// d'Éneria sur la graine neutre ; le module Rust se prouve contre lui.
interface Astre {
  cle: string; genre: string; parent_cle: string | null; etoile_rang: number; type: string; nom: null
  orbite: number | null; heure: number; taille: number; aspect: Record<string, unknown>
}
interface Formation { cle: string; forme: string; nom: null; parametres: Record<string, unknown>; etoile_rang: number }
interface Systeme {
  entree: { q: number; r: number; taille: number; lettre: string }
  sortie: { astres: Astre[]; formations: Formation[]; transition: number }
}
const fx: { graine: string; systemes: Systeme[]; litteraux: { tirage: { cle: string; aspect: string; suite: number[] }[] } } = JSON.parse(
  readFileSync(new URL('../../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url), 'utf8'),
)

describe('fixtures de génération des systèmes', () => {
  it('a la forme d’AD-systeme-2 sur vingt systèmes de la graine neutre', () => {
    assert.deepEqual(Object.keys(fx).sort(), ['graine', 'litteraux', 'systemes'])
    assert.equal(fx.graine, 'kanevas-neutre-1')
    assert.equal(fx.systemes.length, 20)
    assert.equal(new Set(fx.systemes.map((s) => `${s.entree.q},${s.entree.r}`)).size, 20)
    for (const s of fx.systemes) {
      assert.deepEqual(Object.keys(s.entree).sort(), ['lettre', 'q', 'r', 'taille'])
      assert.deepEqual(Object.keys(s.sortie).sort(), ['astres', 'formations', 'transition'])
      assert.ok(s.entree.taille > 0 && /^[MKGFAB]$/.test(s.entree.lettre))
      assert.ok(s.sortie.transition > 0)
    }
  })

  it('porte, par système, 4 à 12 astres hors lunes et étoiles (zones comprises), des clés uniques et des parents existants', () => {
    for (const { entree, sortie } of fx.systemes) {
      const ctx = `${entree.q},${entree.r}`
      const cles = [...sortie.astres.map((a) => a.cle), ...sortie.formations.map((f) => f.cle)]
      assert.equal(new Set(cles).size, cles.length, ctx)
      const carte = sortie.astres.filter((a) => a.genre === 'planete' || a.genre === 'comete').length + sortie.formations.length
      assert.ok(carte >= 4 && carte <= 12, `${ctx}: ${carte} astres`)
      const planetes = new Set(sortie.astres.filter((a) => a.genre === 'planete').map((a) => a.cle))
      assert.ok(sortie.astres.some((a) => a.genre === 'etoile' && a.etoile_rang === 0), ctx)
      for (const a of sortie.astres) {
        assert.deepEqual(Object.keys(a).sort(), ['aspect', 'cle', 'etoile_rang', 'genre', 'heure', 'nom', 'orbite', 'parent_cle', 'taille', 'type'])
        assert.ok(a.cle.startsWith(`${ctx}.`), a.cle)
        assert.ok(['etoile', 'planete', 'lune', 'comete'].includes(a.genre), a.cle)
        assert.equal(a.nom, null)
        assert.ok(a.heure >= 0 && a.heure < 12, `${a.cle}: heure ${a.heure}`)
        assert.ok(a.taille > 0, `${a.cle}: taille`)
        if (a.genre === 'lune') {
          assert.ok(a.parent_cle && planetes.has(a.parent_cle), `${a.cle}: parent_cle`)
          assert.ok(a.cle.startsWith(`${a.parent_cle}-`), a.cle)
        } else {
          assert.equal(a.parent_cle, null, a.cle)
          assert.ok(typeof a.orbite === 'number' && a.orbite >= 0, `${a.cle}: orbite`)
        }
      }
      for (const f of sortie.formations) {
        assert.ok(['anneau', 'nuage'].includes(f.forme), f.cle)
        assert.equal(f.nom, null)
        const p = f.parametres
        if (f.forme === 'anneau') {
          assert.deepEqual(Object.keys(p).sort(), ['a', 'de', 'materiaux', 'rochers'])
          assert.ok((p.de as number) < (p.a as number), f.cle)
        } else {
          assert.deepEqual(Object.keys(p).sort(), ['brume', 'centres', 'heure', 'materiaux', 'orbite', 'rochers'])
          assert.equal((p.centres as unknown[]).length, 4, f.cle)
        }
      }
    }
  })

  it('ne garde aucun champ de sprite et porte les paramètres de comète dans aspect', () => {
    const texte = JSON.stringify(fx)
    for (const interdit of ['"vignette"', '"marge"', '"teinte"', '"id"', '"titre"', '"anonyme"']) assert.ok(!texte.includes(interdit), interdit)
    const comete = fx.systemes.flatMap((s) => s.sortie.astres).filter((a) => a.genre === 'comete')
    assert.ok(comete.length > 0)
    for (const c of comete)
      assert.deepEqual(Object.keys(c.aspect).sort(), ['couleur', 'courbure', 'force_gaz', 'force_poussiere', 'gaz', 'longueur', 'ouverture', 'perihelie', 'poussiere', 'sens', 'tete'])
  })

  it('couvre les cas du critère de sortie', () => {
    const astres = fx.systemes.flatMap((s) => s.sortie.astres)
    const formations = fx.systemes.flatMap((s) => s.sortie.formations)
    assert.ok(astres.some((a) => a.genre === 'etoile' && a.etoile_rang > 0 && a.aspect.serree === true), 'compagne serrée')
    assert.ok(astres.some((a) => a.genre === 'etoile' && a.etoile_rang > 0 && a.aspect.serree === false), 'compagnes éloignées')
    assert.ok(astres.some((a) => a.genre === 'comete'), 'comète')
    assert.ok(formations.some((f) => f.forme === 'nuage' && f.parametres.brume !== null), 'nébuleuse')
    assert.ok(formations.some((f) => f.forme === 'nuage' && f.parametres.brume === null || f.forme === 'nuage' && f.parametres.brume === '#8a7a66'), 'champ d’astéroïdes')
    assert.ok(formations.some((f) => f.forme === 'anneau'), 'ceinture')
    assert.ok(formations.some((f) => f.forme === 'anneau' && JSON.stringify(f.parametres.materiaux).includes('glace')), 'ceinture extérieure')
    const lunes = new Map<string, number>()
    for (const a of astres) if (a.parent_cle) lunes.set(a.parent_cle, (lunes.get(a.parent_cle) ?? 0) + 1)
    assert.ok([...lunes.values()].some((n) => n >= 3), 'planète à trois lunes')
    const types = new Set(astres.filter((a) => a.genre === 'etoile').map((a) => a.type))
    for (const t of ['naine_rouge', 'geante_rouge']) assert.ok(types.has(t), t)
    assert.ok(types.size >= 5)
  })

  it('porte des littéraux de tirage', () => {
    assert.ok(fx.litteraux.tirage.length >= 3)
    for (const l of fx.litteraux.tirage) {
      assert.ok(l.cle && l.aspect && l.suite.length >= 3)
      for (const v of l.suite) assert.ok(v >= 0 && v < 1)
    }
  })
})
