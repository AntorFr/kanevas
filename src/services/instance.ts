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
 * accepts the flag, and it only touches `membres`: fiches, sections and
 * universe services never see it, so an admin without a role is a caller
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
       FROM univers u ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all() as { id: number; nom: string; n: number }[];
  return rows.map((r) => ({ id: r.id, nom: r.nom, nbMembres: r.n }));
}

function exigerUnivers(db: Db, universId: number): void {
  if (!db.prepare('SELECT 1 FROM univers WHERE id = ?').get(universId)) throw introuvable();
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
