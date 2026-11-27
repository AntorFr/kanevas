// Whole-feature tests of kanevas-carte-rendu-habillage-sorties (B-115): the jump arrow on literal values, the distance
// wording and the route family. Written from the sheet and docs/ecrans.md « Jump points and transition halo ».
// 12 h at the top, clockwise, y down; the cap is the true bearing in radians (12 h = 0); expected values are literals.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { libelleDistance, pointsDeSaut } from './carte-geometrie.ts';
import { typeDeRoute } from './type-route.ts';

const S = (q: number, r: number, heure: number) => ({ q, r, heure });
const proche = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

describe('B-115 la flèche de saut vers le voisin', () => {
  it('nominal : un voisin à 9 h est à gauche du cercle de 100 px, flèche tournée vers la gauche (cap 3π/2)', () => {
    const [p] = pointsDeSaut([S(5, 5, 9)], 100, 16);
    proche(p!.x, -100); proche(p!.y, 0); proche(p!.cap, (3 * Math.PI) / 2);
  });

  it('nominal : 6 h est en bas (y vers le bas), cap π ; 1 h à 50 px est à (25, -43,30…), cap π/6', () => {
    const [b] = pointsDeSaut([S(0, 1, 6)], 100, 16);
    proche(b!.x, 0); proche(b!.y, 100); proche(b!.cap, Math.PI);
    const [u] = pointsDeSaut([S(0, 1, 1)], 50, 16);
    proche(u!.x, 25); proche(u!.y, -43.30127018922193); proche(u!.cap, Math.PI / 6);
  });

  it('bords : une sortie seule garde sa place exacte ; aucune sortie, rien', () => {
    assert.deepEqual(pointsDeSaut([], 100, 16), []);
    const [p] = pointsDeSaut([S(1, 0, 3)], 100, 16);
    proche(p!.x, 100); proche(p!.y, 0);
  });

  it('bords : deux sorties à 3 h et 6 h sur 100 px (157 px d’arc) ne bougent pas', () => {
    const r = pointsDeSaut([S(0, 1, 6), S(1, 0, 3)], 100, 16);
    proche(r[0]!.x, 100); proche(r[0]!.y, 0);
    proche(r[1]!.x, 0); proche(r[1]!.y, 100);
  });

  it('bords : deux sorties à 6 h exactement (même heure) sont écartées de 16 px d’arc, de part et d’autre, caps intacts à π', () => {
    const r = pointsDeSaut([S(0, 1, 6), S(1, 1, 6)], 100, 16);
    const [a, b] = r;
    proche(Math.hypot(a!.x, a!.y), 100); proche(Math.hypot(b!.x, b!.y), 100);
    proche(a!.cap, Math.PI); proche(b!.cap, Math.PI);
    proche(a!.x + b!.x, 0, 1e-9); // symmetrical about 6 h
    const angle = 2 * Math.asin(Math.hypot(a!.x - b!.x, a!.y - b!.y) / 200);
    proche(angle * 100, 16, 1e-6);
  });

  it('exclusion : ne modifie pas la liste reçue', () => {
    const entree = [S(0, 1, 6), S(1, 1, 6)];
    pointsDeSaut(entree, 100, 16);
    assert.deepEqual(entree, [S(0, 1, 6), S(1, 1, 6)]);
  });
});

describe('B-115 la distance en cases', () => {
  it('« 0 cases », « 1 case », « 3 cases », « 12 cases »', () => {
    assert.equal(libelleDistance(0), '0 cases');
    assert.equal(libelleDistance(1), '1 case');
    assert.equal(libelleDistance(3), '3 cases');
    assert.equal(libelleDistance(12), '12 cases');
  });
});

describe('B-115 la couleur de la route suit son type', () => {
  it('Publique / public, Privée / privé, Pirate, casse et accents ignorés', () => {
    for (const t of ['Publique', 'public', 'PUBLIQUE']) assert.equal(typeDeRoute(t), 'public', t);
    for (const t of ['Privée', 'privé', 'PRIVEE', 'Privee']) assert.equal(typeDeRoute(t), 'private', t);
    for (const t of ['Pirate', 'pirate', 'PIRATE']) assert.equal(typeDeRoute(t), 'pirate', t);
  });

  it('échec : sans type, vide ou inconnu (« Contrebande »), la famille est « autre », jamais une erreur', () => {
    for (const t of [null, undefined, '', 'Contrebande', 'convoi', 'pirates', 'publicité']) assert.equal(typeDeRoute(t as string | null), 'autre', String(t));
  });
});
