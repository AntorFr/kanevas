import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

// AD-touches-9: the sheet, settings and system pages must not reach the tools' client registry
// (it opens every tool's editor, battlemap included).
const PAGES = ['fiche', 'parametres', 'systeme'];

test('aucune page fiche, parametres ni systeme n’atteint outils/registre.ts', async () => {
  const { grapheDesPages } = await import('../../scripts/niveaux-tests.mjs');
  const fichiers = execFileSync('git', ['ls-files', 'frontend/src', 'src'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const graphe: Map<string, Set<string>> = grapheDesPages(fichiers);
  for (const page of PAGES) {
    const atteints = graphe.get(page);
    assert.ok(atteints && atteints.size > 0, `page ${page} sans graphe`);
    const outils = [...atteints].filter((f) => f === 'frontend/src/outils/registre.ts');
    assert.deepEqual(outils, [], `${page} atteint registre.ts`);
  }
  assert.ok([...graphe.get('fiche')!].includes('frontend/src/outils/sections.ts'), 'la fiche affiche les composants de section');
});
