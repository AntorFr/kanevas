import type { Db } from '../db/db.js';
import { roleDe } from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { validerTitre } from './fiches.js';

export const CATEGORIES_TACHE = ['monstres', 'pnj', 'cartes', 'deroulements', 'autre'] as const;
export type CategorieTache = (typeof CATEGORIES_TACHE)[number];

export interface Tache {
  id: number;
  ficheId: number;
  categorie: CategorieTache;
  libelle: string;
  faite: boolean;
  /** Date of the last tick, null when unticked. */
  faiteLe: string | null;
  creeLe: string;
}

interface TacheRow {
  id: number;
  fiche_id: number;
  categorie: CategorieTache;
  libelle: string;
  faite: number;
  faite_le: string | null;
  cree_le: string;
}

const versTache = (r: TacheRow): Tache => ({
  id: r.id,
  ficheId: r.fiche_id,
  categorie: r.categorie,
  libelle: r.libelle,
  faite: r.faite === 1,
  faiteLe: r.faite_le,
  creeLe: r.cree_le,
});

/**
 * Rights on an adventure's tasks are those of the universe OF THE ADVENTURE, never of an id the caller
 * sends (AD-47): a player, a GM of another universe, an unknown id and a sheet that is not an adventure
 * all get « not found » (AD-22). No universe id is ever a parameter.
 */
export function exigerMJDeAventure(db: Db, compteId: number, ficheId: number): { id: number; univers_id: number } {
  const f = db.prepare("SELECT id, univers_id FROM fiches WHERE id = ? AND type = 'aventure'").get(ficheId) as
    | { id: number; univers_id: number }
    | undefined;
  if (!f || roleDe(db, f.univers_id, compteId) !== 'mj') throw introuvable();
  return f;
}

function chargerPourMJ(db: Db, compteId: number, tacheId: number): TacheRow {
  const t = db.prepare('SELECT * FROM taches_preparation WHERE id = ?').get(tacheId) as
    | TacheRow
    | undefined;
  if (!t) throw introuvable();
  exigerMJDeAventure(db, compteId, t.fiche_id);
  return t;
}

/** The GM adds an unticked task: label 1 to 200 characters, one of the five categories (AD-46). */
export function ajouterTache(
  db: Db,
  compteId: number,
  ficheId: number,
  entree: { categorie: string; libelle: string },
): Tache {
  exigerMJDeAventure(db, compteId, ficheId);
  if (!(CATEGORIES_TACHE as readonly string[]).includes(entree.categorie)) {
    throw invalide('Catégorie inconnue.');
  }
  const libelle = validerTitre(entree.libelle, 200, 'Le libellé');
  const info = db
    .prepare(
      'INSERT INTO taches_preparation (fiche_id, categorie, libelle, cree_le) VALUES (?, ?, ?, ?)',
    )
    .run(ficheId, entree.categorie, libelle, new Date().toISOString());
  return versTache(chargerPourMJ(db, compteId, Number(info.lastInsertRowid)));
}

/**
 * Tasks of an adventure: the unticked ones by category (Monstres, PNJ, Cartes,
 * Déroulements, Autre) then creation, then the ticked ones, last ticked first.
 */
export function listerTaches(db: Db, compteId: number, ficheId: number): Tache[] {
  exigerMJDeAventure(db, compteId, ficheId);
  const rows = db
    .prepare('SELECT * FROM taches_preparation WHERE fiche_id = ?')
    .all(ficheId) as TacheRow[];
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
