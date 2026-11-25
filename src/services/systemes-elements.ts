import type { Db } from '../db/db.js';
import { espaceDe, lectureSysteme } from './droits.js';
import { introuvable } from './erreurs.js';
import { listerFiches } from './fiches.js';
import { listerMembresNoyau } from './membres.js';
import { vueDe, type SystemeCatalogue, type SystemeVue } from './systemes.js';
import { motsDesTypesReglables, typesDuSysteme } from './types-fiche.js';
import type { Fiche } from './types.js';

/** The system as `GET /api/systemes/:sid` answers it (AD-157). */
export interface SystemeComplet extends SystemeVue {
  types: { type: string; active: boolean }[];
  /** The words of those types (the server owns them, AD-120): a GM with no universe has no other list to name them. */
  mots: { type: string; singulier: string; pluriel: string; nouveau: string; icone: string }[];
  /** The elements, for who reads them (a GM of the system, a member of an attached universe); never for an admin with no link (rule 14). */
  fiches?: Fiche[];
  suivant?: string | null;
  /** The GMs of the system: for a GM of it and for the instance admin (B-114). */
  mj?: { compteId: number; username: string }[];
}

/**
 * The system with its types and, for who reads it, its elements (as `GET …/fiches`: `?type`, `?curseur`, 100 a page).
 * The instance admin who reads nothing of it gets the header, the types and the GMs only; anyone else who reads
 * nothing, and an unknown system, the same « not found » (AD-152, AD-157).
 */
export function lireSystemeComplet(
  db: Db,
  acteur: { compteId: number; admin: boolean },
  systemeId: number,
  options: { type?: string; curseur?: string } = {},
): SystemeComplet {
  const s = db.prepare('SELECT id, nom FROM systemes_jeu WHERE id = ?').get(systemeId) as SystemeCatalogue | undefined;
  if (!s) throw introuvable();
  const droit = lectureSysteme(db, acteur.compteId, systemeId);
  if (!droit && !acteur.admin) throw introuvable();
  const complet: SystemeComplet = { ...vueDe(db, acteur.compteId, s), types: typesDuSysteme(db, systemeId), mots: motsDesTypesReglables() };
  if (droit) {
    const page = listerFiches(db, { compteId: acteur.compteId }, droit.espaceId, options);
    complet.fiches = page.fiches;
    complet.suivant = page.suivant;
  }
  if (droit?.role === 'mj' || acteur.admin) {
    const espace = espaceDe(db, systemeId);
    complet.mj = espace === null ? [] : listerMembresNoyau(db, espace).map((m) => ({ compteId: m.compteId, username: m.username }));
  }
  return complet;
}
