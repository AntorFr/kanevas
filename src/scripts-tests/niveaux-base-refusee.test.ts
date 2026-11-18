// `tests:ecrans` and `tests:fiche` refuse a missing or unknown {base} with a non-zero exit and a clear
// message, before building or playing anything (no resultats.tap is written).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../../', import.meta.url));
const jouer = (...args: string[]) => spawnSync(process.execPath, ['scripts/tests-attestes.mjs', ...args], { cwd: racine, encoding: 'utf8' });
const tap = () => (existsSync(`${racine}resultats.tap`) ? statSync(`${racine}resultats.tap`).mtimeMs : 0);

describe('niveaux ecrans et fiche : base refusée', () => {
  for (const niveau of ['ecrans', 'fiche']) {
    test(`--${niveau} sans base sort en 2 et le dit`, () => {
      const avant = tap();
      const r = jouer(`--${niveau}`);
      assert.equal(r.status, 2);
      assert.match(r.stderr, new RegExp(`--${niveau} expects a base commit`));
      assert.equal(tap(), avant);
    });
    test(`--${niveau} suivi d'une option n'est pas une base`, () => {
      const r = jouer(`--${niveau}`, '--concurrence', '1');
      assert.equal(r.status, 2);
      assert.match(r.stderr, /expects a base commit/);
    });
    test(`--${niveau} avec une base inconnue sort en 2 et nomme la base`, () => {
      const avant = tap();
      const r = jouer(`--${niveau}`, 'pas-un-commit-0123');
      assert.equal(r.status, 2);
      assert.match(r.stderr, /Unknown base « pas-un-commit-0123 »/);
      assert.equal(tap(), avant);
    });
  }
  test('--ecrans et --local ensemble sont refusés', () => {
    const r = jouer('--local', '--ecrans', 'HEAD');
    assert.equal(r.status, 2);
  });
});
