import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contourValide } from './zone.js'
import { cleDe } from './cle.js'
import { redigerDocumentMJ, type VueDocument } from './document.js'
import { rendreMarkdown, contenuPublic } from '../../../services/markdown.js'
import { MAX_CONTENU_SECTION } from '../../../services/sections.js'

const code = (c: unknown) => {
  const r = contourValide(c)
  return r.ok ? 'ok' : r.code
}

test('contourValide : contours acceptés', () => {
  assert.equal(code([[0, 0], [4, 0], [2, 3]]), 'ok')
  assert.equal(code([[-12, 2], [-4, 2], [-4, 8], [-12, 8]]), 'ok')
  assert.equal(code([[-100000, -100000], [100000, -100000], [100000, 100000]]), 'ok')
  // concave
  assert.equal(code([[0, 0], [10, 0], [10, 10], [5, 2], [0, 10]]), 'ok')
})

test('contourValide : refus', () => {
  assert.equal(code([[0, 0], [4, 0]]), 'contour_trop_court')
  assert.equal(code([]), 'contour_trop_court')
  assert.equal(code([[0, 0], [4, 4], [4, 0], [0, 4]]), 'contour_croise')
  // un sommet touche une autre arête
  assert.equal(code([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]]), 'contour_croise')
  assert.equal(code([[0, 0], [4, 0], [4, 0], [4, 4]]), 'contour_invalide')
  assert.equal(code([[0, 0], [4, 0], [4, 4], [0, 0]]), 'contour_invalide') // dernier = premier
  assert.notEqual(code([[0, 0], [1, 0], [2, 0]]), 'ok')
  assert.equal(code([[0, 0], [100001, 0], [0, 5]]), 'contour_invalide')
  assert.equal(code([[0, -100001], [3, 0], [0, 5]]), 'contour_invalide')
  assert.equal(code([[0, 0], [1.5, 0], [0, 5]]), 'contour_invalide')
  assert.equal(code([[0, 0], [NaN, 0], [0, 5]]), 'contour_invalide')
  assert.equal(code([[0, 0], [1, 0, 2], [0, 5]]), 'contour_invalide')
  assert.equal(code([[0, 0], ['1', 0], [0, 5]]), 'contour_invalide')
  assert.equal(code('x'), 'contour_invalide')
  assert.equal(code(null), 'contour_invalide')
})

test('contourValide : 64 sommets acceptés, 65 refusés', () => {
  const poly = (n: number) =>
    Array.from({ length: n }, (_, i) => [Math.round(1000 * Math.cos((2 * Math.PI * i) / n)), Math.round(1000 * Math.sin((2 * Math.PI * i) / n))])
  assert.equal(code(poly(64)), 'ok')
  assert.equal(code(poly(65)), 'contour_invalide')
})

test('contourValide : arêtes qui se replient ou se recouvrent', () => {
  assert.equal(code([[0, 0], [4, 0], [2, 0], [2, 3]]), 'contour_croise') // retour sur soi
  assert.equal(code([[0, 0], [4, 0], [4, 4], [2, 0], [0, 4]]), 'contour_croise')
})

test('cleDe', () => {
  assert.equal(cleDe('Port Noir', []), 'port-noir')
  assert.equal(cleDe("Éclat d'Arès", []), 'eclat-d-ares')
  assert.equal(cleDe('Port Noir', ['port-noir']), 'port-noir-2')
  assert.equal(cleDe('Port Noir', ['port-noir', 'port-noir-2']), 'port-noir-3')
  assert.equal(cleDe('Port Noir', ['autre']), 'port-noir')
  assert.equal(cleDe('  --Port   Noir!! ', []), 'port-noir')
  const longue = cleDe('a'.repeat(200), [])
  assert.match(longue, /^[a-z0-9][a-z0-9-]{0,63}$/)
  assert.match(cleDe('a'.repeat(200), [longue]), /^[a-z0-9][a-z0-9-]{0,63}$/)
  assert.match(cleDe('日本', []), /^[a-z0-9][a-z0-9-]{0,63}$/)
})

const galaxie: VueDocument = {
  titre: 'Marches de Vael',
  systemes: [
    { nom: 'Vael', q: 7, r: 0, taille: 'grande', notes: '', secret: false },
    { nom: 'Port-Sel', q: 0, r: 0, taille: 'moyenne', notes: 'Relais\ncommercial', secret: false },
    { nom: 'Ombre', q: -3, r: 4, taille: 'petite', notes: '', secret: true },
    { nom: 'Argent', q: 2, r: 2, taille: 'petite', notes: 'Mines', secret: false },
  ],
  routes: [
    { depuis: 'Port-Sel', vers: 'Vael', longueur: 7, publique: true },
    { depuis: 'Argent', vers: 'Port-Sel', longueur: 3, publique: true },
    { depuis: 'Ombre', vers: 'Vael', longueur: 1, publique: false },
  ],
  zones: [{ nom: 'Brume', densite: 0.4, secret: true }],
}

test('redigerDocumentMJ : galaxie d’essai, texte littéral', () => {
  const attendu = [
    ':::mj',
    '# Marches de Vael',
    '## Systèmes',
    '- **Argent** (2, 2) · petite — Mines',
    '- **Ombre** (-3, 4) · petite (secret)',
    '- **Port-Sel** (0, 0) · moyenne — Relais commercial',
    '- **Vael** (7, 0) · grande',
    '## Routes',
    '- Argent — Port-Sel · 3 cases',
    '- Ombre — Vael · 1 case (privée)',
    '- Port-Sel — Vael · 7 cases',
    '## Zones',
    '- Brume · densité 40 % (secrète)',
    ':::',
  ].join('\n')
  assert.equal(redigerDocumentMJ(galaxie), attendu)
})

test('redigerDocumentMJ : contenu public vide, même avec des noms hostiles', () => {
  const hostile: VueDocument = {
    titre: ':::\nPublic',
    systemes: [{ nom: 'x\n:::\nfuite', q: 0, r: 0, taille: 'petite', notes: '\n:::\nsecret-fuite', secret: false }],
    routes: [],
    zones: [],
  }
  for (const v of [galaxie, hostile]) {
    const t = redigerDocumentMJ(v)
    assert.equal(t.split('\n').filter((l) => l.startsWith(':::')).length, 2)
    assert.equal(contenuPublic(t).trim(), '')
    assert.ok(!rendreMarkdown(contenuPublic(t), { nature: 'section' }).includes('fuite'))
    assert.ok(rendreMarkdown(t, { nature: 'section' }).length >= 0)
  }
})

test('redigerDocumentMJ : listes vides', () => {
  const t = redigerDocumentMJ({ titre: 'G', systemes: [], routes: [], zones: [] })
  assert.ok(t.startsWith(':::mj\n') && t.endsWith('\n:::'))
  assert.equal(contenuPublic(t).trim(), '')
})

test('redigerDocumentMJ : 5 000 systèmes, coupé sous le plafond', () => {
  const systemes = Array.from({ length: 5000 }, (_, i) => ({
    nom: `Système ${String(i).padStart(4, '0')}`, q: i, r: -i, taille: 'moyenne', notes: 'Notes de remplissage pour grossir le texte', secret: i % 7 === 0,
  }))
  const t = redigerDocumentMJ({ titre: 'Grande', systemes, routes: [], zones: [] })
  assert.ok(t.length <= MAX_CONTENU_SECTION, String(t.length))
  const lignes = t.split('\n')
  const syst = lignes.slice(lignes.indexOf('## Systèmes') + 1, lignes.indexOf('## Routes'))
  const queue = syst[syst.length - 1]!
  const m = /^- … (\d+) systèmes de plus non listés\.$/.exec(queue)
  assert.ok(m, queue)
  assert.equal(syst.length - 1 + Number(m![1]), 5000)
  assert.equal(syst[0], '- **Système 0000** (0, 0) · moyenne (secret) — Notes de remplissage pour grossir le texte')
  assert.equal(lignes[0], ':::mj')
  assert.equal(lignes[lignes.length - 1], ':::')
  assert.equal(contenuPublic(t).trim(), '')
})

test('redigerDocumentMJ : routes et zones nombreuses aussi sous le plafond', () => {
  const big = 'n'.repeat(80)
  const v: VueDocument = {
    titre: 'T',
    systemes: Array.from({ length: 3000 }, (_, i) => ({ nom: `S${i}${big}`, q: i, r: 0, taille: 'petite', notes: big, secret: false })),
    routes: Array.from({ length: 4000 }, (_, i) => ({ depuis: `A${i}${big}`, vers: `B${i}${big}`, longueur: 2, publique: false })),
    zones: Array.from({ length: 500 }, (_, i) => ({ nom: `Z${i}${big}`, densite: null, secret: true })),
  }
  const t = redigerDocumentMJ(v)
  assert.ok(t.length <= MAX_CONTENU_SECTION, String(t.length))
  assert.match(t, /routes de plus non listées\./)
  assert.match(t, /zones de plus non listées\./)
})

test('regles/ n’importe ni base ni services (sauf le test)', () => {
  for (const f of ['zone', 'cle', 'document']) {
    const src = readFileSync(new URL(`./${f}.ts`, import.meta.url), 'utf8')
    assert.ok(!/better-sqlite3|services\//.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), f)
  }
})
