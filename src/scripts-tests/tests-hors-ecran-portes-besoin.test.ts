// Besoin « kanevas-tests-hors-ecran » : « chaque attendu d'effet est retrouvé dans un test hors écran VERT avant que son
// test d'écran soit retiré ou allégé ». Un test de porte sauté (skip / todo) ou isolé (only) ne prouve rien : il ne peut pas
// être la porte d'un effet dont l'écran a été allégé. Les portes vivent hors de `src/e2e/` (jamais un test d'écran).
// Attendus en dur : 95 fichiers de porte nommés par l'inventaire au 2026-11-16, jamais moins de 90.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
// @ts-expect-error plain .mjs module shared with the scripts (no declaration file)
import * as inventaire from '../../scripts/inventaire-ecrans.mjs';

type Ligne = { fichier: string; test: string; classe: string; porte: string; decision: string };
type Porte = { fichier: string | null; titre: string };
const { lignesInventaire, portesDe } = inventaire as {
  lignesInventaire: (m: string) => Ligne[];
  portesDe: (c: string) => Porte[];
};

const lignes: Ligne[] = readdirSync('docs/tests-ecran')
  .filter((f) => /^lot-.*\.md$/.test(f))
  .flatMap((f) => lignesInventaire(readFileSync(`docs/tests-ecran/${f}`, 'utf8')));
const allege = (l: Ligne): boolean => /^(retiré|allégé|scindé)/.test(l.decision);
const fichiersDePorte = [...new Set(lignes.filter(allege).flatMap((l) => portesDe(l.porte)).map((p) => p.fichier).filter((f): f is string => !!f))].sort();
const SAUTE = /\b(?:test|it|describe|suite)\.(?:skip|todo|only)\b|[{,]\s*(?:skip|todo)\s*:\s*(?!false\b)/;

describe('tests d’écran hors écran (R25) : les portes des effets reportés', () => {
  test('chaque effet reporté (retiré, allégé, scindé) nomme au moins une porte, hors de src/e2e', () => {
    const fautes = lignes
      .filter((l) => allege(l) && l.classe !== 'affichage')
      .filter((l) => !l.decision.includes(' — ') && portesDe(l.porte).length === 0)
      .map((l) => `${l.fichier}: « ${l.test} » (${l.classe}, ${l.decision}) sans porte`);
    assert.deepEqual(fautes, []);
    assert.ok(fichiersDePorte.length >= 90, `fichiers de porte: ${fichiersDePorte.length}`);
    assert.deepEqual(fichiersDePorte.filter((f) => f.startsWith('src/e2e/') || !existsSync(f)), []);
  });

  test('aucun fichier de porte ne saute, ne met en attente ou n’isole un test (skip, todo, only)', () => {
    const fautes = fichiersDePorte.filter((f) => SAUTE.test(readFileSync(f, 'utf8')));
    assert.deepEqual(fautes, []);
  });
});
