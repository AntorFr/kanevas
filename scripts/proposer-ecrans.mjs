// One-shot helper (AD-niveau-4): proposes the `// ecrans: a, b` line of each screen test from the
// literal addresses it opens (`goto(…)` and quoted `/univers/…`-style paths) compared with the `chemin`
// of the screens. Run once; the declarations are then kept by hand.
//   node scripts/proposer-ecrans.mjs            prints `file: screens` (and the files left without a line)
//   node scripts/proposer-ecrans.mjs --ecrire   inserts the line at the top of each file that has none
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ECRANS = 'frontend/src/ecrans';
const E2E = 'src/e2e';

/** screen name → react-router pattern, read from `export default { chemin: '…' }`. */
export function cheminsDesEcrans(dossier = ECRANS) {
  const out = new Map();
  for (const f of readdirSync(dossier).filter((n) => n.endsWith('.tsx'))) {
    const m = /export default \{\s*chemin:\s*'([^']+)'/.exec(readFileSync(join(dossier, f), 'utf8'));
    if (m) out.set(f.slice(0, -4), m[1]);
  }
  return out;
}

/** True when the concrete `adresse` (placeholders already filled) is answered by `motif`. */
export function repond(motif, adresse) {
  const a = adresse.split(/[?#]/)[0].split('/').filter(Boolean);
  const p = motif.split('/').filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') return true;
    if (i >= a.length) return false;
    if (!p[i].startsWith(':') && p[i] !== a[i]) return false;
  }
  return a.length === p.length;
}

/** Addresses a test source opens: `goto(...)` arguments and quoted paths of the app (never `/api/`). */
export function adresses(source) {
  const out = new Set();
  const nettoyer = (s) => s.replace(/\$\{[^}]*\}/g, 'x').replace(/\$\{.*$/, 'x');
  for (const m of source.matchAll(/\bgoto\(\s*['"`](\/[^'"`?]*)/g)) out.add(nettoyer(m[1]));
  for (const m of source.matchAll(/(['"`])(\/(?:univers|systemes|administration|demo-composants)(?:[/?#][^'"`\s]*)?)\1/g)) out.add(nettoyer(m[2]));
  return [...out].filter((a) => !a.startsWith('/api/'));
}

export function proposer(source, chemins) {
  const noms = new Set();
  for (const a of adresses(source)) for (const [nom, motif] of chemins) if (repond(motif, a)) noms.add(nom);
  return [...noms].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ecrire = process.argv.includes('--ecrire');
  const chemins = cheminsDesEcrans();
  const sans = [];
  let declares = 0;
  const fichiers = readdirSync(E2E).filter((n) => /\.test\.ts$/.test(n)).sort();
  for (const n of fichiers) {
    const chemin = join(E2E, n);
    const source = readFileSync(chemin, 'utf8');
    if (/^\s*\/\/\s*ecrans\s*:/m.test(source.split('\n').slice(0, 5).join('\n'))) { declares++; continue; }
    const noms = proposer(source, chemins);
    if (!noms.length) { sans.push(n); continue; }
    declares++;
    console.log(`${n}: ${noms.join(', ')}`);
    if (ecrire) writeFileSync(chemin, `// ecrans: ${noms.join(', ')}\n${source}`);
  }
  console.log(`\n${declares}/${fichiers.length} files declared; without a line:\n${sans.join('\n')}`);
}
