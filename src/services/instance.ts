import type { Db } from '../db/db.js';
import { introuvable } from './erreurs.js';
import {
  ajouterMembreNoyau,
  changerRoleNoyau,
  listerMembresNoyau,
  retirerMembreNoyau,
} from './membres.js';
import type { Membre, Role } from './types.js';

/**
 * Instance administration (B-6, AD-86). `admin` is built by the route from the
 * session groups, never from a request body. This module is the only one that
 * accepts the flag. It touches `membres`, plus `univers` for the instance
 * list only (id, name, member count; AD-87). Fiches, sections and universe
 * services never see the flag, so an admin without a role is a caller
 * without a role there (AD-22).
 */
export interface ActeurInstance {
  compteId: number;
  admin: boolean;
}

/** A non-admin gets "not found", as for an unknown resource (AD-87). */
function exigerAdmin(acteur: ActeurInstance): void {
  if (acteur.admin !== true) throw introuvable();
}

/** Every universe of the instance: id, name and member count only (no description). */
export function listerUniversInstance(
  db: Db,
  acteur: ActeurInstance,
): { id: number; nom: string; nbMembres: number }[] {
  exigerAdmin(acteur);
  const rows = db
    .prepare(
      `SELECT u.id, u.nom, (SELECT count(*) FROM membres m WHERE m.univers_id = u.id) AS n
       FROM univers u WHERE u.espace_systeme_id IS NULL ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all() as { id: number; nom: string; n: number }[];
  return rows.map((r) => ({ id: r.id, nom: r.nom, nbMembres: r.n }));
}

function exigerUnivers(db: Db, universId: number): void {
  if (!db.prepare('SELECT 1 FROM univers WHERE id = ? AND espace_systeme_id IS NULL').get(universId)) throw introuvable();
}

export function listerMembresInstance(db: Db, acteur: ActeurInstance, universId: number): Membre[] {
  exigerAdmin(acteur);
  exigerUnivers(db, universId);
  return listerMembresNoyau(db, universId);
}

export function ajouterMembreInstance(
  db: Db,
  acteur: ActeurInstance,
  universId: number,
  username: string,
  role: Role,
): Membre {
  exigerAdmin(acteur);
  exigerUnivers(db, universId);
  return ajouterMembreNoyau(db, universId, username, role);
}

export function changerRoleInstance(
  db: Db,
  acteur: ActeurInstance,
  universId: number,
  compteId: number,
  role: Role,
): Membre {
  exigerAdmin(acteur);
  exigerUnivers(db, universId);
  return changerRoleNoyau(db, universId, compteId, role);
}

export function retirerMembreInstance(
  db: Db,
  acteur: ActeurInstance,
  universId: number,
  compteId: number,
): void {
  exigerAdmin(acteur);
  exigerUnivers(db, universId);
  retirerMembreNoyau(db, universId, compteId);
}

/** The hidden space of a system, or "not found" (AD-151, AD-157). */
function espaceOuIntrouvable(db: Db, systemeId: number): number {
  const r = db.prepare('SELECT id FROM univers WHERE espace_systeme_id = ?').get(systemeId) as { id: number } | undefined;
  if (!r) throw introuvable();
  return r.id;
}

/** Every system of the instance (AD-157): how the admin reaches one with no GM or no universe. */
export function listerSystemesInstance(
  db: Db,
  acteur: ActeurInstance,
): { id: number; nom: string; nbUnivers: number; nbMJ: number }[] {
  exigerAdmin(acteur);
  const rows = db
    .prepare(
      `SELECT s.id, s.nom,
              (SELECT count(*) FROM univers u WHERE u.systeme_id = s.id) AS nu,
              (SELECT count(*) FROM membres m JOIN univers e ON e.id = m.univers_id
                WHERE e.espace_systeme_id = s.id AND m.role = 'mj') AS nm
       FROM systemes_jeu s ORDER BY s.nom COLLATE NOCASE, s.id`,
    )
    .all() as { id: number; nom: string; nu: number; nm: number }[];
  return rows.map((r) => ({ id: r.id, nom: r.nom, nbUnivers: r.nu, nbMJ: r.nm }));
}

/** The GMs of a system: the `membres` of its space (AD-152). */
export function listerMJSysteme(db: Db, acteur: ActeurInstance, systemeId: number): Membre[] {
  exigerAdmin(acteur);
  return listerMembresNoyau(db, espaceOuIntrouvable(db, systemeId));
}

export function ajouterMJSysteme(db: Db, acteur: ActeurInstance, systemeId: number, username: string): Membre {
  exigerAdmin(acteur);
  return ajouterMembreNoyau(db, espaceOuIntrouvable(db, systemeId), username, 'mj');
}

/** No floor of one GM here (B-114): a system with no GM is edited by nobody. */
export function retirerMJSysteme(db: Db, acteur: ActeurInstance, systemeId: number, compteId: number): void {
  exigerAdmin(acteur);
  const espace = espaceOuIntrouvable(db, systemeId);
  const n = db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(espace, compteId).changes;
  if (n === 0) throw introuvable();
}
