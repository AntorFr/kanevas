// Proof page of the Wasm path (AD-rust-7): not a product screen, served only by the test's Vite server.
import galaxie from '../../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json';
import sortieCoeur from '../../../../rust/modules/coeur/tests/fixtures/generation-sortie-coeur.json';
import { chargerModule } from '../charger';
import { densiteDefaut, hexVersPlan, planVersHex, tirerBloc } from '../coeur';

const sortie = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

// The `coeur` module (AD-139): the page gives back what the core returns, the test compares it to the fixtures.
const VOISINS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// Inputs of a block of generation-galaxie.json, rebuilt the way the service does (AD-etoiles-2).
function entrees(bx: number, by: number): { densites: number[]; exclus: number[] } {
  const exclus = new Set<string>();
  for (const s of galaxie.systemes_definis) {
    if (s.promu) continue;
    exclus.add(`${s.q},${s.r}`);
    for (const [a, b] of VOISINS) exclus.add(`${s.q + a},${s.r + b}`);
  }
  const densites: number[] = [];
  const out: number[] = [];
  for (let dq = 1; dq <= 3; dq++) {
    for (let dr = 1; dr <= 3; dr++) {
      const cle = `${galaxie.bloc * bx + dq},${galaxie.bloc * by + dr}`;
      const basses = galaxie.densites.zones
        .filter((z) => z.hexagones.some((h) => `${h[0]},${h[1]}` === cle))
        .map((z) => z.densite);
      densites.push(basses.length ? Math.min(...basses) : galaxie.densites.defaut);
      out.push(exclus.has(cle) ? 1 : 0);
    }
  }
  return { densites, exclus: out };
}

async function afficherCoeur(): Promise<void> {
  sortie('densite').textContent = String(await densiteDefaut());
  // Per block of the fixtures: the JSON string the core returns (null or a star).
  const etoiles: string[] = [];
  for (const b of galaxie.blocs) {
    const e = entrees(b.bx, b.by);
    etoiles.push(await tirerBloc(galaxie.graine, b.bx, b.by, e.densites, e.exclus));
  }
  sortie('coeur-etoiles').textContent = JSON.stringify(etoiles);
  const octets: string[] = [];
  for (const b of sortieCoeur.blocs) octets.push(await tirerBloc(sortieCoeur.graine, b.bx, b.by, b.densites, b.exclus));
  sortie('coeur-sortie').textContent = JSON.stringify(octets);
  const [x, y] = await hexVersPlan(7, -3);
  const [q, r] = await planVersHex(x, y);
  sortie('coeur-hex').textContent = JSON.stringify({ x, y, q, r });
}

async function afficher(): Promise<void> {
  try {
    const exemple = await chargerModule('exemple');
    sortie('fnv1a').textContent = String(exemple.fnv1a('kanevas'));
    sortie('version').textContent = exemple.version();
    await afficherCoeur();
  } catch {
    const erreur = sortie('erreur');
    erreur.hidden = false;
    erreur.textContent = 'Wasm module failed to load.';
  }
}

void afficher();
