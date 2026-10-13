import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Recomputes the contrast table of docs/charte.md from tokens.css. Expected thresholds are the
// WCAG 2.2 AA ones written in the charte (4.5 text, 3 non-text); ratios are computed here.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function bloc(selecteur: string): Record<string, string> {
  const debut = css.indexOf(selecteur + ' {');
  assert.ok(debut >= 0, `bloc ${selecteur} absent de tokens.css`);
  const corps = css.slice(css.indexOf('{', debut) + 1, css.indexOf('}', debut));
  const out: Record<string, string> = {};
  for (const m of corps.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
const sombre = bloc(':root');
const clair = { ...sombre, ...bloc(':root[data-theme="light"]') };

type Rgba = [number, number, number, number];
function couleur(v: string): Rgba {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(v);
  assert.ok(m, `couleur illisible : ${v}`);
  return [+m[1]!, +m[2]!, +m[3]!, +m[4]!];
}
function sur(avant: Rgba, fond: Rgba): Rgba {
  const a = avant[3];
  return [0, 1, 2].map((i) => avant[i]! * a + fond[i]! * (1 - a)).concat(1) as Rgba;
}
function lum([r, g, b]: Rgba): number {
  const l = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
}
function ratio(a: Rgba, b: Rgba): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

// [foreground, background, background composited over, threshold]
const paires: [string, string, string | null, number][] = [
  ['texte', 'surface', null, 4.5],
  ['texte-2', 'surface', null, 4.5],
  ['texte-3', 'surface', null, 4.5],
  ['texte-3', 'surface-2', null, 4.5],
  ['texte-3', 'fond', null, 4.5],
  ['texte-3', 'fond-lateral', null, 4.5],
  ['sur-accent', 'accent', null, 4.5],
  ['accent-texte', 'surface', null, 4.5],
  ['accent-texte', 'accent-fond', 'surface', 4.5],
  ['mj', 'surface', null, 4.5],
  ['mj', 'mj-fond', 'surface', 4.5],
  ['table', 'surface', null, 4.5],
  ['table', 'table-fond', 'surface', 4.5],
  ['danger', 'surface', null, 4.5],
  ['danger', 'danger-fond', 'surface', 4.5],
  ['bord-champ', 'surface-2', null, 3],
  ['bord-champ', 'surface', null, 3],
  ['focus', 'fond', null, 3],
];

for (const [nom, theme] of [['sombre', sombre], ['clair', clair]] as const) {
  for (const [av, ar, dessus, seuil] of paires) {
    test(`contraste ${nom} : --${av} sur --${ar}${dessus ? ` (sur --${dessus})` : ''} ≥ ${seuil}`, () => {
      let fond = couleur(theme[ar]!);
      if (dessus) fond = sur(fond, couleur(theme[dessus]!));
      const r = ratio(sur(couleur(theme[av]!), fond), fond);
      assert.ok(r >= seuil, `${r.toFixed(2)} < ${seuil}`);
    });
  }
}

test('contraste : le calcul sait échouer (gris tertiaire du cadrage #6b6a72 sur surface sombre)', () => {
  const r = ratio(couleur('#6b6a72'), couleur('#1a1a1f'));
  assert.ok(r > 3.2 && r < 3.3, String(r)); // charte: 3,24
});

test('contraste : valeurs de référence de la charte (texte sur surface 14,72 / 17,16, charte §5)', () => {
  assert.ok(Math.abs(ratio(couleur(sombre['texte']!), couleur(sombre['surface']!)) - 14.72) < 0.02);
  assert.ok(Math.abs(ratio(couleur(clair['texte']!), couleur(clair['surface']!)) - 17.16) < 0.02);
});
