// Feature kanevas-outils-doc-anglais: the public doc is English and the published
// Releases are English. Counting is done here, independently of scripts/controle-langue.mjs.
// Nothing here compares the tree to a past commit: product changes stay free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    prose.push(l);
  }
  return prose.join('\n');
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

test('the published GitHub Releases are in English', { timeout: 120000 }, (t) => {
  let tags: string[];
  try {
    tags = JSON.parse(execFileSync('gh', ['release', 'list', '--limit', '100', '--json', 'tagName'],
      { cwd: root, encoding: 'utf8' })).map((r: { tagName: string }) => r.tagName);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') { t.diagnostic('gh missing: Releases not checked'); return; }
    throw e;
  }
  assert.ok(tags.length >= 7, `only ${tags.length} Releases`);
  const offending: string[] = [];
  for (const tag of tags) {
    const body = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'body'], { cwd: root, encoding: 'utf8' })).body as string;
    assert.ok(body.trim().length > 0, `${tag}: empty body`);
    const m = frenchWords(body);
    if (Object.keys(m).length) offending.push(`${tag}: ${JSON.stringify(m)}`);
  }
  assert.deepEqual(offending, []);
});
