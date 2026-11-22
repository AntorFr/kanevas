// Manual trial of the image engine (AD-battlemap-generation-5), outside CI.
//   KANEVAS_STUB=1 npx tsx scripts/essai-moteur-alpha.ts     (stub: checks the script itself)
//   CODEX_HOME=<dir with auth.json> npx tsx scripts/essai-moteur-alpha.ts   (real engine)
// Two assets per category through the production prompt; one line per asset: the `alphaPng` answer and the size.
// Nothing the engine wrote is printed: only the answers and sizes. `auth.json` is never read.
import { execFileSync } from 'node:child_process';

import { alphaPng } from '../src/outils/battlemap/coeur.js';
import { CATEGORIES } from '../src/services/battlemap-assets.js';
import { construirePrompt } from '../src/services/battlemap-generation.js';
import { choisirAdaptateur } from '../src/services/images/index.js';

const NOMS: Record<string, string[]> = {
  objet: ['Tonneau de bois', 'Coffre aux ferrures'],
  vaisseau: ['Chasseur léger', 'Cargo cabossé'],
  decor: ['Buisson épineux', 'Statue brisée'],
  sol: ['Dalles de pierre', 'Plancher en bois'],
  mur: ['Mur de briques', 'Cloison métallique'],
};

function tailleDuPng(o: Uint8Array): string {
  const b = Buffer.from(o);
  const png = b.length >= 24 && b.toString('latin1', 1, 4) === 'PNG';
  return `${b.length} octets${png ? `, ${b.readUInt32BE(16)}×${b.readUInt32BE(20)} px` : ', pas un PNG'}`;
}

const { nom, generateur } = choisirAdaptateur();
if (nom === 'aucun') {
  console.log('non joué : pas de moteur dans ce pod');
  process.exit(0);
}
let version = 'bouchon';
if (nom === 'codex') {
  try {
    version = execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    version = 'inconnue';
  }
}
console.log(`adaptateur : ${nom} (${version}), ${new Date().toISOString()}`);

for (const categorie of CATEGORIES) {
  for (const nomAsset of NOMS[categorie] ?? []) {
    const prompt = construirePrompt({ categorie, nom: nomAsset, direction: 'Peinture à la gouache, lumière chaude.' });
    try {
      const octets = await generateur.generer(prompt);
      console.log(`${categorie}\t${nomAsset}\talphaPng=${alphaPng(octets)}\t${tailleDuPng(octets)}`);
    } catch {
      console.log(`${categorie}\t${nomAsset}\téchec de génération`);
    }
  }
}
