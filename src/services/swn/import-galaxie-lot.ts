import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import type { Jeton } from '../jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from '../lots.js';
import { OUTIL_GALAXIE } from './galaxies.js';
import { appliquerAtlas, NATURES_ATLAS, type RapportAtlas } from './atlas.js';
import { HORS_SYNCHRO, importerGalaxie, type Compteurs, type RapportGalaxie } from './import-galaxie.js';

/** The batch's guard, shared by both routes: open, and of the galaxy tool. */
function garderLot(db: Db, jeton: Jeton, lotId: number | null, maintenant: Date): void {
  if (lotId === null) return;
  const lot = lireLot(db, jeton, lotId, maintenant);
  if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  if (lot.outil?.cle !== OUTIL_GALAXIE) throw new ErreurService('invalide', 'Ce lot ne reçoit pas de galaxie.', undefined, 'lot');
}

/**
 * The atlas of a system through the token (AD-atlas-1, AD-atlas-3): the application is one transaction that undoes
 * itself on any refusal; the batch then counts the outcome, refusals included, in a transaction of its own.
 */
export function importerAtlasParJeton(db: Db, jeton: Jeton, lotId: number | null, galaxieId: number, cleSysteme: string,
  corps: unknown, maintenant: Date = new Date()): RapportAtlas {
  garderLot(db, jeton, lotId, maintenant);
  const rapport = appliquerAtlas(db, { compteId: jeton.compteId }, jeton.universId, galaxieId, cleSysteme, corps);
  if (lotId !== null) {
    db.transaction(() => {
      for (const nature of NATURES_ATLAS) {
        const c = rapport.natures[nature];
        for (const issue of ['creees', 'mises_a_jour', 'inchangees', 'refusees'] as const) {
          if (c[issue] > 0) noterDansLot(db, lotId, nature, issue, [], maintenant, c[issue]);
        }
      }
      const entrees: EntreeRapport[] = rapport.refus.map((r) => ({
        cle: r.chemin, objet: r.nature, raison: `champ \`${r.champ}\` : ${r.raison}`, gravite: 'refus', code: r.code,
      }));
      noterDansLot(db, lotId, 'systemes', null, entrees, maintenant);
    })();
  }
  return rapport;
}

/**
 * Application through the token (K-6, T-9). With a batch, the counters and the refusals enter it in the same
 * transaction as the writes; without one, nothing remains but the answer.
 */
export function importerGalaxieParJeton(db: Db, jeton: Jeton, lotId: number | null, galaxieId: number, corps: unknown,
  maintenant: Date = new Date()): RapportGalaxie {
  garderLot(db, jeton, lotId, maintenant);
  return db.transaction(() => {
    const rapport = importerGalaxie(db, { compteId: jeton.compteId }, jeton.universId, galaxieId, corps);
    if (lotId !== null) {
      const issues: [keyof Compteurs, Issue][] = [['creees', 'creees'], ['mises_a_jour', 'mises_a_jour'], ['inchangees', 'inchangees'], ['refusees', 'refusees']];
      for (const [nature, c] of Object.entries(rapport.natures)) {
        for (const [champ, issue] of issues) if (c[champ] > 0) noterDansLot(db, lotId, nature, issue, [], maintenant, c[champ]);
      }
      const entrees: EntreeRapport[] = rapport.refus.map((r) => ({
        cle: r.cle, objet: r.nature, raison: `champ \`${r.champ}\` : ${r.raison}`, gravite: 'refus', code: r.raison === HORS_SYNCHRO ? 'hors_synchro' : undefined,
      }));
      noterDansLot(db, lotId, 'systemes', null, entrees, maintenant);
    }
    return rapport;
  })();
}
