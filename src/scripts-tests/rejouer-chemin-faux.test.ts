// Revue de `kanevas-niveau-local-declaration` : un nom qualifié dont le chemin describe n'existe pas
// ne désigne aucun test ; le rejeu doit sortir non nul au lieu de ne rien jouer et réussir.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const jetables: string[] = [];
after(() => { for (const d of jetables) rmSync(d, { recursive: true, force: true }); });

function depot(): string {
  const d = mkdtempSync(join(tmpdir(), 'rejeu-chemin-'));
  jetables.push(d);
  cpSync(join(RACINE, 'scripts'), join(d, 'scripts'), { recursive: true });
  symlinkSync(join(RACINE, 'node_modules'), join(d, 'node_modules'));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ type: 'module' }));
  mkdirSync(join(d, 'src'), { recursive: true });
  mkdirSync(join(d, 'frontend/src'), { recursive: true });
  writeFileSync(join(d, 'src/a.test.ts'),
    "import { describe, test } from 'node:test';\ndescribe('X', () => { test('un titre', () => { console.log('EXECUTE:ok'); }); });\n");
  return d;
}
const rejoue = (d: string, nom: string) => {
  const env = { ...process.env, NODE_OPTIONS: '' };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', nom], { cwd: d, encoding: 'utf8', env });
};

describe('rejeu : chemin describe inexistant', () => {
  test('un titre qui existe sous un autre describe : sortie non nulle, rien joué', () => {
    const r = rejoue(depot(), 'Z > un titre');
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.ok(!/EXECUTE:ok/.test(r.stdout));
  });
  test('le bon chemin est joué, sortie 0', () => {
    const r = rejoue(depot(), 'X > un titre');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /EXECUTE:ok/);
  });
});
