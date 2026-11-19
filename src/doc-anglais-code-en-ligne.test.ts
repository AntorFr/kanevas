// Feature rouge-kanevas-outils-2: the doc-language test treats inline code like code blocks.
// Black box: the test file src/doc-anglais.test.ts is run on a throw-away tree (README, ARCHITECTURE,
// docs/, .agent/) holding the doc under test; its verdict for that doc is the exit code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// A nested run must not inherit the parent runner's context.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST')));

/** Verdict (true = green) of the « ARCHITECTURE.md: no French word … » test on an ARCHITECTURE.md with this content. */
function verdict(doc: string, file = 'ARCHITECTURE.md'): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'doc-anglais-'));
  try {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'docs')); mkdirSync(join(dir, '.agent'));
    cpSync(join(root, 'src/doc-anglais.test.ts'), join(dir, 'src/doc-anglais.test.ts'));
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    for (const f of ['README.md', 'ARCHITECTURE.md', 'docs/a.md']) writeFileSync(join(dir, f), 'Plain English.\n');
    writeFileSync(join(dir, '.agent/a.md'), 'Le chat est ici pour une raison.\n');
    writeFileSync(join(dir, file), doc);
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--test',
      `--test-name-pattern=^${file.replace('.', '\\.')}: no French word`, 'src/doc-anglais.test.ts'],
    { cwd: dir, encoding: 'utf8', timeout: 100000, env });
    if (r.error) throw r.error;
    assert.ok(/(# |ℹ )tests 1\b/.test(r.stdout + r.stderr), `exactly one test ran: ${r.stdout.slice(-400)}`);
    return r.status === 0;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a French interface string cited in inline code is not a French word (line V-9)', () => {
  assert.equal(verdict("The assistant returns `{ ok: false, erreur: 'Précisez une conception, ou une coque et des choix.' }` verbatim.\n"), true);
});

test('inline code is exempt in README.md and docs/*.md too', () => {
  assert.equal(verdict('Use `le code est dans la boîte`.\n', 'README.md'), true);
  assert.equal(verdict('Use `le code est dans la boîte`.\n', 'docs/a.md'), true);
});

test('two inline code spans and a double-backtick span holding a backtick are exempt', () => {
  assert.equal(verdict('Both `une phrase` and `pour des` are strings, and ``dans la `liste` `` too.\n'), true);
});

test('French prose outside any code still fails', () => {
  assert.equal(verdict('Voici une phrase pour tester.\n'), false);
});

test('French prose between or after inline code spans still fails', () => {
  assert.equal(verdict('`code` une `autre`\n'), false);
  assert.equal(verdict('Use `x` and then la suite.\n'), false);
});

test('an inline code span never closes on another line: French after the stray backtick still fails', () => {
  assert.equal(verdict('Open `une phrase\nclose` here\n'), false);
});

test('a backtick run closed by a run of another length does not exempt the text', () => {
  assert.equal(verdict('Use ``une phrase` here\n'), false);
});

test('quotations and fenced code blocks stay exempt', () => {
  assert.equal(verdict('The title is « le titre est dans la liste ».\n\n```\nle code est dans la boîte\n```\n'), true);
});

test('French in a heading, list item or table cell outside code fails', () => {
  assert.equal(verdict('# Une section\n'), false);
  assert.equal(verdict('- pour `x`\n'), false);
  assert.equal(verdict('| a | est |\n'), false);
});
