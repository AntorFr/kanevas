import type { Db } from '../db/db.js';
import { exigerMJ, exigerRole } from './droits.js';
import { invalide } from './erreurs.js';
import type { Role, Univers } from './types.js';

interface UniversRow {
  id: number;
  nom: string;
  description: string;
  cree_le: string;
}

const versUnivers = (r: UniversRow): Univers => ({
  id: r.id,
  nom: r.nom,
  description: r.description,
  creeLe: r.cree_le,
});

/** Any account creates a universe and becomes its GM (B-2). */
export function creerUnivers(
  db: Db,
  compteId: number,
  entree: { nom: string; description?: string },
): Univers {
  const nom = entree.nom.trim();
  if (nom.length < 1 || nom.length > 80) throw invalide('Le nom doit faire de 1 à 80 caractères.');
  if ((entree.description ?? '').length > 500) throw invalide('La description doit faire 500 caractères au plus.');
  return db.transaction(() => {
    const info = db
      .prepare('INSERT INTO univers (nom, description, cree_le) VALUES (?, ?, ?)')
      .run(nom, entree.description ?? '', new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, 'mj')").run(
      id,
      compteId,
    );
    return versUnivers(db.prepare('SELECT * FROM univers WHERE id = ?').get(id) as UniversRow);
  })();
}

/** The universes the account has a role in, with that role; a new account gets []. */
export function listerUnivers(db: Db, compteId: number): (Univers & { role: Role })[] {
  const rows = db
    .prepare(
      `SELECT u.*, m.role FROM univers u JOIN membres m ON m.univers_id = u.id
       WHERE m.compte_id = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(compteId) as (UniversRow & { role: Role })[];
  return rows.map((r) => ({ ...versUnivers(r), role: r.role }));
}

/** The GM renames the universe and rewrites its description (name 1–80, description ≤ 500). */
export function modifierUnivers(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: string; description: string },
): Univers {
  exigerMJ(db, universId, compteId);
  const nom = entree.nom.trim();
  if (nom.length < 1 || nom.length > 80) throw invalide('Le nom doit faire de 1 à 80 caractères.');
  if (entree.description.length > 500) throw invalide('La description doit faire 500 caractères au plus.');
  db.prepare('UPDATE univers SET nom = ?, description = ? WHERE id = ?').run(nom, entree.description, universId);
  return versUnivers(db.prepare('SELECT * FROM univers WHERE id = ?').get(universId) as UniversRow);
}

/** Not found for a caller without a role (B-4). */
export function lireUnivers(db: Db, compteId: number, universId: number): Univers & { role: Role } {
  const role = exigerRole(db, universId, compteId);
  const row = db.prepare('SELECT * FROM univers WHERE id = ?').get(universId) as UniversRow;
  return { ...versUnivers(row), role };
}
