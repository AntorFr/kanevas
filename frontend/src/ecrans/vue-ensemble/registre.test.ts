import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { createServer } from 'vite';

// The registry uses import.meta.glob, which only Vite resolves: load it through Vite's SSR loader.
const vite = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { blocsVisibles } = (await vite.ssrLoadModule('./registre.ts')) as typeof import('./registre');
const composant = () => null;

test.after(() => vite.close());

test('blocsVisibles : ne rend que les blocs du rôle, par rang puis identifiant', () => {
  const registre = [
    { id: 'b', roles: ['mj', 'joueur'], rang: 2, composant },
    { id: 'prepa', roles: ['mj'], rang: 1, composant },
    { id: 'a', roles: ['mj', 'joueur'], rang: 2, composant },
  ] as Parameters<typeof blocsVisibles>[1];
  assert.deepEqual(blocsVisibles('mj', registre).map((b) => b.id), ['prepa', 'a', 'b']);
  assert.deepEqual(blocsVisibles('joueur', registre).map((b) => b.id), ['a', 'b']);
});

test('blocsVisibles : registre vide → aucun bloc', () => {
  assert.deepEqual(blocsVisibles('mj', []), []);
});

test('un bloc déposé seul dans blocs/ est trouvé par le registre, sans autre fichier modifié', async () => {
  const fichier = join(import.meta.dirname, 'blocs', 'zz-bloc-de-test.tsx');
  writeFileSync(fichier, "export default { id: 'zz-test', roles: ['mj'], rang: 9, composant: () => null };\n");
  try {
    const frais = await createServer({ configFile: false, root: import.meta.dirname, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
    const m = (await frais.ssrLoadModule('./registre.ts')) as typeof import('./registre');
    assert.deepEqual(m.blocsVisibles('mj').map((b) => b.id), ['zz-test']);
    assert.deepEqual(m.blocsVisibles('joueur'), []);
    await frais.close();
  } finally {
    rmSync(fichier, { force: true });
  }
});
