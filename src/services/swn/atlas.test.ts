import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Exit criterion of kanevas-carte-spatiale-atlas-format (AD-atlas-2, AD-atlas-3): the invented test atlas is read
// without refusal; one variant per refusal reason lands at the right path; every defect of one body is returned.
process.env.NODE_ENV = 'test';
const { lireAtlas, MAX_REFUS_ATLAS } = await import('./atlas.js');

const FICHIER = fileURLToPath(new URL('../../outils/swn/exemples/atlas-essai.json', import.meta.url));
const base = () => JSON.parse(readFileSync(FICHIER, 'utf8'));

function refus(mod: (a: any) => void) {
  const a = base();
  mod(a);
  const r = lireAtlas(a);
  assert.equal(r.ok, false);
  return r.ok ? [] : r.refus;
}
const chemins = (r: { chemin: string }[]) => r.map((x) => x.chemin);

test("l'atlas d'essai est lu sans refus et rend ses éléments normalisés", () => {
  const r = lireAtlas(base());
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.atlas.transition, 14.5);
  assert.equal(r.atlas.etoiles.length, 1);
  assert.deepEqual([r.atlas.etoiles[0].rang, r.atlas.etoiles[0].orbite, r.atlas.etoiles[0].heure], [0, 0, 0]);
  assert.equal(r.atlas.corps.length, 2);
  assert.equal(r.atlas.corps[0].etoile, 'soleil-essai');
  assert.equal(r.atlas.corps[1].etoile, 'soleil-essai');
  assert.equal(r.atlas.corps[0].lunes.length, 1);
  assert.equal(r.atlas.corps[0].lunes[0].cle, 'lune-un');
  assert.equal(r.atlas.corps[1].fiche, 'fiche-essai');
  assert.equal(r.atlas.zones[0].forme, 'anneau');
  assert.equal(r.atlas.points[0].cle, 'comete-essai');
  assert.ok(r.atlas.corps[0].aspect);
});

test("le fichier d'essai ne porte aucun nom d'Éneria (AD-131)", () => {
  assert.doesNotMatch(readFileSync(FICHIER, 'utf8'), /[ée]neria/i);
});

test('clé inconnue, au bon chemin', () => {
  assert.ok(chemins(refus((a) => { a.corps[0].lunes[0].bidule = 1; })).includes('corps[0].lunes[0].bidule'));
  assert.ok(chemins(refus((a) => { a.truc = 1; })).includes('truc'));
});

test('clé en double entre une lune et une comète', () => {
  const r = refus((a) => { a.points[0].cle = 'lune-un'; });
  assert.deepEqual(chemins(r), ['points[0].cle']);
});

test('heure à 12', () => {
  assert.deepEqual(chemins(refus((a) => { a.corps[0].heure = 12; })), ['corps[0].heure']);
});

test('orbite négative', () => {
  assert.deepEqual(chemins(refus((a) => { a.corps[0].lunes[0].orbite = -1; })), ['corps[0].lunes[0].orbite']);
});

test('trop de corps', () => {
  const r = refus((a) => {
    a.corps = Array.from({ length: 81 }, (_, i) => ({ cle: `c-${i}`, type: 'tellurique', orbite: 1, heure: 1, taille: 1 }));
  });
  assert.ok(chemins(r).includes('corps'));
});

test('trop de lunes, d\'étoiles, de zones, de points', () => {
  const lune = (i: number) => ({ cle: `m-${i}`, type: 'rocheux', orbite: 1, heure: 1, taille: 1 });
  assert.ok(chemins(refus((a) => { a.corps[0].lunes = Array.from({ length: 25 }, (_, i) => lune(i)); })).includes('corps[0].lunes'));
  assert.ok(chemins(refus((a) => { a.etoiles = Array.from({ length: 9 }, (_, i) => ({ cle: `e-${i}`, type: 'orange', taille: 1, rang: i })); })).includes('etoiles'));
  assert.ok(chemins(refus((a) => { a.zones = Array.from({ length: 41 }, (_, i) => ({ cle: `z-${i}`, forme: 'anneau', parametres: { de: 1, a: 2 } })); })).includes('zones'));
  assert.ok(chemins(refus((a) => { a.points = Array.from({ length: 41 }, (_, i) => ({ ...lune(i), cle: `p-${i}`, type: 'comete' })); })).includes('points'));
});

test('aspect hors borne', () => {
  const r = refus((a) => { a.corps[0].aspect = { mer: 7 }; });
  assert.deepEqual(chemins(r), ['corps[0].aspect']);
});

test('type inconnu', () => {
  assert.deepEqual(chemins(refus((a) => { a.corps[1].type = 'machin'; })), ['corps[1].type']);
});

test('forme inconnue', () => {
  assert.deepEqual(chemins(refus((a) => { a.zones[0].forme = 'cube'; })), ['zones[0].forme']);
});

test('anneau dont de >= a', () => {
  assert.deepEqual(chemins(refus((a) => { a.zones[0].parametres = { de: 7, a: 6 }; })), ['zones[0].parametres']);
  assert.deepEqual(chemins(refus((a) => { a.zones[0].parametres = { de: 6, a: 6 }; })), ['zones[0].parametres']);
});

test('étoile inconnue', () => {
  assert.deepEqual(chemins(refus((a) => { a.corps[1].etoile = 'nulle-part'; })), ['corps[1].etoile']);
});

test('rang en double', () => {
  const r = refus((a) => { a.etoiles.push({ cle: 'deuxieme', type: 'naine', orbite: 5, heure: 1, taille: 1, rang: 0 }); });
  assert.ok(chemins(r).includes('etoiles[1].rang'), JSON.stringify(r));
});

test('plusieurs défauts dans un même corps sont tous rendus', () => {
  const r = refus((a) => {
    Object.assign(a.corps[0], { heure: 12, orbite: -2, taille: 0, type: 'machin', description: 'x'.repeat(2001), bidule: 1 });
  });
  for (const c of ['heure', 'orbite', 'taille', 'type', 'description', 'bidule']) assert.ok(chemins(r).includes(`corps[0].${c}`), c);
  assert.ok(r.every((x) => x.champ && x.raison));
});

test('bornes : orbite requise, taille requise, transition, description', () => {
  assert.ok(chemins(refus((a) => { delete a.corps[0].orbite; })).includes('corps[0].orbite'));
  assert.ok(chemins(refus((a) => { delete a.corps[0].taille; })).includes('corps[0].taille'));
  assert.ok(chemins(refus((a) => { a.transition = -1; })).includes('transition'));
  assert.ok(lireAtlas({ ...base(), transition: null }).ok);
  assert.ok(chemins(refus((a) => { a.corps[0].orbite = '3'; })).includes('corps[0].orbite'));
  assert.ok(chemins(refus((a) => { a.corps[0].orbite = null; })).includes('corps[0].orbite'));
  assert.ok(chemins(refus((a) => { a.corps[0].cle = 'Majuscule'; })).includes('corps[0].cle'));
  assert.ok(chemins(refus((a) => { a.corps[0].heure = 'NaN'; })).includes('corps[0].heure'));
});

test('corps non objet, entrées fausses', () => {
  for (const x of [null, [], 'a', 3]) {
    const r = lireAtlas(x);
    assert.equal(r.ok, false);
  }
  assert.ok(chemins(refus((a) => { a.corps = [null, 3]; })).includes('corps[0]'));
  assert.ok(chemins(refus((a) => { a.corps = 'x'; })).includes('corps'));
});

test('corps sans étoile principale refusés', () => {
  assert.ok(chemins(refus((a) => { a.etoiles = []; })).includes('etoiles'));
});

test('étoile principale : orbite et heure par défaut, compagnon : requis', () => {
  const r = refus((a) => { a.etoiles.push({ cle: 'comp', type: 'naine', taille: 1, rang: 1 }); });
  assert.ok(chemins(r).includes('etoiles[1].orbite') && chemins(r).includes('etoiles[1].heure'));
});

test('1 000 refus gardés, le total compté', () => {
  const a = base();
  a.corps = Array.from({ length: 80 }, (_, i) => ({ cle: `c-${i}`, type: 'x', orbite: -1, heure: 99, taille: -1, a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 1, k: 1 }));
  const r = lireAtlas(a);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.refus.length, Math.min(MAX_REFUS_ATLAS, r.refusTotal));
  assert.equal(r.refusTotal, 80 * 15);
  const b = base();
  b.corps = Array.from({ length: 80 }, (_, i) => ({ cle: `c-${i}`, type: 'x', orbite: -1, heure: 99, taille: -1, lunes: Array.from({ length: 24 }, () => ({ cle: 'Z' })) }));
  const r2 = lireAtlas(b);
  if (r2.ok) assert.fail();
  else { assert.equal(r2.refus.length, MAX_REFUS_ATLAS); assert.ok(r2.refusTotal > MAX_REFUS_ATLAS); }
});

test('lireAtlas ne modifie pas son entrée', () => {
  const a = base();
  const copie = JSON.stringify(a);
  lireAtlas(a);
  assert.equal(JSON.stringify(a), copie);
});
