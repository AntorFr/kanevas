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

/** The exact JSON the core returns for the interior of a system (AD-systeme-2); `version` is the generator version. Throws if the core refuses. */
export async function tirerSysteme(q: number, r: number, taille: number, lettre: string, version: number): Promise<string> {
  return (await chargerModule('coeur')).tirer_systeme(q, r, taille, lettre, version);
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
