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
  assert.equal((await m.dire(m.antor, 'PUT', `${landes.base}/systeme`, { systemeId: sys.id })).status, 204);
  const lire = (h: Parameters<typeof m.dire>[0], q = '?type=creature') => m.dire(h, 'GET', `/api/systemes/${sys.id}${q}`);
  assert.equal((await lire(m.admin)).status, 200, 'the instance admin with no link reads the header only (AD-157)');
  assert.equal((await lire(m.admin)).corps.fiches, undefined, 'and no element');
  assert.equal((await m.dire(m.antor, 'PUT', `${brume.base}/systeme`, { systemeId: sys.id })).status, 204);
  assert.equal((await lire(m.antor)).corps.nbUnivers, 3);

  assert.equal((await lire(m.lea)).status, 200, 'the player reads while attached');
  assert.equal((await m.dire(m.antor, 'PUT', `${lame.base}/systeme`, { systemeId: null })).status, 204);
  assert.equal((await lire(m.lea)).status, 404, 'the player’s next read says introuvable');
  assert.equal((await lire(m.antor)).status, 200, 'the other universes still read it (Brume)');
  assert.equal((await lire(m.antor)).corps.nbUnivers, 2);
  assert.ok(((await m.dire(m.antor, 'GET', '/api/systemes/catalogue')).corps as { nom: string }[]).some((s) => s.nom === 'CoF Mini'), 'the system stays in the catalogue');
  assert.equal((await m.dire(m.antor, 'PUT', `${lame.base}/systeme`, { systemeId: sys.id })).status, 204);
  assert.equal((await lire(m.antor)).corps.nbUnivers, 3, 'attached again');
});

test('B-14: a player cannot set the types of the system (4xx), nor a GM of an attached universe who is not a GM of the system (AD-152)', async () => {
  const m = await monter();
  const lame = await m.univers('Lame', ['lea']);
  const sys = (await m.dire(m.antor, 'POST', `${lame.base}/systeme-nouveau`, { nom: 'CoF Mini' })).corps;
  const corps = { active: false };
  const refus = await m.dire(m.lea, 'PUT', `/api/systemes/${sys.id}/types/objet`, corps);
  assert.ok(refus.status >= 400 && refus.status < 500, `status ${refus.status}`);
  assert.equal((await m.dire(m.antor, 'PUT', `/api/systemes/${sys.id}/types/objet`, corps)).status, 403);
  assert.equal((await m.dire(m.antor, 'POST', `/api/systemes/${sys.id}/gabarits`, { type: 'creature', nom: 'x' })).status, 404);
});
