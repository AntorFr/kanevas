// E-29 (kanevas-battlemap-table-e29): the pure rules the play screen leans on, with literal expectations.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Grille, cellulesPinceau, celluleLibre, commandePiece, commandeRect, pionSous, rectDeVue, rectEntre, rectPartage, rectsDeCellules, type PionVu } from './logique';

const pion = (id: string, x: number, y: number, l = 1, h = 1): PionVu => ({ id, nom: id, asset_id: null, fiche_id: null, x, y, visible: true, l, h });

describe('E-29 logique pure', () => {
  it('la grille lit le bitmap ligne par ligne, bit de poids faible d’abord, et rien hors de la carte', () => {
    // 3 × 2 cells: bits 0 and 4 set (x=0,y=0 and x=1,y=1) -> byte 0b00010001 = 0x11 -> « EQ== »
    const g = new Grille(3, 2, 'EQ==');
    assert.equal(g.revele(0, 0), true);
    assert.equal(g.revele(1, 0), false);
    assert.equal(g.revele(1, 1), true);
    assert.equal(g.revele(2, 1), false);
    assert.equal(g.revele(-1, 0), false);
    assert.equal(g.revele(3, 0), false);
    assert.equal(g.revele(0, 2), false);
  });

  it('le pinceau de 1 et de 3 cases est borné à la carte', () => {
    assert.deepEqual(cellulesPinceau(5, 5, 1, 10, 10), [[5, 5]]);
    assert.equal(cellulesPinceau(5, 5, 3, 10, 10).length, 9);
    assert.deepEqual(cellulesPinceau(0, 0, 3, 10, 10), [[0, 0], [1, 0], [0, 1], [1, 1]]);
    assert.deepEqual(cellulesPinceau(9, 9, 3, 10, 10), [[8, 8], [9, 8], [8, 9], [9, 9]]);
    assert.deepEqual(cellulesPinceau(-3, 4, 1, 10, 10), []);
  });

  it('un trait devient un rectangle par suite horizontale', () => {
    assert.deepEqual(rectsDeCellules([[1, 0], [2, 0], [3, 0], [5, 0], [1, 1]]), [
      { x: 1, y: 0, l: 3, h: 1 }, { x: 5, y: 0, l: 1, h: 1 }, { x: 1, y: 1, l: 1, h: 1 },
    ]);
    assert.deepEqual(rectsDeCellules([]), []);
  });

  it('le rectangle entre deux cases les inclut toutes deux, dans les deux sens', () => {
    assert.deepEqual(rectEntre({ x: 4, y: 7 }, { x: 2, y: 3 }), { x: 2, y: 3, l: 3, h: 5 });
    assert.deepEqual(rectEntre({ x: 4, y: 4 }, { x: 4, y: 4 }), { x: 4, y: 4, l: 1, h: 1 });
  });

  it('les commandes de brouillard : révéler ou masquer, rectangle ou pièce', () => {
    assert.deepEqual(commandeRect(true, { x: 1, y: 2, l: 3, h: 4 }), { type: 'reveler_rect', x: 1, y: 2, l: 3, h: 4 });
    assert.deepEqual(commandeRect(false, { x: 1, y: 2, l: 3, h: 4 }), { type: 'masquer_rect', x: 1, y: 2, l: 3, h: 4 });
    assert.deepEqual(commandePiece(true, 5, 6), { type: 'reveler_piece', x: 5, y: 6 });
    assert.deepEqual(commandePiece(false, 5, 6), { type: 'masquer_piece', x: 5, y: 6 });
  });

  it('le pion sous une case : le dernier posé l’emporte, l’emprise compte', () => {
    const l = [pion('a', 2, 2), pion('b', 2, 2), pion('g', 5, 5, 2, 2)];
    assert.equal(pionSous(l, 2, 2)?.id, 'b');
    assert.equal(pionSous(l, 6, 6)?.id, 'g');
    assert.equal(pionSous(l, 7, 7), undefined);
    assert.equal(pionSous([], 0, 0), undefined);
  });

  it('un nouveau pion se pose sur la case libre la plus proche du centre, dans la carte', () => {
    assert.deepEqual(celluleLibre([], 1, 1, 5.4, 5.9, 10, 10), { x: 5, y: 5 });
    const l = celluleLibre([pion('a', 5, 5)], 1, 1, 5, 5, 10, 10)!;
    assert.notDeepEqual(l, { x: 5, y: 5 });
    assert.ok(Math.abs(l.x - 5) <= 1 && Math.abs(l.y - 5) <= 1);
    // a 2 × 2 footprint must fit inside the map
    assert.deepEqual(celluleLibre([], 2, 2, 9, 9, 10, 10), { x: 8, y: 8 });
  });

  it('carte pleine : aucune case libre', () => {
    const tout = [pion('a', 0, 0), pion('b', 1, 0), pion('c', 0, 1), pion('d', 1, 1)];
    assert.equal(celluleLibre(tout, 1, 1, 0, 0, 2, 2), null);
  });

  it('le rectangle partagé est arrondi vers l’extérieur aux cases et borné à la carte', () => {
    assert.deepEqual(rectPartage({ x: 1.2, y: 2.7, l: 3.1, h: 2.0 }, 30, 20), { x: 1, y: 2, l: 4, h: 3 });
    assert.deepEqual(rectPartage({ x: -5, y: -5, l: 100, h: 100 }, 30, 20), { x: 0, y: 0, l: 30, h: 20 });
    assert.equal(rectPartage({ x: 40, y: 0, l: 5, h: 5 }, 30, 20), null);
    assert.equal(rectPartage({ x: -9, y: 0, l: 5, h: 5 }, 30, 20), null);
  });

  it('le rectangle de vue suit le zoom et le décalage', () => {
    assert.deepEqual(rectDeVue({ zoom: 1, ox: -100, oy: -300 }, 100, 1000, 500), { x: 1, y: 3, l: 10, h: 5 });
    assert.deepEqual(rectDeVue({ zoom: 2, ox: -400, oy: -200 }, 100, 1000, 500), { x: 2, y: 1, l: 5, h: 2.5 });
  });
});
