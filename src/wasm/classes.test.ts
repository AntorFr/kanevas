// Node layer of the star classes (B-117, AD-galaxie-systemes-1): the binding gives the core's values.
// Needs `npm run build:wasm` (rust/pkg).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classeDeCle, classesEtoile } from './coeur.js';

const ATTENDU = [
  { lettre: 'M', libelle: 'M — rouge', couleur: '#ff8f70' },
  { lettre: 'K', libelle: 'K — orange', couleur: '#ffb870' },
  { lettre: 'G', libelle: 'G — jaune', couleur: '#ffe08a' },
  { lettre: 'F', libelle: 'F — jaune pâle', couleur: '#fff4d6' },
  { lettre: 'A', libelle: 'A — blanche', couleur: '#dfe9ff' },
  { lettre: 'B', libelle: 'B — bleue', couleur: '#a9c4ff' },
  { lettre: 'V', libelle: 'V — jaune-vert', couleur: '#d6f08a' },
];

test('classesEtoile lists the seven classes with their letter, label and colour', async () => {
  assert.deepEqual(JSON.parse(await classesEtoile()), ATTENDU);
});

test('classeDeCle is stable, never V, and gives at least four classes over 200 keys at size 0.5', async () => {
  const vues = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const l = await classeDeCle(`cle-${i}`, 0.5);
    assert.equal(l, await classeDeCle(`cle-${i}`, 0.5));
    vues.add(l);
  }
  assert.ok(vues.size >= 4, [...vues].join());
  assert.ok(!vues.has('V'));
});

test('classeDeCle is hotter at size 1 than at size 0 (M before B), never cooler', async () => {
  const ordre = 'MKGFAB';
  let plusChaud = 0;
  for (let i = 0; i < 200; i++) {
    const a = ordre.indexOf(await classeDeCle(`cle-${i}`, 0));
    const b = ordre.indexOf(await classeDeCle(`cle-${i}`, 1));
    assert.ok(a >= 0 && b >= 0 && a <= b);
    if (a < b) plusChaud++;
  }
  assert.ok(plusChaud > 0);
});

test('classeDeCle refuses a size outside [0, 1] and accepts the bounds', async () => {
  for (const t of [-0.01, 1.01, 5, Number.NaN]) await assert.rejects(() => classeDeCle('a', t), String(t));
  await classeDeCle('a', 0);
  await classeDeCle('a', 1);
});
