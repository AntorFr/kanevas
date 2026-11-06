// Hexagon geometry of the galaxy screen: axial coordinates, pointy-top (same convention as the server's `hex.ts`).
export interface Hex { q: number; r: number }

const RACINE_3 = Math.sqrt(3);

export const distanceHex = (a: Hex, b: Hex) => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** Centre of a hexagon on the unit plane (hexagon radius 1). */
export const versPlan = (q: number, r: number) => ({ x: RACINE_3 * (q + r / 2), y: 1.5 * r });

/** The hexagon containing a point of the unit plane (cube rounding). */
export function versHex(x: number, y: number): Hex {
  const qf = (RACINE_3 / 3) * x - y / 3;
  const rf = (2 / 3) * y;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

export const TAILLE_MIN = 10;
export const TAILLE_MAX = 60;
export const COTE_BLOC = 5;
export const BLOCS_MAX = 12;

export const bloc = (v: number) => Math.floor(v / COTE_BLOC);

/** « 7 cases », « 1 case ». */
export const cases = (n: number) => `${n} ${n === 1 ? 'case' : 'cases'}`;

/** Names are cut at 24 characters on the map; the panel shows the whole. */
export const abreger = (nom: string) => ([...nom].length > 24 ? `${[...nom].slice(0, 23).join('')}…` : nom);

/** Lowest zoom (hexagon radius in px) at which at most 60 × 60 hexagons are on screen. */
export function tailleMinimale(largeur: number, hauteur: number): number {
  const parQ = (largeur / RACINE_3 + hauteur / 3) / 56;
  const parR = hauteur / 1.5 / 56;
  return Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, parQ, parR));
}

/** A type of link on the map: cut with « … » beyond 14 characters (the panel shows it whole). */
export function abregerType(t: string): string {
  const c = [...t.replace(/\s+/g, ' ').trim()];
  return c.length > 14 ? `${c.slice(0, 13).join('')}…` : c.join('');
}

/**
 * Centre of a type-of-link label: the middle of the segment pushed along its normal (downwards) far enough
 * that the horizontal text box (width `l`, height `h`, plus `marge`) never meets the segment, whatever its slope.
 */
export function placerEtiquetteType(a: { x: number; y: number }, b: { x: number; y: number }, l: number, h: number, marge = 6): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const long = Math.hypot(dx, dy) || 1;
  let nx = -dy / long;
  let ny = dx / long;
  if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
  const d = Math.abs(nx) * l / 2 + Math.abs(ny) * h / 2 + marge;
  return { x: (a.x + b.x) / 2 + nx * d, y: (a.y + b.y) / 2 + ny * d };
}
