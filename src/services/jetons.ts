import { createHash, randomBytes } from 'node:crypto';

import type { Db } from '../db/db.js';
import { exigerMJ, roleDe } from './droits.js';
import type { Role } from './types.js';
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { applicable, type DeclarationOutil } from '../outils/declaration.js';
import { modulesActifs } from '../outils/registre.js';

/** Allowed lifetimes in days (AD-103); 30 is the default of the screen. */
export const DUREES_JETON = [7, 30, 90, 365] as const;
const JOUR_MS = 24 * 3600 * 1000;
/** `dernier_usage_le` is written at most once a minute (AD-103). */
const USAGE_MIN_MS = 60 * 1000;

/** What a token reaches in a universe (AD-144). `aucun` is also « not reached ». */
export type NiveauAcces = 'lecture' | 'ecriture' | 'aucun';
export type NiveauPose = Exclude<NiveauAcces, 'aucun'>;

/** One reached universe: with `tous` an exception to the level of `tous`, else a line of the list. */
export interface AccesUnivers {
  universId: number;
  nom: string;
  niveau: NiveauAcces;
}

/** The accesses as written by the owner or the admin (a creation or a change). */
export interface AccesEntree {
  tous: boolean;
  /** Required with `tous`, ignored otherwise. */
  niveauTous?: NiveauPose;
  /** With `tous`: the exceptions (`aucun` leaves a universe out); otherwise the list. */
  univers?: { universId: number; niveau: NiveauAcces }[];
}

/** An account acting on a token: `admin` is built by the route from the session, never read from a body. */
export interface ActeurJeton {
  compteId: number;
  admin: boolean;
}

export interface Jeton {
  id: number;
  compteId: number;
  nom: string;
  creeLe: string;
  expireLe: string;
  revoqueLe: string | null;
  revoquePar: number | null;
  dernierUsageLe: string | null;
  tous: boolean;
  niveauTous: NiveauPose | null;
  univers: AccesUnivers[];
  modifieParAdmin: { par: number; le: string } | null;
  /** The tools it writes (K-6); empty is the content token. */
  outils: string[];
}

/** The token of a request: the guard gives it the universe of the address (transitional, until the guard task). */
export interface JetonRequete extends Jeton {
  universId: number;
  /** The level of the request: the token's access and its account's current role (never `aucun` past the guard). */
  niveau: NiveauAcces;
}

export type EtatJeton = 'actif' | 'revoque' | 'expire';

/** A listed token: its state and its owner's name. */
export interface JetonListe extends Jeton {
  etat: EtatJeton;
  proprietaire: string;
}

/** A token listed on E-18 (transitional): also says whether its creator is still a GM (B-46, the "Inactif" pill). */
export interface JetonUniversListe extends Omit<Jeton, 'outils'> {
  universId: number;
  createur: string;
  actif: boolean;
  /** Labelled; a key the registry no longer knows keeps its key as label. */
  outils: { cle: string; libelle: string }[];
}

export interface OutilProposable {
  cle: string;
  libelle: string;
  module: string;
  libelleModule: string;
  type: DeclarationOutil['type'];
}

interface JetonRow {
  id: number;
  compte_id: number;
  nom: string;
  cree_le: string;
  expire_le: string;
  revoque_le: string | null;
  revoque_par: number | null;
  dernier_usage_le: string | null;
  tous: number;
  niveau_tous: NiveauPose | null;
  modifie_par_admin_par: number | null;
  modifie_par_admin_le: string | null;
}

const universDe = (db: Db, jetonId: number): AccesUnivers[] =>
  (db
    .prepare(
      `SELECT ju.univers_id AS universId, u.nom, ju.niveau FROM jetons_univers ju
         JOIN univers u ON u.id = ju.univers_id WHERE ju.jeton_id = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(jetonId) as AccesUnivers[]);

const outilsDe = (db: Db, jetonId: number): string[] =>
  (db.prepare('SELECT outil FROM jetons_outils WHERE jeton_id = ? ORDER BY outil').all(jetonId) as { outil: string }[])
    .map((r) => r.outil);

const versJeton = (db: Db, r: JetonRow): Jeton => ({
  id: r.id,
  compteId: r.compte_id,
  nom: r.nom,
  creeLe: r.cree_le,
  expireLe: r.expire_le,
  revoqueLe: r.revoque_le,
  revoquePar: r.revoque_par,
  dernierUsageLe: r.dernier_usage_le,
  tous: r.tous === 1,
  niveauTous: r.niveau_tous,
  univers: universDe(db, r.id),
  modifieParAdmin:
    r.modifie_par_admin_par !== null && r.modifie_par_admin_le !== null
      ? { par: r.modifie_par_admin_par, le: r.modifie_par_admin_le }
      : null,
  outils: outilsDe(db, r.id),
});

const ligne = (db: Db, id: number): JetonRow | undefined =>
  db.prepare('SELECT * FROM jetons_api WHERE id = ?').get(id) as JetonRow | undefined;

const etatDe = (r: { revoque_le: string | null; expire_le: string }, maintenant: Date): EtatJeton =>
  r.revoque_le !== null ? 'revoque' : r.expire_le <= maintenant.toISOString() ? 'expire' : 'actif';

/**
 * Tools with a catalogue or an importation (T-9) that apply to the universe's game system, in registry order; none without
 * a system. The caller guards the role.
 */
function proposables(db: Db, universId: number): OutilProposable[] {
  const s = db
    .prepare('SELECT s.nom FROM univers u JOIN systemes_jeu s ON s.id = u.systeme_id WHERE u.id = ?')
    .get(universId) as { nom: string } | undefined;
  if (!s) return [];
  return modulesActifs().flatMap((m) =>
    m.outils.filter((o) => (o.catalogue || o.importation) && applicable(o, s.nom)).map((o) => ({
      cle: o.cle, libelle: o.libelle, module: m.nom, libelleModule: m.libelle, type: o.type,
    })));
}

/** The tools a GM can put in a token's scope on E-18 (K-6). GM only. */
export function listerOutilsProposables(db: Db, compteId: number, universId: number): OutilProposable[] {
  exigerMJ(db, universId, compteId);
  return proposables(db, universId);
}

export const empreinteDe = (valeur: string): string =>
  createHash('sha256').update(valeur).digest('hex');

// ---------------------------------------------------------------------------------------------------
// Rules of the accesses (AD-144)

const champ = (message: string, nom: string) => new ErreurService('invalide', message, undefined, nom);

/**
 * The rows to store for the accesses written, or `invalide` (`champ: acces`). With `tous`, a row at the
 * level of `tous` is no exception and is dropped; a list never stores `aucun` (a universe at « — » has
 * no row) and has at least one row. A universe must be one the owner belongs to — except one the token
 * already carries (an account that left a universe keeps its line, E-23).
 */
function normaliser(
  db: Db,
  proprietaire: number,
  acces: unknown,
  dejaPortes: Set<number>,
): { tous: boolean; niveauTous: NiveauPose | null; lignes: { universId: number; niveau: NiveauAcces }[] } {
  const faux = () => champ('Erreur : les accès sont invalides.', 'acces');
  if (typeof acces !== 'object' || acces === null || Array.isArray(acces)) throw faux();
  const a = acces as { tous?: unknown; niveauTous?: unknown; univers?: unknown };
  if (typeof a.tous !== 'boolean') throw faux();
  const niveaux: unknown[] = ['lecture', 'ecriture', 'aucun'];
  const brutes = a.univers === undefined ? [] : a.univers;
  if (!Array.isArray(brutes)) throw faux();
  const vus = new Set<number>();
  const lignes: { universId: number; niveau: NiveauAcces }[] = [];
  for (const b of brutes as { universId?: unknown; niveau?: unknown }[]) {
    if (typeof b !== 'object' || b === null) throw faux();
    if (!Number.isInteger(b.universId) || !niveaux.includes(b.niveau)) throw faux();
    const universId = b.universId as number;
    if (vus.has(universId)) throw faux();
    vus.add(universId);
    if (roleDe(db, universId, proprietaire) === null && !dejaPortes.has(universId)) throw faux();
    lignes.push({ universId, niveau: b.niveau as NiveauAcces });
  }
  if (a.tous) {
    if (a.niveauTous !== 'lecture' && a.niveauTous !== 'ecriture') throw faux();
    return { tous: true, niveauTous: a.niveauTous, lignes: lignes.filter((l) => l.niveau !== a.niveauTous) };
  }
  const liste = lignes.filter((l) => l.niveau !== 'aucun');
  if (liste.length === 0) throw faux();
  return { tous: false, niveauTous: null, lignes: liste };
}

function poserLignes(db: Db, jetonId: number, lignes: { universId: number; niveau: NiveauAcces }[]): void {
  db.prepare('DELETE FROM jetons_univers WHERE jeton_id = ?').run(jetonId);
  for (const l of lignes) {
    db.prepare('INSERT INTO jetons_univers (jeton_id, univers_id, niveau) VALUES (?, ?, ?)').run(jetonId, l.universId, l.niveau);
  }
}

/** The level a token has in a universe: its row, else `tous` unless a row says `aucun` (AD-144). */
export function accesDe(db: Db, jetonId: number, universId: number): NiveauAcces {
  const row = db
    .prepare('SELECT niveau FROM jetons_univers WHERE jeton_id = ? AND univers_id = ?')
    .get(jetonId, universId) as { niveau: NiveauAcces } | undefined;
  if (row) return row.niveau;
  const j = db.prepare('SELECT tous, niveau_tous FROM jetons_api WHERE id = ?').get(jetonId) as
    | { tous: number; niveau_tous: NiveauPose | null }
    | undefined;
  return j && j.tous === 1 && j.niveau_tous ? j.niveau_tous : 'aucun';
}

/**
 * What the token may do in the universe right now: its level ∧ the role its account has **now** (AD-144).
 * No role or no access: `aucun`. A player's `ecriture` token keeps the level `ecriture` with `role: 'joueur'`:
 * it writes what a player writes, the services and their rules say which.
 */
export function niveauEffectif(
  db: Db,
  jeton: { id: number; compteId: number },
  universId: number,
): { niveau: NiveauAcces; role: Role | null } {
  const role = roleDe(db, universId, jeton.compteId);
  const acces = accesDe(db, jeton.id, universId);
  return { niveau: role === null ? 'aucun' : acces, role };
}

// ---------------------------------------------------------------------------------------------------
// Creation

function verifierSaisie(entree: { nom: unknown; dureeJours: unknown }): { nom: string; duree: number } {
  const nom = typeof entree.nom === 'string' ? entree.nom.trim() : '';
  if (nom.length < 1 || nom.length > 80) throw champ('Erreur : le nom est obligatoire.', 'nom');
  if (!(DUREES_JETON as readonly unknown[]).includes(entree.dureeJours)) {
    throw champ('Erreur : la durée est invalide.', 'duree');
  }
  return { nom, duree: entree.dureeJours as number };
}

type EntreeJeton = { nom: unknown; dureeJours: unknown; acces: unknown };
type EntreeJetonUnivers = { nom: unknown; dureeJours: unknown; outils?: unknown };

/**
 * Creates a token for an account (AD-103, AD-144): any member, at the accesses chosen. The value is returned once
 * and never stored: the base keeps its SHA-256 only.
 *
 * Transitional second form `(db, compteId, universId, entree)`: the E-18 route's, which the session task removes —
 * a GM's token on one universe at `ecriture`, optionally with tools.
 */
export function creerJeton(db: Db, compteId: number, entree: EntreeJeton, maintenant?: Date): { jeton: Jeton; valeur: string };
export function creerJeton(
  db: Db, compteId: number, universId: number, entree: EntreeJetonUnivers, maintenant?: Date,
): { jeton: JetonRequete; valeur: string };
export function creerJeton(
  db: Db,
  compteId: number,
  a: number | EntreeJeton,
  b?: EntreeJetonUnivers | Date,
  c?: Date,
): { jeton: Jeton | JetonRequete; valeur: string } {
  const valeur = `kvs_${randomBytes(32).toString('base64url')}`;
  if (typeof a !== 'number') {
    const { nom, duree } = verifierSaisie(a);
    const acces = normaliser(db, compteId, a.acces, new Set());
    return { jeton: inserer(db, compteId, nom, duree, valeur, b instanceof Date ? b : new Date(), acces, []), valeur };
  }
  const universId = a;
  const entree = b as EntreeJetonUnivers;
  exigerMJ(db, universId, compteId);
  const { nom, duree } = verifierSaisie(entree);
  let outils: string[] = [];
  if (entree.outils !== undefined) {
    const offerts = new Set(proposables(db, universId).map((o) => o.cle));
    const liste = entree.outils;
    if (!Array.isArray(liste) || liste.some((o) => typeof o !== 'string' || !offerts.has(o))) {
      throw new ErreurService('invalide', 'Erreur : un outil ne reçoit pas de catalogue dans cet univers.', undefined, 'outils');
    }
    outils = [...new Set(liste as string[])];
  }
  const jeton = inserer(db, compteId, nom, duree, valeur, c ?? new Date(), listeSur(universId), outils);
  return { jeton: { ...jeton, universId }, valeur };
}

const listeSur = (universId: number) => ({
  tous: false,
  niveauTous: null,
  lignes: [{ universId, niveau: 'ecriture' as NiveauAcces }],
});

/**
 * Stub starting world only (AD-55): a token of a fixed, well-known value, on one universe at `ecriture`.
 * Same insertion as `creerJeton`; the value is the one the tests and the recipe use.
 */
export function creerJetonDeValeur(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: string; dureeJours: (typeof DUREES_JETON)[number]; valeur: string },
  maintenant: Date = new Date(),
): Jeton {
  exigerMJ(db, universId, compteId);
  return inserer(db, compteId, entree.nom, entree.dureeJours, entree.valeur, maintenant, listeSur(universId), []);
}

function inserer(
  db: Db,
  compteId: number,
  nom: string,
  duree: number,
  valeur: string,
  maintenant: Date,
  acces: { tous: boolean; niveauTous: NiveauPose | null; lignes: { universId: number; niveau: NiveauAcces }[] },
  outils: string[],
): Jeton {
  const creeLe = maintenant.toISOString();
  const expireLe = new Date(maintenant.getTime() + duree * JOUR_MS).toISOString();
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO jetons_api (compte_id, nom, empreinte, cree_le, expire_le, tous, niveau_tous)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(compteId, nom, empreinteDe(valeur), creeLe, expireLe, acces.tous ? 1 : 0, acces.niveauTous);
    poserLignes(db, Number(lastInsertRowid), acces.lignes);
    for (const outil of outils) {
      db.prepare('INSERT INTO jetons_outils (jeton_id, outil) VALUES (?, ?)').run(lastInsertRowid, outil);
    }
    return versJeton(db, ligne(db, Number(lastInsertRowid))!);
  })();
}

// ---------------------------------------------------------------------------------------------------
// Change of the accesses, revocation

/** The token an actor may touch: its owner, or the instance admin; anyone else gets « not found ». */
function jetonDe(db: Db, acteur: ActeurJeton, jetonId: number): JetonRow {
  const row = ligne(db, jetonId);
  if (!row || (row.compte_id !== acteur.compteId && acteur.admin !== true)) throw introuvable();
  return row;
}

/**
 * Changes the accesses of a token (B-94, B-95): its owner or the instance admin. The admin marks it
 * « modified by the admin »; the owner saving clears the mark. A revoked or expired token cannot be changed
 * (`conflit`, `jeton_revoque`).
 */
export function modifierAcces(
  db: Db,
  acteur: ActeurJeton,
  jetonId: number,
  acces: unknown,
  maintenant: Date = new Date(),
): Jeton {
  return db.transaction(() => {
    const row = jetonDe(db, acteur, jetonId);
    if (etatDe(row, maintenant) !== 'actif') {
      throw new ErreurService('conflit', 'Ce jeton est révoqué.', 'jeton_revoque');
    }
    const portes = new Set(universDe(db, row.id).map((u) => u.universId));
    const n = normaliser(db, row.compte_id, acces, portes);
    db.prepare('UPDATE jetons_api SET tous = ?, niveau_tous = ? WHERE id = ?').run(n.tous ? 1 : 0, n.niveauTous, row.id);
    poserLignes(db, row.id, n.lignes);
    const parAdmin = acteur.compteId !== row.compte_id;
    db.prepare('UPDATE jetons_api SET modifie_par_admin_par = ?, modifie_par_admin_le = ? WHERE id = ?').run(
      parAdmin ? acteur.compteId : null,
      parAdmin ? maintenant.toISOString() : null,
      row.id,
    );
    return versJeton(db, ligne(db, row.id)!);
  })();
}

/**
 * Revokes a token: its owner or the instance admin (`revoque_par` says which). Revoking twice keeps the first
 * date and author.
 *
 * Transitional second form `(db, compteId, universId, jetonId)`: E-18's, any GM of the universe the token reaches.
 */
export function revoquerJeton(db: Db, acteur: ActeurJeton, jetonId: number, maintenant?: Date): Jeton;
export function revoquerJeton(db: Db, compteId: number, universId: number, jetonId: number, maintenant?: Date): void;
export function revoquerJeton(
  db: Db,
  a: ActeurJeton | number,
  b: number,
  c?: number | Date,
  d?: Date,
): Jeton | void {
  if (typeof a === 'number') {
    exigerMJ(db, b, a);
    const jetonId = c as number;
    if (!ligne(db, jetonId) || accesDe(db, jetonId, b) === 'aucun') throw introuvable();
    revoquer(db, jetonId, a, d ?? new Date());
    return;
  }
  const row = jetonDe(db, a, b);
  revoquer(db, row.id, a.compteId, c instanceof Date ? c : new Date());
  return versJeton(db, ligne(db, row.id)!);
}

function revoquer(db: Db, jetonId: number, par: number, maintenant: Date): void {
  db.prepare('UPDATE jetons_api SET revoque_le = ?, revoque_par = ? WHERE id = ? AND revoque_le IS NULL').run(
    maintenant.toISOString(),
    par,
    jetonId,
  );
}

// ---------------------------------------------------------------------------------------------------
// Lists

/** Tokens listed on a screen: the 20 latest inactive ones, the active ones always all (B-46). */
export const MAX_JETONS_LISTES = 20;

type LigneListe = JetonRow & { proprietaire: string };

const SELECT_LISTE = `SELECT j.*, c.username AS proprietaire FROM jetons_api j JOIN comptes c ON c.id = j.compte_id`;

function enListe(db: Db, rows: LigneListe[], maintenant: Date, inactifsMax: 'tous20' | 'total20'): JetonListe[] {
  const liste = rows.map((r) => ({ ...versJeton(db, r), etat: etatDe(r, maintenant), proprietaire: r.proprietaire }));
  const actifs = liste.filter((j) => j.etat === 'actif');
  const autres = liste.filter((j) => j.etat !== 'actif');
  const place = inactifsMax === 'tous20' ? MAX_JETONS_LISTES : Math.max(0, MAX_JETONS_LISTES - actifs.length);
  return [...actifs, ...autres.slice(0, place)];
}

/** The tokens of an account (E-23): the active ones all, then revoked and expired ones up to 20 in all; newest first. */
export function listerJetonsDuCompte(db: Db, compteId: number, maintenant: Date = new Date()): JetonListe[] {
  const rows = db
    .prepare(`${SELECT_LISTE} WHERE j.compte_id = ? ORDER BY j.cree_le DESC, j.id DESC`)
    .all(compteId) as LigneListe[];
  return enListe(db, rows, maintenant, 'total20');
}

/**
 * Every token of the instance (E-5): admin only (anyone else gets « not found »), optionally one owner's. The
 * active ones all, then the 20 latest revoked or expired; the value is never part of it.
 */
export function listerJetonsInstance(
  db: Db,
  acteur: ActeurJeton,
  filtre: { proprietaire?: number } = {},
  maintenant: Date = new Date(),
): JetonListe[] {
  if (acteur.admin !== true) throw introuvable();
  const rows = (filtre.proprietaire === undefined
    ? db.prepare(`${SELECT_LISTE} ORDER BY j.cree_le DESC, j.id DESC`).all()
    : db.prepare(`${SELECT_LISTE} WHERE j.compte_id = ? ORDER BY j.cree_le DESC, j.id DESC`).all(filtre.proprietaire)) as LigneListe[];
  return enListe(db, rows, maintenant, 'tous20');
}

/**
 * Transitional (E-18, until the session task): the tokens that reach the universe, any GM's. GM only; the value is
 * never part of it. Active ones first (all of them, newest first, even past 20), then revoked and expired ones up to 20 in all.
 */
export function listerJetons(
  db: Db,
  compteId: number,
  universId: number,
  maintenant: Date = new Date(),
): JetonUniversListe[] {
  exigerMJ(db, universId, compteId);
  const rows = (db
    .prepare(`${SELECT_LISTE} ORDER BY j.cree_le DESC, j.id DESC`)
    .all() as LigneListe[]).filter((r) => accesDe(db, r.id, universId) !== 'aucun');
  const libelles = new Map(modulesActifs().flatMap((m) => m.outils).map((o) => [o.cle, o.libelle]));
  const iso = maintenant.toISOString();
  const liste = rows.map((r) => {
    const { outils, ...j } = versJeton(db, r);
    return {
      ...j,
      universId,
      outils: outils.map((cle) => ({ cle, libelle: libelles.get(cle) ?? cle })),
      createur: r.proprietaire,
      actif: roleDe(db, universId, r.compte_id) === 'mj',
    };
  });
  const vivant = (j: { revoqueLe: string | null; expireLe: string }) => j.revoqueLe === null && j.expireLe > iso;
  const vivants = liste.filter(vivant);
  const autres = liste.filter((j) => !vivant(j)).slice(0, Math.max(0, MAX_JETONS_LISTES - vivants.length));
  return [...vivants, ...autres];
}

/** A universe an account may put in a token (E-23): the ones it belongs to, with its role there. */
export interface UniversChoisissable {
  id: number;
  cle: string;
  nom: string;
  role: Role;
}

/** The universes an account belongs to, by name: what its tokens can reach (B-94). */
export function universChoisissables(db: Db, compteId: number): UniversChoisissable[] {
  return db
    .prepare(
      `SELECT u.id, u.cle, u.nom, m.role FROM membres m JOIN univers u ON u.id = m.univers_id
        WHERE m.compte_id = ? ORDER BY u.nom COLLATE NOCASE, u.id`,
    )
    .all(compteId) as UniversChoisissable[];
}

// ---------------------------------------------------------------------------------------------------
// Use

/**
 * The token a presented value designates, or null: known fingerprint, not revoked, not expired (AD-103). The reason
 * is never told. No universe, no role: the accesses and the role are read per request (`accesDe`, `niveauEffectif`).
 * `outils` lists its tool rows (`jetons_outils`), empty for a content token.
 */
export function verifierJeton(db: Db, valeur: string, maintenant: Date = new Date()): Jeton | null {
  if (!valeur.startsWith('kvs_')) return null;
  const row = db
    .prepare('SELECT * FROM jetons_api WHERE empreinte = ?')
    .get(empreinteDe(valeur)) as JetonRow | undefined;
  if (!row || row.revoque_le !== null) return null;
  const maintenantIso = maintenant.toISOString();
  if (row.expire_le <= maintenantIso) return null;
  const dernier = row.dernier_usage_le ? Date.parse(row.dernier_usage_le) : null;
  if (dernier === null || maintenant.getTime() - dernier >= USAGE_MIN_MS) {
    db.prepare('UPDATE jetons_api SET dernier_usage_le = ? WHERE id = ?').run(maintenantIso, row.id);
    row.dernier_usage_le = maintenantIso;
  }
  return versJeton(db, row);
}

/** A universe leaves the instance: the tokens stop reaching it (the tokens stay, AD-119). */
export function retirerUniversDesJetons(db: Db, universId: number): void {
  db.prepare('DELETE FROM jetons_univers WHERE univers_id = ?').run(universId);
}
