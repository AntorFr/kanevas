// Feature kanevas-release-outils-cadre-anglais: the body of the published pre-release
// v0.25.0-kanevas-outils.2 is English, keeps its meaning, and tag, title and pre-release
// status are untouched. Terms between « … » and code spans may stay French.
// Expected values are written by hand from the need, not read back from the Release.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

test('the French detector flags a French outils-cadre note and lets quoted French through', () => {
  assert.deepEqual(frenchOutsideQuotes('Un MJ responsable active un outil dans la barre pour les joueuses.'), ['dans', 'la', 'pour', 'les']);
  assert.deepEqual(frenchOutsideQuotes('The lead GM enables the « outil » entry and `la barre`.'), []);
});
