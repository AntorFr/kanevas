import type { Role } from '../../types';

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
  peutEcrire: boolean;
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
}
