// A zone that is a set of hexagons (B-84, Z-6): two <path> for the whole zone — the fill by bands (one run of a
// row is one polygon) and the outer edge only. Both are computed once on the unit plane (hexagon radius 1) and
// memoised on `(id, version)`; panning and zooming only move the group's transform, nothing is recomputed.
import type { ReactNode } from 'react';

import { abreger } from './geo';
import type { ZoneCarte } from './types';

type Plage = readonly [number, number, number];

const DEMI = Math.sqrt(3) / 2;
/** Lattice coordinates of a vertex: x = a·√3/2, y = b/2 (integers, so two hexagons share their corners exactly). */
const SOMMETS: [number, number][] = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
/** Neighbour across the edge from vertex i to vertex i + 1. */
const VOISINS: [number, number][] = [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]];

export interface GeometrieZone { plein: string; bord: string; centre: { x: number; y: number }; calculs: number }

const nb = (v: number) => String(Math.round(v * 1e4) / 1e4);
const pt = (a: number, b: number) => `${nb(a * DEMI)},${nb(b / 2)}`;

/** Fill (bands) and outer edge of a set of ranges `[r, q0, q1]`, on the unit plane. */
export function calculerGeometrie(plages: readonly Plage[]): Omit<GeometrieZone, 'calculs'> {
  // Fill: for each run, the zigzag top left to right then the zigzag bottom right to left.
  const bandes: string[] = [];
  const membres = new Set<string>();
  let n = 0, sq = 0, sr = 0;
  for (const [r, q0, q1] of plages) {
    const b = 3 * r;
    const haut: string[] = [pt(2 * q0 + r - 1, b - 1)];
    const bas: string[] = [];
    for (let q = q0; q <= q1; q++) {
      const a = 2 * q + r;
      haut.push(pt(a, b - 2), pt(a + 1, b - 1));
      bas.push(pt(a, b + 2), pt(a - 1, b + 1));
      membres.add(`${q},${r}`);
      n++; sq += q; sr += r;
    }
    haut.push(pt(2 * q1 + r + 1, b + 1));
    bandes.push(`M${haut.join('L')}L${bas.reverse().join('L')}Z`);
  }
  // Edge: the sides of a member that face a non-member, chained into closed loops (so a dash runs along them).
  const sortants = new Map<string, string[]>();
  for (const [r, q0, q1] of plages) {
    for (let q = q0; q <= q1; q++) {
      const a = 2 * q + r, b = 3 * r;
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = VOISINS[i]!;
        if (membres.has(`${q + dq},${r + dr}`)) continue;
        const [x0, y0] = SOMMETS[i]!, [x1, y1] = SOMMETS[(i + 1) % 6]!;
        const depart = `${a + x0},${b + y0}`;
        const l = sortants.get(depart);
        const fin = `${a + x1},${b + y1}`;
        if (l) l.push(fin); else sortants.set(depart, [fin]);
      }
    }
  }
  const coord = (k: string) => { const [a, b] = k.split(',').map(Number); return pt(a!, b!); };
  const boucles: string[] = [];
  for (const [debut, l] of sortants) {
    while (l.length > 0) {
      const pts = [coord(debut)];
      let cur = l.pop()!;
      for (;;) {
        pts.push(coord(cur));
        const suite = sortants.get(cur);
        if (!suite || suite.length === 0) break;
        cur = suite.pop()!;
      }
      boucles.push(`M${pts.join('L')}Z`);
    }
  }
  // Label: the member closest to the mean of the members.
  const mq = sq / n, mr = sr / n;
  const mx = DEMI * 2 * (mq + mr / 2), my = 1.5 * mr;
  let meilleur = { x: 0, y: 0 }, dmin = Infinity;
  for (const [r, q0, q1] of plages) {
    for (let q = q0; q <= q1; q++) {
      const x = DEMI * 2 * (q + r / 2), y = 1.5 * r;
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < dmin) { dmin = d; meilleur = { x, y }; }
    }
  }
  return { plein: bandes.join(''), bord: boucles.join(''), centre: meilleur };
}

const memo = new Map<string, GeometrieZone>();
const MEMO_MAX = 64;

/** Memoised on `(id, version)`; a zone read without a version (player) is keyed by its ranges. */
export function geometrieDe(z: Pick<ZoneCarte, 'id' | 'version' | 'plages'>): GeometrieZone {
  const plages = z.plages ?? [];
  const cle = `${z.id}:${z.version ?? JSON.stringify(plages)}`;
  let g = memo.get(cle);
  if (!g) {
    const prec = [...memo.keys()].find((k) => k.startsWith(`${z.id}:`));
    const calculs = (prec ? memo.get(prec)!.calculs : 0) + 1;
    g = { ...calculerGeometrie(plages), calculs };
    if (prec) memo.delete(prec);
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
    memo.set(cle, g);
  }
  return g;
}

export const estEnsemble = (z: Pick<ZoneCarte, 'plages'>) => z.plages !== undefined;

export function ZoneHexagones({ zone, decal, echelle, etiquettes, choisie, cliquable, mode, onClic, nomAbrege }: {
  zone: ZoneCarte; decal: { x: number; y: number }; echelle: number;
  etiquettes: boolean; choisie: boolean; cliquable: boolean; mode: boolean; onClic: () => void; nomAbrege?: string;
}): ReactNode {
  const g = geometrieDe(zone);
  const secret = zone.secret === true;
  const c = { x: g.centre.x * echelle + decal.x, y: g.centre.y * echelle + decal.y };
  return (
    <g className={`gx-zone gx-ens gx-c-${zone.couleur}${secret ? ' secrete' : ''}${choisie ? ' choisie' : ''}`} data-zone={zone.cle} data-calculs={g.calculs}>
      <g transform={`translate(${decal.x} ${decal.y}) scale(${echelle})`}>
        <path className="gx-zone-plein" d={g.plein} style={{ stroke: 'none', pointerEvents: cliquable && !mode ? 'fill' : 'none', cursor: cliquable && !mode ? 'pointer' : undefined }}
          onClick={cliquable && !mode ? onClic : undefined} />
        <path className="gx-zone-trait" d={g.bord} vectorEffect="non-scaling-stroke" style={{ fill: 'none', pointerEvents: 'none' }} />
      </g>
      {etiquettes && <text x={c.x} y={c.y} textAnchor="middle">{nomAbrege ?? abreger(zone.nom)}{secret ? ' · Secret' : ''}</text>}
    </g>
  );
}
