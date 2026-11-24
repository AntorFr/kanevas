// Framing of the galaxy map on the known zone (AD-galaxie-systemes-3): pure, no DOM. « Known » is what the reader reads:
// the caller hands over the readable systems and zones only, so a hidden one never moves the view (not even by a margin).
import { BLOCS_MAX, COTE_BLOC, TAILLE_MAX, tailleMinimale, versPlan } from './geo';
import type { SystemeCarte, ZoneCarte } from './types';

const RACINE_3 = Math.sqrt(3);
/** Margin around the known zone, as a part of the window. */
export const MARGE_CADRAGE = 0.08;
/** Smallest hexagon radius (px) the lowered zoom reaches. */
export const TAILLE_FOND = 4;
/** Blocks per side the window may hold when the zoom is lowered (four requests of `BLOCS_MAX` blocks, the map's limit in flight). */
export const BLOCS_FENETRE_MAX = 2 * BLOCS_MAX;

export interface Boite { x0: number; y0: number; x1: number; y1: number }
export interface VueCadree { vx: number; vy: number; s: number }
type Hexagone = { q: number; r: number };

/** The hexagons of a zone: a polygon by its contour points, a set by its ranges `[r, q0, q1]`. */
export function hexagonesDeZone(z: Pick<ZoneCarte, 'contour' | 'plages'>): Hexagone[] {
  if (z.plages) {
    const out: Hexagone[] = [];
    for (const [r, q0, q1] of z.plages) for (let q = q0; q <= q1; q++) out.push({ q, r });
    return out;
  }
  return z.contour.map(([q, r]) => ({ q, r }));
}

/** The box of the plane holding these hexagons (each hexagon takes its whole extent), or null for none. */
export function boiteDeHexagones(hexs: Hexagone[]): Boite | null {
  if (hexs.length === 0) return null;
  const b: Boite = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const h of hexs) {
    const p = versPlan(h.q, h.r);
    b.x0 = Math.min(b.x0, p.x - RACINE_3 / 2); b.x1 = Math.max(b.x1, p.x + RACINE_3 / 2);
    b.y0 = Math.min(b.y0, p.y - 1); b.y1 = Math.max(b.y1, p.y + 1);
  }
  return b;
}

/** The known zone: the readable systems and the hexagons of the readable zones (and `autres`, e.g. drawn stars). */
export function boiteZoneConnue(systemes: Pick<SystemeCarte, 'q' | 'r'>[], zones: Pick<ZoneCarte, 'contour' | 'plages'>[], autres: Hexagone[] = []): Boite | null {
  return boiteDeHexagones([...systemes, ...zones.flatMap(hexagonesDeZone), ...autres]);
}

/** The same box widened by one block on every side: the part of the plane where the grid is drawn. */
export function boiteGrille(b: Boite | null): Boite | null {
  if (!b) return null;
  const m = COTE_BLOC * RACINE_3; // one block, in plane units, on the wider axis
  return { x0: b.x0 - m, x1: b.x1 + m, y0: b.y0 - COTE_BLOC * 1.5, y1: b.y1 + COTE_BLOC * 1.5 };
}

/** The zoom that makes `b` fit a window with its margin. */
export function ajustement(b: Boite, fenetre: { w: number; h: number }): number {
  const largeur = Math.max(b.x1 - b.x0, 1e-6), hauteur = Math.max(b.y1 - b.y0, 1e-6);
  return Math.min((fenetre.w * (1 - 2 * MARGE_CADRAGE)) / largeur, (fenetre.h * (1 - 2 * MARGE_CADRAGE)) / hauteur);
}

/** The lowest zoom: today's, lowered to the fit of the known zone when it is wider, never under `TAILLE_FOND` nor past `BLOCS_FENETRE_MAX` blocks in the window. */
export function zoomMinimal(fenetre: { w: number; h: number }, b: Boite | null): number {
  const base = tailleMinimale(fenetre.w, fenetre.h);
  if (!b) return base;
  const plafond = Math.max(TAILLE_FOND, base * (BLOCS_MAX / BLOCS_FENETRE_MAX));
  return Math.min(base, Math.max(plafond, ajustement(b, fenetre)));
}

/** The opening view: the known zone centred, fitted with a margin of 8 % of the window; null when nothing is known. */
export function cadrerZoneConnue(systemes: Pick<SystemeCarte, 'q' | 'r'>[], zones: Pick<ZoneCarte, 'contour' | 'plages'>[], fenetre: { w: number; h: number }): VueCadree | null {
  const b = boiteZoneConnue(systemes, zones);
  if (!b) return null;
  const s = Math.min(TAILLE_MAX, Math.max(zoomMinimal(fenetre, b), ajustement(b, fenetre)));
  return { vx: (b.x0 + b.x1) / 2, vy: (b.y0 + b.y1) / 2, s };
}
