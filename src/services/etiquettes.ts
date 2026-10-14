import type { Db } from '../db/db.js';
import { exigerRole, peutVoirFiche, sqlFicheLisible } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import type { Acteur } from './types.js';

/**
 * Aliases and labels of a sheet (AD-118, B-38). The only reader and writer of `fiche_alias`,
 * `etiquettes` and `fiche_etiquettes` (AD-2). The FTS index of the aliases is kept by SQL triggers
 * (AD-21): nothing here writes to `recherche_*`.
 */

export const MAX_ALIAS = 20;
export const LONGUEUR_ALIAS = 120;
export const MAX_ETIQUETTES = 20;
export const LONGUEUR_ETIQUETTE = 40;

export interface Etiquetage {
  alias: string[];
  etiquettes: string[];
}

const cle = (s: string) => s.toLowerCase();
const trier = (l: string[]) => [...l].sort((a, b) => cle(a).localeCompare(cle(b)) || a.localeCompare(b));

/** Trimmed, empties dropped, duplicates without case merged (first spelling wins). */
function nettoyer(valeurs: unknown, quoi: string): string[] {
  if (!Array.isArray(valeurs) || valeurs.some((v) => typeof v !== 'string')) {
    throw new ErreurService('invalide', `${quoi} : une liste de textes.`);
  }
  const vus = new Map<string, string>();
  for (const v of valeurs as string[]) {
    const t = v.trim();
    if (t !== '' && !vus.has(cle(t))) vus.set(cle(t), t);
  }
  return [...vus.values()];
}

/** The sets of a sheet, sorted, no right check: for callers that already read the sheet. */
export function etiquetageDe(db: Db, ficheId: number): Etiquetage {
  const alias = db.prepare('SELECT alias FROM fiche_alias WHERE fiche_id = ?').all(ficheId) as { alias: string }[];
  const etiquettes = db
    .prepare(
      `SELECT e.nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = ?`,
    )
    .all(ficheId) as { nom: string }[];
  return { alias: trier(alias.map((a) => a.alias)), etiquettes: trier(etiquettes.map((e) => e.nom)) };
}

function fichePresente(db: Db, universId: number, ficheId: number): boolean {
  return db.prepare('SELECT 1 FROM fiches WHERE id = ? AND univers_id = ?').get(ficheId, universId) !== undefined;
}

/** Aliases and labels of a sheet the caller reads; an unreadable sheet does not exist (AD-22). */
export function lireEtiquetage(db: Db, acteur: Acteur, universId: number, ficheId: number): Etiquetage {
  const role = exigerRole(db, universId, acteur.compteId);
  if (!fichePresente(db, universId, ficheId) || !peutVoirFiche(db, role, ficheId, acteur)) throw introuvable();
  return etiquetageDe(db, ficheId);
}

/**
 * The GM (outside player mode) replaces both sets at once. Unknown labels are created in the
 * universe; a label left without sheet is deleted in the same transaction. Nothing is written
 * when a bound is broken. Returns the sets as stored.
 */
export function poserEtiquetage(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  entree: { alias: unknown; etiquettes: unknown },
): Etiquetage {
  const role = exigerRole(db, universId, acteur.compteId);
  if (!fichePresente(db, universId, ficheId) || !peutVoirFiche(db, role, ficheId, acteur)) throw introuvable();
  if (role !== 'mj' || acteur.modeJoueur) throw refuse();

  const alias = nettoyer(entree.alias, 'Les alias');
  const etiquettes = nettoyer(entree.etiquettes, 'Les étiquettes');
  const refus = (detail: string, message: string) => new ErreurService('invalide', message, detail);
  if (alias.some((a) => a.length > LONGUEUR_ALIAS)) {
    throw refus('alias_trop_long', `Un alias : de 1 à ${LONGUEUR_ALIAS} caractères.`);
  }
  if (etiquettes.some((e) => e.length > LONGUEUR_ETIQUETTE)) {
    throw refus('etiquette_trop_longue', `Une étiquette : de 1 à ${LONGUEUR_ETIQUETTE} caractères.`);
  }
  if (alias.length > MAX_ALIAS) throw refus('alias_trop_nombreux', `${MAX_ALIAS} alias au plus.`);
  if (etiquettes.length > MAX_ETIQUETTES) {
    throw refus('etiquettes_trop_nombreuses', `${MAX_ETIQUETTES} étiquettes au plus.`);
  }

  db.transaction(() => {
    // Aliases: keep the stored spelling of those already there.
    const voulus = new Set(alias.map(cle));
    const presents = db.prepare('SELECT rowid AS r, alias FROM fiche_alias WHERE fiche_id = ?').all(ficheId) as {
      r: number;
      alias: string;
    }[];
    for (const p of presents) {
      if (!voulus.has(cle(p.alias))) db.prepare('DELETE FROM fiche_alias WHERE rowid = ?').run(p.r);
    }
    const gardes = new Set(presents.filter((p) => voulus.has(cle(p.alias))).map((p) => cle(p.alias)));
    for (const a of alias) {
      if (!gardes.has(cle(a))) db.prepare('INSERT INTO fiche_alias (fiche_id, alias) VALUES (?, ?)').run(ficheId, a);
    }

    // Labels: resolve or create, link, unlink, then drop those without sheet.
    const ids = new Set<number>();
    for (const nom of etiquettes) {
      const ex = db
        .prepare('SELECT id FROM etiquettes WHERE univers_id = ? AND nom = ? COLLATE NOCASE')
        .get(universId, nom) as { id: number } | undefined;
      const id =
        ex?.id ??
        Number(
          db
            .prepare('INSERT INTO etiquettes (univers_id, nom, cree_le) VALUES (?, ?, ?)')
            .run(universId, nom, new Date().toISOString()).lastInsertRowid,
        );
      ids.add(id);
      db.prepare('INSERT OR IGNORE INTO fiche_etiquettes (fiche_id, etiquette_id) VALUES (?, ?)').run(ficheId, id);
    }
    const liees = db.prepare('SELECT etiquette_id AS id FROM fiche_etiquettes WHERE fiche_id = ?').all(ficheId) as {
      id: number;
    }[];
    for (const l of liees) {
      if (ids.has(l.id)) continue;
      db.prepare('DELETE FROM fiche_etiquettes WHERE fiche_id = ? AND etiquette_id = ?').run(ficheId, l.id);
      db.prepare(
        'DELETE FROM etiquettes WHERE id = ? AND NOT EXISTS (SELECT 1 FROM fiche_etiquettes WHERE etiquette_id = ?)',
      ).run(l.id, l.id);
    }
  })();
  return etiquetageDe(db, ficheId);
}

/** The labels carried by at least one sheet the caller reads (same filter as the lists, AD-118 (4)). */
export function etiquettesProposees(db: Db, acteur: Acteur, universId: number): { nom: string }[] {
  const role = exigerRole(db, universId, acteur.compteId);
  const lisible = sqlFicheLisible(role, acteur, 'f');
  const noms = db
    .prepare(
      `SELECT DISTINCT e.nom FROM etiquettes e
       JOIN fiche_etiquettes fe ON fe.etiquette_id = e.id
       JOIN fiches f ON f.id = fe.fiche_id
       WHERE e.univers_id = ?${lisible ? ` AND ${lisible.sql}` : ''}`,
    )
    .all(universId, ...(lisible?.params ?? [])) as { nom: string }[];
  return trier(noms.map((n) => n.nom)).map((nom) => ({ nom }));
}
