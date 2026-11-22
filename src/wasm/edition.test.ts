// Node layer of the `edition` exports of the core (AD-edition-3, AD-edition-4): every typed call goes through
// chargerModule('coeur') and gives the values the Rust tests pin. Needs `npm run build:wasm` (rust/pkg).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { galactiqueVersOrbiteHeure, heureVersVoisin, orbiteHeureVersPlan, planVersOrbiteHeure, typesAstre, validerAspect, validerFormation } from './coeur.js';

test('typesAstre gives the list of each genre and throws for another', async () => {
  assert.deepEqual((await typesAstre('planete')).sort(), ['gazeuse', 'glace', 'lave', 'rocheux', 'tellurique', 'verrouillee']);
  assert.deepEqual((await typesAstre('lune')).sort(), ['glace', 'lave', 'rocheux']);
  assert.deepEqual(await typesAstre('comete'), ['comete']);
  assert.equal((await typesAstre('etoile')).length, 10);
  await assert.rejects(typesAstre('ceinture'));
});

test('galactiqueVersOrbiteHeure falls on the circle and on the hour of heureVersVoisin for the six neighbours', async () => {
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) {
    const [o, h] = await galactiqueVersOrbiteHeure(dq, dr, 3.37);
    assert.ok(Math.abs(o - 3.37) <= 0.0051, `orbit ${dq},${dr}: ${o}`);
    assert.equal(h, await heureVersVoisin(7, -3, 7 + dq, -3 + dr));
  }
  assert.deepEqual(await galactiqueVersOrbiteHeure(1, 0, 4), [4, 3]);
  assert.deepEqual(await galactiqueVersOrbiteHeure(0, 0, 4), [0, 0]);
  await assert.rejects(galactiqueVersOrbiteHeure(Number.NaN, 0, 4));
  await assert.rejects(galactiqueVersOrbiteHeure(1, 0, -1));
});

test('plan and orbit/hour go back and forth through the typed calls', async () => {
  for (const [o, h] of [[2, 3], [5.25, 7.5], [1000, 11.99], [0.01, 0.5]] as const) {
    const [x, y] = await orbiteHeureVersPlan(o, h);
    const [o2, h2] = await planVersOrbiteHeure(x, y);
    assert.ok(Math.abs(o2 - o) < 1e-9 && Math.abs(h2 - h) < 1e-9, `${o} ${h}`);
  }
});

test('validerAspect returns the aspect for a valid one and throws a message for a refused one', async () => {
  assert.deepEqual(JSON.parse(await validerAspect('tellurique', '{"mer":0.5}')), { mer: 0.5 });
  await assert.rejects(validerAspect('tellurique', '{"licorne":1}'), /licorne/);
  await assert.rejects(validerAspect('tellurique', '{"mer":2}'));
  await assert.rejects(validerAspect('licorne', '{}'));
  await assert.rejects(validerAspect('tellurique', `{"mer":0.5${' '.repeat(4097)}}`));
});

test('validerFormation returns the parameters for a valid zone and throws for a refused one', async () => {
  assert.deepEqual(JSON.parse(await validerFormation('anneau', '{"de":1,"a":2}')), { de: 1, a: 2 });
  await assert.rejects(validerFormation('anneau', '{"de":2,"a":1}'));
  await assert.rejects(validerFormation('anneau', '{"de":1,"a":2,"licorne":1}'), /licorne/);
  await assert.rejects(validerFormation('nuage', '{"centres":[[1001,4,1]]}'));
  await assert.rejects(validerFormation('disque', '{}'));
  await assert.rejects(validerFormation('anneau', `{"de":1,"a":2${' '.repeat(8200)}}`));
});
