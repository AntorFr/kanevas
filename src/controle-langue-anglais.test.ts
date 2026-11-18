import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Need: the language check's own CLI is English (CLAUDE.md: new text is English).
const SCRIPT = resolve('scripts/controle-langue.mjs');
const OLD_OPTIONS = ['--titres', '--liens', '--attendu'];

test('the README documents the English options and none of the old French ones', () => {
  const readme = readFileSync(resolve('README.md'), 'utf8');
  for (const o of ['--headings', '--links', '--expected', '--releases', '--sections', '--base']) {
    assert.ok(readme.includes(o), `README lacks ${o}`);
  }
  for (const o of OLD_OPTIONS) assert.ok(!readme.includes(o), `README still has ${o}`);
  assert.ok(!/tag:titres=|titres=\d|puces=\d|liens=\d/.test(readme), 'README still has the French --expected format');
  assert.ok(readme.includes('tag:headings=n,bullets=n,links=n'));
});

test('the script source carries no French option name or French counts key', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  for (const o of OLD_OPTIONS) assert.ok(!src.includes(o), `script still has ${o}`);
  assert.ok(!/\b(titres|puces|liens)\b\s*[:=]/.test(src.replace(/«[^»]*»/g, '')), 'French key in script');
});

test('the English options are accepted and the old ones refused with an English message', () => {
  const ok = spawnSync('node', [SCRIPT, '--headings', 'README.md'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.ok(Array.isArray(JSON.parse(ok.stdout).files[0].sections));
  for (const o of OLD_OPTIONS) {
    const r = spawnSync('node', [SCRIPT, o, 'README.md'], { encoding: 'utf8' });
    assert.equal(r.status, 2, o);
    assert.match(r.stderr, /Unknown option/, o);
    assert.ok(!/inconnu|option\s+inconnue|invalide/i.test(r.stderr), o);
  }
});
