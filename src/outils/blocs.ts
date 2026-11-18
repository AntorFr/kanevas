import type { Db } from '../db/db.js';
import { accessible } from '../services/outils.js';
import type { Acteur } from '../services/types.js';
import { schemaBlocFiche, type BlocFiche } from './declaration.js';
import { modulesActifs } from './registre.js';

/**
 * The blocks the accessible tools add to a sheet (AD-liens-3), the way `catalogueDe` collects `outilsAssistant`: a tool that
 * is disabled or hidden from the reader's role adds nothing, and a tool with nothing readable returns no block.
 */
export function blocsDeFiche(db: Db, acteur: Acteur, universId: number, ficheId: number): BlocFiche[] {
  const blocs: BlocFiche[] = [];
  for (const module of modulesActifs()) {
    for (const declare of module.outils) {
      if (!declare.blocsFiche || !accessible(db, acteur, universId, declare.cle)) continue;
      const bloc = declare.blocsFiche(db, acteur, universId, ficheId);
      if (bloc) blocs.push(schemaBlocFiche.parse(bloc));
    }
  }
  return blocs;
}
