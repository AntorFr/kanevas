import type { Db } from '../db/db.js';
import { introuvable } from './erreurs.js';
import type { Jeton } from './jetons.js';

export interface ResultatSuiviImport {
  id: number;
  etat: 'creee' | 'mise_a_jour' | 'inchangee';
  avertissements: string[];
}

/** An origin key: 1 to 200 characters, no `|`, `]` nor line break (import API contract). */
export function cleValide(cle: string): boolean {
  return cle.length >= 1 && cle.length <= 200 && !/[|\]\r\n]/.test(cle);
}

/** What `GET /` of the import API says about the token's universe and account. */
export function lireContexteImport(
  db: Db,
  jeton: Jeton,
): { univers: { id: number; nom: string }; compte: { id: number; username: string } } {
  const univers = db.prepare('SELECT id, nom FROM univers WHERE id = ?').get(jeton.universId) as
    | { id: number; nom: string }
    | undefined;
  const compte = db.prepare('SELECT id, username FROM comptes WHERE id = ?').get(jeton.compteId) as
    | { id: number; username: string }
    | undefined;
  if (!univers || !compte) throw introuvable();
  return { univers, compte };
}
