import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Contract of « two galaxies of the same seed »: the generated systems of both are the same, apart from the
// positions defined or hidden in one of them. A defined or hidden position never moves another star.
process.env.NODE_ENV = 'test';
delete process.env.KANEVAS_STUB;
const { migrate, openDb } = await import('../../db/db.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { viderCacheBlocs } = await import('./cache-blocs.js');
const { lireBlocs } = await import('./lecture-carte.js');
const { creerGalaxie, changerGraine } = await import('./galaxies.js');
const { placerSysteme } = await import('./ecriture-carte.js');
const { masquerSysteme } = await import('./ecriture-systeme.js');

const FS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rust/modules/coeur/tests/fixtures/generation-systemes.json', import.meta.url)), 'utf8'));
const R0 = { bx: -11, by: -11 }, R1 = { bx: -7, by: -7 };

test('deux galaxies de même graine rendent les mêmes systèmes générés, hors positions définies ou masquées', () => {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(semerBouchon(db), true);
  viderCacheBlocs();
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];
  const univers = q('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai")[0].id as number;
  const mj = { compteId: q('SELECT id FROM comptes WHERE username=?', 'antor')[0].id as number };
  const ids = [creerGalaxie(db, mj, univers, { titre: 'A' }).id, creerGalaxie(db, mj, univers, { titre: 'B' }).id];
  for (const id of ids) {
    changerGraine(db, mj, univers, id, { graine: FS.graine, version: q('SELECT version FROM swn_galaxies WHERE id=?', id)[0].version, confirme: true });
  }
  const [a, b] = ids;
  const generes = (g: number) => lireBlocs(db, mj, univers, g, R0, R1).blocs.flatMap((bl) => bl.generes.map(([x, y]) => `${x},${y}`));
  const vierge = generes(a);
  assert.deepEqual(generes(b), vierge, 'sans rien définir, identiques');
  assert.ok(vierge.length > 10);

  // In B only: hide drawn systems (anchored, promoted) and place systems by hand on empty hexagons.
  const tires = vierge.map((s) => s.split(',').map(Number) as [number, number]);
  const occupes = new Set<string>();
  for (const [x, y] of tires.slice(0, 3)) {
    masquerSysteme(db, mj, univers, b, x, y, { secret: true, versionSysteme: q('SELECT version FROM swn_galaxies WHERE id=?', b)[0].version } as any);
    occupes.add(`${x},${y}`);
  }
  const pris = new Set(vierge);
  const libres: [number, number][] = [];
  for (let x = R0.bx * 5; x < (R1.bx + 1) * 5 && libres.length < 6; x += 3) {
    for (let y = R0.by * 5; y < (R1.by + 1) * 5 && libres.length < 6; y += 7) if (!pris.has(`${x},${y}`)) libres.push([x, y]);
  }
  const [vx, vy] = tires[5]!; // a drawn star right next to a hand-placed system
  libres.push([vx + 1, vy]);
  // A defined, non-promoted system also takes the stars within one hexagon (AD-etoiles-2, AD-etoiles-6): they vanish, they never move.
  const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  libres.forEach(([x, y], i) => {
    placerSysteme(db, mj, univers, b, { nom: `Défini ${i}`, q: x, r: y } as any);
    for (const [dq, dr] of DIRS) occupes.add(`${x + dq},${y + dr}`);
  });

  const ecart = (l: string[]) => l.filter((s) => !occupes.has(s));
  assert.ok(occupes.has(`${vx},${vy}`) && generes(b).every((s) => s !== `${vx},${vy}`), 'the neighbour star is gone');
  assert.deepEqual(ecart(generes(b)), ecart(vierge));
  assert.ok(generes(b).every((s) => vierge.includes(s)), 'nothing appears: no star moved');
});
