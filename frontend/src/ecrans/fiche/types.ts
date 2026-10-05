import type { Role } from '../../types';

export interface Audience {
  joueursLisent: boolean;
  joueursEcrivent: boolean;
  auteurId: number | null;
  auteurLit: boolean;
  auteurEcrit: boolean;
}

/** An attachment as the sheet read carries it (AD-67); `secrete` only in a GM view. */
export interface PieceJointe {
  id: number;
  nom: string;
  taille: number;
  image: boolean;
  secrete?: boolean;
}

export interface SectionVue {
  id: number;
  titre: string;
  ordre: number;
  contenu: string;
  version: number;
  modifieLe: string;
  peutEcrire: boolean;
  piecesJointes?: PieceJointe[];
  /** Only in a GM view (never in player mode). */
  audience?: Audience;
}

export interface Fiche {
  id: number;
  universId: number;
  type: string;
  titre: string;
  charge: { v?: number; pj?: boolean };
}

export interface FicheVue extends Fiche {
  sections: SectionVue[];
}

export interface PageFiches {
  fiches: Fiche[];
  suivant: string | null;
}

/** What a section block receives (see `registre.ts`). `role` is the effective one (player mode = joueur). */
export interface PropsBlocSection {
  universId: number;
  fiche: FicheVue;
  section: SectionVue;
  role: Role;
  /** `?mode=joueur` when the GM views as a player, else ''. */
  suffixeMode?: string;
  /** Refetches the sheet after a write. */
  rafraichir: () => Promise<void>;
}
