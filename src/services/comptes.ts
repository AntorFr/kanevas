import type { Db } from '../db/db.js';
import { invalide } from './erreurs.js';
import type { Compte } from './types.js';

interface CompteRow {
  id: number;
  username: string;
  cree_le: string;
}

const versCompte = (r: CompteRow): Compte => ({ id: r.id, username: r.username, creeLe: r.cree_le });

/** The Authelia `preferred_username` is the only identity; never a role or a group (AD-9). */
export function trouverCompte(db: Db, username: string): Compte | null {
  const row = db.prepare('SELECT * FROM comptes WHERE username = ?').get(username) as
    | CompteRow
    | undefined;
  return row ? versCompte(row) : null;
}

export function lireCompte(db: Db, id: number): Compte | null {
  const row = db.prepare('SELECT * FROM comptes WHERE id = ?').get(id) as CompteRow | undefined;
  return row ? versCompte(row) : null;
}

/** First login creates the account with no access to any universe (B-1); later ones return it. */
export function assurerCompte(db: Db, username: string): Compte {
  const nom = username.trim();
  if (!nom) throw invalide("L'identifiant est vide.");
  db.prepare('INSERT OR IGNORE INTO comptes (username, cree_le) VALUES (?, ?)').run(
    nom,
    new Date().toISOString(),
  );
  return trouverCompte(db, nom)!;
}
