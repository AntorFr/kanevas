import type { Db } from '../db/db.js';
import { exigerRole, peutLireSection, peutVoirFiche } from './droits.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { chargerFiche } from './fiches.js';
import type { Acteur, SectionRow, TypeFiche } from './types.js';

export const LIMITE_RELATIONS = 100;

export interface Relation {
  id: number;
  /** The free label of the relation. */
  type: string;
  cible: { id: number; titre: string; type: TypeFiche };
}

function chargerSection(db: Db, ficheId: number, sectionId: number): SectionRow {
  const row = db
    .prepare('SELECT * FROM sections WHERE id = ? AND fiche_id = ?')
    .get(sectionId, ficheId) as SectionRow | undefined;
  if (!row) throw introuvable();
  return row;
}

/** GM only; a player is answered as if the thing did not exist (AD-22). */
function exigerMJCache(db: Db, universId: number, compteId: number): void {
  if (exigerRole(db, universId, compteId) !== 'mj') throw introuvable();
}

/**
 * The GM links a section to a sheet of the same universe (AD-64). Refusals
 * write nothing: `auto_relation` (invalide), `relation_existante` and
 * `limite_relations` (conflit, in `detail`).
 */
export function relierSection(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  entree: { cibleFicheId: number; type: string },
): Relation {
  exigerMJCache(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  chargerSection(db, ficheId, sectionId);
  const type = String(entree.type).trim();
  if (type.length < 1 || type.length > 80) throw invalide('Le type : de 1 à 80 caractères.');
  const cible = chargerFiche(db, universId, entree.cibleFicheId);
  if (cible.id === ficheId) {
    throw new ErreurService('invalide', 'Une fiche ne se relie pas à elle-même.', 'auto_relation');
  }
  return db.transaction((): Relation => {
    const doublon = db
      .prepare(
        'SELECT 1 FROM relations WHERE section_id = ? AND cible_fiche_id = ? AND type = ?',
      )
      .get(sectionId, cible.id, type);
    if (doublon) {
      throw new ErreurService('conflit', 'Cette relation existe déjà.', 'relation_existante');
    }
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM relations WHERE section_id = ?')
      .get(sectionId) as { n: number };
    if (n >= LIMITE_RELATIONS) {
      throw new ErreurService(
        'conflit',
        `Cette section porte déjà ${LIMITE_RELATIONS} relations.`,
        'limite_relations',
      );
    }
    const info = db
      .prepare(
        'INSERT INTO relations (section_id, cible_fiche_id, type, cree_le) VALUES (?, ?, ?, ?)',
      )
      .run(sectionId, cible.id, type, new Date().toISOString());
    return {
      id: Number(info.lastInsertRowid),
      type,
      cible: { id: cible.id, titre: cible.titre, type: cible.type },
    };
  })();
}

/** The GM removes a relation (a real deletion) of this universe. */
export function retirerRelation(
  db: Db,
  compteId: number,
  universId: number,
  relationId: number,
): void {
  exigerMJCache(db, universId, compteId);
  const info = db
    .prepare(
      `DELETE FROM relations WHERE id = ? AND section_id IN
         (SELECT s.id FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.univers_id = ?)`,
    )
    .run(relationId, universId);
  if (info.changes === 0) throw introuvable();
}

/**
 * The relations of a section the caller reads, under both guards (AD-64): the
 * carrying section and the target sheet must be readable by this caller in this
 * mode; the others are absent, uncounted.
 */
export function lireRelations(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  sectionId: number,
): Relation[] {
  const role = exigerRole(db, universId, acteur.compteId);
  chargerFiche(db, universId, ficheId);
  const section = chargerSection(db, ficheId, sectionId);
  if (!peutLireSection(role, section, acteur)) throw introuvable();
  const rows = db
    .prepare(
      `SELECT r.id, r.type, f.id AS cible_id, f.titre AS cible_titre, f.type AS cible_type
       FROM relations r JOIN fiches f ON f.id = r.cible_fiche_id
       WHERE r.section_id = ? AND f.univers_id = ? ORDER BY r.id`,
    )
    .all(sectionId, universId) as {
    id: number;
    type: string;
    cible_id: number;
    cible_titre: string;
    cible_type: TypeFiche;
  }[];
  return rows
    .filter((r) => peutVoirFiche(db, role, r.cible_id, acteur))
    .map((r) => ({
      id: r.id,
      type: r.type,
      cible: { id: r.cible_id, titre: r.cible_titre, type: r.cible_type },
    }));
}
