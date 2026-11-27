import assert from 'node:assert/strict';
import { test } from 'node:test';

// Besoin B-124 (parcours P-27, P-30; écran E-23), écrit depuis le besoin seul, par la porte du cœur (`dessiner`, RGBA) :
// un monde vivant (`tellurique`, `verrouillee`) qui porte `villes` ou `lueur` est plus clair du côté opposé à l'étoile que le même
// monde sans la clé ; `force_lueur` fait varier l'écart dans l'ordre ; le côté éclairé ne change pas.
// Convention de l'appel (docs de l'architecture) : `angle` = direction VERS l'étoile sur l'image, x à droite, y en haut :
// angle=0 l'étoile est à droite (nuit à gauche), angle=180 l'étoile est à gauche (nuit à droite).
const { validerAspectType, dessiner: dessinerCoeur, versionRendu } = await import('./coeur.js');

const COTE = 128;

/** Somme de luminance (R+G+B) des pixels opaques dont la colonne est dans [x0, x1[ — la moitié du disque. */
function lum(img: { l: number; px: Buffer }, x0: number, x1: number): number {
  let s = 0;
  for (let y = 0; y < img.l; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.l + x) * 4;
    if (img.px[o + 3]! > 0) s += img.px[o]! + img.px[o + 1]! + img.px[o + 2]!;
  }
  return s;
}
/** Les octets des colonnes [x0, x1[. */
function colonnes(img: { l: number; px: Buffer }, x0: number, x1: number): string {
  const out: Buffer[] = [];
  for (let y = 0; y < img.l; y++) out.push(img.px.subarray((y * img.l + x0) * 4, (y * img.l + x1) * 4));
  return Buffer.concat(out).toString('hex');
}

async function monde() {
  const v = await versionRendu();
  /** Dessine un corps du type et de l'aspect donnés (graine fixe) à l'angle donné : RGBA du cœur. */
  const dessiner = async (type: string, aspect: Record<string, unknown>, angle: number) =>
    ({ l: COTE, px: Buffer.from(await dessinerCoeur(JSON.stringify({ type, aspect: { graine: 4242, ...aspect } }), COTE, v, angle)) });
  return { dessiner };
}
const MOITIE = COTE / 2;
// Colonnes bien dans la nuit (gauche) et bien dans le jour (droite) pour angle=0, hors bande du terminateur.
const NUIT = [0, MOITIE - 20] as const;
const JOUR = [MOITIE + 20, COTE] as const;

for (const type of ['tellurique', 'verrouillee']) {
  for (const cle of ['villes', 'lueur']) {
    test(`B-124 nominal : un ${type} qui porte ${cle} est plus clair côté nuit que sans la clé, et le côté éclairé garde ses octets`, async () => {
      const w = await monde();
      const sans = await w.dessiner(type, {}, 0);
      const avec = await w.dessiner(type, { [cle]: 1 }, 0);
      assert.ok(lum(avec, ...NUIT) > lum(sans, ...NUIT), `nuit: ${lum(avec, ...NUIT)} <= ${lum(sans, ...NUIT)}`);
      assert.equal(colonnes(avec, ...JOUR), colonnes(sans, ...JOUR));
    }, { timeout: 120_000 });
  }
}

test('B-124 la nuit suit l\'étoile : étoile à gauche (angle 180), c\'est la moitié droite qui s\'éclaire, la gauche garde ses octets', async () => {
  const w = await monde();
  const sans = await w.dessiner('tellurique', {}, 180);
  const avec = await w.dessiner('tellurique', { villes: 1, lueur: 1 }, 180);
  assert.ok(lum(avec, MOITIE + 20, COTE) > lum(sans, MOITIE + 20, COTE));
  assert.equal(colonnes(avec, 0, MOITIE - 20), colonnes(sans, 0, MOITIE - 20));
  // Et la moitié gauche de l'angle 0 n'est plus la nuit : étoile en haut (90), le haut ne bouge pas.
  const s90 = await w.dessiner('tellurique', {}, 90);
  const a90 = await w.dessiner('tellurique', { villes: 1, lueur: 1 }, 90);
  const haut = (i: { l: number; px: Buffer }) => i.px.subarray(0, (MOITIE - 20) * COTE * 4).toString('hex');
  assert.equal(haut(a90), haut(s90));
  const bas = (i: { l: number; px: Buffer }) => i.px.subarray((MOITIE + 20) * COTE * 4).reduce((s, v, k) => (k % 4 === 3 ? s : s + v), 0);
  assert.ok(bas(a90) > bas(s90));
}, { timeout: 120_000 });

test('B-124 force_lueur fait varier l\'écart dans l\'ordre : 0 (rien) < 0,5 < 1 < 2 pour villes comme pour lueur', async () => {
  const w = await monde();
  for (const cle of ['villes', 'lueur']) {
    const sans = await w.dessiner('tellurique', {}, 0);
    const base = lum(sans, ...NUIT);
    const ecart: number[] = [];
    for (const f of [0, 0.5, 1, 2]) ecart.push(lum(await w.dessiner('tellurique', { [cle]: 1, force_lueur: f }, 0), ...NUIT) - base);
    assert.equal(ecart[0], 0, `${cle} force 0`);
    assert.ok(ecart[0]! < ecart[1]! && ecart[1]! < ecart[2]! && ecart[2]! < ecart[3]!, `${cle}: ${ecart.join(' < ')}`);
  }
}, { timeout: 120_000 });

test('B-124 la valeur compte : villes 0,2 éclaire moins que villes 1 ; lueur 0,2 moins que lueur 1 (disque de 256 px, toute la moitié nuit)', async () => {
  const v = await versionRendu();
  const rgba = async (aspect: object) => ({ l: 256, px: Buffer.from(await dessinerCoeur(JSON.stringify({ type: 'tellurique', aspect: { graine: 4242, ...aspect } }), 256, v, 0)) });
  const base = lum(await rgba({}), 0, 128);
  for (const cle of ['villes', 'lueur']) {
    const faible = lum(await rgba({ [cle]: 0.2 }), 0, 128) - base;
    const plein = lum(await rgba({ [cle]: 1 }), 0, 128) - base;
    assert.ok(faible > 0 && faible < plein, `${cle}: ${faible} / ${plein}`);
  }
}, { timeout: 120_000 });

test('B-124 bords neutres : villes 0 et lueur 0 (même avec force_lueur 2), ou force_lueur seule, redonnent exactement les octets du corps sans clé', async () => {
  const w = await monde();
  const ref = (await w.dessiner('tellurique', {}, 0)).px;
  for (const aspect of [{ villes: 0, lueur: 0, force_lueur: 2 }, { force_lueur: 2 }, { villes: 0, lueur: 0 }, { villes: 1, lueur: 1, force_lueur: 0 }]) {
    assert.ok((await w.dessiner('tellurique', aspect, 0)).px.equals(ref), JSON.stringify(aspect));
  }
}, { timeout: 120_000 });

test('B-124 mêmes villes d\'un dessin à l\'autre : deux dessins du même corps donnent les mêmes octets', async () => {
  const w = await monde();
  const a = await w.dessiner('tellurique', { villes: 0.7, lueur: 0.4 }, 0);
  const b = await w.dessiner('tellurique', { villes: 0.7, lueur: 0.4 }, 0);
  assert.ok(a.px.equals(b.px));
  assert.ok(!a.px.equals((await w.dessiner('tellurique', {}, 0)).px), 'les clés ont un effet');
  // force_lueur 2 (le plus fort) ne touche pas non plus le côté éclairé.
  const fort = await w.dessiner('tellurique', { villes: 1, lueur: 1, force_lueur: 2 }, 0);
  assert.equal(colonnes(fort, ...JOUR), colonnes(await w.dessiner('tellurique', {}, 0), ...JOUR));
}, { timeout: 120_000 });

test('B-124 exclusion : un astre d\'un autre genre (rocheux, gazeuse, glace, lave) refuse villes, lueur et force_lueur avec la clé nommée', async () => {
  for (const type of ['rocheux', 'gazeuse', 'glace', 'lave']) {
    for (const cle of ['villes', 'lueur', 'force_lueur']) {
      const v = JSON.parse(await validerAspectType(type, JSON.stringify({ [cle]: 0.5 })));
      assert.equal(v.ok, false, `${type} ${cle}`);
      assert.match(JSON.stringify(v), new RegExp(cle), `${type} ${cle}`);
    }
  }
  for (const type of ['tellurique', 'verrouillee']) {
    for (const cle of ['villes', 'lueur', 'force_lueur']) {
      assert.equal(JSON.parse(await validerAspectType(type, JSON.stringify({ [cle]: 0.5 }))).ok, true, `${type} ${cle}`);
    }
  }
});

test('B-124 bornes : villes et lueur dans [0, 1], force_lueur dans [0, 2] ; juste au-delà refusé', async () => {
  const ok = async (a: object) => JSON.parse(await validerAspectType('tellurique', JSON.stringify(a))).ok;
  for (const a of [{ villes: 0 }, { villes: 1 }, { lueur: 0 }, { lueur: 1 }, { force_lueur: 0 }, { force_lueur: 2 }]) assert.equal(await ok(a), true, JSON.stringify(a));
  for (const a of [{ villes: 1.01 }, { villes: -0.01 }, { lueur: 1.01 }, { lueur: -0.01 }, { force_lueur: 2.01 }, { force_lueur: -0.01 }, { villes: 'beaucoup' }]) assert.equal(await ok(a), false, JSON.stringify(a));
});
