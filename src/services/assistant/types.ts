import type { z } from 'zod';

/**
 * What an agent write adds to the answer (AD-76). `libelle` is written by the
 * server and only names what the caller may read; `cible` lets the client build
 * the link (sheet or proposal).
 */
export type TypeEvenement =
  | 'fiche_creee'
  | 'section_modifiee'
  | 'section_completee'
  | 'proposition_creee'
  | 'image_attachee'
  | 'fiche_modifiee'
  | 'fiche_supprimee'
  | 'section_supprimee'
  | 'relation_creee'
  | 'relation_modifiee'
  | 'relation_retiree'
  | 'systeme_modifie'
  // Battle map (AD-battlemap-assistant-6)
  | 'direction_ecrite'
  | 'lot_prepare'
  | 'carte_composee';

export interface Evenement {
  type: TypeEvenement;
  libelle: string;
  cible: { type: 'fiche' | 'proposition' | 'systeme' | 'direction' | 'lot' | 'carte'; [id: string]: string | number };
}

/**
 * The result of a tool call. A failure carries the text the interface would
 * show ("Introuvable." …) and never an event (AD-74, AD-76).
 */
export type Resultat =
  | { ok: true; donnees: unknown; evenement?: Evenement }
  | {
    ok: false;
    erreur: string;
    /** The refusal's code, for the MCP door's write tools (`section_modifiee`, `section_geree`, `invalide`…). */
    code?: string;
    /** The field an `invalide` refusal is about. */
    champ?: string;
  };

/**
 * What one request shares between its tool calls (AD-89): the abort signal of the request and
 * whether an image was already generated in it. The orchestration creates one per request.
 */
export interface ContexteDemande {
  signal?: AbortSignal;
  imageGeneree?: boolean;
}

/**
 * A tool, neutral of any transport (AD-73): a description, a zod schema and an
 * executor. The caller's account, universe and role are closed over by the
 * catalogue — they are never parameters (AD-74).
 */
export interface Outil {
  nom: string;
  /** The doors that offer the tool (AD-mcp-2); absent = the assistant's alone (the modules' tools). */
  portes?: readonly Porte[];
  description: string;
  schema: z.ZodObject;
  /** Validates `args` against `schema` then runs; never throws for a service refusal. */
  executer(args: unknown, contexte?: ContexteDemande): Resultat | Promise<Resultat>;
  /** True for a tool whose time is not counted in the request's deadline (the image engine, AD-90). */
  horsDelai?: boolean;
}

/** The doors of the catalogue (AD-mcp-2): the in-app assistant and the MCP server. */
export type Porte = 'assistant' | 'mcp';

export interface Catalogue {
  role: 'mj' | 'joueur';
  porte: Porte;
  /** What the door's token writes; the assistant's door is `ecriture` (its own tools check the role). */
  niveau: 'lecture' | 'ecriture';
  outils: Outil[];
}
