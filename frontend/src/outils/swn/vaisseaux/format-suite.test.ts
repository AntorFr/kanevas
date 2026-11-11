// Review of kanevas-outils-format-vaisseaux-suite-atelier (E-22, Z-7): captions written from the fields the server sends, expected values by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legende, ligneAjuste } from './format.ts';
import type { Donnees } from './types.ts';

const mod = (d: Donnees) => ({ nature: 'modifications' as const, donnees: d });

test('armure par classe : la classe de la coque choisie, rien sans coque ni à 0', () => {
  const d: Donnees = { effet: 'armure_par_classe', armure_par_classe: [1, 2, 3, 4] };
  assert.equal(legende(mod(d), 2), 'armure +2');
  assert.equal(legende(mod(d), 3), 'armure +3');
  assert.equal(legende(mod(d), 4), 'armure +4');
  assert.equal(legende(mod(d)), '');
  assert.equal(legende(mod({ effet: 'armure_par_classe', armure_par_classe: [0, 0, 0, 0] }), 2), '');
});

test('soutes optimisées, montage et surcharge : la légende dit le paramètre du catalogue', () => {
  assert.equal(legende(mod({ effet: 'soutes_optimisees', effet_pct: 10 })), 'soutes −10 % de masse');
  assert.equal(legende(mod({ effet: 'montage_specialise', valeur: -1 })), 'emports −1');
  assert.equal(legende(mod({ effet: 'montage_specialise', valeur: 1 })), 'emports +1');
  assert.equal(legende(mod({ effet: 'surcharge_arme', effet_pct: 50 })), 'puissance de l’arme +50 %');
});

test('un catalogue sans ces champs ne donne aucune légende', () => {
  for (const effet of ['soutes_optimisees', 'montage_specialise', 'surcharge_arme', 'armure_par_classe']) {
    assert.equal(legende(mod({ effet }), 2), '', effet);
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
