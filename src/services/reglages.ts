import type { Db } from '../db/db.js';

/** The only reader and writer of `reglages_instance` (AD-143): settings of the whole instance. */

/** Default of `fond_carte_max_mo`, in MB. */
export const FOND_CARTE_MAX_MO_DEFAUT = 75;
export const FOND_CARTE_MAX_MO_MIN = 1;
export const FOND_CARTE_MAX_MO_MAX = 500;

export function lireReglage(db: Db, cle: string): string | null {
  const r = db.prepare('SELECT valeur FROM reglages_instance WHERE cle = ?').get(cle) as { valeur: string } | undefined;
  return r?.valeur ?? null;
}

export function poserReglage(db: Db, cle: string, valeur: string, compteId: number | null): void {
  db.prepare(
    `INSERT INTO reglages_instance (cle, valeur, modifie_le, modifie_par) VALUES (?, ?, ?, ?)
     ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = excluded.modifie_le,
       modifie_par = excluded.modifie_par`,
  ).run(cle, valeur, new Date().toISOString(), compteId);
}

/** The largest map background, in MB: the setting, else 75. A stored value out of range is ignored. */
export function fondCarteMaxMo(db: Db): number {
  const n = Number(lireReglage(db, 'fond_carte_max_mo'));
  return Number.isInteger(n) && n >= FOND_CARTE_MAX_MO_MIN && n <= FOND_CARTE_MAX_MO_MAX
    ? n
    : FOND_CARTE_MAX_MO_DEFAUT;
}
