// Doors of `src/e2e/deplacer-arborescence-deplacement-echecs.test.ts` (lot « écrans »): the answers of the move itself
// (`PATCH {parent}`: trop_profond, 404) and a parent of any type (AD-99), in-process. The screen keeps the messages and the box.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const monde = await monter();
const { antor, dire, univers, creer } = monde;

async function fiche(base: string, type: string, titre: string, parent: number | null = null): Promise<number> {
  const f = await creer(antor, base, { type, titre, ...(type === 'personnage' ? { charge: { pj: false } } : {}) });
  if (parent !== null) assert.equal((await dire(antor, 'PATCH', `${base}/fiches/${f.id}`, { parent })).status, 200);
  return f.id;
}

test('échec : un parent déjà à 51 niveaux → 400 trop_profond, la fiche reste à la racine', async () => {
  const { base } = await univers('Déplacer profond');
  let parent: number | null = null;
  for (let i = 1; i <= 51; i++) parent = await fiche(base, 'lieu', `ZP${String(i).padStart(2, '0')}`, parent);
  const libre = await fiche(base, 'lieu', 'ZLibre');
  const r = await dire(antor, 'PATCH', `${base}/fiches/${libre}`, { parent });
  assert.equal(r.status, 400);
  assert.equal(r.corps.code, 'trop_profond');
  assert.deepEqual((await dire(antor, 'GET', `${base}/fiches/${libre}`)).corps.ancetres, [], 'ZLibre est restée à la racine');
});

test('échec : la fiche supprimée avant le déplacement → 404, la cible n’a pas reçu d’enfant', async () => {
  const { base } = await univers('Déplacer disparu');
  const f = await fiche(base, 'lieu', 'ZEphemere');
  const cible = await fiche(base, 'lieu', 'ZCible');
  assert.equal((await dire(antor, 'DELETE', `${base}/fiches/${f}`)).status, 204);
  const r = await dire(antor, 'PATCH', `${base}/fiches/${f}`, { parent: cible });
  assert.equal(r.status, 404);
  const enfants = (await dire(antor, 'GET', `${base}/fiches/${cible}/enfants`)).corps;
  assert.deepEqual(enfants.enfants ?? enfants.fiches ?? [], [], 'ZCible n’a pas reçu d’enfant');
});

test('nominal : un personnage reçoit la fiche en parent (tous types, AD-99)', async () => {
  const { base } = await univers('Déplacer tous types');
  const perso = await fiche(base, 'personnage', 'ZPerso');
  const f = await fiche(base, 'lieu', 'ZSousPerso');
  assert.equal((await dire(antor, 'PATCH', `${base}/fiches/${f}`, { parent: perso })).status, 200);
  const ancetres = (await dire(antor, 'GET', `${base}/fiches/${f}`)).corps.ancetres as Any[];
  assert.deepEqual(ancetres.map((a) => a.titre), ['ZPerso']);
});
