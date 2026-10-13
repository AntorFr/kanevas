import type { Db } from '../db/db.js';
import { exigerMJDeCampagne } from './campagnes.js';
import { introuvable, invalide } from './erreurs.js';
import { validerTitre } from './fiches.js';

export const CATEGORIES_TACHE = ['monstres', 'pnj', 'cartes', 'deroulements', 'autre'] as const;
export type CategorieTache = (typeof CATEGORIES_TACHE)[number];

export interface Tache {
  id: number;
  campagneId: number;
  categorie: CategorieTache;
  libelle: string;
  faite: boolean;
  /** Date of the last tick, null when unticked. */
  faiteLe: string | null;
  creeLe: string;
}

interface TacheRow {
  id: number;
  campagne_id: number;
  categorie: CategorieTache;
  libelle: string;
  faite: number;
  faite_le: string | null;
  cree_le: string;
}

const versTache = (r: TacheRow): Tache => ({
  id: r.id,
  campagneId: r.campagne_id,
  categorie: r.categorie,
  libelle: r.libelle,
  faite: r.faite === 1,
  faiteLe: r.faite_le,
  creeLe: r.cree_le,
});

function chargerPourMJ(db: Db, compteId: number, tacheId: number): TacheRow {
  const t = db.prepare('SELECT * FROM taches_preparation WHERE id = ?').get(tacheId) as
    | TacheRow
    | undefined;
  if (!t) throw introuvable();
  exigerMJDeCampagne(db, compteId, t.campagne_id);
  return t;
}

/** The GM adds an unticked task: label 1 to 200 characters, one of the five categories (AD-46). */
export function ajouterTache(
  db: Db,
  compteId: number,
  campagneId: number,
  entree: { categorie: string; libelle: string },
): Tache {
  exigerMJDeCampagne(db, compteId, campagneId);
  if (!(CATEGORIES_TACHE as readonly string[]).includes(entree.categorie)) {
    throw invalide('Catégorie inconnue.');
  }
  const libelle = validerTitre(entree.libelle, 200, 'Le libellé');
  const info = db
    .prepare(
      'INSERT INTO taches_preparation (campagne_id, categorie, libelle, cree_le) VALUES (?, ?, ?, ?)',
    )
    .run(campagneId, entree.categorie, libelle, new Date().toISOString());
  return versTache(chargerPourMJ(db, compteId, Number(info.lastInsertRowid)));
}

/**
 * Tasks of a campaign: the unticked ones by category (Monstres, PNJ, Cartes,
 * Déroulements, Autre) then creation, then the ticked ones, last ticked first.
 */
export function listerTaches(db: Db, compteId: number, campagneId: number): Tache[] {
  exigerMJDeCampagne(db, compteId, campagneId);
  const rows = db
    .prepare('SELECT * FROM taches_preparation WHERE campagne_id = ?')
    .all(campagneId) as TacheRow[];
  const rang = (c: CategorieTache) => CATEGORIES_TACHE.indexOf(c);
  const cmp = (a: TacheRow, b: TacheRow) => {
    if (a.faite !== b.faite) return a.faite - b.faite;
    if (a.faite === 0) return rang(a.categorie) - rang(b.categorie) || a.id - b.id;
    const fa = a.faite_le ?? '';
    const fb = b.faite_le ?? '';
    return fa < fb ? 1 : fa > fb ? -1 : b.id - a.id;
  };
  return rows.sort(cmp).map(versTache);
}

/** Ticks (dates the tick) or unticks (clears the date) a task. */
export function cocherTache(db: Db, compteId: number, tacheId: number, faite: boolean): Tache {
  chargerPourMJ(db, compteId, tacheId);
  db.prepare('UPDATE taches_preparation SET faite = ?, faite_le = ? WHERE id = ?').run(
    faite ? 1 : 0,
    faite ? new Date().toISOString() : null,
    tacheId,
  );
  return versTache(chargerPourMJ(db, compteId, tacheId));
}
