import { ecrire } from './historique.js';
import type { Db } from '../db/db.js';
import { exigerRole, peutLireSection, peutVoirFiche } from './droits.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { cleDe } from './historique.js';
import { empreinteRelation } from './empreintes.js';
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
 * The GM links a section to a sheet of the same universe (AD-64, AD-136). Refusals
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
  return ecrire(db, compteId, (): Relation => {
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
  });
}

/** A relation of this universe with what its fingerprint and its guards read (AD-64, AD-139). */
export interface RelationLue {
  id: number;
  sectionId: number;
  sectionCle: string;
  ficheId: number;
  cibleId: number;
  nature: string;
  qualificatif: string;
}

/** The relation `relationId` if it carries a section of a sheet of this universe, else null (unknown and foreign alike). */
export function lireRelationParId(db: Db, universId: number, relationId: number): RelationLue | null {
  const r = db
    .prepare(
      `SELECT r.id, r.section_id AS sectionId, s.cle AS sectionCle, s.fiche_id AS ficheId,
              r.cible_fiche_id AS cibleId, r.nature, r.qualificatif
         FROM relations r JOIN sections s ON s.id = r.section_id JOIN fiches f ON f.id = s.fiche_id
        WHERE r.id = ? AND f.univers_id = ?`,
    )
    .get(relationId, universId) as RelationLue | undefined;
  return r ?? null;
}

/**
 * The relation the caller reads under both guards (AD-64): its carrying section and its target sheet. What
 * is not readable by this account is `introuvable`, like an unknown id.
 */
export function lireRelationLisible(db: Db, acteur: Acteur, universId: number, relationId: number): RelationLue {
  const role = exigerRole(db, universId, acteur.compteId);
  const r = lireRelationParId(db, universId, relationId);
  if (!r) throw introuvable();
  const section = chargerSection(db, r.ficheId, r.sectionId);
  if (!peutLireSection(role, section, acteur) || !peutVoirFiche(db, role, r.cibleId, acteur)) throw introuvable();
  return r;
}

/** The fingerprint of a relation as the read gives it (AD-139). */
export function empreinteDeRelation(db: Db, r: RelationLue): string {
  return empreinteRelation(
    { sectionCle: r.sectionCle, cibleId: r.cibleId, nature: r.nature, qualificatif: r.qualificatif },
    cleDe(db),
  );
}

/**
 * The relation that already holds the fact `relierSection` would add (same section, target, nature and
 * qualifier; or, for a symmetric nature, the same fact held by the target toward this sheet), or null.
 */
export function trouverRelationExistante(
  db: Db,
  universId: number,
  ficheId: number,
  sectionId: number,
  cibleId: number,
  nature: string,
  qualificatif: string,
): RelationLue | null {
  const direct = db
    .prepare('SELECT id FROM relations WHERE section_id = ? AND cible_fiche_id = ? AND nature = ? AND qualificatif = ?')
    .get(sectionId, cibleId, nature, qualificatif) as { id: number } | undefined;
  if (direct) return lireRelationParId(db, universId, direct.id);
  if (nature === '' || natureDe(nature)?.symetrique !== true) return null;
  const inverse = db
    .prepare(
      `SELECT r.id FROM relations r JOIN sections s ON s.id = r.section_id
        WHERE s.fiche_id = ? AND r.cible_fiche_id = ? AND r.nature = ? AND r.qualificatif = ?`,
    )
    .get(cibleId, ficheId, nature, qualificatif) as { id: number } | undefined;
  return inverse ? lireRelationParId(db, universId, inverse.id) : null;
}

/**
 * The GM changes the nature and/or the qualifier of a relation (B-109); what is not sent stays. The same
 * refusals as `relierSection` (`nature_incompatible`, `relation_existante`), nothing written on a refusal.
 * `ecrit` is false when the values sent are the current ones.
 */
export function modifierRelation(
  db: Db,
  compteId: number,
  universId: number,
  relationId: number,
  changement: { nature?: string | null; qualificatif?: string },
): { relation: Relation; ecrit: boolean } {
  exigerMJCache(db, universId, compteId);
  const courante = lireRelationLisible(db, { compteId }, universId, relationId);
  if (changement.qualificatif !== undefined && typeof changement.qualificatif !== 'string') {
    throw invalide('Le qualificatif : 80 caractères au plus.');
  }
  const qualificatif = (changement.qualificatif ?? courante.qualificatif).trim();
  const nature = changement.nature === undefined ? courante.nature : (changement.nature ?? '');
  if (typeof nature !== 'string') {
    throw new ErreurService('invalide', 'Cette nature ne relie pas ces deux types de fiches.', 'nature_incompatible');
  }
  if (qualificatif.length > 80) throw invalide('Le qualificatif : 80 caractères au plus.');
  if (nature === '' && qualificatif.length < 1) throw invalide('Le qualificatif est obligatoire sans nature.');
  const source = chargerFiche(db, universId, courante.ficheId);
  const cible = chargerFiche(db, universId, courante.cibleId);
  if (nature !== '' && !(estNature(nature) && natureConvient(nature, source.type, cible.type))) {
    throw new ErreurService('invalide', 'Cette nature ne relie pas ces deux types de fiches.', 'nature_incompatible');
  }
  const vue = (): Relation => ({
    id: relationId,
    nature,
    qualificatif,
    cible: { id: cible.id, titre: cible.titre, type: cible.type, ...chargeDeCible(cible.type, cible.charge) },
  });
  if (nature === courante.nature && qualificatif === courante.qualificatif) return { relation: vue(), ecrit: false };
  return ecrire(db, compteId, () => {
    const autre = trouverRelationExistante(
      db, universId, courante.ficheId, courante.sectionId, courante.cibleId, nature, qualificatif,
    );
    if (autre && autre.id !== relationId) {
      throw new ErreurService('conflit', 'Cette relation existe déjà.', 'relation_existante');
    }
    db.prepare('UPDATE relations SET nature = ?, qualificatif = ? WHERE id = ?').run(nature, qualificatif, relationId);
    return { relation: vue(), ecrit: true };
  });
}

/** The GM removes a relation (a real deletion) of this universe. */
export function retirerRelation(
  db: Db,
  compteId: number,
  universId: number,
  relationId: number,
): void {
  exigerMJCache(db, universId, compteId);
  const info = ecrire(db, compteId, () =>
    db
      .prepare(
        `DELETE FROM relations WHERE id = ? AND section_id IN
         (SELECT s.id FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.univers_id = ?)`,
      )
      .run(relationId, universId),
  );
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
