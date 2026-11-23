// Proof page of the Wasm path (AD-rust-7): not a product screen, served only by the test's Vite server.
import galaxie from '../../../../rust/modules/coeur/tests/fixtures/generation-galaxie.json';
import sortieCoeur from '../../../../rust/modules/coeur/tests/fixtures/generation-sortie-coeur.json';
import systemes from '../../../../rust/modules/coeur/tests/fixtures/generation-systemes.json';
import sortieSystemes from '../../../../rust/modules/coeur/tests/fixtures/generation-sortie-systemes.json';
import { chargerModule } from '../charger';
import {
  dessiner,
  densiteDefaut,
  fusionnerReglages,
  reglagesDefaut,
  typesCatalogue,
  validerAspectType,
  validerReglages,
  versionGenerateurCourante,
  versionsGenerateur,
  galactiqueVersOrbiteHeure,
  hexVersPlan,
  orbiteHeureVersPlan,
  planVersHex,
  planVersOrbiteHeure,
  tirerBloc,
  tirerSysteme,
  transitionDefaut,
  typesAstre,
  validerAspect,
  validerFormation,
  classeDeCle,
  classesEtoile,
} from '../coeur';

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
  await afficherSystemes();
}

// Interiors of systems (AD-systeme-2): the JSON string per fixture system, the exact-bytes ones, and the other calls.
async function afficherSystemes(): Promise<void> {
  const tires: string[] = [];
  for (const s of systemes.systemes) tires.push(await tirerSysteme(s.entree.q, s.entree.r, s.entree.taille, s.entree.lettre, 1));
  sortie('coeur-systemes').textContent = JSON.stringify(tires);
  const octets: string[] = [];
  for (const s of sortieSystemes.systemes) {
    octets.push(await tirerSysteme(s.entree.q, s.entree.r, s.entree.taille, s.entree.lettre, sortieSystemes.version));
  }
  sortie('coeur-sortie-systemes').textContent = JSON.stringify(octets);
  const premier = systemes.systemes[0]!.sortie;
  const transition = await transitionDefaut(JSON.stringify(premier.astres), JSON.stringify(premier.formations));
  const [x, y] = await orbiteHeureVersPlan(2, 3);
  const [orbite, heure] = await planVersOrbiteHeure(x, y);
  sortie('coeur-systeme-appels').textContent = JSON.stringify({ transition, x, y, orbite, heure });
}

// Bodies drawn from their aspect (AD-carte-1): the bytes as hexadecimal per aspect, and what the refusals throw.
const ASPECTS_RENDU = ['{"type":"tellurique"}', '{"type":"jaune"}', '{"type":"gazeuse","aspect":{"palette":["#102030","#a0b0c0"]}}'];
async function afficherRendu(): Promise<void> {
  const images: string[] = [];
  for (const a of ASPECTS_RENDU) images.push(Array.from(await dessiner(a, 32, 1), (o) => o.toString(16).padStart(2, '0')).join(''));
  sortie('coeur-rendu').textContent = JSON.stringify(images);
  const refus: boolean[] = [];
  for (const [a, c] of [['{"type":"licorne"}', 32], ['{"type":"tellurique"}', 8]] as const) {
    try {
      await dessiner(a, c, 1);
      refus.push(false);
    } catch {
      refus.push(true);
    }
  }
  sortie('coeur-rendu-refus').textContent = JSON.stringify(refus);
}

// The edition calls (AD-edition-3, AD-edition-4): values returned, and whether each refusal throws.
async function afficherEdition(): Promise<void> {
  const refuse = async (appel: () => Promise<unknown>): Promise<boolean> => {
    try {
      await appel();
      return false;
    } catch {
      return true;
    }
  };
  const voisins: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const galactique: { orbite: number; heure: number; voisin: number }[] = [];
  for (const [dq, dr] of voisins) {
    const [orbite, heure] = await galactiqueVersOrbiteHeure(dq, dr, 3.37);
    galactique.push({ orbite, heure, voisin: (await chargerModule('coeur')).heure_vers_voisin(7, -3, 7 + dq, -3 + dr) });
  }
  sortie('coeur-edition').textContent = JSON.stringify({
    types: { planete: await typesAstre('planete'), lune: await typesAstre('lune'), comete: await typesAstre('comete') },
    galactique,
    aspect: await validerAspect('tellurique', '{"mer":0.5}'),
    formation: await validerFormation('anneau', '{"de":1,"a":2}'),
    refus: [
      await refuse(() => typesAstre('ceinture')),
      await refuse(() => validerAspect('tellurique', '{"licorne":1}')),
      await refuse(() => validerAspect('tellurique', '{"mer":2}')),
      await refuse(() => validerFormation('anneau', '{"de":2,"a":1}')),
      await refuse(() => validerFormation('nuage', '{"centres":[[1001,4,1]]}')),
    ],
  });
}

// The settings calls (AD-reglages-1, AD-reglages-6): what each export returns, and whether the refusals throw.
async function afficherReglages(): Promise<void> {
  const defaut = await reglagesDefaut(1);
  const refuse = async (appel: () => Promise<unknown>): Promise<boolean> => {
    try {
      await appel();
      return false;
    } catch {
      return true;
    }
  };
  sortie('coeur-reglages').textContent = JSON.stringify({
    defaut,
    versions: await versionsGenerateur(),
    courante: await versionGenerateurCourante(),
    valide: await validerReglages(1, '{"frequences":{"comete":0.9}}'),
    refuse: await validerReglages(1, '{"frequences":{"comete":2}}'),
    fusion: await fusionnerReglages(1, '{"frequences":{"comete":0.9}}'),
    fusionVide: await fusionnerReglages(1, '{}'),
    aspect: await validerAspectType('tellurique', '{"mer":0.5}'),
    aspectRefuse: await validerAspectType('tellurique', '{"licorne":1}'),
    catalogue: await typesCatalogue(),
    comete: await tirerSysteme(0, 0, 0.8, 'K', 1, '{"frequences":{"comete":1}}'),
    refus: [
      await refuse(() => reglagesDefaut(2)),
      await refuse(() => fusionnerReglages(1, '{"frequences":{"comete":2}}')),
      await refuse(() => tirerSysteme(0, 0, 0.8, 'K', 2, '{}')),
      await refuse(() => tirerSysteme(0, 0, 0.8, 'K', 1, '{"licorne":1}')),
    ],
  });
}

// The star classes (B-117): the list, the class drawn for a few keys and sizes, and whether a size out of range throws.
async function afficherClasses(): Promise<void> {
  const tirages: string[] = [];
  for (const t of [0, 0.5, 1]) for (let i = 0; i < 20; i++) tirages.push(await classeDeCle(`cle-${i}`, t));
  let refus = false;
  try {
    await classeDeCle('a', 1.5);
  } catch {
    refus = true;
  }
  sortie('coeur-classes').textContent = JSON.stringify({ liste: await classesEtoile(), tirages, refus });
}

async function afficher(): Promise<void> {
  try {
    const exemple = await chargerModule('exemple');
    sortie('fnv1a').textContent = String(exemple.fnv1a('kanevas'));
    sortie('version').textContent = exemple.version();
    await afficherCoeur();
    await afficherRendu();
    await afficherEdition();
    await afficherReglages();
    await afficherClasses();
  } catch {
    const erreur = sortie('erreur');
    erreur.hidden = false;
    erreur.textContent = 'Wasm module failed to load.';
  }
}

void afficher();
