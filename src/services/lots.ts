import type { Db } from '../db/db.js';
import { exigerMJ } from './droits.js';
import { introuvable } from './erreurs.js';
import { compterEnAttente } from './liens.js';
import type { Jeton } from './jetons.js';

/** Entries kept in a batch report (AD-104); further ones are counted but not listed. */
export const MAX_RAPPORT = 1000;

export const NATURES = ['fiches', 'fichiers', 'campagnes', 'scenarios', 'relations'] as const;
export type Nature = (typeof NATURES)[number];
export type Issue = 'creees' | 'mises_a_jour' | 'inchangees' | 'refusees';

/** Only the sheets can be deleted by the import (`DELETE /fiches/:cle`, AD-119 (4)): `supprimees` is theirs. */
export type Compteurs = Record<Exclude<Nature, 'fiches'>, Record<Issue, number>> & {
  fiches: Record<Issue | 'supprimees', number>;
};

export interface EntreeRapport {
  cle: string;
  objet: string;
  raison: string;
  gravite: 'refus' | 'avertissement';
}

export interface Lot {
  lotId: number;
  universId: number;
  jetonId: number;
  ouvertLe: string;
  closLe: string | null;
  dernierEcritLe: string | null;
  /** « Abandonné » is not stored: open and without a write for more than 24 h (E-18). */
  etat: 'en_cours' | 'clos' | 'abandonne';
  compteurs: Compteurs;
  avertissements: number;
  enAttente: number;
  rapport: EntreeRapport[];
}

interface LotRow {
  id: number;
  univers_id: number;
  jeton_id: number;
  ouvert_le: string;
  clos_le: string | null;
  dernier_ecrit_le: string | null;
  compteurs: string;
  avertissements: number;
  en_attente: number;
  rapport: string;
}

const JOUR_MS = 24 * 3600 * 1000;

function compteursVides(): Compteurs {
  const c = {} as Compteurs;
  for (const n of NATURES) c[n] = { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 } as never;
  c.fiches.supprimees = 0;
  return c;
}

function versLot(r: LotRow, maintenant: Date): Lot {
  const stockes = JSON.parse(r.compteurs) as Partial<Compteurs>;
  const compteurs = compteursVides();
  for (const n of NATURES) Object.assign(compteurs[n], stockes[n] ?? {});
  const derniere = Date.parse(r.dernier_ecrit_le ?? r.ouvert_le);
  return {
    lotId: r.id,
    universId: r.univers_id,
    jetonId: r.jeton_id,
    ouvertLe: r.ouvert_le,
    closLe: r.clos_le,
    dernierEcritLe: r.dernier_ecrit_le,
    etat: r.clos_le ? 'clos' : maintenant.getTime() - derniere > JOUR_MS ? 'abandonne' : 'en_cours',
    compteurs,
    avertissements: r.avertissements,
    enAttente: r.en_attente,
    rapport: JSON.parse(r.rapport) as EntreeRapport[],
  };
}

function ligne(db: Db, lotId: number): LotRow | undefined {
  return db.prepare('SELECT * FROM lots_import WHERE id = ?').get(lotId) as LotRow | undefined;
}

/**
 * Opens a batch for the token, or returns the one it already has open (resumption). A batch
 * is never opened by a refused request: the guard answers before any service is called.
 */
export function ouvrirLot(
  db: Db,
  jeton: Jeton,
  maintenant: Date = new Date(),
): { lot: Lot; repris: boolean } {
  return db.transaction(() => {
    const ouvert = db
      .prepare('SELECT * FROM lots_import WHERE jeton_id = ? AND clos_le IS NULL ORDER BY id DESC LIMIT 1')
      .get(jeton.id) as LotRow | undefined;
    if (ouvert) return { lot: versLot(ouvert, maintenant), repris: true };
    const { lastInsertRowid } = db
      .prepare('INSERT INTO lots_import (univers_id, jeton_id, ouvert_le, compteurs) VALUES (?, ?, ?, ?)')
      .run(jeton.universId, jeton.id, maintenant.toISOString(), JSON.stringify(compteursVides()));
    return { lot: versLot(ligne(db, Number(lastInsertRowid))!, maintenant), repris: false };
  })();
}

/** A batch of the token's universe; any other id is unknown. */
export function lireLot(db: Db, jeton: Jeton, lotId: number, maintenant: Date = new Date()): Lot {
  const row = ligne(db, lotId);
  if (!row || row.univers_id !== jeton.universId) throw introuvable();
  return versLot(row, maintenant);
}

/**
 * Sheets whose wanted parent is not the one written (absent target, cycle), still where the import
 * left them: a hand-moved sheet is not waiting (AD-115 (4)).
 */
function compterParentsEnAttente(db: Db, universId: number): number {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM fiches f
        WHERE f.univers_id = ? AND json_extract(f.dernier_import, '$.parent.demande') IS NOT NULL
          AND f.parent_id IS json_extract(f.dernier_import, '$.parent.ecrit')
          AND NOT EXISTS (SELECT 1 FROM fiches p WHERE p.id = f.parent_id
                            AND p.cle_origine = json_extract(f.dernier_import, '$.parent.demande'))`,
    )
    .get(universId) as { n: number };
  return n;
}

/** Closes a batch (idempotent: a closed one keeps its date) and returns its report. */
export function cloreLot(db: Db, jeton: Jeton, lotId: number, maintenant: Date = new Date()): Lot {
  lireLot(db, jeton, lotId, maintenant);
  // « En attente » is counted once, at the closing (E-18): links still waiting for an origin key.
  db.prepare('UPDATE lots_import SET clos_le = ?, en_attente = ? WHERE id = ? AND clos_le IS NULL').run(
    maintenant.toISOString(),
    compterEnAttente(db, jeton.universId) + compterParentsEnAttente(db, jeton.universId),
    lotId,
  );
  return lireLot(db, jeton, lotId, maintenant);
}

/**
 * For the write services of the import: counts one outcome for a nature, optionally with a
 * report entry (a refusal, or a warning that bumps `avertissements`), and stamps the write.
 * Runs inside the caller's transaction. Entries past `MAX_RAPPORT` are counted, not listed.
 */
export function noterDansLot(
  db: Db,
  lotId: number,
  nature: Nature,
  issue: Issue | 'supprimees',
  entrees: EntreeRapport[] = [],
  maintenant: Date = new Date(),
): void {
  const row = ligne(db, lotId);
  if (!row) throw introuvable();
  const lot = versLot(row, maintenant);
  (lot.compteurs[nature] as Record<string, number>)[issue]! += 1;
  const rapport = [...lot.rapport, ...entrees].slice(0, MAX_RAPPORT);
  const avert = entrees.filter((e) => e.gravite === 'avertissement').length;
  db.prepare(
    `UPDATE lots_import SET compteurs = ?, rapport = ?, avertissements = avertissements + ?,
       dernier_ecrit_le = ? WHERE id = ?`,
  ).run(JSON.stringify(lot.compteurs), JSON.stringify(rapport), avert, maintenant.toISOString(), lotId);
}

/** Batches listed on E-18 (B-49). */
export const MAX_LOTS_LISTES = 20;
/** Report entries sent per batch to the screen (E-18: 200, then « … et N autres »). */
export const MAX_ENTREES_ECRAN = 200;

export interface LotListe extends Omit<Lot, 'rapport'> {
  jeton: string;
  refus: EntreeRapport[];
  alertes: EntreeRapport[];
  /** Entries of the report beyond the 200 sent per group. */
  refusAutres: number;
  alertesAutres: number;
}

/** The 20 latest batches of the universe, newest first, with their counters and report. GM only. */
export function listerLots(
  db: Db,
  compteId: number,
  universId: number,
  maintenant: Date = new Date(),
): LotListe[] {
  exigerMJ(db, universId, compteId);
  const rows = db
    .prepare(
      `SELECT l.*, j.nom AS jeton FROM lots_import l JOIN jetons_api j ON j.id = l.jeton_id
       WHERE l.univers_id = ? ORDER BY l.ouvert_le DESC, l.id DESC LIMIT ?`,
    )
    .all(universId, MAX_LOTS_LISTES) as (LotRow & { jeton: string })[];
  return rows.map((r) => {
    const { rapport, ...lot } = versLot(r, maintenant);
    const refus = rapport.filter((e) => e.gravite === 'refus');
    const alertes = rapport.filter((e) => e.gravite === 'avertissement');
    return {
      ...lot,
      jeton: r.jeton,
      refus: refus.slice(0, MAX_ENTREES_ECRAN),
      alertes: alertes.slice(0, MAX_ENTREES_ECRAN),
      refusAutres: Math.max(0, refus.length - MAX_ENTREES_ECRAN),
      alertesAutres: Math.max(0, alertes.length - MAX_ENTREES_ECRAN),
    };
  });
}
