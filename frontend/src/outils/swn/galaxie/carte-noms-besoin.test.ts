// Pure-function pass (verification) of kanevas-carte-rendu-galaxie-systemes: « au dézoom un système défini garde son nom quand un système
// tiré perd le sien » (exit criterion of the sheet, AD-rendu-9 of docs/parcours.md B-117), written from the criterion — not from the code.
// Expected values are literals: the box of a name is about 0.6 × 12 px per character wide and 12 px high, so two names of a few letters
// 10 px apart overlap and two names 400 px apart do not.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nomsVisibles, type CandidatNom } from './carte-noms.ts';

const defini = (cle: string, x: number, y: number, texte: string, taille = 0): CandidatNom => ({ cle, x, y, texte, priorite: 0, taille });
const tiree = (cle: string, x: number, y: number, taille = 1): CandidatNom => ({ cle, x, y, texte: 'Étoile 12, -4', priorite: 1, taille });

describe('nomsVisibles : le nom d’un système défini passe avant celui d’une étoile tirée', () => {
  it('zoom avant, les deux noms sont loin : les deux restent ; au dézoom, positions rapprochées, le système défini garde son nom et l’étoile tirée perd le sien', () => {
    const avant = nomsVisibles([defini('systeme:havre', 100, 100, 'Havre'), tiree('etoile:12,-4', 500, 100)], { s: 1 });
    assert.deepEqual([...avant].sort(), ['etoile:12,-4', 'systeme:havre']);
    const apres = nomsVisibles([defini('systeme:havre', 10, 10, 'Havre'), tiree('etoile:12,-4', 40, 10)], { s: 0.1 });
    assert.deepEqual([...apres], ['systeme:havre']);
  });

  it('la plus grande étoile tirée, la plus petite taille de système défini, au même point : le système défini gagne', () => {
    const k = nomsVisibles([tiree('etoile:grande', 50, 50, 1), defini('systeme:petit', 50, 50, 'Havre', 0)], { s: 0.1 });
    assert.deepEqual([...k], ['systeme:petit']);
  });

  it('trente étoiles tirées amassées sur un système défini : seul le système défini garde son nom', () => {
    const cands: CandidatNom[] = [];
    for (let i = 0; i < 30; i++) cands.push(tiree(`etoile:${i}`, 200 + (i % 5), 200 + Math.floor(i / 5), (i % 10) / 10));
    cands.push(defini('systeme:centre', 202, 202, 'Havre'));
    const k = nomsVisibles(cands, { s: 0.1 });
    assert.ok(k.has('systeme:centre'));
    assert.equal([...k].filter((c) => c.startsWith('etoile:')).length, 0);
  });

  it('deux systèmes définis éloignés gardent chacun leur nom, une étoile tirée libre aussi', () => {
    const k = nomsVisibles([defini('systeme:a', 0, 0, 'Alpha'), defini('systeme:b', 600, 0, 'Bravo'), tiree('etoile:libre', 300, 300)], { s: 1 });
    assert.deepEqual([...k].sort(), ['etoile:libre', 'systeme:a', 'systeme:b']);
  });

  it('une galaxie sans aucun candidat ne garde aucun nom', () => {
    assert.equal(nomsVisibles([], { s: 0.1 }).size, 0);
  });
});
