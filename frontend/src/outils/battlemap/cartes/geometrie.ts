// Drawing geometry of the canvas: which cell, edge or element lies under a pointer, in cell units. These are picking helpers
// of the screen; whether a position is *valid* (inside the map, a real edge) is the core's answer to the command, never this file's.
import type { Calque, Cellule, Document, Element, Segment } from './types';

export interface Boite { x0: number; y0: number; x1: number; y1: number }
export interface Point { x: number; y: number }

/** Footprint of an asset in cells (a floor or a wall has none: 1 × 1). */
export type Empreintes = (assetId: string) => { largeur: number; hauteur: number };

export const cellule = (p: Point): Cellule => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/** The box an element covers (its position is its centre), rotation by quarter turns swapping width and height. */
export function boiteElement(e: Element, empreinte: Empreintes): Boite {
  const { largeur, hauteur } = empreinte(e.asset_id);
  const echelle = e.echelle ?? 1;
  const quart = (e.rotation ?? 0) % 180 !== 0;
  const w = (quart ? hauteur : largeur) * echelle;
  const h = (quart ? largeur : hauteur) * echelle;
  return { x0: e.x - w / 2, y0: e.y - h / 2, x1: e.x + w / 2, y1: e.y + h / 2 };
}

export const dansBoite = (b: Boite, p: Point) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
export const seCoupent = (a: Boite, b: Boite) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

export function boite(a: Point, b: Point): Boite {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** Elements of the given layers, the front-most (last) first. */
export function elementsSous(doc: Document, p: Point, calques: ReadonlySet<string>, empreinte: Empreintes): Element[] {
  return doc.elements.filter((e) => calques.has(e.calque) && dansBoite(boiteElement(e, empreinte), p)).reverse();
}

export function elementsDans(doc: Document, b: Boite, calques: ReadonlySet<string>, empreinte: Empreintes): Element[] {
  return doc.elements.filter((e) => calques.has(e.calque) && seCoupent(boiteElement(e, empreinte), b));
}

/** The cells of the rectangle between two cells, both included. */
export function rectangle(a: Cellule, b: Cellule): Cellule[] {
  const cellules: Cellule[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cellules.push({ x, y });
  }
  return cellules;
}

/** The cells a pointer crossed between two moves, with no gap (a fast drag skips cells). */
export function ligneCellules(a: Cellule, b: Cellule): Cellule[] {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const cellules: Cellule[] = [];
  for (let i = 0; i <= n; i++) {
    cellules.push({ x: Math.round(a.x + ((b.x - a.x) * i) / (n || 1)), y: Math.round(a.y + ((b.y - a.y) * i) / (n || 1)) });
  }
  return cellules;
}

/** The nearest grid vertex. */
export const sommet = (p: Point): Cellule => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The wall segments of the straight run between two vertices, on the dominant axis (always snapped). */
export function segmentsDroits(a: Cellule, b: Cellule): Segment[] {
  const segments: Segment[] = [];
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x++) segments.push({ x, y: a.y, cote: 'h' });
  } else {
    for (let y = Math.min(a.y, b.y); y < Math.max(a.y, b.y); y++) segments.push({ x: a.x, y, cote: 'v' });
  }
  return segments;
}

/** The four sides of the rectangle between two vertices. */
export function contour(a: Cellule, b: Cellule): Segment[] {
  const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return [...segmentsDroits({ x: x0, y: y0 }, { x: x1, y: y0 }), ...segmentsDroits({ x: x0, y: y1 }, { x: x1, y: y1 }),
    ...segmentsDroits({ x: x0, y: y0 }, { x: x0, y: y1 }), ...segmentsDroits({ x: x1, y: y0 }, { x: x1, y: y1 })];
}

/** The edge segment nearest a point, among the candidates, within `portee` cells. */
export function segmentProche(p: Point, candidats: readonly Segment[], portee = 0.35): Segment | undefined {
  let meilleur: Segment | undefined;
  let distance = portee;
  for (const s of candidats) {
    const [x0, y0, x1, y1] = s.cote === 'h' ? [s.x, s.y, s.x + 1, s.y] : [s.x, s.y, s.x, s.y + 1];
    const dx = Math.max(x0 - p.x, 0, p.x - x1);
    const dy = Math.max(y0 - p.y, 0, p.y - y1);
    const d = Math.hypot(dx, dy);
    if (d <= distance) {
      distance = d;
      meilleur = s;
    }
  }
  return meilleur;
}

/** Centre that puts the top-left corner of the footprint on the grid (the element sits on its cells). */
export function centreAimante(centre: Point, largeur: number, hauteur: number): Point {
  const sur = (c: number, taille: number) => Math.round(c - taille / 2) + taille / 2;
  return { x: sur(centre.x, largeur), y: sur(centre.y, hauteur) };
}

/** Layers of a type: the first visible and unlocked one is the active one of the tools of that type. */
export type CalqueActif = { calque: Calque } | { message: string };
export const MESSAGE_AUCUN_CALQUE = 'Créez d’abord un calque de ce type.';
export const MESSAGE_VERROUILLE = 'Ce calque est verrouillé.';

export function calqueActif(doc: Document, type: Calque['type']): CalqueActif {
  const du = doc.calques.filter((c) => c.type === type);
  const libre = du.find((c) => c.visible && !c.verrouille);
  if (libre) return { calque: libre };
  return { message: du.some((c) => c.visible && c.verrouille) ? MESSAGE_VERROUILLE : MESSAGE_AUCUN_CALQUE };
}

/** The layer the « Poser » tool writes to: the one chosen in the panel when it can take an element, else the first free one. */
export function calqueObjet(doc: Document, choisi: string | null | undefined): CalqueActif {
  const c = choisi ? doc.calques.find((x) => x.id === choisi && x.type === 'objet') : undefined;
  if (c) return c.visible && !c.verrouille ? { calque: c } : { message: c.verrouille ? MESSAGE_VERROUILLE : MESSAGE_CACHE };
  return calqueActif(doc, 'objet');
}
export const MESSAGE_CACHE = 'Ce calque est masqué.';
