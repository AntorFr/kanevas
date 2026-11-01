// Feature kanevas-release-outils-cadre-anglais: the body of the published pre-release
// v0.25.0-kanevas-outils.2 is English, keeps its meaning, and tag, title and pre-release
// status are untouched. Terms between « … » and code spans may stay French.
// Expected values are written by hand from the need, not read back from the Release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const TAG = 'v0.25.0-kanevas-outils.2';

const FRENCH = new Set(['le', 'la', 'les', 'des', 'du', 'est', 'sont', 'pour', 'avec', 'une', 'dans', 'et', 'qui', 'sur', 'aux', 'par']);

function frenchOutsideQuotes(body: string): string[] {
  let depth = 0;
  let kept = '';
  for (const c of body.replace(/`[^`]*`/g, ' ')) {
    if (c === '«') { depth++; kept += ' '; } else if (c === '»') { depth = Math.max(0, depth - 1); kept += ' '; } else kept += depth ? ' ' : c;
  }
  const words = kept.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  return [...new Set(words.filter((w) => FRENCH.has(w)))];
}

function view() {
  try {
    return JSON.parse(execFileSync('gh', ['release', 'view', TAG, '--json', 'tagName,name,isPrerelease,isDraft,body'],
      { cwd: root, encoding: 'utf8' })) as { tagName: string; name: string; isPrerelease: boolean; isDraft: boolean; body: string };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

test('the French detector flags a French outils-cadre note and lets quoted French through', () => {
  assert.deepEqual(frenchOutsideQuotes('Un MJ responsable active un outil dans la barre pour les joueuses.'), ['dans', 'la', 'pour', 'les']);
  assert.deepEqual(frenchOutsideQuotes('The lead GM enables the « outil » entry and `la barre`.'), []);
});

test('the outils-cadre pre-release body is English and non-empty', (t) => {
  const r = view();
  if (!r) { t.diagnostic('gh missing: Release not checked'); return; }
  assert.ok(r.body.trim().length > 0, 'empty body');
  assert.deepEqual(frenchOutsideQuotes(r.body), []);
});

test('the outils-cadre pre-release body keeps the meaning of the original note', (t) => {
  const r = view();
  if (!r) { t.diagnostic('gh missing: Release not checked'); return; }
  const body = r.body.toLowerCase();
  for (const concept of [/\b(gm|game master)\b/, /\btool/, /visib/, /\bsetting/, /\bplayer/, /sidebar|side bar|toolbar|\bbar\b/, /ownership/, /transferable/, /assistant/, /trial/]) {
    assert.match(body, concept, `missing concept ${concept}`);
  }
});

test('the outils-cadre pre-release keeps its tag, title, pre-release status and published state', (t) => {
  const r = view();
  if (!r) { t.diagnostic('gh missing: Release not checked'); return; }
  assert.equal(r.tagName, 'v0.25.0-kanevas-outils.2');
  assert.equal(r.name, 'v0.25.0-kanevas-outils.2');
  assert.equal(r.isPrerelease, true);
  assert.equal(r.isDraft, false);
});
