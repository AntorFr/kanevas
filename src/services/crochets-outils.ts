import type { Db } from '../db/db.js';

/**
 * Called after a universe setting of a module changes (S-5): `sections-gerees.ts` plugs in the proposals of
 * recalculation at load. A hook in a module with no import, rather than an import of `sections-gerees.ts` from
 * `outils.ts`, which closed a cycle with `droits.ts` and `fiches.ts` and left `TYPES_FICHE` uninitialised.
 */
export const surSourceModifiee: {
  appeler: (db: Db, compteId: number, universId: number, cle: string) => void;
} = { appeler: () => {} };
