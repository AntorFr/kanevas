// Door of the lot « outils » for `src/e2e/tenir-ensemble-besoin.test.ts` (docs/tests-ecran/lot-outils.md): a renamed sheet in the type list
// and in the search, in-process on the seeded « Lame d'Ébène ». The rename itself is `tenir-fiche-service.test.ts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-mediatheque.js';

test('B-39: after the rename, the « Lieux » list carries « Port-Sel-sur-Brume » and no « Port-Sel », and the search of the new title returns the sheet', async () => {
  const m = await monter();
  const port = m.ficheId('Port-Sel');
  assert.equal((await m.patch(m.antor, `/fiches/${port}`, { titre: 'Port-Sel-sur-Brume' })).statusCode, 200);
  const titres = ((await m.json(m.antor, '/fiches?type=lieu')).fiches as Any[]).map((f) => f.titre);
  assert.ok(titres.includes('Port-Sel-sur-Brume'), titres.join('|'));
  assert.ok(!titres.includes('Port-Sel'), titres.join('|'));
  assert.ok(((await m.json(m.antor, '/fiches?q=Brume')).fiches as Any[]).some((f) => f.id === port));
});
