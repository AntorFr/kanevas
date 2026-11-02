import type { Db } from '../db/db.js';
import { appliquerCatalogue, previsualiserCatalogue, type RapportCatalogue } from './catalogues.js';
import { ErreurService, introuvable } from './erreurs.js';
import type { Jeton } from './jetons.js';
import { lireLot, noterDansLot, type EntreeRapport, type Issue } from './lots.js';
import type { CibleOutils } from './outils.js';

export type NiveauCatalogue = 'univers' | 'systeme';

/** Reads `?niveau=`: absent means the universe. */
export function niveauDeRequete(brut: unknown): NiveauCatalogue {
  if (brut === undefined || brut === 'univers') return 'univers';
  if (brut === 'systeme') return 'systeme';
  throw new ErreurService('invalide', 'Niveau invalide.', undefined, 'niveau');
}

/** The target level of the token's universe; a universe without a system has no system level. */
function cibleDe(db: Db, jeton: Jeton, niveau: NiveauCatalogue): CibleOutils {
  if (niveau === 'univers') return { niveau, id: jeton.universId };
  const u = db.prepare('SELECT systeme_id FROM univers WHERE id = ?').get(jeton.universId) as
    { systeme_id: number | null } | undefined;
  if (!u || u.systeme_id === null) throw introuvable();
  return { niveau, id: u.systeme_id };
}

const ISSUES: [keyof RapportCatalogue['natures'][string], Issue][] = [
  ['ajoutes', 'creees'], ['modifies', 'mises_a_jour'], ['inchanges', 'inchangees'], ['refuses', 'refusees'],
];

/** Preview through the token (K-6): never writes, never counts. */
export function apercuCatalogueParJeton(
  db: Db, jeton: Jeton, niveau: NiveauCatalogue, outil: string, fichier: unknown,
): RapportCatalogue {
  return previsualiserCatalogue(db, { compteId: jeton.compteId }, cibleDe(db, jeton, niveau), outil, fichier);
}

/**
 * Application through the token (K-6). With a batch, the counters and the refusals enter it in the
 * same transaction as the writes: a failure leaves neither. Without one, nothing but the answer.
 */
export function appliquerCatalogueParJeton(
  db: Db, jeton: Jeton, lotId: number | null, niveau: NiveauCatalogue, outil: string, fichier: unknown,
  maintenant: Date = new Date(),
): RapportCatalogue {
  if (lotId !== null) {
    const lot = lireLot(db, jeton, lotId, maintenant);
    if (lot.closLe !== null) throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
    if (lot.outil?.cle !== outil) throw new ErreurService('invalide', 'Ce lot ne reçoit pas ce catalogue.', undefined, 'lot');
  }
  return db.transaction(() => {
    const rapport = appliquerCatalogue(db, { compteId: jeton.compteId }, cibleDe(db, jeton, niveau), outil, fichier);
    if (lotId !== null) {
      for (const [nature, c] of Object.entries(rapport.natures)) {
        for (const [champ, issue] of ISSUES) {
          if (c[champ] > 0) noterDansLot(db, lotId, nature, issue, [], maintenant, c[champ]);
        }
      }
      const refus: EntreeRapport[] = rapport.refus.map((r) => ({
        cle: r.cle, objet: r.nature, raison: `champ \`${r.champ}\` : ${r.raison}`, gravite: 'refus',
      }));
      // Stamps the write even when the file counted nothing.
      noterDansLot(db, lotId, Object.keys(rapport.natures)[0] ?? '', null, refus, maintenant);
    }
    return rapport;
  })();
}
