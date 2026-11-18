// Node layer of the `reglages` exports of the core (AD-reglages-1, AD-reglages-6, AD-148): every typed call goes through
// chargerModule('coeur') and gives the values the Rust tests pin. Needs `npm run build:wasm` (rust/pkg).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fusionnerReglages,
  reglagesDefaut,
  tirerSysteme,
  typesAstre,
  typesCatalogue,
  validerAspectType,
  validerReglages,
  versionGenerateurCourante,
  versionsGenerateur,
} from './coeur.js';

test('versions and defaults: version 1 is known and current, any other throws', async () => {
  assert.deepEqual(await versionsGenerateur(), [1]);
  assert.equal(await versionGenerateurCourante(), 1);
  const d = JSON.parse(await reglagesDefaut(1));
  assert.deepEqual(Object.keys(d).sort(), ['frequences', 'par_classe']);
  assert.equal(Object.keys(d.par_classe).length, 8);
  await assert.rejects(reglagesDefaut(2));
  await assert.rejects(reglagesDefaut(0));
});

test('validerReglages answers a value: the canonical form, or the field and the bound', async () => {
  assert.deepEqual(JSON.parse(await validerReglages(1, '{}')), { ok: true, canonique: {} });
  assert.deepEqual(JSON.parse(await validerReglages(1, '{"frequences":{"comete":0.9}}')), { ok: true, canonique: { frequences: { comete: 0.9 } } });
  const r = JSON.parse(await validerReglages(1, '{"frequences":{"comete":2}}'));
  assert.equal(r.ok, false);
  assert.equal(r.champ, 'frequences.comete');
  assert.equal(r.borne, 'Entre 0 et 1.');
  assert.equal(JSON.parse(await validerReglages(1, '{"licorne":1}')).ok, false);
  assert.equal(JSON.parse(await validerReglages(1, '{"par_classe":{"jaune":{"planetes":[5,2]}}}')).ok, false);
  assert.equal(JSON.parse(await validerReglages(1, `{"frequences":{}${' '.repeat(9 * 1024)}}`)).ok, false);
  assert.equal(JSON.parse(await validerReglages(2, '{}')).ok, false);
});

test('fusionnerReglages: {} is the default, a partial object moves only its key, a refusal throws', async () => {
  const d = JSON.parse(await reglagesDefaut(1));
  assert.deepEqual(JSON.parse(await fusionnerReglages(1, '{}')), d);
  const f = JSON.parse(await fusionnerReglages(1, '{"par_classe":{"orange":{"lunes":[1,2]}}}'));
  d.par_classe.orange.lunes = [1, 2];
  assert.deepEqual(f, d);
  await assert.rejects(fusionnerReglages(1, '{"frequences":{"comete":2}}'));
  await assert.rejects(fusionnerReglages(2, '{}'));
});

test('tirerSysteme takes the settings: a comet frequency of 1 gives a comet, 0 none; an unknown version throws', async () => {
  const avec = async (f: number) => JSON.parse(await tirerSysteme(0, 0, 0.8, 'K', 1, `{"frequences":{"comete":${f}}}`)).astres.some((a: { genre: string }) => a.genre === 'comete');
  assert.equal(await avec(1), true);
  assert.equal(await avec(0), false);
  assert.equal(await tirerSysteme(0, 0, 0.8, 'K', 1), await tirerSysteme(0, 0, 0.8, 'K', 1, await reglagesDefaut(1)));
  await assert.rejects(tirerSysteme(0, 0, 0.8, 'K', 2, '{}'));
  await assert.rejects(tirerSysteme(0, 0, 0.8, 'K', 1, '{"licorne":1}'));
});

test('validerAspectType and typesCatalogue: every default accepted, refusals as values', async () => {
  const cat = JSON.parse(await typesCatalogue());
  for (const genre of ['etoile', 'planete', 'lune', 'comete']) for (const t of await typesAstre(genre)) assert.ok(cat[t], t);
  for (const [t, a] of Object.entries(cat)) assert.equal(JSON.parse(await validerAspectType(t, JSON.stringify(a))).ok, true, t);
  assert.equal(JSON.parse(await validerAspectType('tellurique', '{"licorne":1}')).ok, false);
  assert.equal(JSON.parse(await validerAspectType('gazeuse', '{"palette":["#12"]}')).ok, false);
  assert.equal(JSON.parse(await validerAspectType('tellurique', `{"mer":0.5${' '.repeat(4097)}}`)).ok, false);
  assert.equal(JSON.parse(await validerAspectType('licorne', '{}')).ok, false);
});
