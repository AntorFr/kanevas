// Names of the galaxy map collapse by priority (AD-galaxie-systemes-4): pure, no DOM.
export interface CandidatNom {
  cle: string; x: number; y: number; texte: string;
  /** 0 for a defined system, 1 for a drawn star. */
  priorite: number;
  /** Size of the star, [0, 1]: the larger one is placed first within a priority. */
  taille?: number;
}
export interface VueNoms { s: number; corps?: number }
// `s` is the zoom; it moves the boxes' positions (done by the caller), not which names are tried.

/** Hexagon radius (px) from which the labels of routes and zones show: names of stars have no threshold, they give way by collision (AD-galaxie-systemes-4). */
export const SEUIL_NOMS = 12;
/** Height of a name's box, in px. */
export const HAUTEUR_NOM = 12;
const CORPS_DEFAUT = 12;

/** The `cle` of the names kept: placed by priority, then size (large first), then key; a name is kept only if its box meets no kept box. */
export function nomsVisibles(candidats: CandidatNom[], vue: VueNoms): Set<string> {
  const gardes = new Set<string>();
  const corps = vue.corps ?? CORPS_DEFAUT;
  const boites: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const ordre = [...candidats].sort((a, b) => a.priorite - b.priorite || (b.taille ?? 0) - (a.taille ?? 0) || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  for (const c of ordre) {
    const demi = (0.6 * corps * [...c.texte].length) / 2;
    const b = { x0: c.x - demi, x1: c.x + demi, y0: c.y, y1: c.y + HAUTEUR_NOM };
    if (boites.some((k) => b.x0 < k.x1 && b.x1 > k.x0 && b.y0 < k.y1 && b.y1 > k.y0)) continue;
    boites.push(b);
    gardes.add(c.cle);
  }
  return gardes;
}
