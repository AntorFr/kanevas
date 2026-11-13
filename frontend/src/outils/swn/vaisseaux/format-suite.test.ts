// Review of kanevas-outils-format-vaisseaux-suite-atelier (E-22, Z-7): captions written from the fields the server sends, expected values by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legende, ligneAjuste } from './format.ts';
import type { Donnees } from './types.ts';

const mod = (d: Donnees) => ({ nature: 'modifications' as const, donnees: d });

test('les quatre effets du livre : aucune légende tant que l’atelier ne les dit pas (W-6, tâche suivante)', () => {
  for (const effet of ['soutes_optimisees_livre', 'blindage_renforce', 'montages_specialises', 'surcharge_cumulable']) {
    assert.equal(legende(mod({ effet, valeur: 2, effet_pct: 50 }), 2), '', effet);
  }
});

test('base de la réduction : « de la coque » seulement pour la coque', () => {
  const am = (b?: string) => ({ nature: 'amenagements' as const, donnees: { effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5], reduction_cout_pct: 10, ...(b ? { reduction_base: b } : {}) } as Donnees });
  assert.equal(legende(am('coque'), 2), 'moteur système · rend puissance 3 et masse 1,5 · coût −10 % de la coque');
  assert.equal(legende(am('amenagement'), 2), 'moteur système · rend puissance 3 et masse 1,5 · coût −10 %');
  assert.equal(legende(am(), 2), 'moteur système · rend puissance 3 et masse 1,5 · coût −10 %');
});

test('échange arrondi : la légende le dit, sans arrondi elle ne le dit pas', () => {
  const e: Donnees = { effet: 'echange', sens: 'puissance_vers_masse', points_max: 5 };
  assert.match(legende(mod({ ...e, echange_arrondi: 'installation' })), /arrondi par installation/);
  assert.doesNotMatch(legende(mod(e)), /arrondi/);
});

test('ligne ajustée : seulement les deltas non nuls du serveur', () => {
  assert.equal(ligneAjuste(undefined), '');
  assert.equal(ligneAjuste({}), '');
  assert.equal(ligneAjuste({ masse: 0 }), '');
  assert.equal(ligneAjuste({ masse: -1 }), 'masse −1');
  assert.equal(ligneAjuste({ masse: -0.5 }), 'masse −0,5');
  assert.equal(ligneAjuste({ emports: -1 }), 'emports −1');
  assert.equal(ligneAjuste({ puissance: 5 }), 'puissance +5');
});
