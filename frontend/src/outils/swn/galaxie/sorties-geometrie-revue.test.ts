// Jump arrows (AD-sorties-2, AD-sorties-3), written from the exit criterion on literal values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ECART_FLECHE_PX, libelleDistance, pointsDeSaut } from './carte-geometrie.ts';
import { typeDeRoute } from './type-route.ts';

const S = (q: number, r: number, heure: number) => ({ q, r, heure });
const arc = (a: { x: number; y: number }, b: { x: number; y: number }, R: number) => {
  const d = Math.abs(Math.atan2(a.x, -a.y) - Math.atan2(b.x, -b.y));
  return Math.min(d, 2 * Math.PI - d) * R;
};

describe('pointsDeSaut', () => {
  it('constant et places littérales : 12 h en haut, 3 h à droite, caps 0 et π/2', () => {
    assert.equal(ECART_FLECHE_PX, 16);
    const [b, a] = pointsDeSaut([S(0, 0, 12), S(1, 0, 3)], 100, 16);
    // sorted by hour: 3 first, 12 last
    assert.ok(Math.abs(a!.x) < 1e-6 && Math.abs(a!.y + 100) < 1e-6, `${a!.x},${a!.y}`);
    assert.ok(Math.abs(a!.cap) < 1e-9 || Math.abs(a!.cap - 2 * Math.PI) < 1e-9);
    assert.ok(Math.abs(b!.x - 100) < 1e-6 && Math.abs(b!.y) < 1e-6);
    assert.ok(Math.abs(b!.cap - Math.PI / 2) < 1e-9);
  });

  it('heure 0 donne la même place que 12 ; 6 h est en bas', () => {
    const [a] = pointsDeSaut([S(0, 0, 0)], 100, 16);
    assert.ok(Math.abs(a!.x) < 1e-6 && Math.abs(a!.y + 100) < 1e-6);
    const [b] = pointsDeSaut([S(0, 0, 6)], 100, 16);
    assert.ok(Math.abs(b!.x) < 1e-6 && Math.abs(b!.y - 100) < 1e-6);
  });

  it('3 h et 3,01 : écartées d’au moins 16 px, caps inchangés', () => {
    const [a, b] = pointsDeSaut([S(0, 0, 3), S(1, 0, 3.01)], 100, 16);
    assert.ok(arc(a!, b!, 100) >= 16 - 1e-6, `${arc(a!, b!, 100)}`);
    assert.ok(arc(a!, b!, 100) < 16 + 1e-3, 'le plus petit angle, pas plus');
    assert.ok(Math.abs(a!.cap - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(b!.cap - (3.01 / 12) * 2 * Math.PI) < 1e-9);
    // symétrique autour du milieu des caps
    const mil = (Math.PI / 2 + (3.01 / 12) * 2 * Math.PI) / 2;
    const m = (Math.atan2(a!.x, -a!.y) + Math.atan2(b!.x, -b!.y)) / 2;
    assert.ok(Math.abs(m - mil) < 1e-9);
  });

  it('trois sorties serrées : toutes trois écartées', () => {
    const r = pointsDeSaut([S(0, 0, 3), S(1, 0, 3.01), S(2, 0, 3.02)], 100, 16);
    assert.ok(arc(r[0]!, r[1]!, 100) >= 16 - 1e-6);
    assert.ok(arc(r[1]!, r[2]!, 100) >= 16 - 1e-6);
    r.forEach((p, i) => assert.ok(Math.abs(p.cap - ((3 + 0.01 * i) / 12) * 2 * Math.PI) < 1e-9));
  });

  it('même heure, cases différentes : écartées aussi', () => {
    const r = pointsDeSaut([S(2, 1, 9), S(1, 5, 9)], 100, 16);
    assert.ok(arc(r[0]!, r[1]!, 100) >= 16 - 1e-6);
    assert.deepEqual(r.map((p) => [p.q, p.r]), [[1, 5], [2, 1]]);
  });

  it('à cheval sur 12 h : 11,99 et 0,01 écartées en passant par le haut', () => {
    const r = pointsDeSaut([S(0, 0, 0.01), S(1, 0, 11.99)], 100, 16);
    assert.ok(arc(r[0]!, r[1]!, 100) >= 16 - 1e-6, `${arc(r[0]!, r[1]!, 100)}`);
  });

  it('indépendant de l’ordre de l’entrée, trié par heure puis (q, r)', () => {
    const e = [S(3, 1, 6), S(0, 2, 3), S(0, 1, 3), S(1, 0, 3.01), S(5, 5, 11)];
    const a = pointsDeSaut(e, 100, 16);
    const b = pointsDeSaut([...e].reverse(), 100, 16);
    const c = pointsDeSaut([e[2]!, e[4]!, e[0]!, e[3]!, e[1]!], 100, 16);
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    assert.deepEqual(a.map((p) => [p.heure, p.q, p.r]), [[3, 0, 1], [3, 0, 2], [3.01, 1, 0], [6, 3, 1], [11, 5, 5]]);
  });

  it('cas limites : vide, une seule, rayon nul, écart nul, ne modifie pas l’entrée', () => {
    assert.deepEqual(pointsDeSaut([], 100, 16), []);
    const un = pointsDeSaut([S(0, 0, 3)], 100, 16);
    assert.equal(un.length, 1);
    const e = [S(1, 0, 4), S(0, 0, 3)];
    const copie = JSON.stringify(e);
    for (const [R, g] of [[0, 16], [100, 0]] as const) {
      const r = pointsDeSaut(e, R, g);
      assert.equal(r.length, 2);
      r.forEach((p) => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)));
    }
    assert.equal(JSON.stringify(e), copie);
  });

  it('cercle trop petit pour tout écarter : termine, finis, sans NaN', () => {
    const e = Array.from({ length: 12 }, (_, i) => S(i, 0, 3 + i * 0.001));
    const r = pointsDeSaut(e, 20, 16);
    assert.equal(r.length, 12);
    r.forEach((p) => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)));
  });

  it('sorties déjà assez éloignées : places intactes', () => {
    const r = pointsDeSaut([S(0, 0, 1), S(1, 0, 5), S(2, 0, 9)], 100, 16);
    r.forEach((p) => assert.ok(Math.abs(p.x - 100 * Math.sin(p.cap)) < 1e-9 && Math.abs(p.y + 100 * Math.cos(p.cap)) < 1e-9));
  });
});

describe('libelleDistance', () => {
  it('singulier et pluriel', () => {
    assert.equal(libelleDistance(1), '1 case');
    assert.equal(libelleDistance(3), '3 cases');
    assert.equal(libelleDistance(12), '12 cases');
  });
});

describe('typeDeRoute', () => {
  it('familles', () => {
    assert.equal(typeDeRoute(' Pirate '), 'pirate');
    assert.equal(typeDeRoute('publique'), 'public');
    assert.equal(typeDeRoute('Public'), 'public');
    assert.equal(typeDeRoute('Privée'), 'private');
    assert.equal(typeDeRoute('privé'), 'private');
    assert.equal(typeDeRoute('privee'), 'private');
    assert.equal(typeDeRoute('PRIVATE'), 'private');
    assert.equal(typeDeRoute(null), 'autre');
    assert.equal(typeDeRoute(undefined), 'autre');
    assert.equal(typeDeRoute(''), 'autre');
    assert.equal(typeDeRoute('   '), 'autre');
    assert.equal(typeDeRoute('convoi'), 'autre');
    assert.equal(typeDeRoute('pirates'), 'autre');
    assert.equal(typeDeRoute('route publique'), 'autre');
  });
});

describe('tokens de route', () => {
  const css = readFileSync(new URL('../../../ui/tokens.css', import.meta.url), 'utf8');
  const bloc = (sel: string): string => {
    const i = css.indexOf(sel);
    assert.ok(i >= 0, sel);
    return css.slice(css.indexOf('{', i), css.indexOf('}', i));
  };
  const sombre = { public: '#5ad1c4', private: '#efe27a', pirate: '#ff6b6b', autre: '#a6a7b0' };
  const clair = { public: '#0b7a70', private: '#7d6a00', pirate: '#c0332b', autre: '#4a4c58' };
  const verifie = (b: string, v: Record<string, string>) => {
    for (const [k, c] of Object.entries(v)) assert.match(b, new RegExp(`--route-${k}:\\s*${c}\\b`, 'i'), `--route-${k}`);
  };
  it('présents dans :root, le thème clair et .cs-ciel', () => {
    verifie(bloc(':root {'), sombre);
    verifie(bloc('[data-theme="light"]'), clair);
    verifie(bloc('.cs-ciel'), sombre);
  });
});
