// Revérification de `kanevas-niveau-local` (écart B3 rouvert) : deux tests de même titre sous des describe
// différents ; `node scripts/rejouer-tests.mjs "X > même titre"` ne joue que celui de X.
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

const EN = "import assert from 'node:assert/strict';\nimport { describe, test } from 'node:test';\n";
const m = (nom: string, ok = true) => `console.log('EXECUTE:${nom}');${ok ? '' : " assert.fail('rouge');"}`;
function depot(fichiers: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'rejeu-meme-titre-'));
  jetables.push(d);
  cpSync(join(RACINE, 'scripts'), join(d, 'scripts'), { recursive: true });
  symlinkSync(join(RACINE, 'node_modules'), join(d, 'node_modules'));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ type: 'module' }));
  mkdirSync(join(d, 'frontend/src'), { recursive: true });
  for (const [f, c] of Object.entries(fichiers)) {
    mkdirSync(join(d, f, '..'), { recursive: true });
    writeFileSync(join(d, f), c);
  }
  return d;
}
const rejoue = (d: string, ...noms: string[]) => {
  const env = { ...process.env, NODE_OPTIONS: '' };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['scripts/rejouer-tests.mjs', ...noms], { cwd: d, encoding: 'utf8', env });
};
const executes = (s: string): string[] => [...s.matchAll(/^(?:# )?EXECUTE:(.*)$/gm)].map((x) => x[1]).sort();

describe('rejeu : même titre sous des describe différents', () => {
  const deux = `${EN}describe('X', () => { test('même titre', () => { ${m('X')} }); });\ndescribe('Y', () => { test('même titre', () => { ${m('Y', false)} }); });`;

  test('nommer le second describe ne joue que lui', () => {
    const r = rejoue(depot({ 'src/d.test.ts': deux }), 'Y > même titre');
    assert.deepEqual(executes(r.stdout), ['Y']);
    assert.notEqual(r.status, 0);
  });

  test('nommer les deux chemins joue les deux, et eux seuls', () => {
    const d = `${EN}describe('X', () => { test('même titre', () => { ${m('X')} }); test('autre', () => { ${m('X-autre')} }); });\ndescribe('Y', () => { test('même titre', () => { ${m('Y')} }); });`;
    const r = rejoue(depot({ 'src/d.test.ts': d }), 'X > même titre', 'Y > même titre');
    assert.deepEqual(executes(r.stdout), ['X', 'Y']);
    assert.equal(r.status, 0, r.stdout);
  });

  test('describe imbriqués : le chemin complet désigne un seul test', () => {
    const d = `${EN}describe('X', () => { describe('a', () => { test('même titre', () => { ${m('X-a')} }); }); describe('b', () => { test('même titre', () => { ${m('X-b', false)} }); }); });`;
    const r = rejoue(depot({ 'src/d.test.ts': d }), 'X > a > même titre');
    assert.deepEqual(executes(r.stdout), ['X-a']);
    assert.equal(r.status, 0, r.stdout);
  });

  test('même titre dans deux fichiers : le test nommé par son describe est seul joué', () => {
    const r = rejoue(depot({
      'src/a.test.ts': `${EN}describe('X', () => { test('même titre', () => { ${m('fa-X')} }); });`,
      'src/b.test.ts': `${EN}describe('Y', () => { test('même titre', () => { ${m('fb-Y', false)} }); });`,
    }), 'X > même titre');
    assert.deepEqual(executes(r.stdout), ['fa-X']);
    assert.equal(r.status, 0, r.stdout);
  });

  test('un describe dont le nom finit comme celui nommé ne est pas joué (AX vs X)', () => {
    const d = `${EN}describe('AX', () => { test('même titre', () => { ${m('AX', false)} }); });\ndescribe('X', () => { test('même titre', () => { ${m('X')} }); });`;
    const r = rejoue(depot({ 'src/d.test.ts': d }), 'X > même titre');
    assert.deepEqual(executes(r.stdout), ['X']);
    assert.equal(r.status, 0, r.stdout);
  });
});
