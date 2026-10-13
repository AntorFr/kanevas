import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contenuPublic, rendreMarkdown } from './markdown.js';

// Property (AD-114): any word the section render puts inside a GM block must be absent from the public text.
const BRIQUES = [':::mj', ':::mj', ':::', ':::', '::::', '```', '~~~', '', '', '> :::mj', '> :::', '>> :::', '- :::mj', '- :::', '1. :::', '    :::', '\t:::', '  :::', '> ', '- ', '    code', '> - :::', '> > :::mj', ' :::mj', '::: mj', '>:::', '>     :::'];

test('contenuPublic ne garde jamais un mot que le rendu section place dans un bloc MJ (fuzz à graine fixe)', () => {
  let seed = 424242;
  const alea = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  let observes = 0;
  for (let n = 0; n < 4000; n++) {
    const lignes: string[] = [];
    const k = 3 + Math.floor(alea() * 8);
    for (let i = 0; i < k; i++) {
      const b = BRIQUES[Math.floor(alea() * BRIQUES.length)]!;
      lignes.push(alea() < 0.5 ? b : `${b} S${i}`);
    }
    const src = lignes.join('\n');
    const piles: boolean[] = [];
    const dedans = new Set<string>();
    for (const t of rendreMarkdown(src, { nature: 'section' }).split(/(<div[^>]*>|<\/div>)/)) {
      if (t.startsWith('<div')) piles.push(/bloc-mj/.test(t));
      else if (t === '</div>') piles.pop();
      else if (piles.some(Boolean)) for (const s of t.match(/S\d+/g) ?? []) dedans.add(s);
    }
    if (dedans.size) observes++;
    const pub = new Set(contenuPublic(src).match(/S\d+/g) ?? []);
    for (const s of dedans) assert.ok(!pub.has(s), `fuite de ${s} dans ${JSON.stringify(src)}`);
  }
  assert.ok(observes > 500, 'le fuzz doit produire des blocs');
});
