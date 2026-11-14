// Node layer of the `coeur` module proof (AD-139, AD-etoiles-3, B-87): the fixtures' blocks go through
// chargerModule('coeur') and give the fixtures' stars; the blocks of generation-sortie-coeur.json give the same JSON bytes.
// Needs `npm run build:wasm` (rust/pkg).
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { densiteDefaut, hexVersPlan, planVersHex, tirerBloc } from './coeur.js';

const lire = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../rust/modules/coeur/tests/fixtures/${f}`, import.meta.url)), 'utf8'));
const galaxie = lire('generation-galaxie.json');
const sortie = lire('generation-sortie-coeur.json');

const VOISINS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
function entrees(bx: number, by: number) {
  const exclus = new Set<string>();
  for (const s of galaxie.systemes_definis) {
    if (s.promu) continue;
    exclus.add(`${s.q},${s.r}`);
    for (const [a, b] of VOISINS) exclus.add(`${s.q + a},${s.r + b}`);
  }
  const densites: number[] = [];
  const ex: number[] = [];
  for (let dq = 1; dq <= 3; dq++)
    for (let dr = 1; dr <= 3; dr++) {
      const cle = `${galaxie.bloc * bx + dq},${galaxie.bloc * by + dr}`;
      const basses = galaxie.densites.zones
        .filter((z: any) => z.hexagones.some((h: number[]) => `${h[0]},${h[1]}` === cle))
        .map((z: any) => z.densite);
      densites.push(basses.length ? Math.min(...basses) : galaxie.densites.defaut);
      ex.push(exclus.has(cle) ? 1 : 0);
    }
  return { densites, exclus: ex };
}

test('every block of generation-galaxie.json gives the fixture star through chargerModule("coeur")', async () => {
  assert.ok(galaxie.blocs.length >= 400);
  let avecEtoile = 0;
  for (const b of galaxie.blocs) {
    const e = entrees(b.bx, b.by);
    const obtenu = JSON.parse(await tirerBloc(galaxie.graine, b.bx, b.by, e.densites, e.exclus));
    if (!b.etoile) {
      assert.equal(obtenu, null, `block ${b.bx},${b.by}`);
      continue;
    }
    avecEtoile++;
    assert.ok(obtenu, `block ${b.bx},${b.by}`);
    assert.equal(obtenu.q, b.etoile.q);
    assert.equal(obtenu.r, b.etoile.r);
    assert.equal(obtenu.lettre, b.etoile.lettre);
    for (const k of ['taille', 'x', 'y']) assert.ok(Math.abs(obtenu[k] - b.etoile[k]) <= 1e-9, `${k} ${b.bx},${b.by}`);
  }
  assert.ok(avecEtoile >= 100);
});

test('the blocks of generation-sortie-coeur.json give the very same JSON string, byte for byte', async () => {
  assert.ok(sortie.blocs.length >= 5);
  for (const b of sortie.blocs) {
    assert.equal(await tirerBloc(sortie.graine, b.bx, b.by, b.densites, b.exclus), b.json, `block ${b.bx},${b.by}`);
  }
});

test('the typed calls forward the core: default density, hex <-> plane round trip', async () => {
  assert.equal(await densiteDefaut(), 0.68);
  for (const b of galaxie.blocs) {
    if (!b.etoile) continue;
    const [x, y] = await hexVersPlan(b.etoile.q, b.etoile.r);
    assert.ok(Math.abs(x - b.etoile.x) <= 1e-9 && Math.abs(y - b.etoile.y) <= 1e-9);
    assert.deepEqual(await planVersHex(x, y), [b.etoile.q, b.etoile.r]);
  }
});

test('an excluded candidate never carries a star, densities at 1 give the candidate', async () => {
  const un = new Array(9).fill(1);
  const aucun = new Array(9).fill(0);
  assert.equal(JSON.parse(await tirerBloc('kanevas-neutre-1', 2, 3, aucun, aucun)), null);
  assert.notEqual(JSON.parse(await tirerBloc('kanevas-neutre-1', 2, 3, un, aucun)), null);
  assert.equal(JSON.parse(await tirerBloc('kanevas-neutre-1', 2, 3, un, un)), null);
});

const dossiers: string[] = [];
after(() => dossiers.forEach((d) => rmSync(d, { recursive: true, force: true })));
let n = 0;
async function chargeurAvec(wasmDir: string) {
  process.env.WASM_DIR = wasmDir;
  return (await import(`./charger.js?coeur=${n++}`)) as typeof import('./charger.js');
}

test('the artefact copied like dist/wasm/coeur loads; a missing one fails with the fixed message, no host path', async () => {
  const pkg = fileURLToPath(new URL('../../rust/pkg', import.meta.url));
  const initial = process.env.WASM_DIR;
  try {
    const plein = mkdtempSync(join(tmpdir(), 'kanevas-coeur-'));
    dossiers.push(plein);
    cpSync(join(pkg, 'coeur'), join(plein, 'coeur'), { recursive: true });
    const { chargerModule } = await chargeurAvec(plein);
    const m = await chargerModule<{ densite_defaut(): number }>('coeur');
    assert.equal(m.densite_defaut(), 0.68);

    const vide = mkdtempSync(join(tmpdir(), 'kanevas-coeur-'));
    dossiers.push(vide);
    const c2 = await chargeurAvec(vide);
    await assert.rejects(c2.chargerModule('coeur'), (e: Error) => {
      assert.equal(e.message, 'Wasm module "coeur" is missing or unreadable.');
      assert.ok(!e.message.includes(vide) && !e.message.includes(pkg));
      return true;
    });
  } finally {
    if (initial === undefined) delete process.env.WASM_DIR;
    else process.env.WASM_DIR = initial;
  }
});
