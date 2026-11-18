// Door of the lot « outils » for `src/e2e/sous-type-dialogue-complements.test.ts` (docs/tests-ecran/lot-outils.md): a player who reads a sheet
// does not change its sub-type, in-process on the seeded « Lame d'Ébène » (no browser). The rest is `src/routes/types-besoin-ensemble.test.ts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monter } from './monde-lot-mediatheque.js';

test('a player who reads « Maître Aldric » does not change his sub-type through the API: refused, the sub-type stays « Capitaine »', async () => {
  const m = await monter();
  const aldric = m.ficheId('Maître Aldric');
  assert.equal((await m.patch(m.antor, `/fiches/${aldric}`, { sousType: 'Capitaine' })).statusCode, 200);
  assert.equal((await m.get(m.lea, `/fiches/${aldric}`)).statusCode, 200);
  const r = await m.patch(m.lea, `/fiches/${aldric}`, { sousType: 'Amiral' });
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, `PATCH Léa -> ${r.statusCode}`);
  assert.equal((await m.json(m.antor, `/fiches/${aldric}`)).sousType, 'Capitaine');
});

test('a sub-type emptied (null) is read back as null, and a changed one is read back in the sheet and in the type list', async () => {
  const m = await monter();
  const aldric = m.ficheId('Maître Aldric');
  assert.equal((await m.patch(m.antor, `/fiches/${aldric}`, { sousType: 'Capitaine' })).statusCode, 200);
  assert.equal((await m.patch(m.antor, `/fiches/${aldric}`, { sousType: 'Amiral' })).statusCode, 200);
  assert.equal((await m.json(m.antor, `/fiches/${aldric}`)).sousType, 'Amiral');
  const liste = (await m.json(m.antor, '/fiches?type=personnage')).fiches as { id: number; sousType: string | null }[];
  assert.equal(liste.find((f) => f.id === aldric)?.sousType, 'Amiral');
  assert.equal((await m.patch(m.antor, `/fiches/${aldric}`, { sousType: null })).statusCode, 200);
  assert.equal((await m.json(m.antor, `/fiches/${aldric}`)).sousType, null);
});
