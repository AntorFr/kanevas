// Doors of the lot « outils » for `src/e2e/systemes-ensemble.test.ts` and `src/e2e/systemes-ecrans.test.ts` (docs/tests-ecran/lot-outils.md):
// what detaching a universe leaves of the system, what a GM of an unattached universe or a player cannot reach, in-process (no browser).
// The rest of the rights (catalogue, attach, read 404s, writes) is `src/routes/systemes.test.ts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monter } from './monde-lot-ecrans.js';

test('P-8: a universe attached then detached leaves the system, its entries and its other universe as they were; the detached universe and the player read 404 at once', async () => {
  const m = await monter();
  const lame = await m.univers('Lame', ['lea']);
  const landes = await m.univers('Landes');
  const brume = await m.univers('Brume');
  const sys = (await m.dire(m.antor, 'POST', `${lame.base}/systeme-nouveau`, { nom: 'CoF Mini' })).corps;
  assert.equal((await m.dire(m.antor, 'POST', `/api/systemes/${sys.id}/gabarits`, { type: 'creature', nom: 'Garde du sceau', contenu: '' })).status, 201);
  assert.equal((await m.dire(m.antor, 'PUT', `${landes.base}/systeme`, { systemeId: sys.id })).status, 204);
  const lire = (h: Parameters<typeof m.dire>[0], q = '?type=creature') => m.dire(h, 'GET', `/api/systemes/${sys.id}${q}`);
  assert.equal((await lire(m.admin)).status, 404, 'a GM of an unattached universe reads nothing');
  assert.equal((await lire(m.admin)).corps.gabarits, undefined);
  assert.equal((await m.dire(m.antor, 'PUT', `${brume.base}/systeme`, { systemeId: sys.id })).status, 204);
  assert.equal((await lire(m.antor)).corps.nbUnivers, 3);

  assert.equal((await lire(m.lea)).status, 200, 'the player reads while attached');
  assert.equal((await m.dire(m.antor, 'PUT', `${lame.base}/systeme`, { systemeId: null })).status, 204);
  assert.equal((await lire(m.lea)).status, 404, 'the player’s next read says introuvable');
  assert.equal((await lire(m.antor)).status, 200, 'the other universes still read it (Brume)');
  assert.equal((await lire(m.antor)).corps.nbUnivers, 2);
  assert.deepEqual(((await lire(m.antor)).corps.gabarits as { nom: string }[]).map((g) => g.nom), ['Garde du sceau']);
  assert.ok(((await m.dire(m.antor, 'GET', '/api/systemes/catalogue')).corps as { nom: string }[]).some((s) => s.nom === 'CoF Mini'), 'the system stays in the catalogue');
  assert.equal((await m.dire(m.antor, 'PUT', `${lame.base}/systeme`, { systemeId: sys.id })).status, 204);
  assert.equal((await lire(m.antor)).corps.gabarits.length, 1, 'attached again: the content is back');
});

test('B-14: a player cannot write an entry of the system (4xx) and the same body is valid for a GM; the player then reads only the GM’s entry', async () => {
  const m = await monter();
  const lame = await m.univers('Lame', ['lea']);
  const sys = (await m.dire(m.antor, 'POST', `${lame.base}/systeme-nouveau`, { nom: 'CoF Mini' })).corps;
  const corps = { type: 'creature', nom: 'Intrus', contenu: '' };
  const refus = await m.dire(m.lea, 'POST', `/api/systemes/${sys.id}/gabarits`, corps);
  assert.ok(refus.status >= 400 && refus.status < 500, `status ${refus.status}`);
  assert.equal((await m.dire(m.antor, 'POST', `/api/systemes/${sys.id}/gabarits`, { ...corps, nom: 'Intrus MJ' })).status, 201);
  const noms = ((await m.dire(m.lea, 'GET', `/api/systemes/${sys.id}?type=creature`)).corps.gabarits as { nom: string }[]).map((g) => g.nom);
  assert.deepEqual(noms, ['Intrus MJ']);
});
