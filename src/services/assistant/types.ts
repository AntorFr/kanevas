import type { z } from 'zod';

/**
 * What an agent write adds to the answer (AD-76). `libelle` is written by the
 * server and only names what the caller may read; `cible` lets the client build
 * the link (sheet, campaign or scenario).
 */
export type TypeEvenement =
  | 'section_modifiee'
  | 'section_completee'
  | 'campagne_creee'
  | 'scenario_cree'
  | 'image_attachee';

export interface Evenement {
  type: TypeEvenement;
  libelle: string;
  cible: { type: 'fiche' | 'campagne' | 'scenario'; [id: string]: string | number };
}

/**
 * The result of a tool call. A failure carries the text the interface would
 * show ("Introuvable." …) and never an event (AD-74, AD-76).
 */
export type Resultat =
  | { ok: true; donnees: unknown; evenement?: Evenement }
  | { ok: false; erreur: string };

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
  description: string;
  schema: z.ZodObject;
  /** Validates `args` against `schema` then runs; never throws for a service refusal. */
  executer(args: unknown, contexte?: ContexteDemande): Resultat | Promise<Resultat>;
  /** True for a tool whose time is not counted in the request's deadline (the image engine, AD-90). */
  horsDelai?: boolean;
}

export interface Catalogue {
  role: 'mj' | 'joueur';
  outils: Outil[];
}
