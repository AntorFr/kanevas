// Feature kanevas-releases-anglais: the bodies of four published GitHub Releases are English.
// Terms between « … » may stay French; tags, titles and pre-release status are untouched;
// the repository is public, so no Éneria data in a body. Expected values are written by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const EXPECTED = [
  { tag: 'v0.26.0-kanevas-scenarios.3', prerelease: true },
  { tag: 'v0.26.0-kanevas-scenarios.2', prerelease: true },
  { tag: 'v0.26.0-kanevas-fiches-liees.1', prerelease: true },
  { tag: 'v0.25.0', prerelease: false },
];

const FRENCH = new Set(['le', 'la', 'les', 'des', 'du', 'est', 'sont', 'pour', 'avec', 'une', 'dans', 'et', 'qui', 'sur', 'aux', 'par']);

/** French stop words outside « … » quotations and outside code spans. */
function frenchOutsideQuotes(body: string): string[] {
  let depth = 0;
  let kept = '';
  for (const c of body.replace(/`[^`]*`/g, ' ')) {
    if (c === '«') { depth++; kept += ' '; } else if (c === '»') { depth = Math.max(0, depth - 1); kept += ' '; } else kept += depth ? ' ' : c;
  }
  const words = kept.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  return [...new Set(words.filter((w) => FRENCH.has(w)))];
}

function view(tag: string) {
  try {
    return JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'tagName,name,isPrerelease,isDraft,body'],
      { cwd: root, encoding: 'utf8' })) as { tagName: string; name: string; isPrerelease: boolean; isDraft: boolean; body: string };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

test('the detector flags a French Release body and lets quoted French interface terms through', () => {
  assert.deepEqual(frenchOutsideQuotes('Le MJ repère les fiches que les joueurs ne voient pas.'), ['le', 'les']);
  assert.deepEqual(frenchOutsideQuotes('Antor links sheets with a nature (« se situe à », « membre de ») and a qualifier.'), []);
  assert.deepEqual(frenchOutsideQuotes('The GM sees the « MJ seul » badge.'), []);
});

for (const { tag, prerelease } of EXPECTED) {
  test(`Release ${tag} has an English, non-empty body without Éneria data`, (t) => {
    const r = view(tag);
    if (!r) { t.diagnostic('gh missing: Release not checked'); return; }
    assert.ok(r.body.trim().length > 0, `${tag}: empty body`);
    assert.deepEqual(frenchOutsideQuotes(r.body), [], `${tag}: French words outside « … »`);
    assert.doesNotMatch(r.body, /[ée]neria/i, `${tag}: Éneria data in a public body`);
  });

  test(`Release ${tag} keeps its tag, title, pre-release status and published state`, (t) => {
    const r = view(tag);
    if (!r) { t.diagnostic('gh missing: Release not checked'); return; }
    assert.equal(r.tagName, tag);
    assert.equal(r.name, tag);
    assert.equal(r.isPrerelease, prerelease);
    assert.equal(r.isDraft, false);
  });
}
