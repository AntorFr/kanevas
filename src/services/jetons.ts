import { createHash, randomBytes } from 'node:crypto';

import type { Db } from '../db/db.js';
import { exigerMJ, roleDe } from './droits.js';
import { introuvable, invalide } from './erreurs.js';

/** Allowed lifetimes in days (AD-103); 30 is the default of the screen. */
export const DUREES_JETON = [7, 30, 90, 365] as const;
const JOUR_MS = 24 * 3600 * 1000;
/** `dernier_usage_le` is written at most once a minute (AD-103). */
const USAGE_MIN_MS = 60 * 1000;

export interface Jeton {
  id: number;
  universId: number;
  compteId: number;
  nom: string;
  creeLe: string;
  expireLe: string;
  revoqueLe: string | null;
  dernierUsageLe: string | null;
}

/** A listed token: also says whether its creator is still a GM (B-46, the "Inactif" pill). */
export interface JetonListe extends Jeton {
  createur: string;
  actif: boolean;
}

interface JetonRow {
  id: number;
  univers_id: number;
  compte_id: number;
  nom: string;
  cree_le: string;
  expire_le: string;
  revoque_le: string | null;
  dernier_usage_le: string | null;
}

const versJeton = (r: JetonRow): Jeton => ({
  id: r.id,
  universId: r.univers_id,
  compteId: r.compte_id,
  nom: r.nom,
  creeLe: r.cree_le,
  expireLe: r.expire_le,
  revoqueLe: r.revoque_le,
  dernierUsageLe: r.dernier_usage_le,
});

export const empreinteDe = (valeur: string): string =>
  createHash('sha256').update(valeur).digest('hex');

/**
 * Creates a token for the calling GM (AD-103). The value is returned once and never stored:
 * the base keeps its SHA-256 only.
 */
export function creerJeton(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: unknown; dureeJours: unknown },
  maintenant: Date = new Date(),
): { jeton: Jeton; valeur: string } {
  exigerMJ(db, universId, compteId);
  const nom = typeof entree.nom === 'string' ? entree.nom.trim() : '';
  if (nom.length < 1 || nom.length > 80) throw invalide('Erreur : le nom est obligatoire.');
  const duree = entree.dureeJours;
  if (!(DUREES_JETON as readonly unknown[]).includes(duree)) {
    throw invalide('Erreur : la durée est invalide.');
  }
  return inserer(db, compteId, universId, nom, duree as number, `kvs_${randomBytes(32).toString('base64url')}`, maintenant);
}

/**
 * Stub starting world only (AD-55): a token of a fixed, well-known value. Same insertion as
 * `creerJeton`; the value is the one the tests and the recipe use.
 */
export function creerJetonDeValeur(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: string; dureeJours: (typeof DUREES_JETON)[number]; valeur: string },
  maintenant: Date = new Date(),
): Jeton {
  exigerMJ(db, universId, compteId);
  return inserer(db, compteId, universId, entree.nom, entree.dureeJours, entree.valeur, maintenant).jeton;
}

function inserer(
  db: Db,
  compteId: number,
  universId: number,
  nom: string,
  duree: number,
  valeur: string,
  maintenant: Date,
): { jeton: Jeton; valeur: string } {
  const creeLe = maintenant.toISOString();
  const expireLe = new Date(maintenant.getTime() + duree * JOUR_MS).toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO jetons_api (univers_id, compte_id, nom, empreinte, cree_le, expire_le)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(universId, compteId, nom, empreinteDe(valeur), creeLe, expireLe);
  const row = db.prepare('SELECT * FROM jetons_api WHERE id = ?').get(lastInsertRowid) as JetonRow;
  return { jeton: versJeton(row), valeur };
}

/** Every token of the universe, any GM's, newest first. GM only; the value is never part of it. */
export function listerJetons(db: Db, compteId: number, universId: number): JetonListe[] {
  exigerMJ(db, universId, compteId);
  const rows = db
    .prepare(
      `SELECT j.*, c.username AS createur FROM jetons_api j JOIN comptes c ON c.id = j.compte_id
       WHERE j.univers_id = ? ORDER BY j.cree_le DESC, j.id DESC`,
    )
    .all(universId) as (JetonRow & { createur: string })[];
  return rows.map((r) => ({
    ...versJeton(r),
    createur: r.createur,
    actif: roleDe(db, universId, r.compte_id) === 'mj',
  }));
}

/** Any GM of the universe revokes any of its tokens. Revoking twice keeps the first date. */
export function revoquerJeton(
  db: Db,
  compteId: number,
  universId: number,
  jetonId: number,
  maintenant: Date = new Date(),
): void {
  exigerMJ(db, universId, compteId);
  const row = db
    .prepare('SELECT id FROM jetons_api WHERE id = ? AND univers_id = ?')
    .get(jetonId, universId);
  if (!row) throw introuvable();
  db.prepare('UPDATE jetons_api SET revoque_le = ? WHERE id = ? AND revoque_le IS NULL').run(
    maintenant.toISOString(),
    jetonId,
  );
}

/**
 * The token a presented value designates, or null: known fingerprint, not revoked, not expired,
 * and its creator still a GM of the universe (AD-103). The reason is never told.
 */
export function verifierJeton(db: Db, valeur: string, maintenant: Date = new Date()): Jeton | null {
  if (!valeur.startsWith('kvs_')) return null;
  const row = db
    .prepare('SELECT * FROM jetons_api WHERE empreinte = ?')
    .get(empreinteDe(valeur)) as JetonRow | undefined;
  if (!row || row.revoque_le !== null) return null;
  const maintenantIso = maintenant.toISOString();
  if (row.expire_le <= maintenantIso) return null;
  if (roleDe(db, row.univers_id, row.compte_id) !== 'mj') return null;
  const dernier = row.dernier_usage_le ? Date.parse(row.dernier_usage_le) : null;
  if (dernier === null || maintenant.getTime() - dernier >= USAGE_MIN_MS) {
    db.prepare('UPDATE jetons_api SET dernier_usage_le = ? WHERE id = ?').run(maintenantIso, row.id);
    row.dernier_usage_le = maintenantIso;
  }
  return versJeton(row);
}
