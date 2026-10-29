import type { Db } from '../db/db.js';
import { exigerRole, peutLireSection, peutVoirFiche } from './droits.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { chargerFiche } from './fiches.js';
import { natureConvient, natureDe, estNature } from './natures.js';
import type { Acteur, SectionRow, TypeFiche } from './types.js';

export const LIMITE_RELATIONS = 100;

export interface Relation {
  id: number;
  /** Key of the nature (services/natures.ts), '' for a free relation. */
  nature: string;
  /** The qualifier; required without a nature, optional with one. */
  qualificatif: string;
  cible: { id: number; titre: string; type: TypeFiche; charge?: { pj: boolean } };
}

/** What the badge of a target reads: `pj` for a personnage, nothing else (AD-64). */
function chargeDeCible(type: TypeFiche, charge: string | Record<string, unknown>): { charge?: { pj: boolean } } {
  if (type !== 'personnage') return {};
  const c = typeof charge === 'string' ? (JSON.parse(charge) as Record<string, unknown>) : charge;
  return { charge: { pj: c.pj === true } };
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
 * The GM links a section to a sheet of the same universe (AD-64, AD-129). Refusals
 * write nothing: `auto_relation` and `nature_incompatible` (invalide), `relation_existante` and
 * `limite_relations` (conflit), in `detail`. `type` is a synonym of `qualificatif`; both together are refused.
 */
export function relierSection(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sectionId: number,
  entree: { cibleFicheId: number; nature?: string | null; qualificatif?: string; type?: string },
): Relation {
  exigerMJCache(db, universId, compteId);
  const source = chargerFiche(db, universId, ficheId);
  chargerSection(db, ficheId, sectionId);
  if (entree.type !== undefined && entree.qualificatif !== undefined) {
    throw invalide('Le qualificatif : un seul des champs « type » et « qualificatif ».');
  }
  const brut = entree.qualificatif ?? entree.type;
  if (brut !== undefined && typeof brut !== 'string') throw invalide('Le qualificatif : 80 caractères au plus.');
  const qualificatif = (brut ?? '').trim();
  const nature = entree.nature === undefined || entree.nature === null ? '' : entree.nature;
  if (typeof nature !== 'string') {
    throw new ErreurService('invalide', 'Cette nature ne relie pas ces deux types de fiches.', 'nature_incompatible');
  }
  if (qualificatif.length > 80) throw invalide('Le qualificatif : 80 caractères au plus.');
  if (nature === '' && qualificatif.length < 1) throw invalide('Le qualificatif est obligatoire sans nature.');
  const cible = chargerFiche(db, universId, entree.cibleFicheId);
  if (cible.id === ficheId) {
    throw new ErreurService('invalide', 'Une fiche ne se relie pas à elle-même.', 'auto_relation');
  }
  if (nature !== '' && !(estNature(nature) && natureConvient(nature, source.type, cible.type))) {
    throw new ErreurService('invalide', 'Cette nature ne relie pas ces deux types de fiches.', 'nature_incompatible');
  }
  const symetrique = nature !== '' && natureDe(nature)?.symetrique === true;
  return db.transaction((): Relation => {
    const doublon = db
      .prepare(
        'SELECT 1 FROM relations WHERE section_id = ? AND cible_fiche_id = ? AND nature = ? AND qualificatif = ?',
      )
      .get(sectionId, cible.id, nature, qualificatif);
    // A symmetric fact is stored once: the other sheet already holding it toward this one is a duplicate.
    const inverse =
      symetrique &&
      db
        .prepare(
          `SELECT 1 FROM relations r JOIN sections s ON s.id = r.section_id
            WHERE s.fiche_id = ? AND r.cible_fiche_id = ? AND r.nature = ? AND r.qualificatif = ?`,
        )
        .get(cible.id, ficheId, nature, qualificatif);
    if (doublon || inverse) {
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
        'INSERT INTO relations (section_id, cible_fiche_id, nature, qualificatif, cree_le) VALUES (?, ?, ?, ?, ?)',
      )
      .run(sectionId, cible.id, nature, qualificatif, new Date().toISOString());
    return {
      id: Number(info.lastInsertRowid),
      nature,
      qualificatif,
      cible: { id: cible.id, titre: cible.titre, type: cible.type, ...chargeDeCible(cible.type, cible.charge) },
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
      `SELECT r.id, r.nature, r.qualificatif, f.id AS cible_id, f.titre AS cible_titre, f.type AS cible_type, f.charge AS cible_charge
       FROM relations r JOIN fiches f ON f.id = r.cible_fiche_id
       WHERE r.section_id = ? AND f.univers_id = ? ORDER BY r.id`,
    )
    .all(sectionId, universId) as {
    id: number;
    nature: string;
    qualificatif: string;
    cible_id: number;
    cible_titre: string;
    cible_type: TypeFiche;
    cible_charge: string;
  }[];
  return rows
    .filter((r) => peutVoirFiche(db, role, r.cible_id, acteur))
    .map((r) => ({
      id: r.id,
      nature: r.nature,
      qualificatif: r.qualificatif,
      cible: {
        id: r.cible_id,
        titre: r.cible_titre,
        type: r.cible_type,
        ...chargeDeCible(r.cible_type, r.cible_charge),
      },
    }));
}
