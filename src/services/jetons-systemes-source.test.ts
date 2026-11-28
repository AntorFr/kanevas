// AD-systemes-api-2: `jetons_systemes` is read and written in `services/jetons.ts` only. Any other source file of `src/`
// (tests and the SQL migrations apart) naming the table fails here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function fichiers(dossier: string, base = ''): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(`${dossier}/${e.name}`, `${base}${e.name}/`) : [`${base}${e.name}`]);
}

test('AD-systemes-api-2 : aucun fichier de src/ hors services/jetons.ts ne nomme jetons_systemes', () => {
  const trouves: string[] = [];
  let vus = 0;
  for (const f of fichiers(SRC)) {
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f) || f === 'services/jetons.ts') continue;
    vus += 1;
    readFileSync(`${SRC}/${f}`, 'utf8').split('\n').forEach((l, i) => {
      if (/jetons_systemes/i.test(l)) trouves.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.ok(vus > 100, 'the scan reads the sources');
  assert.deepEqual(trouves, []);
  assert.match(readFileSync(`${SRC}/services/jetons.ts`, 'utf8'), /FROM jetons_systemes/, 'the table is read where the rule says');
});
