// The one rule of « may this reader see this system? » (AD-masquer-1, B-97, AD-150). A GM outside Player mode reads
// every system; anyone else reads the ones that are not hidden. Every read of the galaxy goes through this file: the
// predicate for one system (`systemeLisible`, `lisibleAuNiveau`), its SQL twin for lists (`sqlSystemeLisible`) and the
// hexagons a reader must find empty (`hexagonesMasques`). No other file reads `swn_systemes.secret` to decide a read
// (a source-scan test fails otherwise; its exceptions are the GM's state read `etatMasque` and the writes).
import type { Db } from '../../db/db.js';
import { roleDe, vueMJ } from '../droits.js';
import { accessible } from '../outils.js';
import type { Acteur } from '../types.js';

/** The tool key; the module `swn` declares it (`src/outils/swn/index.ts`). */
export const OUTIL_GALAXIE = 'swn/galaxie';

export type NiveauLecture = 'mj' | 'joueur';

/**
 * The one place a role becomes a reading level (G-2): `'mj'` for a GM outside Player mode, `'joueur'` for a
 * player and for a GM in Player mode, `null` without a role or when the tool is not accessible to the actor.
 */
export function niveauLecture(db: Db, acteur: Acteur, universId: number): NiveauLecture | null {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) return null;
  if (!accessible(db, acteur, universId, OUTIL_GALAXIE)) return null;
  return vueMJ(role, acteur) ? 'mj' : 'joueur';
}

/** The rule itself, on a row already read: the single place that says what a hidden system is for a level. */
export const lisibleAuNiveau = (niveau: NiveauLecture, systeme: { secret: number }): boolean =>
  niveau === 'mj' || systeme.secret === 0;

/** The SQL twin of the rule for lists: a condition on the system joined as `alias`. */
export const sqlSystemeLisible = (alias: string, niveau: NiveauLecture): string =>
  (niveau === 'mj' ? '1 = 1' : `${alias}.secret = 0`);

/** Is the system `systemeId` readable by this actor? An unknown id, a role-less actor or an inaccessible tool: no. */
export function systemeLisible(db: Db, acteur: Acteur, systemeId: number): boolean {
  const ligne = Number.isSafeInteger(systemeId)
    ? db.prepare('SELECT univers_id, secret FROM swn_systemes WHERE id = ?').get(systemeId) as { univers_id: number; secret: number } | undefined
    : undefined;
  if (!ligne) return false;
  const niveau = niveauLecture(db, acteur, ligne.univers_id);
  return niveau !== null && lisibleAuNiveau(niveau, ligne);
}

/** `q,r` of the systems this level may not read: where the galaxy read must show an empty hexagon, drawn star included. */
export function hexagonesMasques(db: Db, galaxieId: number, niveau: NiveauLecture): Set<string> {
  if (niveau === 'mj') return new Set();
  const lignes = db.prepare(`SELECT s.q, s.r FROM swn_systemes s WHERE s.galaxie_id = ? AND NOT (${sqlSystemeLisible('s', niveau)})`)
    .all(galaxieId) as { q: number; r: number }[];
  return new Set(lignes.map((l) => `${l.q},${l.r}`));
}

/** What the GM's own screens show of a row (the badge, the switch): the one place the flag is turned into a boolean. */
export const estMasque = (systeme: { secret: number }): boolean => systeme.secret === 1;
