import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

// @ts-expect-error plain .mjs without types
import { choisirTestsEcran, ecransDe, ecransDeclares } from '../../scripts/niveaux-tests.mjs';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const e2e = readdirSync('src/e2e').filter((n) => n.endsWith('.test.ts')).map((n) => `src/e2e/${n}`);
const lire = (f: string) => readFileSync(f, 'utf8');

test('every « // ecrans: » line of a screen test names registered screens only', () => {
  const connus = ecransDe(tracked);
  assert.ok(connus.size > 0);
  for (const f of e2e) assert.doesNotThrow(() => ecransDeclares(lire(f), connus, f), f);
});

test('an unknown screen name in a declaration is an error', () => {
  const connus = ecransDe(tracked);
  assert.throws(() => ecransDeclares('// ecrans: fiche, inconnu\nx', connus, 'a.test.ts'), /unknown screen/);
});

test('a change to one declared page plays fewer screen tests than the whole of src/e2e', () => {
  const choisis = choisirTestsEcran(['frontend/src/ecrans/membres.tsx'], tracked, lire);
  assert.ok(choisis.length > 0);
  assert.ok(choisis.length < e2e.length, `${choisis.length} of ${e2e.length}`);
});
