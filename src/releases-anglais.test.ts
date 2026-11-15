// Feature kanevas-releases-anglais: the bodies of four published GitHub Releases are English.
// Terms between « … » may stay French; tags, titles and pre-release status are untouched;
// the repository is public, so no Éneria data in a body. Expected values are written by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

test('the detector flags a French Release body and lets quoted French interface terms through', () => {
  assert.deepEqual(frenchOutsideQuotes('Le MJ repère les fiches que les joueurs ne voient pas.'), ['le', 'les']);
  assert.deepEqual(frenchOutsideQuotes('Antor links sheets with a nature (« se situe à », « membre de ») and a qualifier.'), []);
  assert.deepEqual(frenchOutsideQuotes('The GM sees the « MJ seul » badge.'), []);
});
