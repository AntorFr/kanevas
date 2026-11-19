// Door of the lot « outils » for `src/e2e/outils-catalogue-ecrans-verif.test.ts` (docs/tests-ecran/lot-outils.md): what the player reads of a
// catalogue once the GM hides an element or withdraws a system one, and gets back when they are shown again (in-process, no browser).
// The refusals and the shapes are `src/routes/outils-catalogue.test.ts`; the two levels are `outils-catalogue-ensemble-lot-outils.test.ts`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const EXEMPLE = JSON.parse(readFileSync(new URL('../outils/essai/exemples/catalogue-essai.json', import.meta.url), 'utf8'));

test('E-20: an element hidden from the players leaves their reading at once and comes back when shown; a withdrawn system hull too; the GM reading carries the state', async () => {
  const m = await monter({ semis: true });
  const id = (t: string, nom: string) => (m.app.db.prepare(`SELECT id FROM ${t} WHERE nom = ?`).get(nom) as Any).id as number;
  const [E, S] = [id('univers', "Éneria d'essai"), id('systemes_jeu', "Système d'essai")];
  const U = `/api/univers/${E}/outils/essai/g/catalogue`;
  assert.equal((await m.dire(m.antor, 'PUT', `/api/systemes/${S}/outils/essai/g/activation`, { active: true })).status, 204);
  assert.equal((await m.dire(m.antor, 'POST', `/api/systemes/${S}/outils/essai/g/catalogue/application`, EXEMPLE)).status, 200);
  const ajout = { catalogue: 'essai/g', version: 'u1', armes: [{ cle: 'lance-essai', nom: "Lance d'essai", masse: 3, cout: 30, portee: 'courte' }] };
  const ap = await m.dire(m.antor, 'POST', `${U}/application`, ajout);
  assert.equal(ap.status, 200, JSON.stringify(ap.corps));
  const lu = async (h: Any, nature: string) => JSON.stringify((await m.dire(h, 'GET', `${U}?nature=${nature}`)).corps);

  assert.match(await lu(m.lea, 'armes'), /Lance d'essai/);
  const gest = async () => ((await m.dire(m.antor, 'GET', `${U}/gestion?nature=armes`)).corps.elements as Any[]).find((e) => e.cle === 'lance-essai');
  assert.equal((await m.dire(m.antor, 'PUT', `${U}/armes/lance-essai/masque`, { masque: true, version: (await gest()).version })).status, 200);
  assert.doesNotMatch(await lu(m.lea, 'armes'), /Lance d'essai|"lance-essai"/);
  assert.equal((await gest()).masque, true);
  assert.equal((await m.dire(m.antor, 'PUT', `${U}/armes/lance-essai/masque`, { masque: false, version: (await gest()).version })).status, 200);
  assert.match(await lu(m.lea, 'armes'), /Lance d'essai/);

  assert.match(await lu(m.lea, 'coques'), /Corvette/);
  assert.equal((await m.dire(m.antor, 'PUT', `${U}/coques/corvette/retrait`, { retire: true })).status, 200);
  assert.doesNotMatch(await lu(m.lea, 'coques'), /Corvette/);
  assert.equal((await m.dire(m.antor, 'PUT', `${U}/coques/corvette/retrait`, { retire: false })).status, 200);
  assert.match(await lu(m.lea, 'coques'), /Corvette/);
});

test('E-20: a system weapon withdrawn from one universe stays in the neighbour; hiding the replacing element of a system key hides the key for the player; a re-import keeps the mask', async () => {
  const m = await monter({ semis: true });
  const id = (t: string, nom: string) => (m.app.db.prepare(`SELECT id FROM ${t} WHERE nom = ?`).get(nom) as Any).id as number;
  const [E, V, S] = [id('univers', "Éneria d'essai"), id('univers', 'Univers voisin'), id('systemes_jeu', "Système d'essai")];
  const U = (u: number) => `/api/univers/${u}/outils/essai/g/catalogue`;
  assert.equal((await m.dire(m.antor, 'PUT', `/api/systemes/${S}/outils/essai/g/activation`, { active: true })).status, 204);
  assert.equal((await m.dire(m.antor, 'POST', `/api/systemes/${S}/outils/essai/g/catalogue/application`, EXEMPLE)).status, 200);
  const lu = async (h: Any, u: number) => JSON.stringify((await m.dire(h, 'GET', `${U(u)}?nature=armes`)).corps);
  const premiere = (EXEMPLE.armes as Any[]).find((a) => a.cle === 'laser');
  const canon = 'canon-leger';

  assert.equal((await m.dire(m.antor, 'PUT', `${U(E)}/armes/${canon}/retrait`, { retire: true })).status, 200);
  assert.ok(!(await lu(m.lea, E)).includes(canon), 'Léa no longer reads the withdrawn weapon');
  assert.ok((await lu(m.antor, V)).includes(canon), 'Univers voisin keeps it');
  assert.equal((await m.dire(m.antor, 'PUT', `${U(E)}/armes/${canon}/retrait`, { retire: false })).status, 200);
  assert.ok((await lu(m.lea, E)).includes(canon), 'restored, Léa reads it again');

  const remplacant = { catalogue: 'essai/g', version: 'u2', armes: [{ ...premiere, nom: 'Remplaçante maison' }] };
  assert.equal((await m.dire(m.antor, 'POST', `${U(E)}/application`, remplacant)).status, 200);
  const gest = async () => ((await m.dire(m.antor, 'GET', `${U(E)}/gestion?nature=armes`)).corps.elements as Any[]).find((e) => e.cle === premiere.cle);
  assert.equal((await m.dire(m.antor, 'PUT', `${U(E)}/armes/${premiere.cle}/masque`, { masque: true, version: (await gest()).version })).status, 200);
  assert.ok(!(await lu(m.lea, E)).includes(`"cle":"${premiere.cle}"`), 'neither the replacing element nor the system one: Léa does not read the key');
  assert.ok((await lu(m.antor, V)).includes(`"cle":"${premiere.cle}"`), 'the neighbour is untouched');
  assert.equal((await m.dire(m.antor, 'POST', `${U(E)}/application`, { ...remplacant, version: 'u3', armes: [{ ...premiere, nom: 'Remplaçante maison', cout: 77 }] })).status, 200);
  assert.equal((await gest()).masque, true, 'still hidden after the re-import (B-48)');
  assert.ok(!(await lu(m.lea, E)).includes(`"cle":"${premiere.cle}"`));
});
