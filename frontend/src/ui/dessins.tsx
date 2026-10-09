import { useId } from 'react';

/**
 * Drawn card headers of the system card (E-16) and the universe card (E-1): computed from the name
 * alone, always the same for a given name, never an image (docs/charte.md, « Carte de système »).
 * Colours come only from the classes of `ecrans/cartes.css` (tokens).
 */

/** FNV-1a hash of a text. */
export function graine(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic generator of numbers in [0, 1). */
export function alea(depart: number): () => number {
  let s = depart;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** « CoF Mini » → « Cm »; one capitalised word → its first two letters. */
export function monogramme(nom: string): string {
  const mots = nom
    .replace(/[’']/g, ' ')
    .split(/\s+/)
    .filter((m) => /^[A-ZÀ-Ý0-9]/.test(m));
  const deux = (mots.length > 1 ? mots[0]!.charAt(0) + mots[1]!.charAt(0) : nom.trim().slice(0, 2)).toUpperCase();
  return deux.length > 1 ? deux.charAt(0) + deux.charAt(1).toLowerCase() : deux;
}

type Point = [number, number];
const pt = (q: Point) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`;
const poly = (l: Point[]) => `M${l.map(pt).join(' L')} Z`;

export type TypeDe = 'd20' | 'd8' | 'd12';

/** Outline and inner edges of a drawn die (d20: hexagon and triangle; d8: lozenge; d12: pentagon). */
export function de(type: TypeDe, cx: number, cy: number, R: number, rot: number): { contour: string; aretes: string } {
  const P = (ang: number, k: number): Point => {
    const a = ((ang + rot) * Math.PI) / 180;
    return [cx + R * k * Math.cos(a), cy + R * k * Math.sin(a)];
  };
  if (type === 'd20') {
    const hex = [0, 1, 2, 3, 4, 5].map((i) => P(-90 + i * 60, 1));
    const tri = [0, 1, 2].map((i) => P(-90 + i * 120, 0.52));
    let aretes = poly(tri);
    [0, 1, 2].forEach((i) => {
      const h = i * 2;
      [h, (h + 1) % 6, (h + 5) % 6].forEach((j) => {
        aretes += ` M${pt(tri[i]!)} L${pt(hex[j]!)}`;
      });
    });
    return { contour: poly(hex), aretes };
  }
  if (type === 'd8') {
    const l = [P(-90, 1), P(0, 0.78), P(90, 1), P(180, 0.78)];
    const c = P(0, 0);
    return {
      contour: poly(l),
      aretes: `M${pt(l[1]!)} L${pt(l[3]!)} M${pt(l[0]!)} L${pt([c[0] + R * 0.12, c[1]])} L${pt(l[2]!)}`,
    };
  }
  const pen = [0, 1, 2, 3, 4].map((i) => P(-90 + i * 72, 1));
  const inn = [0, 1, 2, 3, 4].map((i) => P(-90 + i * 72, 0.55));
  let aretes = poly(inn);
  inn.forEach((q, i) => {
    aretes += ` M${pt(q)} L${pt(pen[i]!)}`;
  });
  return { contour: poly(pen), aretes };
}

function De({ type, cx, cy, R, rot }: { type: TypeDe; cx: number; cy: number; R: number; rot: number }) {
  const d = de(type, cx, cy, R, rot);
  return (
    <g className="de">
      <path d={d.contour} />
      <path className="arete" d={d.aretes} />
    </g>
  );
}

const TYPES: TypeDe[] = ['d20', 'd8', 'd12'];

/** E-16: triangular lattice, a big tinted die with a halo, a small neutral one, the monogram. */
export function VisuelSysteme({ nom }: { nom: string }) {
  const idHalo = `halo-${useId().replace(/:/g, '')}`;
  const r = alea(graine(nom));
  const pas = 26 + Math.floor(r() * 18);
  const dx = r() * pas;
  const ang = Math.floor(r() * 4) * 15;
  const traits: number[] = [];
  for (let k = -14; k < 28; k++) traits.push(k * pas + dx);
  const opacite = 0.45 + r() * 0.4;
  const gauche = r() < 0.35;
  const type = TYPES[Math.floor(r() * 3)]!;
  const cx = gauche ? 110 + r() * 60 : 250 + r() * 100;
  const cy = 60 + r() * 80;
  const R = 54 + r() * 40;
  const rot = Math.floor(r() * 4) * 8 - 12;
  const x2 = gauche ? 300 + r() * 60 : 50 + r() * 110;
  const y2 = 40 + r() * 40;
  const type2 = (['d8', 'd12', 'd20'] as TypeDe[])[Math.floor(r() * 3)]!;
  const R2 = 20 + r() * 10;
  const rot2 = r() * 30;
  return (
    <svg className="dessin dessin-systeme" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id={idHalo}>
          <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="treillis" opacity={opacite.toFixed(2)}>
        {[0, 60, 120].map((d) => (
          <g key={d} transform={`rotate(${ang + d} 200 100)`}>
            {traits.map((x) => (
              <path key={x} d={`M${x.toFixed(1)},-300 l0,800`} />
            ))}
          </g>
        ))}
      </g>
      <circle cx={cx.toFixed(0)} cy={cy.toFixed(0)} r={(R * 1.7).toFixed(0)} fill={`url(#${idHalo})`} />
      <De type={type} cx={cx} cy={cy} R={R} rot={rot} />
      <g className="petit">
        <De type={type2} cx={x2} cy={y2} R={R2} rot={rot2} />
      </g>
      <text className="monogramme" x={gauche ? 378 : 22} y="176" textAnchor={gauche ? 'end' : 'start'}>
        {monogramme(nom)}
      </text>
    </svg>
  );
}

function relief(r: () => number, cx: number, cy: number, R: number, n: number, haut: boolean) {
  const a = [r() * 0.22, r() * 0.16, r() * 0.1];
  const ph = [r() * 6.3, r() * 6.3, r() * 6.3];
  const courbes: { d: string; haut: boolean; sommet: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const f = 1 - k / n;
    let d = '';
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      const rr = R * f * (1 + a[0]! * Math.sin(2 * t + ph[0]!) + a[1]! * Math.sin(3 * t + ph[1]!) + a[2]! * Math.sin(5 * t + ph[2]! + k * 0.3));
      d += `${i ? ' L' : 'M'}${(cx + rr * 1.6 * Math.cos(t)).toFixed(1)},${(cy + rr * Math.sin(t)).toFixed(1)}`;
    }
    courbes.push({ d: `${d} Z`, haut: haut && k >= n - 3, sommet: haut && k === n - 1 });
  }
  return courbes;
}

/** E-1: two reliefs drawn as contour lines (a territory); the seal is laid on top by the card. */
export function VisuelUnivers({ nom }: { nom: string }) {
  const r = alea(graine(nom));
  const courbes = [
    ...relief(r, 250 + r() * 90, 70 + r() * 60, 70 + r() * 30, 8, true),
    ...relief(r, 60 + r() * 90, 150 + r() * 40, 40 + r() * 20, 5, false),
  ];
  return (
    <svg className="dessin dessin-univers" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {courbes.map((c, i) => (
        <g key={i}>
          <path className={`niveau${c.haut ? ' haut' : ''}`} d={c.d} />
          {c.sommet && <path className="sommet" d={c.d} />}
        </g>
      ))}
    </svg>
  );
}
