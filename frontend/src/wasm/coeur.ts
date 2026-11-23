// Typed calls on the exports of the `coeur` module (AD-139, AD-etoiles-3), browser side. No logic here:
// the server twin is src/wasm/coeur.ts; one .wasm, so the same bytes.
import { chargerModule } from './charger';

/** A star as the core serialises it. */
export interface EtoileCoeur {
  q: number;
  r: number;
  taille: number;
  lettre: string;
  x: number;
  y: number;
}

/** The exact JSON the core returns for a block: `null` or an `EtoileCoeur`. `densites` and `exclus` hold nine values. */
export async function tirerBloc(
  graine: string,
  bx: number,
  by: number,
  densites: ArrayLike<number>,
  exclus: ArrayLike<number | boolean>,
): Promise<string> {
  const c = await chargerModule('coeur');
  return c.tirer_bloc(graine, bx, by, Float64Array.from(densites), Uint8Array.from(exclus, Number));
}

export async function hexVersPlan(q: number, r: number): Promise<[number, number]> {
  const p = (await chargerModule('coeur')).hex_vers_plan(q, r);
  return [p[0]!, p[1]!];
}

export async function planVersHex(x: number, y: number): Promise<[number, number]> {
  const h = (await chargerModule('coeur')).plan_vers_hex(x, y);
  return [h[0]!, h[1]!];
}

export async function densiteDefaut(): Promise<number> {
  return (await chargerModule('coeur')).densite_defaut();
}

/**
 * The exact JSON the core returns for the interior of a system (AD-systeme-2); `version` is the generator version,
 * `valeurs` the settings object (the complete one, or a subset over the defaults; `{}`: the defaults). Throws if the core refuses.
 */
export async function tirerSysteme(
  q: number,
  r: number,
  taille: number,
  lettre: string,
  version: number,
  valeurs = '{}',
): Promise<string> {
  return (await chargerModule('coeur')).tirer_systeme(q, r, taille, lettre, version, valeurs);
}

/** The complete default settings object of a generator version, as JSON. Throws for an unknown version (AD-reglages-1). */
export async function reglagesDefaut(version: number): Promise<string> {
  return (await chargerModule('coeur')).reglages_defaut(version);
}

/** The core's verdict on an override, as JSON: `{ ok: true, canonique }` or `{ ok: false, champ, borne, message }`. */
export async function validerReglages(version: number, surcharge: string): Promise<string> {
  return (await chargerModule('coeur')).valider_reglages(version, surcharge);
}

/** The complete settings object, the override over the defaults, as JSON. Throws with the core's message if the override is refused. */
export async function fusionnerReglages(version: number, surcharge: string): Promise<string> {
  return (await chargerModule('coeur')).fusionner_reglages(version, surcharge);
}

/** The generator versions the core knows, oldest first (AD-148). */
export async function versionsGenerateur(): Promise<number[]> {
  return Array.from((await chargerModule('coeur')).versions_generateur());
}

/** The generator version a galaxy created now draws with. */
export async function versionGenerateurCourante(): Promise<number> {
  return (await chargerModule('coeur')).version_generateur_courante();
}

/** The core's verdict on the partial aspect of a type, as JSON: `{ ok: true, canonique }` or `{ ok: false, champ, borne, message }`. */
export async function validerAspectType(type: string, json: string): Promise<string> {
  return (await chargerModule('coeur')).valider_aspect_type(type, json);
}

/** The default parameters of every type of the catalogue of aspects, as a JSON object `{ <type>: <aspect> }`. */
export async function typesCatalogue(): Promise<string> {
  return (await chargerModule('coeur')).types_catalogue();
}

/** The default `transition` of stored rows, from the JSON arrays of `astres` and `formations`. */
export async function transitionDefaut(astres: string, formations: string): Promise<number> {
  return (await chargerModule('coeur')).transition_defaut(astres, formations);
}

export async function orbiteHeureVersPlan(orbite: number, heure: number): Promise<[number, number]> {
  const p = (await chargerModule('coeur')).orbite_heure_vers_plan(orbite, heure);
  return [p[0]!, p[1]!];
}

export async function planVersOrbiteHeure(x: number, y: number): Promise<[number, number]> {
  const o = (await chargerModule('coeur')).plan_vers_orbite_heure(x, y);
  return [o[0]!, o[1]!];
}

/** RGBA bytes (`cote * cote * 4`) of a body drawn from its aspect JSON (AD-carte-1). Throws if the core refuses. */
export async function dessiner(aspect: string, cote: number, versionRendu: number): Promise<Uint8Array> {
  return (await chargerModule('coeur')).dessiner_astre(aspect, cote, versionRendu);
}

export async function versionRendu(): Promise<number> {
  return (await chargerModule('coeur')).version_rendu();
}

export async function catalogueAspects(): Promise<string> {
  return (await chargerModule('coeur')).catalogue_aspects();
}

/** Types of the aspects catalogue a body of `genre` (`etoile`, `planete`, `lune`, `comete`) may take. Throws for another genre. */
export async function typesAstre(genre: string): Promise<string[]> {
  return JSON.parse((await chargerModule('coeur')).types_astre(genre)) as string[];
}

/** `[orbite, heure]` of a galactic offset `(dq, dr)` (hexagons, real), the adjacent hexagons falling on the circle of radius `rayon` (AD-edition-4). */
export async function galactiqueVersOrbiteHeure(dq: number, dr: number, rayon: number): Promise<[number, number]> {
  const p = (await chargerModule('coeur')).galactique_vers_orbite_heure(dq, dr, rayon);
  return [p[0]!, p[1]!];
}

/** The aspect JSON re-serialised if it is valid for the type (<= 4 KiB, known keys, bounds). Throws with the core's message otherwise. */
export async function validerAspect(type: string, json: string): Promise<string> {
  return (await chargerModule('coeur')).valider_aspect(type, json);
}

/** The parameters JSON re-serialised if they are valid for the shape (`anneau` or `nuage`, <= 8 KiB). Throws with the core's message otherwise. */
export async function validerFormation(forme: string, json: string): Promise<string> {
  return (await chargerModule('coeur')).valider_formation(forme, json);
}

/** The seven star classes of the core as JSON: `[{ lettre, libelle, couleur }]`. */
export async function classesEtoile(): Promise<string> {
  return (await chargerModule('coeur')).classes_etoile();
}

/** The class letter drawn from a key and a size in [0, 1]; never `V`. Throws on a size out of range. */
export async function classeDeCle(cle: string, taille: number): Promise<string> {
  return (await chargerModule('coeur')).classe_de_cle(cle, taille);
}
