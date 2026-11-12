// Feature kanevas-outils-doc-anglais: the public doc is English and the published
// Releases are English. Counting is done here, independently of scripts/controle-langue.mjs.
// Nothing here compares the tree to a past commit: product changes stay free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const FRENCH_WORDS = new Set(['le', 'la', 'les', 'des', 'est', 'pour', 'avec', 'une', 'dans']);

const read = (f: string) => readFileSync(resolve(root, f), 'utf8');

const files = ['README.md', 'ARCHITECTURE.md', ...readdirSync(resolve(root, 'docs'))
  .filter((f) => f.endsWith('.md')).sort().map((f) => `docs/${f}`)];

/** Keeps the prose lines of a markdown text, dropping code blocks (fences ``` or ~~~). */
function proseOf(text: string) {
  const prose: string[] = [];
  let fence = '';
  for (const l of text.split(/\r?\n/)) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (!fence && m) { fence = m[1]; continue; }
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !m[2].trim()) fence = '';
      continue;
    }
    prose.push(withoutInlineCode(l));
  }
  return prose.join('\n');
}

/** Blanks inline code spans: a run of backticks closed by a run of the same length; an unclosed one stays text. */
function withoutInlineCode(line: string) {
  const runs = [...line.matchAll(/`+/g)];
  let out = '';
  let pos = 0;
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    const close = runs.slice(i + 1).findIndex((r) => r[0].length === open[0].length);
    if (close < 0) continue;
    const end = runs[i + 1 + close];
    out += line.slice(pos, open.index) + ' ';
    pos = end.index! + end[0].length;
    i += 1 + close;
  }
  return out + line.slice(pos);
}

function withoutQuotations(s: string) {
  let depth = 0;
  let out = '';
  for (const c of s) {
    if (c === '«') { depth++; out += ' '; } else if (c === '»') { depth = Math.max(0, depth - 1); out += ' '; } else out += depth ? ' ' : c;
  }
  return out;
}

function frenchWords(text: string) {
  const found: Record<string, number> = {};
  for (const w of withoutQuotations(proseOf(text)).toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    if (FRENCH_WORDS.has(w)) found[w] = (found[w] ?? 0) + 1;
  }
  return found;
}

for (const f of files) {
  test(`${f}: no French word outside « … » quotations and code blocks`, () => {
    assert.deepEqual(frenchWords(read(f)), {});
  });
}

test('the counter recognises French: quotations and code blocks are exempt', () => {
  assert.deepEqual(frenchWords('The title is « le titre est dans la liste »\n\n```\nle code est dans la boîte\n```\n'), {});
  assert.deepEqual(frenchWords('Use `le code est dans la boîte` and ``une `pour` ``'), {});
  assert.deepEqual(frenchWords('Use `unclosed une and the rest'), { une: 1 });
  assert.deepEqual(frenchWords('Use the code, une phrase `x`'), { une: 1 });
  assert.deepEqual(frenchWords('Voici une phrase pour tester'), { une: 1, pour: 1 });
  assert.deepEqual(frenchWords('Le chat est ici'), { le: 1, est: 1 });
});

test('.agent/* stays in French', () => {
  const dir = resolve(root, '.agent');
  const md = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(md.length > 0);
  for (const f of md) {
    const n = Object.keys(frenchWords(readFileSync(resolve(dir, f), 'utf8'))).length;
    assert.ok(n > 0, `.agent/${f} no longer contains French`);
  }
});

test('the counter: inline code needs a closing run of the same length, on the same line', () => {
  assert.deepEqual(frenchWords('Use ``une `` and `une`'), {});
  assert.deepEqual(frenchWords('Use `` une ` and une'), { une: 2 });
  assert.deepEqual(frenchWords('Open `une\nclose` une'), { une: 2 });
  assert.deepEqual(frenchWords('`a` une `b`'), { une: 1 });
});
