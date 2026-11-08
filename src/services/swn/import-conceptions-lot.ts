import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import type { Jeton } from '../jetons.js';
import { lireLot, noterDansLot, type EntreeRapport } from '../lots.js';
import { OUTIL_VAISSEAUX } from './calcul-vaisseau.js';
import { HORS_SYNCHRO, importerConceptions, type Compteurs, type RapportConceptions } from './import-conceptions.js';

/**
 * Application through the token (M-1). With a batch, the counters and the refusals enter it in the same
 * transaction as the writes; without one, nothing remains but the answer.
 */
export function importerConceptionsParJeton(db: Db, jeton: Jeton, lotId: number | null, corps: unknown,
  maintenant: Date = new Date()): RapportConceptions {
  if (lotId !== null) {
    const lot = lireLot(db, jeton, lotId, maintenant);
    if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
    if (lot.outil?.cle !== OUTIL_VAISSEAUX) throw new ErreurService('invalide', 'Ce lot ne reçoit pas de conceptions.', undefined, 'lot');
  }
  return db.transaction(() => {
    const rapport = importerConceptions(db, { compteId: jeton.compteId }, jeton.universId, corps);
    if (lotId !== null) {
      const issues: (keyof Compteurs)[] = ['creees', 'mises_a_jour', 'inchangees', 'refusees'];
      const c = rapport.natures.conceptions;
      for (const issue of issues) if (c[issue] > 0) noterDansLot(db, lotId, 'conceptions', issue, [], maintenant, c[issue]);
      const entrees: EntreeRapport[] = rapport.refus.map((r) => ({
        cle: r.cle, objet: 'conceptions', raison: `champ \`${r.champ}\` : ${r.raison}`, gravite: 'refus', code: r.raison === HORS_SYNCHRO ? 'hors_synchro' : undefined,
      }));
      noterDansLot(db, lotId, 'conceptions', null, entrees, maintenant);
    }
    return rapport;
  })();
}
