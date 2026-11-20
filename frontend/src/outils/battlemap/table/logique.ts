// The pure parts of E-29 (AD-battlemap-table-2, -3): the fog bitmap as the core writes it, the commands the tools build, where a new
// token lands. Nothing here decides a rule: the server (the core) refuses what is not allowed.
import type { Commande } from '../cartes/types';

export interface Rect { x: number; y: number; l: number; h: number }
export interface Pion { id: string; nom: string; asset_id: string | null; fiche_id: string | null; x: number; y: number; visible: boolean }
/** A token as drawn: with its footprint in cells (the player view carries it, the GM's state does not). */
export interface PionVu extends Pion { l: number; h: number }

/** The revealed bitmap: one bit per cell, row-major from the top-left, least significant bit first, base64. */
export class Grille {
  private octets: Uint8Array;
  constructor(readonly largeur: number, readonly hauteur: number, base64: string) {
    const bin = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
    this.octets = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  revele(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.largeur || y >= this.hauteur) return false;
    const i = y * this.largeur + x;
    return ((this.octets[i >> 3] ?? 0) >> (i & 7) & 1) === 1;
  }
}

/** The cells a brush of `n` × `n` covers when the pointer is on `(x, y)`. */
export function cellulesPinceau(x: number, y: number, n: number, largeur: number, hauteur: number): [number, number][] {
  const depart = n === 1 ? 0 : n === 2 ? 0 : 1;
  const sortie: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = x - depart + i;
    const cy = y - depart + j;
    if (cx >= 0 && cy >= 0 && cx < largeur && cy < hauteur) sortie.push([cx, cy]);
  }
  return sortie;
}

/** Cells to rectangles: one rectangle per horizontal run, so a long stroke stays a short batch. */
export function rectsDeCellules(cellules: Iterable<[number, number]>): Rect[] {
  const lignes = new Map<number, Set<number>>();
  for (const [x, y] of cellules) {
    const l = lignes.get(y) ?? new Set<number>();
    l.add(x);
    lignes.set(y, l);
  }
  const rects: Rect[] = [];
  for (const [y, ensemble] of [...lignes].sort((a, b) => a[0] - b[0])) {
    const xs = [...ensemble].sort((a, b) => a - b);
    let debut = xs[0]!;
    let prec = debut;
    for (const x of xs.slice(1)) {
      if (x === prec + 1) { prec = x; continue; }
      rects.push({ x: debut, y, l: prec - debut + 1, h: 1 });
      debut = prec = x;
    }
    rects.push({ x: debut, y, l: prec - debut + 1, h: 1 });
  }
  return rects;
}

/** The rectangle between two cells, both included. */
export function rectEntre(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, l: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

export type GestePinceau = 'pinceau' | 'rectangle' | 'piece';

export const commandeRect = (reveler: boolean, r: Rect): Commande => ({ type: reveler ? 'reveler_rect' : 'masquer_rect', ...r });
export const commandePiece = (reveler: boolean, x: number, y: number): Commande => ({ type: reveler ? 'reveler_piece' : 'masquer_piece', x, y });

/** A token id: short (the core caps it at 20 characters). */
export const nouvelIdPion = (): string => `p${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;

/** The pion under a cell, the last drawn first (stacked tokens are drawn in creation order). */
export function pionSous(pions: readonly PionVu[], x: number, y: number): PionVu | undefined {
  for (let i = pions.length - 1; i >= 0; i--) {
    const p = pions[i]!;
    if (x >= p.x && x < p.x + p.l && y >= p.y && y < p.y + p.h) return p;
  }
  return undefined;
}

/** The free cell nearest `(cx, cy)` where a footprint of `l × h` fits inside the map (rings of growing size), or `null`. */
export function celluleLibre(pions: readonly PionVu[], l: number, h: number, cx: number, cy: number, largeur: number, hauteur: number): { x: number; y: number } | null {
  const occupee = (x: number, y: number) => pions.some((p) => x < p.x + p.l && x + l > p.x && y < p.y + p.h && y + h > p.y);
  const dedans = (x: number, y: number) => x >= 0 && y >= 0 && x + l <= largeur && y + h <= hauteur;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  for (let r = 0; r <= Math.max(largeur, hauteur); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx;
      const y = y0 + dy;
      if (dedans(x, y) && !occupee(x, y)) return { x, y };
    }
  }
  return null;
}

/** The view rectangle (in cells) a canvas of `w × h` pixels shows at this zoom and offset. */
export function rectDeVue(vue: { zoom: number; ox: number; oy: number }, tailleCase: number, w: number, h: number): Rect {
  const e = vue.zoom * tailleCase;
  return { x: -vue.ox / e, y: -vue.oy / e, l: w / e, h: h / e };
}

/** A view rectangle as the core accepts it: whole cells, inside the map (`null` when nothing of the map is in view). */
export function rectPartage(r: Rect, largeur: number, hauteur: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(largeur, Math.ceil(r.x + r.l));
  const y1 = Math.min(hauteur, Math.ceil(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : null;
}
