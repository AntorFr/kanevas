import type { Db } from '../db/db.js';
import { exigerMJ, exigerRole } from './droits.js';
import { ErreurService, invalide, refuse } from './erreurs.js';
import { supprimerFichier } from './stockage.js';
import type { Acteur, Role, Univers } from './types.js';

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

export interface SystemeRef {
  id: number;
  nom: string;
}

/** The system of a universe as the universe shows it: `null` when detached (AD-94). */
function systemeRef(db: Db, universId: number): SystemeRef | null {
  return (
    (db
      .prepare('SELECT s.id, s.nom FROM univers u JOIN systemes_jeu s ON s.id = u.systeme_id WHERE u.id = ?')
      .get(universId) as SystemeRef | undefined) ?? null
  );
}

/** The universes the account has a role in, with that role, system and member count; a new account gets []. */
export function listerUnivers(
  db: Db,
  compteId: number,
): (Univers & { role: Role; systeme: SystemeRef | null; nbMembres: number })[] {
  const rows = db
    .prepare(
      `SELECT u.*, m.role,
              (SELECT COUNT(*) FROM membres x WHERE x.univers_id = u.id) AS nb_membres
       FROM univers u JOIN membres m ON m.univers_id = u.id
       WHERE m.compte_id = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(compteId) as (UniversRow & { role: Role; nb_membres: number })[];
  return rows.map((r) => ({
    ...versUnivers(r),
    role: r.role,
    systeme: systemeRef(db, r.id),
    nbMembres: r.nb_membres,
  }));
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
export function lireUnivers(
  db: Db,
  compteId: number,
  universId: number,
): Univers & { role: Role; systeme: SystemeRef | null } {
  const role = exigerRole(db, universId, compteId);
  const row = db.prepare('SELECT * FROM univers WHERE id = ?').get(universId) as UniversRow;
  return { ...versUnivers(row), role, systeme: systemeRef(db, universId) };
}

/**
 * The GM deletes the universe (AD-105, AD-119 (5)). Only a GM outside player mode (no role: not found;
 * a player: refused); the name is compared to the letter **here**, never by the browser alone
 * (`invalide`, `detail: 'nom_different'`). One transaction removes everything that hangs from the
 * universe, children before parents so that an omission fails on a `RESTRICT` rather than leaving an
 * orphan row; the game system stays. The files of the library, the map backgrounds and the historical
 * attachments are listed **before** and leave the disk only **after** the commit (a failed erasure is
 * logged, never undoes).
 */
export function supprimerUnivers(db: Db, acteur: Acteur, universId: number, nom: unknown): void {
  const role = exigerRole(db, universId, acteur.compteId);
  if (role !== 'mj' || acteur.modeJoueur) throw refuse();
  const u = db.prepare('SELECT nom FROM univers WHERE id = ?').get(universId) as { nom: string };
  if (typeof nom !== 'string' || nom !== u.nom) {
    throw new ErreurService('invalide', "Le nom ne correspond pas à celui de l'univers.", 'nom_different');
  }
  const disques = db.transaction(() => {
    const colonne = (sql: string) => (db.prepare(sql).all(universId) as { d: string }[]).map((r) => r.d);
    const aEffacer = [
      ...colonne('SELECT disque AS d FROM fichiers WHERE univers_id = ?'),
      ...colonne('SELECT fond AS d FROM cartes WHERE univers_id = ? AND fond IS NOT NULL'),
      ...colonne(
        `SELECT p.fichier AS d FROM pieces_jointes p JOIN sections s ON s.id = p.section_id
           JOIN fiches f ON f.id = s.fiche_id WHERE f.univers_id = ?`,
      ),
    ];
    const run = (sql: string) => db.prepare(sql).run(universId);
    run('DELETE FROM lots_import WHERE univers_id = ?');
    run('DELETE FROM jetons_api WHERE univers_id = ?');
    run('DELETE FROM taches_preparation WHERE campagne_id IN (SELECT id FROM campagnes WHERE univers_id = ?)');
    run('DELETE FROM scenarios WHERE campagne_id IN (SELECT id FROM campagnes WHERE univers_id = ?)');
    run('DELETE FROM campagnes WHERE univers_id = ?');
    run('DELETE FROM elements_carte WHERE carte_id IN (SELECT id FROM cartes WHERE univers_id = ?)');
    run('DELETE FROM cartes WHERE univers_id = ?');
    run('DELETE FROM propositions WHERE univers_id = ?');
    run('DELETE FROM fichiers_attente WHERE univers_id = ?');
    run('DELETE FROM relations WHERE cible_fiche_id IN (SELECT id FROM fiches WHERE univers_id = ?)');
    run('UPDATE fiches SET parent_id = NULL WHERE univers_id = ?');
    // Sections take with them their links, file references, proposals, waiting keys, relations.
    run('DELETE FROM sections WHERE fiche_id IN (SELECT id FROM fiches WHERE univers_id = ?)');
    run('DELETE FROM fiches WHERE univers_id = ?'); // aliases and label links cascade
    run('DELETE FROM etiquettes WHERE univers_id = ?');
    run('DELETE FROM types_univers WHERE univers_id = ?');
    run('DELETE FROM fichiers WHERE univers_id = ?');
    run('DELETE FROM membres WHERE univers_id = ?');
    run('DELETE FROM univers WHERE id = ?');
    return aEffacer;
  })();
  for (const d of disques) supprimerFichier(d);
}
