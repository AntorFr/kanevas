// What an element looks like (B-96): an icon and a colour among closed lists of the server, validated at each write.
// An element has no illustration; the screen reads these lists through `catalogueElements`, never copies them.
import { COULEURS } from './ecriture-carte.js';

export const GENRES_ELEMENT = ['vaisseau', 'ville', 'station', 'base', 'autre'] as const;
export type GenreElement = (typeof GENRES_ELEMENT)[number];

/** Icons of the element mark: the five kinds first (each kind's default), then a few more. */
export const ICONES_ELEMENT = ['vaisseau', 'ville', 'station', 'base', 'autre', 'epave', 'balise', 'portail'] as const;
export const COULEURS_ELEMENT = COULEURS;

export interface AspectElement { icone: string; couleur: string }

/** The icon of a kind and the first colour of the list: what a new or an imported element without aspect reads. */
export const aspectParDefaut = (genre: GenreElement): AspectElement => ({ icone: genre, couleur: COULEURS_ELEMENT[0] });

export const catalogueElements = () => ({
  genres: [...GENRES_ELEMENT], icones: [...ICONES_ELEMENT], couleurs: [...COULEURS_ELEMENT],
});

/** Reads a stored aspect, filling what is missing with the kind's defaults. */
export function aspectLu(genre: GenreElement, stocke: string): AspectElement {
  const defaut = aspectParDefaut(genre);
  try {
    const o = JSON.parse(stocke) as Record<string, unknown>;
    return {
      icone: typeof o.icone === 'string' && (ICONES_ELEMENT as readonly string[]).includes(o.icone) ? o.icone : defaut.icone,
      couleur: typeof o.couleur === 'string' && (COULEURS_ELEMENT as readonly string[]).includes(o.couleur) ? o.couleur : defaut.couleur,
    };
  } catch {
    return defaut;
  }
}
