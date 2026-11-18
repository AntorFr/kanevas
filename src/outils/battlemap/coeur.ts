// The only loader of the `battlemap-core` Wasm on the server (AD-battlemap-editeur-1, AD-battlemap-editeur-9): one instance,
// pure functions over JSON text and bytes, no I/O. The services of the map call the core through here and nowhere else.
import type * as Coeur from '../../../rust/pkg/battlemap_core/battlemap_core.js';
import { chargerModule } from '../../wasm/charger.js';

// Services are synchronous (better-sqlite3 transactions) and the loader is not: the module is read once, when this file is
// first imported. A missing artefact does not break the import (a server without the Wasm still starts and serves every
// other tool): it is raised, with the loader's fixed message, by the first call that needs the core.
let instance: typeof Coeur | undefined;
let echec: Error | undefined;
try {
  instance = await chargerModule<typeof Coeur>('battlemap_core');
} catch (e) {
  echec = e as Error;
}

function coeur(): typeof Coeur {
  if (!instance) throw echec ?? new Error('Wasm module "battlemap_core" is missing or unreadable.');
  return instance;
}

export interface RefusCoeur { ok: false; code: string; champ?: string; index?: number }
export interface Limites {
  largeur_max: number; hauteur_max: number; elements_max: number; calques_max: number;
  document_octets_max: number; echelle_min: number; echelle_max: number;
}
export interface ContexteFiltre { assets_mj_seul: string[]; assets_retires: string[]; fiches_lisibles: string[] }

/** The limits of AD-163, for a caller that must show one. */
export const limites = (): Limites => JSON.parse(coeur().limites()) as Limites;

/** The document of a new map (three empty layers). Throws the core's code (`limite_depassee`) as a message. */
export function carteVide(largeur: number, hauteur: number): string {
  try {
    return coeur().carte_vide(largeur, hauteur);
  } catch (e) {
    throw new ErreurCoeur(String(e));
  }
}

/** A batch applied whole: the new document and the inverse commands, or the core's refusal. */
export function appliquerLot(document: string, commandes: unknown): { ok: true; document: string; inverses: unknown[] } | RefusCoeur {
  const r = JSON.parse(coeur().appliquerLot(document, JSON.stringify(commandes))) as
    { ok: true; document: unknown; inverses: unknown[] } | RefusCoeur;
  // The document stays text: it is stored as received from the core, never re-serialised by a second writer.
  return r.ok ? { ok: true, document: JSON.stringify(r.document), inverses: r.inverses } : r;
}

export const validerDocument = (document: string): { ok: true } | RefusCoeur =>
  JSON.parse(coeur().validerDocument(document)) as { ok: true } | RefusCoeur;

export function filtrerPourJoueur(document: string, contexte: ContexteFiltre): string {
  try {
    return coeur().filtrerPourJoueur(document, JSON.stringify(contexte));
  } catch (e) {
    throw new ErreurCoeur(String(e));
  }
}

export function compterUsages(document: string, assetId: string): number {
  try {
    return coeur().compterUsages(document, assetId);
  } catch (e) {
    throw new ErreurCoeur(String(e));
  }
}

export const alphaPng = (octets: Uint8Array): boolean => coeur().alphaPng(octets);
export function detourerFondUni(octets: Uint8Array): Uint8Array {
  try {
    return coeur().detourerFondUni(octets);
  } catch (e) {
    throw new ErreurCoeur(String(e));
  }
}

export interface ContexteTable { empreintes: Record<string, [number, number]>; acteur?: 'mj' | 'joueur' }
export interface ContexteVue extends ContexteFiltre { empreintes: Record<string, [number, number]> }
export interface EtatTable {
  schema: number;
  pions: { id: string; nom: string; asset_id: string | null; fiche_id: string | null; x: number; y: number; visible: boolean }[];
  brouillard: string; vue: { x: number; y: number; l: number; h: number } | null; calques_masques: string[];
}

/** The state of a new table: nothing revealed. */
export function etatVide(largeur: number, hauteur: number): string {
  try {
    return coeur().etatVide(largeur, hauteur);
  } catch (e) {
    throw new ErreurCoeur(String(e));
  }
}

/** A batch of table commands applied whole: the new state (text, as the core wrote it) or the core's refusal. */
export function appliquerTable(document: string, etat: string, lot: unknown, contexte: ContexteTable): { ok: true; etat: string } | RefusCoeur {
  const r = JSON.parse(coeur().appliquerTable(document, etat, JSON.stringify(lot), JSON.stringify(contexte))) as
    { ok: true; etat: unknown } | RefusCoeur;
  return r.ok ? { ok: true, etat: JSON.stringify(r.etat) } : r;
}

/** What a player reads: the filtered document, the tokens, the bitmap and the shared view. */
export function vueJoueur(document: string, etat: string, contexte: ContexteVue): { document: unknown; pions: unknown[]; brouillard: string; vue: unknown } {
  try {
    return JSON.parse(coeur().vueJoueur(document, etat, JSON.stringify(contexte)));
  } catch (e) {
    throw new ErreurCoeur(String(e));
  }
}

export function redimensionnerEtat(etat: string, avant: [number, number], apres: [number, number], contexte: ContexteTable): { ok: true; etat: string } | RefusCoeur {
  const r = JSON.parse(coeur().redimensionnerEtat(etat, avant[0], avant[1], apres[0], apres[1], JSON.stringify(contexte))) as
    { ok: true; etat: unknown } | RefusCoeur;
  return r.ok ? { ok: true, etat: JSON.stringify(r.etat) } : r;
}

/** A refusal of the core outside a batch: `message` is its fixed code. */
export class ErreurCoeur extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'ErreurCoeur';
  }
}
