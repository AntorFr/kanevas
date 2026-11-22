import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// E-23, the sky of the system map: whatever is drawn on `--ciel` (labels, hours, exits, the selection ring, the focus ring)
// must reach the WCAG 2.2 AA thresholds written in docs/charte.md (4.5 text, 3 non-text) in BOTH themes. Ratios are computed here
// from tokens.css; the thresholds are the charte's.
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
// What the elements of the sky really inherit: the theme, then the `.cs-ciel` block on top (the cascade).
const surLeCiel = bloc('.cs-ciel');

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

// [foreground token, background token of the sky, threshold]
const paires: [string, string, number][] = [
  ['texte', 'ciel', 4.5], // labels of the bodies
  ['texte-2', 'ciel', 4.5], // zone labels
  ['texte-3', 'ciel', 4.5], // hours
  ['accent', 'ciel', 4.5], // exit labels
  ['texte', 'ciel-lueur', 4.5], // the lighter centre of the sky
  ['texte-3', 'ciel-lueur', 4.5],
  ['accent', 'ciel-lueur', 3], // selection ring, transition circle, exit marks
  ['focus', 'ciel', 3], // focus ring of a body
];

for (const [nom, theme] of [['sombre', sombre], ['clair', clair]] as const) {
  const reel = { ...theme, ...surLeCiel };
  for (const [av, ar, seuil] of paires) {
    test(`contraste du ciel, thème ${nom} : --${av} sur --${ar} ≥ ${seuil}`, () => {
      const r = ratio(couleur(reel[av]!), couleur(reel[ar]!));
      assert.ok(r >= seuil, `${r.toFixed(2)} < ${seuil}`);
    });
  }
  test(`contraste du ciel, thème ${nom} : le ciel a ses trois jetons et la même valeur dans les deux thèmes`, () => {
    for (const j of ['ciel', 'ciel-lueur', 'ciel-trait', 'ciel-halo']) {
      assert.ok(reel[j], `--${j} absent`);
      assert.equal(reel[j], sombre[j], `--${j} diffère entre les thèmes`);
    }
  });
}

test('contraste du ciel : le calcul sait échouer (--texte-3 du thème clair sur le ciel, sans le bloc .cs-ciel)', () => {
  const r = ratio(couleur(clair['texte-3']!), couleur(clair['ciel']!));
  assert.ok(r < 4.5, String(r));
});
