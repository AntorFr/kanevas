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
import { roleDe, sqlFicheLisible } from '../droits.js';
import { colonneReserve, estReserve, sqlElementLisible, systemeLisible } from './lisibilite.js';
import { aspectLu, type AspectElement, type GenreElement } from './elements-aspect.js';
import { galaxieLisible, zonesLisibles, type LigneGalaxie, type NiveauLecture } from './galaxies.js';
import { entreesBloc, systemesExclusants, tirerEtoileComplete } from './tirage-etoiles.js';
import { reglagesDe } from './reglages.js';
import { fusionSurcharges, surchargesDe } from './catalogue-aspects.js';

interface Coeur {
  tirer_systeme(q: number, r: number, taille: number, lettre: string, version: number, valeurs: string): string;
  transition_defaut(astres: string, formations: string): number;
  graine_de(cle_systeme: string, cle_corps: string): number;
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

export interface FicheLiee { id: number; titre: string }
export interface AstreVue {
  cle: string; genre: 'etoile' | 'planete' | 'lune' | 'comete'; parent_cle: string | null; etoile_rang: number; type: string;
  nom: string | null; orbite: number | null; heure: number; taille: number; aspect: Record<string, unknown>;
  /** Token of the write (AD-edition-2): a GM outside Player mode only; a drawn body reads 1. */
  version?: number;
  /** The linked sheet, only when the reader reads it (AD-liens-2); a hidden sheet is `null`, like no link at all. */
  fiche: FicheLiee | null;
  /** Plain text of a defined body, for the form « Modifier » of the writing GM only (absent when empty). */
  description?: string;
}
export interface FormationVue {
  cle: string; forme: 'anneau' | 'nuage'; nom: string | null; parametres: Record<string, unknown>; etoile_rang: number;
  version?: number;
  fiche: FicheLiee | null;
  /** As for a body: the writing GM only. */
  description?: string;
}
/**
 * A non-celestial element (B-96). Its place is read, never stored, when it sits on a body: `sur` is that body's `cle` and
 * `orbite` / `heure` are the body's, so the element follows it. `reserve` and `version` only for the writing GM.
 */
export interface ElementVue {
  cle: string; genre: GenreElement; nom: string; sur: string | null; orbite: number | null; heure: number;
  aspect: AspectElement; fiche: FicheLiee | null; description?: string;
  /** The writing GM only: « Réservé au MJ » (the badge « MJ seul ») and the token of the write. */
  reserve?: boolean; version?: number;
}
export interface InterieurVue {
  q: number; r: number; nom: string | null; etat: 'tire' | 'defini'; transition: number;
  astres: AstreVue[]; formations: FormationVue[]; elements: ElementVue[]; version_generateur: number;
  /** GM outside Player mode only (AD-edition-2): the writes are open, and the token of the system (defined: its row's
   * `version`; drawn: the galaxy's `version`, which a seed or settings change moves). */
  peutEcrire?: true; versionSysteme?: number;
}

interface LigneElement extends Omit<ElementVue, 'aspect' | 'fiche' | 'reserve'> { aspect: string; fiche_id: number | null; reserve: number }
interface LigneAstre extends Omit<AstreVue, 'aspect' | 'fiche'> { aspect: string; fiche_id: number | null }
interface LigneFormation extends Omit<FormationVue, 'parametres' | 'fiche'> { parametres: string; fiche_id: number | null }
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
  astres: AstreVue[], formations: FormationVue[], versionGenerateur: number, elements: ElementVue[] = [],
): InterieurVue {
  const triees = ordonner(astres.map((a) => ({ ...a, fiche: a.fiche ?? null })));
  const fs = ordonnerFormations(formations.map((f) => ({ ...f, fiche: f.fiche ?? null })));
  return {
    q, r, nom, etat,
    transition: transition ?? leCoeur().transition_defaut(JSON.stringify(triees), JSON.stringify(fs)),
    astres: triees, formations: fs, elements, version_generateur: versionGenerateur,
  };
}

/**
 * The interior of the system at `(q, r)`. Role, unknown galaxy, hexagon without star and a secret system seen by a
 * player (or a GM in Player mode) are the same `introuvable`. There is no guard per body (AD-150) and nothing
 * hidden, no raw `fiche_id`, no `secret`, no row id leaves.
 */
export function lireInterieur(
  db: Db, acteur: Acteur, universId: number, galaxieId: number, q: number, r: number,
): InterieurVue {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) throw introuvable();
  const ligne = db.prepare('SELECT id, cle, nom, transition FROM swn_systemes WHERE galaxie_id = ? AND q = ? AND r = ?')
    .get(galaxie.id, q, r) as { id: number; cle: string; nom: string; transition: number | null } | undefined;
  if (ligne) {
    if (!systemeLisible(db, acteur, ligne.id)) throw introuvable();
    const lignesAstres = db.prepare(`SELECT a.cle, a.genre, p.cle AS parent_cle, a.etoile_rang, a.type, a.nom, a.orbite, a.heure,
        a.taille, a.aspect, a.version, a.description, a.fiche_id FROM swn_astres a LEFT JOIN swn_astres p ON p.id = a.parent_id
        WHERE a.systeme_id = ? ORDER BY a.id`).all(ligne.id) as LigneAstre[];
    const lignesFormations = db.prepare(`SELECT cle, forme, nom, parametres, etoile_rang, version, description, fiche_id FROM swn_formations
        WHERE systeme_id = ? ORDER BY id`).all(ligne.id) as LigneFormation[];
    // One predicate for what the reader sees of the elements (`sqlElementLisible`): a reserved one is absent, no hole, no count.
    const lignesElements = db.prepare(`SELECT e.cle, e.genre, e.nom, e.description, a.cle AS sur,
        CASE WHEN e.astre_id IS NULL THEN e.orbite ELSE a.orbite END AS orbite,
        CASE WHEN e.astre_id IS NULL THEN e.heure ELSE a.heure END AS heure,
        e.aspect, e.version, e.fiche_id, ${colonneReserve('e')}
        FROM swn_elements e JOIN swn_systemes s ON s.id = e.systeme_id LEFT JOIN swn_astres a ON a.id = e.astre_id
        WHERE e.systeme_id = ? AND ${sqlElementLisible('e', 's', niveau)} ORDER BY e.id`).all(ligne.id) as LigneElement[];
    const fiches = fichesLisibles(db, acteur, universId, [...lignesAstres, ...lignesFormations, ...lignesElements].map((x) => x.fiche_id));
    const astres = lignesAstres
      .map(({ description, fiche_id, ...a }) => ({ ...a, fiche: fiches.get(fiche_id ?? -1) ?? null, aspect: JSON.parse(a.aspect) as Record<string, unknown>, ...(description ? { description } : {}) }));
    const formations = lignesFormations
      .map(({ description, fiche_id, ...f }) => ({ ...f, fiche: fiches.get(fiche_id ?? -1) ?? null, parametres: JSON.parse(f.parametres) as Record<string, unknown>, ...(description ? { description } : {}) }));
    const elements = lignesElements.map(({ description, fiche_id, reserve, aspect, ...el }): ElementVue => ({
      ...el, aspect: aspectLu(el.genre, aspect), fiche: fiches.get(fiche_id ?? -1) ?? null,
      ...(description ? { description } : {}), reserve: estReserve({ reserve }),
    }));
    const vue = composer(q, r, ligne.nom, 'defini', ligne.transition, avecAspectEffectif(db, galaxie.id, astres, ligne.cle), formations, reglagesDe(db, galaxie.id).versionGenerateur, elements);
    return niveau === 'mj' ? ouvrirEcriture(vue, ligneVersion(db, ligne.id)) : sansJetons(vue);
  }
  // No row: the star must be the one the block's draw holds at (q, r), with the exclusions of every reader.
  const tire = lireTire(db, galaxie, niveau, q, r);
  if (!tire) throw introuvable();
  const vue = composer(q, r, null, 'tire', tire.transition, avecAspectEffectif(db, galaxie.id, tire.astres), tire.formations, reglagesDe(db, galaxie.id).versionGenerateur);
  return niveau === 'mj' ? ouvrirEcriture(vue, galaxie.version) : sansJetons(vue);
}

/** Each body with its effective aspect (AD-reglages-6): the galaxy's override of its type under its own aspect. */
function avecAspectEffectif(db: Db, galaxieId: number, astres: AstreVue[], cleSysteme?: string): AstreVue[] {
  const surcharges = surchargesDe(db, galaxieId);
  return astres.map((a) => {
    const aspect = fusionSurcharges(surcharges, a.type, a.aspect);
    // A defined body without a seed (a row older than the slice, a body made on a screen) is drawn with the seed the import
    // would have written, filled in here at the read and never stored (AD-aspects-socle-2): one body, one picture for every reader.
    if (cleSysteme !== undefined && aspect.graine === undefined) return { ...a, aspect: { ...aspect, graine: leCoeur().graine_de(cleSysteme, a.cle) } };
    return { ...a, aspect };
  });
}

/**
 * The sheets of `ids` this reader reads, `{id, titre}` by id, in one query (AD-liens-2): the rule of `lireRelations`
 * (`sqlFicheLisible`), the sheet's own title at each reading, a sheet of another universe never.
 */
function fichesLisibles(db: Db, acteur: Acteur, universId: number, ids: (number | null)[]): Map<number, FicheLiee> {
  const uniques = [...new Set(ids.filter((i): i is number => i !== null))];
  if (uniques.length === 0) return new Map();
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) return new Map();
  const lisible = sqlFicheLisible(role, acteur, 'f');
  const lignes = db.prepare(`SELECT f.id, f.titre FROM fiches f WHERE f.univers_id = ? AND f.id IN (${uniques.map(() => '?').join(',')})
      ${lisible ? `AND ${lisible.sql}` : ''}`).all(universId, ...uniques, ...(lisible?.params ?? [])) as FicheLiee[];
  return new Map(lignes.map((l) => [l.id, { id: l.id, titre: l.titre }]));
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
  for (const x of vue.elements) { delete x.version; delete x.reserve; }
  return vue;
}

/** The core's draw of the interior of a star, as its JSON: the one call of `tirer_systeme`, with a version and an override. */
export function tirerInterieur(etoile: { q: number; r: number; taille: number; lettre: string }, version: number, valeurs: string): string {
  return leCoeur().tirer_systeme(etoile.q, etoile.r, etoile.taille, etoile.lettre, version, valeurs);
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
  const reglages = reglagesDe(db, galaxie.id);
  const tire = JSON.parse(tirerInterieur(etoile, reglages.versionGenerateur, reglages.valeurs)) as
    { astres: AstreVue[]; formations: FormationVue[]; transition: number };
  return { etoile, ...tire };
}
