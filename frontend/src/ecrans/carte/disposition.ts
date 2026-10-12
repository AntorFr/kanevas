/**
 * Graph layout (AD-71): a pure, dependency-free, deterministic force placement.
 * It is applied to the one graph the server rendered for this reader — never to
 * any other call's content — so a node the reader cannot see changes nothing.
 */

export interface NoeudDispo {
  id: number;
  titre: string;
}

export interface LienDispo {
  de: number;
  vers: number;
}

export interface Point {
  x: number;
  y: number;
}

export const ITERATIONS = 300;

/** Positions in the unit square [0, 1] × [0, 1], by node id. */
export function disposer(noeuds: NoeudDispo[], liens: LienDispo[]): Map<number, Point> {
  const tries = [...noeuds].sort((a, b) => (a.titre < b.titre ? -1 : a.titre > b.titre ? 1 : a.id - b.id));
  const n = tries.length;
  const sortie = new Map<number, Point>();
  if (n === 0) return sortie;
  if (n === 1) return sortie.set(tries[0]!.id, { x: 0.5, y: 0.5 });

  const index = new Map(tries.map((t, i) => [t.id, i]));
  const aretes: Array<[number, number]> = [];
  for (const l of liens) {
    const a = index.get(l.de);
    const b = index.get(l.vers);
    if (a !== undefined && b !== undefined && a !== b) aretes.push([a, b]);
  }

  // Start on a circle, in the order of the titles then the ids.
  const px = tries.map((_, i) => 0.5 + 0.4 * Math.cos((2 * Math.PI * i) / n));
  const py = tries.map((_, i) => 0.5 + 0.4 * Math.sin((2 * Math.PI * i) / n));
  const k = Math.sqrt(1 / n); // ideal distance
  let temperature = 0.1;

  for (let it = 0; it < ITERATIONS; it++) {
    const dx = new Array<number>(n).fill(0);
    const dy = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = px[i]! - px[j]!;
        let vy = py[i]! - py[j]!;
        let d = Math.hypot(vx, vy);
        if (d < 1e-6) {
          // Coincident: a fixed, index-based push keeps it deterministic.
          vx = Math.cos(i + j);
          vy = Math.sin(i + j);
          d = 1e-6;
        }
        const f = (k * k) / d; // repulsion
        dx[i]! += (vx / d) * f;
        dy[i]! += (vy / d) * f;
        dx[j]! -= (vx / d) * f;
        dy[j]! -= (vy / d) * f;
      }
    }
    for (const [a, b] of aretes) {
      const vx = px[a]! - px[b]!;
      const vy = py[a]! - py[b]!;
      const d = Math.hypot(vx, vy) || 1e-6;
      const f = (d * d) / k; // attraction along the link
      dx[a]! -= (vx / d) * f;
      dy[a]! -= (vy / d) * f;
      dx[b]! += (vx / d) * f;
      dy[b]! += (vy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i]!, dy[i]!) || 1e-6;
      const pas = Math.min(d, temperature);
      px[i]! += (dx[i]! / d) * pas;
      py[i]! += (dy[i]! / d) * pas;
    }
    temperature = Math.max(0.0005, temperature * 0.98);
  }

  // Stretch to fill the unit square.
  const etendre = (v: number[]) => {
    const min = Math.min(...v);
    const max = Math.max(...v);
    return v.map((x) => (max - min < 1e-9 ? 0.5 : (x - min) / (max - min)));
  };
  const nx = etendre(px);
  const ny = etendre(py);
  tries.forEach((t, i) => sortie.set(t.id, { x: nx[i]!, y: ny[i]! }));
  return sortie;
}

export interface Taille {
  largeur: number;
  hauteur: number;
}

/** Room one node takes (title included) and the margin kept around the outer ones, in pixels. */
export const CASE = { largeur: 180, hauteur: 76 };
export const MARGE = 40;

/**
 * The size a graph of `n` nodes needs inside `disponible` pixels of width: the width follows the screen
 * (never narrower than one node), the height grows with the number of rows the nodes need.
 */
export function tailleCadre(n: number, disponible: number): Taille {
  const largeur = Math.max(CASE.largeur + 2 * MARGE, Math.floor(disponible));
  const colonnes = Math.max(1, Math.floor((largeur - 2 * MARGE) / CASE.largeur));
  const lignes = Math.max(1, Math.ceil(n / colonnes));
  return { largeur, hauteur: Math.max(380, Math.ceil(lignes * CASE.hauteur * 1.6) + 2 * MARGE) };
}

/**
 * Maps the unit-square layout into a frame of `taille` pixels: the layout's own shape is kept (scaled to the
 * frame), then any two nodes whose CASE-sized boxes overlap are pushed apart along the axis of least
 * penetration. Deterministic (fixed pair order, fixed pass count). If the frame is too tight for that to
 * converge, each node falls back on its own free case of a grid, so two nodes never overlap.
 */
export function enPixels(unite: Map<number, Point>, taille: Taille): Map<number, Point> {
  const minX = Math.min(MARGE + CASE.largeur / 2, taille.largeur / 2);
  const maxX = Math.max(minX, taille.largeur - MARGE - CASE.largeur / 2);
  const minY = Math.min(MARGE + CASE.hauteur / 2, taille.hauteur / 2);
  const maxY = Math.max(minY, taille.hauteur - MARGE - CASE.hauteur / 2);
  const ids = [...unite.keys()];
  const pts = ids.map((id) => ({ x: minX + unite.get(id)!.x * (maxX - minX), y: minY + unite.get(id)!.y * (maxY - minY) }));
  const borne = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const chevauche = (a: Point, b: Point) => Math.abs(a.x - b.x) < CASE.largeur - 0.5 && Math.abs(a.y - b.y) < CASE.hauteur - 0.5;
  let propre = false;
  for (let passe = 0; passe < 300 && !propre; passe++) {
    propre = true;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]!;
        const b = pts[j]!;
        if (!chevauche(a, b)) continue;
        propre = false;
        const px = CASE.largeur - Math.abs(a.x - b.x);
        const py = CASE.hauteur - Math.abs(a.y - b.y);
        if (px < py) {
          const s = a.x <= b.x ? 1 : -1;
          a.x -= (s * px) / 2;
          b.x += (s * px) / 2;
        } else {
          const s = a.y <= b.y ? 1 : -1;
          a.y -= (s * py) / 2;
          b.y += (s * py) / 2;
        }
        a.x = borne(a.x, minX, maxX);
        b.x = borne(b.x, minX, maxX);
        a.y = borne(a.y, minY, maxY);
        b.y = borne(b.y, minY, maxY);
      }
    }
  }
  if (propre) {
    const sortie = new Map<number, Point>();
    ids.forEach((id, i) => sortie.set(id, pts[i]!));
    return sortie;
  }
  return enGrille(unite, taille);
}

/** Fallback: each node gets the free case of a CASE-sized grid nearest to its ideal spot (layout order). */
function enGrille(unite: Map<number, Point>, taille: Taille): Map<number, Point> {
  const colonnes = Math.max(1, Math.floor((taille.largeur - 2 * MARGE) / CASE.largeur));
  const lignes = Math.max(1, Math.floor((taille.hauteur - 2 * MARGE) / CASE.hauteur));
  const ox = (taille.largeur - colonnes * CASE.largeur) / 2 + CASE.largeur / 2;
  const oy = (taille.hauteur - lignes * CASE.hauteur) / 2 + CASE.hauteur / 2;
  const libres: Point[] = [];
  for (let r = 0; r < lignes; r++) for (let c = 0; c < colonnes; c++) libres.push({ x: ox + c * CASE.largeur, y: oy + r * CASE.hauteur });
  const sortie = new Map<number, Point>();
  for (const [id, u] of unite) {
    const idealX = MARGE + u.x * (taille.largeur - 2 * MARGE);
    const idealY = MARGE + u.y * (taille.hauteur - 2 * MARGE);
    let meilleur = -1;
    let dMin = Infinity;
    for (let i = 0; i < libres.length; i++) {
      const d = Math.hypot(libres[i]!.x - idealX, libres[i]!.y - idealY);
      if (d < dMin) {
        dMin = d;
        meilleur = i;
      }
    }
    if (meilleur < 0) {
      // More nodes than cases (frame sized by the caller): fall back on the ideal spot.
      sortie.set(id, { x: idealX, y: idealY });
      continue;
    }
    sortie.set(id, libres[meilleur]!);
    libres.splice(meilleur, 1);
  }
  return sortie;
}
