import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import type { JetonRequete as Jeton } from '../jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from '../lots.js';
import { OUTIL_VAISSEAUX } from './calcul-vaisseau.js';
import { importerConceptions, type Compteurs, type RapportConceptions } from './import-conceptions.js';

const ISSUES: [keyof Compteurs, Issue][] = [
  ['creees', 'creees'], ['mises_a_jour', 'mises_a_jour'], ['inchangees', 'inchangees'], ['refusees', 'refusees'],
];

/**
 * Application of ship designs through the token (I-1, K-6). With a batch, the counters of the `conceptions` nature and the
 * refusals (capped at the report's ceiling by `noterDansLot`) enter it in the transaction of the writes; without one, nothing
 * remains but the answer. A file refused as a whole (shape, size) throws before any write and counts nothing.
 */
export function importerConceptionsParJeton(db: Db, jeton: Jeton, lotId: number | null, corps: unknown,
  maintenant: Date = new Date()): RapportConceptions {
  if (lotId !== null) {
    const lot = lireLot(db, jeton, lotId, maintenant);
    if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
    if (lot.outil?.cle !== OUTIL_VAISSEAUX) throw new ErreurService('invalide', 'Ce lot ne reçoit pas de conceptions.', undefined, 'lot');
  }
  return db.transaction(() => {
    const rapport = importerConceptions(db, { compteId: jeton.compteId }, jeton.universId, corps, jeton);
    if (lotId !== null) {
      const c = rapport.natures.conceptions;
      for (const [champ, issue] of ISSUES) if (c[champ] > 0) noterDansLot(db, lotId, 'conceptions', issue, [], maintenant, c[champ]);
      const entrees: EntreeRapport[] = rapport.refus.map((r) => ({
        cle: r.cle, objet: 'conceptions', raison: `champ \`${r.champ}\` : ${r.raison}`, gravite: 'refus',
      }));
      // Stamps the write even when the file counted nothing.
      noterDansLot(db, lotId, 'conceptions', null, entrees, maintenant);
    }
    return rapport;
  })();
}
