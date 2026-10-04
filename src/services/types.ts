export type Role = 'mj' | 'joueur';

export const TYPES_FICHE = [
  'personnage',
  'lieu',
  'faction',
  'objet',
  'evenement',
  'quete',
  'compte_rendu',
] as const;
export type TypeFiche = (typeof TYPES_FICHE)[number];

/**
 * Who is asking. `modeJoueur` (AD-39) only restricts READS: the caller is read
 * as a player who authors no section. Writes ignore it.
 */
export interface Acteur {
  compteId: number;
  modeJoueur?: boolean;
}

export interface Compte {
  id: number;
  username: string;
  creeLe: string;
}

export interface Univers {
  id: number;
  nom: string;
  description: string;
  creeLe: string;
}

export interface Membre {
  compteId: number;
  username: string;
  role: Role;
}

export interface SectionRow {
  id: number;
  fiche_id: number;
  titre: string;
  ordre: number;
  contenu: string;
  version: number;
  modifie_le: string;
  joueurs_lisent: number;
  joueurs_ecrivent: number;
  auteur_id: number | null;
  auteur_lit: number;
  auteur_ecrit: number;
}

export interface Audience {
  joueursLisent: boolean;
  joueursEcrivent: boolean;
  auteurId: number | null;
  auteurLit: boolean;
  auteurEcrit: boolean;
}

export interface SectionVue {
  id: number;
  titre: string;
  ordre: number;
  contenu: string;
  version: number;
  modifieLe: string;
  /** Whether the caller may write the content (as seen in this view). */
  peutEcrire: boolean;
  /** Only in a GM view (never in player mode): the four switches and the author. */
  audience?: Audience;
}

export interface Fiche {
  id: number;
  universId: number;
  type: TypeFiche;
  titre: string;
  charge: Record<string, unknown>;
  creeLe: string;
  modifieLe: string;
}

export interface FicheVue extends Fiche {
  sections: SectionVue[];
}
