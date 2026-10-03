import type { Db } from '../db/db.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import type { Acteur, Audience, Role, SectionRow, SectionVue } from './types.js';

/** The caller's role in a universe, read from `membres` on every call (AD-9). */
export function roleDe(db: Db, universId: number, compteId: number): Role | null {
  const row = db
    .prepare('SELECT role FROM membres WHERE univers_id = ? AND compte_id = ?')
    .get(universId, compteId) as { role: Role } | undefined;
  return row?.role ?? null;
}

/** A caller without a role gets "not found", as if the universe did not exist (B-4). */
export function exigerRole(db: Db, universId: number, compteId: number): Role {
  const role = roleDe(db, universId, compteId);
  if (!role) throw introuvable();
  return role;
}

/** GM only. No role → not found; a player → refused. */
export function exigerMJ(db: Db, universId: number, compteId: number): void {
  if (exigerRole(db, universId, compteId) !== 'mj') throw refuse();
}

/**
 * How a read is made: the GM reads everything (AD-18) unless in player mode
 * (AD-39), which reads as a player who authors no section.
 */
function regard(role: Role, acteur: Acteur): { mj: boolean; auteurId: number | null } {
  if (acteur.modeJoueur) return { mj: false, auteurId: null };
  return { mj: role === 'mj', auteurId: acteur.compteId };
}

/** True when the read view of this caller is the full GM one. */
export function vueMJ(role: Role, acteur: Acteur): boolean {
  return regard(role, acteur).mj;
}

export function peutLireSection(role: Role, s: SectionRow, acteur: Acteur): boolean {
  const r = regard(role, acteur);
  if (r.mj) return true;
  return s.joueurs_lisent === 1 || (s.auteur_id !== null && s.auteur_id === r.auteurId && s.auteur_lit === 1);
}

/** Write rights come from the audience (AD-19); the GM always writes (AD-18). */
export function peutEcrireSection(role: Role, s: SectionRow, compteId: number): boolean {
  if (role === 'mj') return true;
  return s.joueurs_ecrivent === 1 || (s.auteur_id === compteId && s.auteur_ecrit === 1);
}

export function audienceDe(s: SectionRow): Audience {
  return {
    joueursLisent: s.joueurs_lisent === 1,
    joueursEcrivent: s.joueurs_ecrivent === 1,
    auteurId: s.auteur_id,
    auteurLit: s.auteur_lit === 1,
    auteurEcrit: s.auteur_ecrit === 1,
  };
}

/** The view of a section for a caller who may read it. */
export function vueSection(role: Role, s: SectionRow, acteur: Acteur): SectionVue {
  const vue: SectionVue = {
    id: s.id,
    titre: s.titre,
    ordre: s.ordre,
    contenu: s.contenu,
    version: s.version,
    modifieLe: s.modifie_le,
    // Player mode is a read view: it never shows a write right the player lacks as a non-author.
    peutEcrire: acteur.modeJoueur
      ? peutEcrireSection('joueur', s, -1)
      : peutEcrireSection(role, s, acteur.compteId),
  };
  if (vueMJ(role, acteur)) vue.audience = audienceDe(s);
  return vue;
}

export { ErreurService };
