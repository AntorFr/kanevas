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

/** Assets, then references, then the text: the order of `compter`. The files stay (so `RESTRICT` is never hit). */
export function effacerDonneesBattlemap(db: Db, universId: number): void {
  db.prepare('DELETE FROM bm_assets WHERE univers_id = ?').run(universId);
  db.prepare('DELETE FROM bm_direction_images WHERE univers_id = ?').run(universId);
  db.prepare('DELETE FROM bm_direction WHERE univers_id = ?').run(universId);
}
