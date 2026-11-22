// Node layer of the `rendu` proof (AD-carte-1, B-87): `dessiner` through chargerModule('coeur') draws the same bytes at each call,
// refuses without crashing, and the page of the browser test draws the same bytes (src/e2e/wasm-navigateur.test.ts).
// Needs `npm run build:wasm` (rust/pkg).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { catalogueAspects, dessiner, versionRendu } from './coeur.js';

const couleurs = (o: Uint8Array) => new Set(Array.from({ length: o.length / 4 }, (_, i) => o.subarray(i * 4, i * 4 + 4).join(','))).size;

test('the same aspect, side and version give the same bytes; a changed palette gives other bytes', async () => {
  const v = await versionRendu();
  assert.ok(Number.isInteger(v) && v >= 1);
  const a = await dessiner('{"type":"tellurique"}', 64, v);
  assert.equal(a.length, 64 * 64 * 4);
  assert.deepEqual(await dessiner('{"type":"tellurique"}', 64, v), a);
  const autre = await dessiner('{"type":"tellurique","aspect":{"palette":["#ff0000","#00ff00"]}}', 64, v);
  assert.notDeepEqual(autre, a);
});

test('every type of the default catalogue draws more than one colour', async () => {
  const v = await versionRendu();
  const cat = JSON.parse(await catalogueAspects());
  const types = Object.keys(cat.types);
  assert.ok(types.length >= 21);
  for (const t of types) assert.ok(couleurs(await dessiner(JSON.stringify({ type: t }), 64, v)) > 1, t);
});

test('an unknown type, a side of 8 or 2049, an unknown version and a broken aspect are refused, not crashed', async () => {
  const v = await versionRendu();
  await assert.rejects(dessiner('{"type":"licorne"}', 64, v));
  await assert.rejects(dessiner('{"type":"tellurique"}', 8, v));
  await assert.rejects(dessiner('{"type":"tellurique"}', 2049, v));
  await assert.rejects(dessiner('{"type":"tellurique"}', 64, v + 1));
  await assert.rejects(dessiner('pas du json', 64, v));
  // the module still answers after the refusals
  assert.equal((await dessiner('{"type":"tellurique"}', 16, v)).length, 16 * 16 * 4);
});

test('after the build, dessiner works from dist/ alone (compiled binding, dist/wasm) and gives the bytes of the working tree', async () => {
  assert.ok(existsSync(join(process.cwd(), 'dist/wasm/coeur/coeur_bg.wasm')), 'run `npm run build:wasm && npm run build`');
  const v = await versionRendu();
  const attendu = Buffer.from(await dessiner('{"type":"lave"}', 32, v)).toString('hex');
  const dist = join(process.cwd(), 'dist');
  const r = spawnSync(
    process.execPath,
    ['-e', `import('${pathToFileURL(join(dist, 'wasm/coeur.js')).href}').then(async (m) => { process.stdout.write(Buffer.from(await m.dessiner('{"type":"lave"}', 32, ${v})).toString('hex')); })`],
    { cwd: dist, env: { ...process.env, WASM_DIR: '' }, encoding: 'utf8', maxBuffer: 1 << 24 },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, attendu);
});
