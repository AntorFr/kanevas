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
export const CASE = { largeur: 150, hauteur: 70 };
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
 * Maps the unit-square layout into a frame of `taille` pixels, then pushes overlapping boxes apart
 * (deterministic: fixed order, fixed iterations) so no two nodes share a case.
 */
export function enPixels(unite: Map<number, Point>, taille: Taille): Map<number, Point> {
  const ids = [...unite.keys()];
  const px = ids.map((id) => MARGE + unite.get(id)!.x * (taille.largeur - 2 * MARGE));
  const py = ids.map((id) => MARGE + unite.get(id)!.y * (taille.hauteur - 2 * MARGE));
  const n = ids.length;
  for (let it = 0; it < 120; it++) {
    let bouge = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[j]! - px[i]!;
        const dy = py[j]! - py[i]!;
        const ox = CASE.largeur - Math.abs(dx);
        const oy = CASE.hauteur - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        bouge = true;
        // Separate along the axis that needs the least move; the sign of a tie follows the index.
        if (ox / CASE.largeur < oy / CASE.hauteur) {
          const s = (dx === 0 ? (i < j ? -1 : 1) : Math.sign(dx)) * (ox / 2 + 0.5);
          px[i]! -= s;
          px[j]! += s;
        } else {
          const s = (dy === 0 ? (i < j ? -1 : 1) : Math.sign(dy)) * (oy / 2 + 0.5);
          py[i]! -= s;
          py[j]! += s;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      px[i] = Math.min(taille.largeur - MARGE, Math.max(MARGE, px[i]!));
      py[i] = Math.min(taille.hauteur - MARGE, Math.max(MARGE, py[i]!));
    }
    if (!bouge) break;
  }
  return new Map(ids.map((id, i) => [id, { x: px[i]!, y: py[i]! }]));
}
