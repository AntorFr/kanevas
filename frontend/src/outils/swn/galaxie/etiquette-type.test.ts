// Placement of the type-of-link label (E-21): whatever the slope, the horizontal text box never meets the route.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placerEtiquetteType } from './geo.ts';

type P = { x: number; y: number };
// Does the segment ab meet the axis-aligned box centred on c? (slab method)
function croise(a: P, b: P, c: P, l: number, h: number): boolean {
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[a.x, b.x - a.x, c.x - l / 2, c.x + l / 2], [a.y, b.y - a.y, c.y - h / 2, c.y + h / 2]] as const) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

describe('placerEtiquetteType', () => {
  const L = 42, H = 14;
  it('ne croise jamais le segment, quelle que soit la pente et le sens', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const r = (deg * Math.PI) / 180;
      const a = { x: 100, y: 100 };
      const b = { x: 100 + 90 * Math.cos(r), y: 100 + 90 * Math.sin(r) };
      const c = placerEtiquetteType(a, b, L, H);
      assert.equal(croise(a, b, c, L, H), false, `pente ${deg}°`);
    }
  });
  it('reste sous le segment (côté bas) et près de son milieu', () => {
    const a = { x: 0, y: 0 }, b = { x: 80, y: 40 };
    const c = placerEtiquetteType(a, b, L, H);
    const m = { x: 40, y: 20 };
    assert.ok(c.y > m.y);
    assert.ok(Math.hypot(c.x - m.x, c.y - m.y) < 60);
  });
  it('segment horizontal : centré, 6 px de marge sous la ligne', () => {
    const c = placerEtiquetteType({ x: 0, y: 0 }, { x: 100, y: 0 }, L, H);
    assert.equal(c.x, 50);
    assert.equal(c.y, H / 2 + 6);
  });
  it('segment nul : pas de NaN', () => {
    const c = placerEtiquetteType({ x: 5, y: 5 }, { x: 5, y: 5 }, L, H);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  });
});
