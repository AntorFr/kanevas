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
  /** `contenu` without the GM blocks (AD-114), kept by `sections.ts` at each write. */
  contenu_public: string;
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
  /** Markdown source: only when the caller may write the section (AD-113). */
  contenu?: string;
  /** The source rendered by `rendreMarkdown`, for every reader. */
  html: string;
  version: number;
  modifieLe: string;
  /** Whether the caller may write the content (as seen in this view). */
  peutEcrire: boolean;
  /** Only in a GM view (never in player mode): the four switches and the author. */
  audience?: Audience;
  /** Attachments the caller sees; filled by a sheet read (AD-67). */
  piecesJointes?: PieceJointeVue[];
}

export interface PieceJointeVue {
  id: number;
  nom: string;
  taille: number;
  image: boolean;
  /** Only rendered to the GM outside player mode. */
  secrete?: boolean;
}

export interface Fiche {
  id: number;
  universId: number;
  type: TypeFiche;
  titre: string;
  charge: Record<string, unknown>;
  creeLe: string;
  modifieLe: string;
  /** Opaque token of the illustration (AD-93), null when the sheet has none. */
  illustration: IllustrationVue | null;
}

export interface IllustrationVue {
  jeton: string;
}

/** Why a sheet cites another one (AD-100): a link in one of its sections, or a relation. */
export type Pourquoi = { genre: 'lien'; section: string } | { genre: 'relation'; libelle: string };

/** One line of « Mentionnée dans »: a source sheet the reader may read, once, with all its reasons. */
export interface Mention {
  ficheId: number;
  titre: string;
  type: TypeFiche;
  pourquoi: Pourquoi[];
}

export interface PageMentions {
  mentions: Mention[];
  /** More sources exist beyond this page — computed on what the reader sees only. */
  suite: boolean;
}

export interface FicheVue extends Fiche {
  sections: SectionVue[];
  /** « Mentionnée dans »: the first page (AD-100); the rest through `GET …/mentions?apres=`. */
  mentions: Mention[];
  mentionsSuite: boolean;
  /** Import origin key (B-50): only in the GM view (outside player mode), never in a reader's answer. */
  cleOrigine?: string;
}
