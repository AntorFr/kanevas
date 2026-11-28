// Assembles the web archive of a version (AD-web-publie-2, 4): the one place that lists its pieces.
// Usage: node scripts/assembler-web.mjs <dest> <version>   (from a repository whose `npm run build` has run)
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const [dest, version] = process.argv.slice(2);
if (!dest || !version || process.argv.length > 4) {
  console.error('usage: node scripts/assembler-web.mjs <dest> <version>');
  process.exit(2);
}
if (!existsSync(join(racine, 'dist/server.js')) || !existsSync(join(racine, 'dist/public/index.html'))) {
  console.error('assembler-web: dist/ is not built (run `npm run build` first).');
  process.exit(1);
}

const pieces = [
  ['dist', 'dist'],
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['scripts/faux-setup-token.mjs', 'scripts/faux-setup-token.mjs'],
  ['scripts/lancer-bouchon.mjs', 'lancer-bouchon.mjs'],
];
const cible = resolve(dest);
mkdirSync(cible, { recursive: true });
for (const [de, vers] of pieces) {
  mkdirSync(dirname(join(cible, vers)), { recursive: true });
  cpSync(join(racine, de), join(cible, vers), { recursive: true });
}
writeFileSync(join(cible, 'VERSION'), `${version}\n`);
