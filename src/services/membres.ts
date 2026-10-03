import type { Db } from '../db/db.js';
import { exigerMJ, exigerRole } from './droits.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import type { Membre, Role } from './types.js';

export const RAISON_JAMAIS_CONNECTE = "Ce compte ne s'est jamais connecté.";
export const RAISON_DEJA_MEMBRE = 'Ce compte est déjà membre.';
export const RAISON_DERNIER_MJ = "Impossible : l'univers doit garder au moins un MJ.";

const ROLES: readonly string[] = ['mj', 'joueur'];

function verifierRole(role: string): asserts role is Role {
  if (!ROLES.includes(role)) throw invalide('Rôle inconnu.');
}

function nombreMJ(db: Db, universId: number): number {
  return (
    db
      .prepare("SELECT count(*) AS n FROM membres WHERE univers_id = ? AND role = 'mj'")
      .get(universId) as { n: number }
  ).n;
}

/**
 * The author of a section is a player member (AD-19): when a member leaves or
 * becomes GM, they stop being the author of the sections of this universe.
 */
function effacerAuteur(db: Db, universId: number, compteId: number): void {
  db.prepare(
    `UPDATE sections SET auteur_id = NULL, auteur_lit = 0, auteur_ecrit = 0
     WHERE auteur_id = ? AND fiche_id IN (SELECT id FROM fiches WHERE univers_id = ?)`,
  ).run(compteId, universId);
}

/** The member list is for the GM; a player gets "not found" (E-4). */
export function listerMembres(db: Db, acteurId: number, universId: number): Membre[] {
  if (exigerRole(db, universId, acteurId) !== 'mj') throw introuvable();
  const rows = db
    .prepare(
      `SELECT m.compte_id, c.username, m.role FROM membres m
       JOIN comptes c ON c.id = m.compte_id WHERE m.univers_id = ?
       ORDER BY c.username COLLATE NOCASE`,
    )
    .all(universId) as { compte_id: number; username: string; role: Role }[];
  return rows.map((r) => ({ compteId: r.compte_id, username: r.username, role: r.role }));
}

/** B-3: add by exact identifier, only an account that has logged in once. */
export function ajouterMembre(
  db: Db,
  acteurId: number,
  universId: number,
  username: string,
  role: Role,
): Membre {
  exigerMJ(db, universId, acteurId);
  verifierRole(role);
  const compte = db.prepare('SELECT id, username FROM comptes WHERE username = ?').get(
    username.trim(),
  ) as { id: number; username: string } | undefined;
  if (!compte) throw new ErreurService('invalide', RAISON_JAMAIS_CONNECTE);
  try {
    db.prepare('INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, ?)').run(
      universId,
      compte.id,
      role,
    );
  } catch (e) {
    if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new ErreurService('invalide', RAISON_DEJA_MEMBRE);
    }
    throw e;
  }
  return { compteId: compte.id, username: compte.username, role };
}

/** Changes a member's role; demoting the only GM is refused (B-5). */
export function changerRole(
  db: Db,
  acteurId: number,
  universId: number,
  compteId: number,
  role: Role,
): Membre {
  exigerMJ(db, universId, acteurId);
  verifierRole(role);
  return db.transaction(() => {
    const actuel = db
      .prepare(
        `SELECT m.role, c.username FROM membres m JOIN comptes c ON c.id = m.compte_id
         WHERE m.univers_id = ? AND m.compte_id = ?`,
      )
      .get(universId, compteId) as { role: Role; username: string } | undefined;
    if (!actuel) throw introuvable();
    if (actuel.role === 'mj' && role !== 'mj' && nombreMJ(db, universId) <= 1) {
      throw new ErreurService('invalide', RAISON_DERNIER_MJ);
    }
    db.prepare('UPDATE membres SET role = ? WHERE univers_id = ? AND compte_id = ?').run(
      role,
      universId,
      compteId,
    );
    if (role === 'mj') effacerAuteur(db, universId, compteId);
    return { compteId, username: actuel.username, role };
  })();
}

/** Removes a member; the only GM cannot leave (B-5). Their sections lose their author. */
export function retirerMembre(db: Db, acteurId: number, universId: number, compteId: number): void {
  exigerMJ(db, universId, acteurId);
  db.transaction(() => {
    const actuel = db
      .prepare('SELECT role FROM membres WHERE univers_id = ? AND compte_id = ?')
      .get(universId, compteId) as { role: Role } | undefined;
    if (!actuel) throw introuvable();
    if (actuel.role === 'mj' && nombreMJ(db, universId) <= 1) {
      throw new ErreurService('invalide', RAISON_DERNIER_MJ);
    }
    effacerAuteur(db, universId, compteId);
    db.prepare('DELETE FROM membres WHERE univers_id = ? AND compte_id = ?').run(
      universId,
      compteId,
    );
  })();
}
