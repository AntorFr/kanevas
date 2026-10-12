import type { Carte } from '../cartes/commun';

/** An element of a map as `lireCarte` returns it (`ElementVue`): a token (with a position) or a node. */
export interface Element {
  id: number;
  ficheId: number;
  titre: string;
  type: string;
  x?: number;
  y?: number;
}

export interface Lien {
  de: number;
  vers: number;
  type: string;
}

/** The answer of `GET /api/univers/:id/cartes/:cid` (`CarteLue` of the server). */
export interface CarteLue {
  carte: Carte;
  peutEcrire: boolean;
  elements: Element[];
  liens?: Lien[];
}

export const ECHEC = 'L’action n’a pas abouti. Réessayez.';

const TYPES: Record<string, string> = {
  personnage: 'Personnage',
  lieu: 'Lieu',
  faction: 'Faction',
  objet: 'Objet',
  evenement: 'Événement',
  quete: 'Quête',
  compte_rendu: 'Compte-rendu',
};
export const TYPES_CHOIX = Object.entries(TYPES).map(([type, label]) => ({ type, label }));
export const libelleType = (type: string) => TYPES[type] ?? type;

/** Title as a token or a node shows it: 24 characters, then « … ». */
export const titreCourt = (t: string) => (Array.from(t).length > 24 ? `${Array.from(t).slice(0, 24).join('')}…` : t);

export const adresseFiche = (universId: number | string, ficheId: number) => `/univers/${universId}/fiche/${ficheId}`;

/** A position in percent, held in the frame then rounded to two decimals (AD-70). */
export const borner = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
