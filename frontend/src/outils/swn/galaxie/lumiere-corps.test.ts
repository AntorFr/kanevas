// The light of a body (AD-aspects-socle-1, E-23), written from the exit criterion with literal values, not from the code.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catalogueAspects } from '../../../../../src/wasm/coeur.js';
import { angleVersEtoile, cleSprite, eclairages, etoileDe, lumiereDeEtoile, LUMIERE_DEFAUT, poserClasses } from './lumiere-corps.ts';
import type { AstreSysteme } from './types.ts';

const astre = (cle: string, o: Partial<AstreSysteme> = {}): AstreSysteme => ({
  cle, genre: 'planete', parent_cle: null, etoile_rang: 0, type: 'tellurique', nom: cle, orbite: 2, heure: 3, taille: 0.1, ...o,
});
const etoile = (cle: string, rang: number, o: Partial<AstreSysteme> = {}) => astre(cle, { genre: 'etoile', type: 'jaune', orbite: null, etoile_rang: rang, ...o });
const deg = (d: number, r = 100) => ({ x: r * Math.cos((d * Math.PI) / 180), y: r * Math.sin((d * Math.PI) / 180) });

describe('angleVersEtoile', () => {
  const e = { x: 0, y: 0 };
  it('un corps à droite de son étoile reçoit 180, au-dessus 270, à gauche 0, au-dessous 90', () => {
    assert.equal(angleVersEtoile({ x: 100, y: 0 }, e), 180);
    assert.equal(angleVersEtoile({ x: 0, y: -100 }, e), 270);
    assert.equal(angleVersEtoile({ x: -100, y: 0 }, e), 0);
    assert.equal(angleVersEtoile({ x: 0, y: 100 }, e), 90);
  });
  it('sans étoile : null', () => {
    assert.equal(angleVersEtoile({ x: 1, y: 1 }, null), null);
    assert.equal(angleVersEtoile({ x: 1, y: 1 }, undefined), null);
  });
  it('arrondi à 5° et ramené dans [0, 360) : 358 → 0, 2 → 0, 357 → 355', () => {
    // direction (screen, y up) toward the star d° = d ; the engine's angle is the star's direction
    const depuis = (d: number) => { const p = deg(d + 180); return angleVersEtoile({ x: p.x, y: -p.y }, e); };
    // body placed so the direction body→star is d (y up)
    assert.equal(depuis(358), 0);
    assert.equal(depuis(2), 0);
    assert.equal(depuis(357), 355);
    assert.equal(depuis(2.4), 0);
    assert.equal(depuis(2.6), 5);
    assert.equal(depuis(177), 175);
    for (const d of [0, 1, 90, 179, 359, 359.9]) { const a = depuis(d)!; assert.ok(a >= 0 && a < 360 && a % 5 === 0, String(d)); }
  });
  it('ne dépend pas du zoom (même direction, distances 1 et 1000)', () => {
    assert.equal(angleVersEtoile({ x: 3, y: -4 }, { x: 0, y: 0 }), angleVersEtoile({ x: 3000, y: -4000 }, { x: 0, y: 0 }));
  });
  it('un corps sur son étoile : null, jamais NaN', () => {
    assert.equal(angleVersEtoile({ x: 5, y: 5 }, { x: 5, y: 5 }), null);
    assert.equal(angleVersEtoile({ x: NaN, y: 0 }, { x: 0, y: 0 }), null);
  });
});

describe('lumiereDeEtoile', () => {
  it('la couleur posée de l’étoile', async () => {
    assert.equal(lumiereDeEtoile(etoile('s', 0, { aspect: { couleur: '#ffd27a' } })), '#ffd27a');
    assert.equal(lumiereDeEtoile(etoile('s', 0, { aspect: { couleur: '#FFD27A' } })), '#ffd27a');
  });
  it('la couleur posée du système l’emporte', () => {
    assert.equal(lumiereDeEtoile(etoile('s', 0, { aspect: { couleur: '#ffd27a' } }), '#112233'), '#112233');
  });
  it('sans couleur posée : la couleur de sa classe lue du cœur ; une posée invalide est ignorée', async () => {
    poserClasses(await catalogueAspects());
    const cat = JSON.parse(await catalogueAspects()) as { types: Record<string, { palette: string[] }> };
    for (const t of ['jaune', 'geante_rouge', 'naine_blanche']) {
      const l = lumiereDeEtoile(etoile('s', 0, { type: t }));
      assert.match(l, /^#[0-9a-f]{6}$/);
      assert.ok(cat.types[t]!.palette.map((c) => c.toLowerCase()).includes(l), t);
    }
    assert.notEqual(lumiereDeEtoile(etoile('s', 0, { type: 'geante_rouge' })), lumiereDeEtoile(etoile('s', 0, { type: 'geante_bleue' })));
    assert.equal(lumiereDeEtoile(etoile('s', 0, { type: 'jaune', aspect: { couleur: 'rouge' } })), lumiereDeEtoile(etoile('s', 0, { type: 'jaune' })));
  });
  it('sans l’une ni l’autre : #fff4e0', async () => {
    poserClasses(await catalogueAspects());
    assert.equal(lumiereDeEtoile(etoile('s', 0, { type: 'inconnu' })), '#fff4e0');
    assert.equal(lumiereDeEtoile(null), '#fff4e0');
    assert.equal(LUMIERE_DEFAUT, '#fff4e0');
  });
});

describe('etoileDe et eclairages', () => {
  const s0 = etoile('s0', 0), s1 = etoile('s1', 1, { aspect: { couleur: '#ffd27a' } });
  const p0 = astre('p0', { etoile_rang: 0 }), p1 = astre('p1', { etoile_rang: 1 });
  const l0 = astre('l0', { genre: 'lune', parent_cle: 'p0', etoile_rang: 0 });
  const l1 = astre('l1', { genre: 'lune', parent_cle: 'p1', etoile_rang: 1 });
  const tous = [s0, s1, p0, p1, l0, l1];
  it('une planète a l’étoile de son rang, une lune celle de sa planète, une étoile aucune', () => {
    assert.equal(etoileDe(p0, tous)?.cle, 's0');
    assert.equal(etoileDe(p1, tous)?.cle, 's1');
    assert.equal(etoileDe(l1, tous)?.cle, 's1');
    assert.equal(etoileDe(s0, tous), null);
  });
  it('une lune sans planète, ou sans étoile dans le système : null', () => {
    assert.equal(etoileDe(astre('o', { genre: 'lune', parent_cle: null }), tous), null);
    assert.equal(etoileDe(p0, [p0]), null);
  });
  it('une planète à gauche de chaque étoile reçoit 0 et la lumière de SON étoile', () => {
    const c = [
      { cle: 's0', astre: s0, x: 0, y: 0 }, { cle: 'p0', astre: p0, x: -50, y: 0 },
      { cle: 's1', astre: s1, x: 500, y: 0 }, { cle: 'p1', astre: p1, x: 450, y: 0 },
    ];
    const m = eclairages(c);
    assert.equal(m.get('p0')?.angle, 0);
    assert.equal(m.get('p1')?.angle, 0);
    assert.equal(m.get('p1')?.lumiere, '#ffd27a');
    assert.notEqual(m.get('p0')?.lumiere, '#ffd27a');
    assert.equal(m.has('s0'), false);
  });
  it('la clé du sprite change avec l’angle et la lumière', () => {
    assert.equal(cleSprite('p', undefined), 'p');
    assert.notEqual(cleSprite('p', { angle: 0, lumiere: '#fff4e0' }), cleSprite('p', { angle: 5, lumiere: '#fff4e0' }));
    assert.notEqual(cleSprite('p', { angle: 0, lumiere: '#fff4e0' }), cleSprite('p', { angle: 0, lumiere: '#ffd27a' }));
  });
});
