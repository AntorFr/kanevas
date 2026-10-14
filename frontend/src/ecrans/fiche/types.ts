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
  /** Markdown source: only when the caller may write the section (AD-113). */
  contenu?: string;
  /** The rendered source (AD-113), for every reader. */
  html: string;
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
  creeLe?: string;
  /** Free sub-type under the title (AD-113), absent when the sheet has none. */
  sousType?: string | null;
  charge: { v?: number; pj?: boolean };
  /** The sheet's illustration (AD-93): `jeton` changes at each replacement and goes in the image address. */
  illustration?: { jeton: string } | null;
  /** Aliases and labels (AD-118), sorted by the server. */
  alias?: string[];
  etiquettes?: string[];
  /** With a search: the alias that answers when the title does not. */
  aliasTrouve?: string;
}

/** One line of « Mentionnée dans » (AD-100). */
export interface Mention {
  ficheId: number;
  titre: string;
  type: string;
  pourquoi: ({ genre: 'lien'; section: string } | { genre: 'relation'; libelle: string })[];
}

/** A readable ancestor, highest first (AD-115 (2)). */
export interface Ancetre {
  id: number;
  titre: string;
  type: string;
}

/** A child in « Contient » (AD-115 (3)). */
export interface Enfant {
  id: number;
  titre: string;
  type: string;
  sousType: string | null;
}

export interface PageEnfants {
  enfants: Enfant[];
  suivant: string | null;
}

export interface FicheVue extends Fiche {
  /** Readable ancestors, highest first; the unreadable ones are skipped by the server. */
  ancetres?: Ancetre[];
  sections: SectionVue[];
  /** « Mentionnée dans »: the first page, what the reader sees only. */
  mentions?: Mention[];
  mentionsSuite?: boolean;
  mentionsRestantes?: number;
  /** Origin key of an imported sheet (B-50): sent to the GM outside player mode only. */
  cleOrigine?: string;
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
