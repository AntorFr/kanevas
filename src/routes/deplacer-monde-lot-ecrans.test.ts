// Doors of `src/e2e/deplacer-arborescence-ensemble-besoin.test.ts` (lot « écrans »): what « Déplacer sous… » reads and writes
// (`horsDe`, `racines`, `PATCH {parent}`), on the starting world, in-process.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const monde = await monter({ semis: true });
const { antor, lea, dire } = monde;
const U = ((await dire(antor, 'GET', '/api/univers')).corps as Any[]).find((u) => u.nom === "Lame d'Ébène").id as number;
const ids: Record<string, number> = {};
for (const f of (await dire(antor, 'GET', `/api/univers/${U}/fiches?type=lieu`)).corps.fiches as Any[]) ids[f.titre] = f.id;
const fiche = (id: number) => `/api/univers/${U}/fiches/${id}`;
const ancetres = async (id: number) => ((await dire(antor, 'GET', fiche(id))).corps.ancetres as Any[]).map((a) => a.titre);

test('nominal : La Taverne du Kraken rangée sous Les Docks reçoit la nouvelle ascendance, « aucun parent » la met à la racine', async () => {
  assert.equal((await dire(antor, 'PATCH', fiche(ids['La Taverne du Kraken']), { parent: ids['Les Docks'] })).status, 200);
  assert.deepEqual(await ancetres(ids['La Taverne du Kraken']), ['Les Sphères', 'Port-Sel', 'Les Docks']);
  assert.equal((await dire(antor, 'PATCH', fiche(ids['La Taverne du Kraken']), { parent: null })).status, 200);
  assert.deepEqual(await ancetres(ids['La Taverne du Kraken']), []);
});

test('échec : Les Sphères sous Val-Fortin devenue son enfant → refus « cycle », rien ne change', async () => {
  assert.equal((await dire(antor, 'PATCH', fiche(ids['Val-Fortin']), { parent: ids['Les Sphères'] })).status, 200);
  const r = await dire(antor, 'PATCH', fiche(ids['Les Sphères']), { parent: ids['Val-Fortin'] });
  assert.equal(r.status, 400);
  assert.equal(r.corps.code, 'cycle');
  assert.deepEqual(await ancetres(ids['Les Sphères']), []);
});

test('API : la recherche avec horsDe écarte la fiche et ses descendants côté serveur', async () => {
  const r = (await dire(antor, 'GET', `/api/univers/${U}/fiches?q=Port&horsDe=${ids['Les Sphères']}`)).corps;
  assert.ok(!r.fiches.some((f: Any) => f.titre === 'Port-Sel'), 'descendant rendu');
  const r2 = (await dire(antor, 'GET', `/api/univers/${U}/fiches?q=Port`)).corps;
  assert.ok(r2.fiches.some((f: Any) => f.titre === 'Port-Sel'), 'sans horsDe Port-Sel doit être trouvée');
  const r3 = (await dire(antor, 'GET', `/api/univers/${U}/fiches?q=Docks&horsDe=${ids['Les Sphères']}`)).corps;
  assert.equal(r3.fiches.length, 0);
});

test('exclusion : Léa et Antor en mode Joueur n’ont ni racines (403) ni horsDe (400)', async () => {
  const racines = await dire(lea, 'GET', `/api/univers/${U}/fiches/racines`);
  assert.equal(racines.status, 403);
  const t = JSON.stringify(racines.corps);
  assert.ok(!t.includes('Sphères') && !t.includes('Port-Sel'), t);
  const hors = await dire(lea, 'GET', `/api/univers/${U}/fiches?q=Port&horsDe=${ids['Les Sphères']}`);
  assert.equal(hors.status, 400);
  assert.ok(!JSON.stringify(hors.corps).includes('Port-Sel'));
  assert.equal((await dire(antor, 'GET', `/api/univers/${U}/fiches/racines?mode=joueur`)).status, 403);
  assert.equal((await dire(antor, 'GET', `/api/univers/${U}/fiches?q=Port&horsDe=${ids['Les Sphères']}&mode=joueur`)).status, 400);
});
