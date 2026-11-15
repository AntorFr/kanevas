import type { Db } from '../db/db.js';

/**
 * Door to `retirerSection` for the modules that sit below `sections.ts` in the import graph
 * (importing it directly closes a cycle through `fiches` and `types-fiche`).
 * `sections.ts` plugs the real function in when it loads.
 */
type Retrait = (db: Db, compteId: number, universId: number, ficheId: number, sectionId: number) => unknown;
let retrait: Retrait | null = null;

export function brancherRetrait(f: Retrait): void { retrait = f; }

export function retirerSectionGeree(db: Db, compteId: number, universId: number, ficheId: number, sectionId: number): void {
  if (!retrait) throw new Error('retirerSection is not plugged in');
  retrait(db, compteId, universId, ficheId, sectionId);
}
