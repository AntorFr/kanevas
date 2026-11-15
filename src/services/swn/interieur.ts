// The one read of the interior of a system (AD-systeme-3): the only caller of the core's `tirer_systeme` and
// `transition_defaut` in the services. A hexagon with a `swn_systemes` row is a defined system (its rows are the
// truth); one without is drawn by the core from the star the block's draw holds there, or is not found.
import type { Db } from '../../db/db.js';
import { TAILLE_BLOC } from '../../outils/swn/regles/generation.js';
import { lirePlages } from '../../outils/swn/regles/forme.js';
import type { Point } from '../../outils/swn/regles/hex.js';
import { chargerModule } from '../../wasm/charger.js';
import { introuvable } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { galaxieLisible, zonesLisibles } from './galaxies.js';
import { entreesBloc, systemesExclusants, tirerEtoileComplete, VERSION_GENERATEUR } from './tirage-etoiles.js';

interface Coeur {
  tirer_systeme(q: number, r: number, taille: number, lettre: string, version: number): string;
  transition_defaut(astres: string, formations: string): number;
}

// Loaded once at import so that the service stays synchronous; a failed load makes every read throw the generic error.
let coeur: Coeur | undefined;
try {
  coeur = await chargerModule<Coeur>('coeur');
} catch {
  coeur = undefined;
}
function leCoeur(): Coeur {
  if (!coeur) throw new Error('Wasm module "coeur" is missing or unreadable.');
  return coeur;
}

export interface AstreVue {
  cle: string; genre: 'etoile' | 'planete' | 'lune' | 'comete'; parent_cle: string | null; etoile_rang: number; type: string;
  nom: string | null; orbite: number | null; heure: number; taille: number; aspect: Record<string, unknown>;
}
export interface FormationVue {
  cle: string; forme: 'anneau' | 'nuage'; nom: string | null; parametres: Record<string, unknown>; etoile_rang: number;
}
export interface InterieurVue {
  q: number; r: number; nom: string | null; etat: 'tire' | 'defini'; transition: number;
  astres: AstreVue[]; formations: FormationVue[]; version_generateur: number;
}

interface LigneAstre extends Omit<AstreVue, 'aspect'> { aspect: string }
interface LigneFormation extends Omit<FormationVue, 'parametres'> { parametres: string }

const RANG_GENRE: Record<AstreVue['genre'], number> = { etoile: 0, planete: 1, lune: 1, comete: 2 };

/** By star rank; in a rank the star, then the planets by orbit with their moons right after, then the comets. Stable. */
function ordonner(astres: AstreVue[]): AstreVue[] {
  const lunes = new Map<string, AstreVue[]>();
  for (const a of astres) if (a.genre === 'lune' && a.parent_cle !== null) {
    lunes.set(a.parent_cle, [...(lunes.get(a.parent_cle) ?? []), a]);
  }
  const tetes = astres.filter((a) => a.genre !== 'lune');
  tetes.sort((x, y) => x.etoile_rang - y.etoile_rang || RANG_GENRE[x.genre] - RANG_GENRE[y.genre]
    || (x.genre === 'planete' && y.genre === 'planete' ? (x.orbite ?? 0) - (y.orbite ?? 0) : 0));
  return tetes.flatMap((a) => [a, ...(lunes.get(a.cle) ?? [])]);
}

function composer(
  q: number, r: number, nom: string | null, etat: InterieurVue['etat'], transition: number | null,
  astres: AstreVue[], formations: FormationVue[],
): InterieurVue {
  const triees = ordonner(astres);
  const fs = [...formations].sort((x, y) => x.etoile_rang - y.etoile_rang);
  return {
    q, r, nom, etat,
    transition: transition ?? leCoeur().transition_defaut(JSON.stringify(triees), JSON.stringify(fs)),
    astres: triees, formations: fs, version_generateur: VERSION_GENERATEUR,
  };
}

/**
 * The interior of the system at `(q, r)`. Role, unknown galaxy, hexagon without star and a secret system seen by a
 * player (or a GM in Player mode) are the same `introuvable`. There is no guard per body (AD-150) and nothing
 * hidden, no `fiche_id`, no `secret`, no row id leaves.
 */
export function lireInterieur(
  db: Db, acteur: Acteur, universId: number, galaxieId: number, q: number, r: number,
): InterieurVue {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) throw introuvable();
  const ligne = db.prepare('SELECT id, nom, secret, transition FROM swn_systemes WHERE galaxie_id = ? AND q = ? AND r = ?')
    .get(galaxie.id, q, r) as { id: number; nom: string; secret: number; transition: number | null } | undefined;
  if (ligne) {
    if (ligne.secret === 1 && niveau !== 'mj') throw introuvable();
    const astres = (db.prepare(`SELECT a.cle, a.genre, p.cle AS parent_cle, a.etoile_rang, a.type, a.nom, a.orbite, a.heure,
        a.taille, a.aspect FROM swn_astres a LEFT JOIN swn_astres p ON p.id = a.parent_id
        WHERE a.systeme_id = ? ORDER BY a.id`).all(ligne.id) as LigneAstre[])
      .map((a) => ({ ...a, aspect: JSON.parse(a.aspect) as Record<string, unknown> }));
    const formations = (db.prepare(`SELECT cle, forme, nom, parametres, etoile_rang FROM swn_formations
        WHERE systeme_id = ? ORDER BY id`).all(ligne.id) as LigneFormation[])
      .map((f) => ({ ...f, parametres: JSON.parse(f.parametres) as Record<string, unknown> }));
    return composer(q, r, ligne.nom, 'defini', ligne.transition, astres, formations);
  }
  // No row: the star must be the one the block's draw holds at (q, r), with the exclusions of every reader.
  const bx = Math.floor(q / TAILLE_BLOC), by = Math.floor(r / TAILLE_BLOC);
  const zones = zonesLisibles(db, galaxie.id, niveau).map((z) => ({
    contour: JSON.parse(z.contour) as Point[], plages: z.plages === null ? null : lirePlages(z.plages), densite: z.densite,
  }));
  const entrees = entreesBloc(bx, by, zones, galaxie.densite_defaut, systemesExclusants(db, galaxie.id, { bx, by }, { bx, by }));
  const etoile = tirerEtoileComplete(galaxie.graine, bx, by, entrees);
  if (!etoile || etoile.q !== q || etoile.r !== r) throw introuvable();
  const tire = JSON.parse(leCoeur().tirer_systeme(q, r, etoile.taille, etoile.lettre, VERSION_GENERATEUR)) as
    { astres: AstreVue[]; formations: FormationVue[]; transition: number };
  return composer(q, r, null, 'tire', tire.transition, tire.astres, tire.formations);
}
