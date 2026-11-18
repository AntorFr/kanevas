import type { Db } from '../db/db.js';

/**
 * What the module `battlemap` counts and erases for the core (D-1, AD-150): the `bm_*` rows of a universe, never a file.
 * Apart from the two services so that the module declaration (read by the registry, which `droits.ts` imports) does not
 * pull `fichiers.ts` into the import cycle.
 */

export function compterAssets(db: Db, universId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM bm_assets WHERE univers_id = ?').get(universId) as { n: number }).n;
}

export function compterDirection(db: Db, universId: number): { references: number; texte: number } {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM bm_direction_images WHERE univers_id = ?').get(universId) as { n: number };
  const t = db.prepare('SELECT 1 AS ok FROM bm_direction WHERE univers_id = ?').get(universId);
  return { references: n, texte: t ? 1 : 0 };
}

/** Batches and their lines (AD-battlemap-generation-1); the module lists them before the assets. */
export function compterLots(db: Db, universId: number): { lots: number; lignes: number } {
  const lots = (db.prepare('SELECT COUNT(*) AS n FROM bm_lots WHERE univers_id = ?').get(universId) as { n: number }).n;
  const lignes = (db.prepare('SELECT COUNT(*) AS n FROM bm_lots_lignes WHERE lot_id IN (SELECT id FROM bm_lots WHERE univers_id = ?)')
    .get(universId) as { n: number }).n;
  return { lots, lignes };
}

/** Lines, then batches, before the assets' rows. The files stay. */
export function effacerLots(db: Db, universId: number): void {
  db.prepare('DELETE FROM bm_lots_lignes WHERE lot_id IN (SELECT id FROM bm_lots WHERE univers_id = ?)').run(universId);
  db.prepare('DELETE FROM bm_lots WHERE univers_id = ?').run(universId);
}

/** Assets, then references, then the text: the order of `compter`. The files stay (so `RESTRICT` is never hit). */
export function effacerDonneesBattlemap(db: Db, universId: number): void {
  db.prepare('DELETE FROM bm_assets WHERE univers_id = ?').run(universId);
  db.prepare('DELETE FROM bm_direction_images WHERE univers_id = ?').run(universId);
  db.prepare('DELETE FROM bm_direction WHERE univers_id = ?').run(universId);
}

/**
 * What the map reads of the library to filter or check a document: among `ids` (the `asset_id` strings of a document),
 * the assets that exist in the universe (`connus`, a draft excepted: it is not offered, rule 5) and, among them, those
 * whose file is GM-only (`mjSeul`). An id that is no number is unknown.
 */
export function etatAssets(db: Db, universId: number, ids: Iterable<string>): { connus: Set<string>; mjSeul: Set<string> } {
  const numeriques = [...new Set(ids)].filter((i) => /^[1-9][0-9]{0,15}$/.test(i));
  const connus = new Set<string>();
  const mjSeul = new Set<string>();
  const lire = db.prepare(
    `SELECT a.id, f.visibilite FROM bm_assets a JOIN fichiers f ON f.id = a.fichier_id
     WHERE a.univers_id = ? AND a.etat = 'valide' AND a.id = ?`);
  for (const id of numeriques) {
    const l = lire.get(universId, Number(id)) as { id: number; visibilite: string } | undefined;
    if (!l) continue;
    connus.add(id);
    if (l.visibilite === 'mj') mjSeul.add(id);
  }
  return { connus, mjSeul };
}
