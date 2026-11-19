import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { blocEnAttente } = (await vite.ssrLoadModule('./liees.tsx')) as typeof import('./liees');
test.after(() => vite.close());

describe('blocEnAttente (bloc « Fiches liées »)', () => {
  test('données lues, types en chargement : le bloc attend', () => {
    assert.equal(blocEnAttente({ donneesLues: true, typesEtat: 'chargement' }), true);
  });
  test('données non lues : le bloc attend, quel que soit l’état des types', () => {
    for (const typesEtat of ['chargement', 'ok', 'erreur'] as const) {
      assert.equal(blocEnAttente({ donneesLues: false, typesEtat }), true, typesEtat);
    }
  });
  test('données lues, types lus : le bloc s’affiche', () => {
    assert.equal(blocEnAttente({ donneesLues: true, typesEtat: 'ok' }), false);
  });
  test('données lues, types en erreur : repli sur le type brut, le bloc s’affiche', () => {
    assert.equal(blocEnAttente({ donneesLues: true, typesEtat: 'erreur' }), false);
  });
});
