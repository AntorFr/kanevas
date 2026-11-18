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
import { galaxieLisible, zonesLisibles, type LigneGalaxie, type NiveauLecture } from './galaxies.js';
import { entreesBloc, systemesExclusants, tirerEtoileComplete, VERSION_GENERATEUR } from './tirage-etoiles.js';

interface Coeur {
  tirer_systeme(q: number, r: number, taille: number, lettre: string, version: number, valeurs: string): string;
  reglages_defaut(version: number): string;
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
  /** Token of the write (AD-edition-2): a GM outside Player mode only; a drawn body reads 1. */
  version?: number;
  /** Plain text of a defined body, for the form « Modifier » of the writing GM only (absent when empty). */
  description?: string;
}
export interface FormationVue {
  cle: string; forme: 'anneau' | 'nuage'; nom: string | null; parametres: Record<string, unknown>; etoile_rang: number;
  version?: number;
  /** As for a body: the writing GM only. */
  description?: string;
}
export interface InterieurVue {
  q: number; r: number; nom: string | null; etat: 'tire' | 'defini'; transition: number;
  astres: AstreVue[]; formations: FormationVue[]; version_generateur: number;
  /** GM outside Player mode only (AD-edition-2): the writes are open, and the token of the system (defined: its row's
   * `version`; drawn: the galaxy's `version`, which a seed or settings change moves). */
  peutEcrire?: true; versionSysteme?: number;
}

interface LigneAstre extends Omit<AstreVue, 'aspect'> { aspect: string }
interface LigneFormation extends Omit<FormationVue, 'parametres'> { parametres: string }
export interface Tire {
  etoile: { q: number; r: number; taille: number; lettre: string };
  astres: AstreVue[]; formations: FormationVue[]; transition: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The order of « Corps » (E-23, AD-systeme-3): the star, its companions (by rank), then each planet by increasing orbit
 * with its moons right after, then the comets and the anomalies (even one of genre `planete`) by increasing orbit.
 * Stable: equal orbits keep the order the rows come in.
 */
function ordonner(astres: AstreVue[]): AstreVue[] {
  const lunes = new Map<string, AstreVue[]>();
  for (const a of astres) if (a.genre === 'lune' && a.parent_cle !== null) {
    lunes.set(a.parent_cle, [...(lunes.get(a.parent_cle) ?? []), a]);
  }
  const tetes = astres.filter((a) => a.genre !== 'lune');
  const groupe = (a: AstreVue): number => (a.genre === 'etoile' ? 0 : a.genre === 'planete' && a.type !== 'anomalie' ? 1 : 2);
  tetes.sort((x, y) => groupe(x) - groupe(y)
    || (groupe(x) === 0 ? x.etoile_rang - y.etoile_rang : num(x.orbite) - num(y.orbite)));
  return tetes.flatMap((a) => [a, ...(lunes.get(a.cle) ?? [])]);
}

/** The orbit of a zone: where a ring starts, the centre of a cloud. */
function orbiteFormation(f: FormationVue): number {
  return num(f.forme === 'anneau' ? f.parametres.de : f.parametres.orbite);
}

/** Zones by increasing orbit; on the same orbit a cloud comes after the rings. Stable. */
function ordonnerFormations(formations: FormationVue[]): FormationVue[] {
  return [...formations].sort((x, y) => orbiteFormation(x) - orbiteFormation(y)
    || (x.forme === y.forme ? 0 : x.forme === 'anneau' ? -1 : 1));
}

function composer(
  q: number, r: number, nom: string | null, etat: InterieurVue['etat'], transition: number | null,
  astres: AstreVue[], formations: FormationVue[],
): InterieurVue {
  const triees = ordonner(astres);
  const fs = ordonnerFormations(formations);
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
        a.taille, a.aspect, a.version, a.description FROM swn_astres a LEFT JOIN swn_astres p ON p.id = a.parent_id
        WHERE a.systeme_id = ? ORDER BY a.id`).all(ligne.id) as LigneAstre[])
      .map(({ description, ...a }) => ({ ...a, aspect: JSON.parse(a.aspect) as Record<string, unknown>, ...(description ? { description } : {}) }));
    const formations = (db.prepare(`SELECT cle, forme, nom, parametres, etoile_rang, version, description FROM swn_formations
        WHERE systeme_id = ? ORDER BY id`).all(ligne.id) as LigneFormation[])
      .map(({ description, ...f }) => ({ ...f, parametres: JSON.parse(f.parametres) as Record<string, unknown>, ...(description ? { description } : {}) }));
    const vue = composer(q, r, ligne.nom, 'defini', ligne.transition, astres, formations);
    return niveau === 'mj' ? ouvrirEcriture(vue, ligneVersion(db, ligne.id)) : sansJetons(vue);
  }
  // No row: the star must be the one the block's draw holds at (q, r), with the exclusions of every reader.
  const tire = lireTire(db, galaxie, niveau, q, r);
  if (!tire) throw introuvable();
  const vue = composer(q, r, null, 'tire', tire.transition, tire.astres, tire.formations);
  return niveau === 'mj' ? ouvrirEcriture(vue, galaxie.version) : sansJetons(vue);
}

const ligneVersion = (db: Db, systemeId: number): number =>
  (db.prepare('SELECT version FROM swn_systemes WHERE id = ?').get(systemeId) as { version: number }).version;

/** What only the writing GM holds: the tokens of AD-edition-2 (a drawn body is version 1, what anchoring writes). */
function ouvrirEcriture(vue: InterieurVue, versionSysteme: number): InterieurVue {
  for (const x of [...vue.astres, ...vue.formations]) x.version ??= 1;
  return { ...vue, peutEcrire: true, versionSysteme };
}
function sansJetons(vue: InterieurVue): InterieurVue {
  for (const x of [...vue.astres, ...vue.formations]) { delete x.version; delete x.description; }
  return vue;
}

/**
 * The system the draw holds at `(q, r)` for this level, with its star, or null: the one place a drawn interior is
 * computed, which the anchoring of `ecriture-systeme.ts` reuses so that what it freezes is what was read.
 */
export function lireTire(db: Db, galaxie: LigneGalaxie, niveau: NiveauLecture, q: number, r: number): Tire | null {
  const bx = Math.floor(q / TAILLE_BLOC), by = Math.floor(r / TAILLE_BLOC);
  const zones = zonesLisibles(db, galaxie.id, niveau).map((z) => ({
    contour: JSON.parse(z.contour) as Point[], plages: z.plages === null ? null : lirePlages(z.plages), densite: z.densite,
  }));
  const entrees = entreesBloc(bx, by, zones, galaxie.densite_defaut, systemesExclusants(db, galaxie.id, { bx, by }, { bx, by }));
  const etoile = tirerEtoileComplete(galaxie.graine, bx, by, entrees);
  if (!etoile || etoile.q !== q || etoile.r !== r) return null;
  const tire = JSON.parse(leCoeur().tirer_systeme(q, r, etoile.taille, etoile.lettre, VERSION_GENERATEUR, leCoeur().reglages_defaut(VERSION_GENERATEUR))) as
    { astres: AstreVue[]; formations: FormationVue[]; transition: number };
  return { etoile, ...tire };
}
