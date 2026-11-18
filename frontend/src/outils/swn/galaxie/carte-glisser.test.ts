// Drag and arrow rules of the system map (E-23, Déplacer 1 and 2), written from the exit criterion: a place is (orbit, hour),
// 12 h at the top and 3 h at the right, the orbit within 0 to 1 000, the hour wrapping around 12 (never 12 itself).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placeApresPas, placeDepuisPoint, rayonOrbite, U } from './carte-geometrie.ts';
import { DELAI_FLECHES_MS, pasFleche } from '../../../ui/glisser.ts';

const proche = (a: number, b: number, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

describe('placeDepuisPoint', () => {
  it('lit 12 h en haut, 3 h à droite, 6 h en bas, 9 h à gauche', () => {
    const r = rayonOrbite(3);
    assert.equal(placeDepuisPoint(0, -r).heure, 0);
    assert.equal(placeDepuisPoint(r, 0).heure, 3);
    assert.equal(placeDepuisPoint(0, r).heure, 6);
    assert.equal(placeDepuisPoint(-r, 0).heure, 9);
  });
  it('rend l\'orbite dont le cercle passe par le point (les deux tronçons de l\'échelle)', () => {
    for (const o of [0.2, 0.9, 1, 1.5, 2, 5.25, 12]) {
      const p = placeDepuisPoint(rayonOrbite(o), 0);
      proche(p.orbite, o);
    }
  });
  it('reste dans 0 à 1 000 et ne rend jamais 12 h', () => {
    assert.equal(placeDepuisPoint(0, 0).orbite, 0);
    assert.equal(placeDepuisPoint(1e9, 0).orbite, 1000);
    for (let a = 0; a < 360; a += 0.37) {
      const p = placeDepuisPoint(Math.sin((a * Math.PI) / 180) * 3 * U, -Math.cos((a * Math.PI) / 180) * 3 * U);
      assert.ok(p.heure >= 0 && p.heure < 12, `heure ${p.heure} à ${a}°`);
    }
    // just left of 12 h rounds to 12 : it must read 0
    assert.equal(placeDepuisPoint(-0.001, -3 * U).heure, 0);
  });
  it('aller-retour sur une orbite et une heure rondes', () => {
    const o = 4, h = 7.5, r = rayonOrbite(o), a = (h * 30 * Math.PI) / 180;
    const p = placeDepuisPoint(Math.sin(a) * r, -Math.cos(a) * r);
    proche(p.orbite, o); proche(p.heure, h);
  });
});

describe('placeApresPas', () => {
  it('ajoute le pas à l\'orbite et à l\'heure', () => {
    assert.deepEqual(placeApresPas(2, 3, { orbite: 0.25, heure: 0 }, false), { orbite: 2.25, heure: 3 });
    assert.deepEqual(placeApresPas(2, 3, { orbite: 0, heure: -0.25 }, false), { orbite: 2, heure: 2.75 });
  });
  it('l\'heure fait le tour de 12 dans les deux sens', () => {
    assert.equal(placeApresPas(2, 11.9, { orbite: 0, heure: 0.25 }, false).heure, 0.15);
    assert.equal(placeApresPas(2, 11.75, { orbite: 0, heure: 0.25 }, false).heure, 0);
    assert.equal(placeApresPas(2, 0, { orbite: 0, heure: -0.25 }, false).heure, 11.75);
    assert.equal(placeApresPas(2, 0.1, { orbite: 0, heure: -1 }, false).heure, 11.1);
  });
  it('l\'orbite est bornée à 0 et à 1 000', () => {
    assert.equal(placeApresPas(0.1, 3, { orbite: -1, heure: 0 }, false).orbite, 0);
    assert.equal(placeApresPas(999.9, 3, { orbite: 1, heure: 0 }, false).orbite, 1000);
  });
  it('une lune n\'a pas d\'orbite à bouger', () => {
    assert.deepEqual(placeApresPas(null, 5, { orbite: 1, heure: 1 }, true), { orbite: null, heure: 6 });
    assert.equal(placeApresPas(3, 5, { orbite: 1, heure: 0 }, true).orbite, 3);
  });
  it('trois pas de 0,25 s\'additionnent sans dérive d\'arrondi', () => {
    let p: { orbite: number | null; heure: number } = { orbite: 1.1, heure: 0.1 };
    for (let i = 0; i < 3; i++) p = placeApresPas(p.orbite, p.heure, { orbite: 0.25, heure: 0.25 }, false);
    assert.deepEqual(p, { orbite: 1.85, heure: 0.85 });
  });
});

describe('pasFleche', () => {
  it('0,25 par flèche, ×4 avec Maj, null pour toute autre touche', () => {
    assert.deepEqual(pasFleche('ArrowUp', false), { orbite: 0.25, heure: 0 });
    assert.deepEqual(pasFleche('ArrowDown', true), { orbite: -1, heure: 0 });
    assert.deepEqual(pasFleche('ArrowRight', true), { orbite: 0, heure: 1 });
    assert.deepEqual(pasFleche('ArrowLeft', false), { orbite: 0, heure: -0.25 });
    assert.equal(pasFleche('a', false), null);
    assert.equal(pasFleche('Enter', true), null);
    assert.equal(DELAI_FLECHES_MS, 600);
  });
});
