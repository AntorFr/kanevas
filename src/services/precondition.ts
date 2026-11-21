import type { Db } from '../db/db.js';
import { ErreurService } from './erreurs.js';
import { noterDansLot, type Nature } from './lots.js';

/**
 * Precondition of an import write (AD-140, AD-ecriture-1, B-85). Pure of HTTP: the route hands the
 * request headers once, the services receive `{siEmpreinte?, siAbsent?}` and apply it inside their
 * transaction. The fingerprints are those of `empreintes.ts`, never recomputed here.
 */
export interface Precondition {
  /** `If-Match`: the fingerprint the script read; the write applies only if it is still the current one. */
  siEmpreinte?: string;
  /** `If-None-Match: *`: the write applies only if the object does not exist. */
  siAbsent?: boolean;
}

/** Reason written in the batch report for a refusal by fingerprint (E-18). */
export const RAISON_EMPREINTE_PERIMEE = 'modifiée depuis la lecture';

const EMPREINTE_CITEE = /^"([0-9a-f]{32})"$/;

type EnTetes = Record<string, string | string[] | undefined>;

/**
 * Reads `If-Match` and `If-None-Match` (400 `invalide`, `champ: if_match` / `if_none_match`).
 * `creation`: the route is one of the `PUT`s that create (sheet, file) — the only ones that take `If-None-Match`.
 */
export function lirePrecondition(entetes: EnTetes, options: { creation?: boolean } = {}): Precondition {
  const ifMatch = entetes['if-match'];
  const ifNone = entetes['if-none-match'];
  if (ifMatch !== undefined && ifNone !== undefined) {
    throw new ErreurService('invalide', 'If-Match et If-None-Match ne vont pas ensemble.', undefined, 'if_match');
  }
  const precondition: Precondition = {};
  if (ifMatch !== undefined) {
    const m = typeof ifMatch === 'string' ? EMPREINTE_CITEE.exec(ifMatch.trim()) : null;
    if (!m) {
      throw new ErreurService('invalide', 'If-Match : une empreinte entre guillemets est attendue.', undefined, 'if_match');
    }
    precondition.siEmpreinte = m[1]!;
  }
  if (ifNone !== undefined) {
    if (!options.creation || typeof ifNone !== 'string' || ifNone.trim() !== '*') {
      throw new ErreurService('invalide', 'If-None-Match : seul « * » est accepté, sur un PUT qui crée.', undefined, 'if_none_match');
    }
    precondition.siAbsent = true;
  }
  return precondition;
}

export const empreintePerimee = () =>
  new ErreurService('conflit', 'Modifiée depuis la lecture.', 'empreinte_perimee');

/**
 * Compares to the current fingerprint of the object (null: it does not exist). To be called inside the
 * write's transaction, before any write: it throws `conflit` / `empreinte_perimee` (412) and writes nothing.
 */
export function verifierPrecondition(precondition: Precondition | undefined, courante: string | null): void {
  if (!precondition) return;
  if (precondition.siAbsent && courante !== null) throw empreintePerimee();
  if (precondition.siEmpreinte !== undefined && precondition.siEmpreinte !== courante) throw empreintePerimee();
}

export interface CompteLot {
  lotId: number | null;
  nature: Nature;
  /** Key of the object, written in the report entry. */
  cle: string;
  /** What the entry names (`fiche`, `section`, `relation`, `fichier`). */
  objet: string;
  maintenant?: Date;
}

/**
 * Applies the precondition inside one transaction, then the write. A refusal by fingerprint rolls
 * everything back and, with a batch, counts « 1 refusée » (key, « modifiée depuis la lecture ») outside
 * the rolled-back transaction; the nature counted is the caller's. Without a batch nothing is counted.
 */
export function sousPrecondition<T>(
  db: Db,
  precondition: Precondition | undefined,
  lot: CompteLot,
  courante: () => string | null,
  ecrire: () => T,
): T {
  try {
    return db.transaction(() => {
      verifierPrecondition(precondition, courante());
      return ecrire();
    })();
  } catch (e) {
    if (e instanceof ErreurService && e.detail === 'empreinte_perimee' && lot.lotId !== null) {
      noterDansLot(db, lot.lotId, lot.nature, 'refusees', [
        { cle: lot.cle, objet: lot.objet, raison: RAISON_EMPREINTE_PERIMEE, gravite: 'refus', code: 'empreinte_perimee' },
      ], lot.maintenant);
    }
    throw e;
  }
}
