import type { Db } from '../db/db.js';
import { exigerRole, vueMJ } from './droits.js';
import { ErreurService, introuvable } from './erreurs.js';
import {
  CATEGORIES, MAX_EMPREINTE, MAX_NOM_ASSET, exigerEcriture, fichierDeAsset, retirerLigneBrouillon, validerBrouillon,
  type Categorie,
} from './battlemap-assets.js';
import { effacerFichier, modifierFichier } from './fichiers.js';
import type { Acteur } from './types.js';

/**
 * The generation batches of the battle map (AD-157, AD-battlemap-generation-1 and 2): the only reader and writer of
 * `bm_lots` / `bm_lots_lignes`. This file holds the state machine; the runner that spends the engine is
 * `battlemap-generation.ts`, which calls the few `…Ligne` primitives at the end.
 */

export const MAX_LIGNES = 20;
export const MAX_INDICE = 200;
export const MAX_REMARQUE = 500;

export type EtatLigne = 'attente' | 'en_cours' | 'brouillon' | 'echec' | 'accepte' | 'ecarte' | 'interrompu';
export type EtatLot = 'prepare' | 'en_cours' | 'termine';
export type CodeEchec = 'moteur' | 'delai' | 'image_invalide' | 'bibliotheque_pleine' | 'moteur_absent';

/** The interface's words of each failure (AD-battlemap-generation-3); never the engine's. */
export const MOTS_ECHEC: Record<CodeEchec, string> = {
  moteur: "Échec : le moteur d'image n'a pas répondu.",
  delai: "Échec : le moteur d'image a dépassé le délai.",
  image_invalide: "Échec : le moteur d'image n'a pas rendu une image.",
  bibliotheque_pleine: 'Échec : la bibliothèque est pleine (5 000 assets).',
  moteur_absent: "Échec : plus de moteur d'image.",
};

export interface SaisieLigne {
  nom?: unknown;
  categorie?: unknown;
  largeur?: unknown;
  hauteur?: unknown;
  indice?: unknown;
}

export interface LigneVue {
  id: number;
  rang: number;
  nom: string;
  categorie: Categorie;
  largeur: number | null;
  hauteur: number | null;
  indice: string;
  remarque: string;
  etat: EtatLigne;
  codeEchec: CodeEchec | null;
  /** The fixed sentence of `codeEchec`. */
  motEchec: string | null;
  assetId: number | null;
  /** File of the draft or of the accepted asset, for the library's file route (never served by a route of the batch). */
  fichierId: number | null;
  jeton: string | null;
}

export interface LotVue {
  id: number;
  etat: EtatLot;
  creeLe: string;
  lignes: LigneVue[];
  /** At least one line is `interrompu`: « Reprendre » is offered. */
  interrompu: boolean;
}

interface LigneSql {
  id: number; lot_id: number; rang: number; nom: string; categorie: Categorie; largeur: number | null; hauteur: number | null;
  indice: string; remarque: string; etat: EtatLigne; code_echec: CodeEchec | null; asset_id: number | null;
  fichier_id: number | null; disque: string | null;
}
interface LotSql { id: number; univers_id: number; etat: EtatLot; cree_par: number; cree_le: string }

const SELECT_LIGNES = `SELECT l.id, l.lot_id, l.rang, l.nom, l.categorie, l.largeur, l.hauteur, l.indice, l.remarque, l.etat,
  l.code_echec, l.asset_id, a.fichier_id, f.disque
  FROM bm_lots_lignes l LEFT JOIN bm_assets a ON a.id = l.asset_id LEFT JOIN fichiers f ON f.id = a.fichier_id`;

const conflit = (message: string, detail: string) => new ErreurService('conflit', message, detail);
const maintenant = () => new Date().toISOString();

// ---- The runner's door: the lots service never imports the runner (it would be a cycle). -----------------------------------
let declencheur: ((db: Db) => void) | undefined;
/** `battlemap-generation.ts` registers itself here; « Lancer », « Reprendre », « Régénérer » and « Réessayer » call it. */
export function poserDeclencheur(f: ((db: Db) => void) | undefined): void {
  declencheur = f;
}
const declencher = (db: Db) => declencheur?.(db);

// ---- Reads -------------------------------------------------------------------------------------------------------------------
const vueLigne = (l: LigneSql): LigneVue => ({
  id: l.id, rang: l.rang, nom: l.nom, categorie: l.categorie, largeur: l.largeur, hauteur: l.hauteur, indice: l.indice,
  remarque: l.remarque, etat: l.etat, codeEchec: l.code_echec, motEchec: l.code_echec ? MOTS_ECHEC[l.code_echec] : null,
  assetId: l.asset_id, fichierId: l.fichier_id, jeton: l.disque,
});

function lotOuvert(db: Db, universId: number): LotSql | undefined {
  return db.prepare("SELECT id, univers_id, etat, cree_par, cree_le FROM bm_lots WHERE univers_id = ? AND etat <> 'termine'")
    .get(universId) as LotSql | undefined;
}

function vueLot(db: Db, lot: LotSql): LotVue {
  const lignes = (db.prepare(`${SELECT_LIGNES} WHERE l.lot_id = ? ORDER BY l.rang`).all(lot.id) as LigneSql[]).map(vueLigne);
  return { id: lot.id, etat: lot.etat, creeLe: lot.cree_le, lignes, interrompu: lignes.some((l) => l.etat === 'interrompu') };
}

/** Reads need the GM outside Player mode: anyone else, a GM in Player mode included, gets `introuvable` (roles table of E-27). */
function exigerLecture(db: Db, acteur: Acteur, universId: number): void {
  const role = exigerRole(db, universId, acteur.compteId);
  if (!vueMJ(role, acteur)) throw introuvable();
}

/** The batch not `termine`, or null: a closed batch is not shown again. */
export function lireLot(db: Db, acteur: Acteur, universId: number): LotVue | null {
  exigerLecture(db, acteur, universId);
  const lot = lotOuvert(db, universId);
  return lot ? vueLot(db, lot) : null;
}

// ---- Validation ------------------------------------------------------------------------------------------------------------
interface LignePropre { nom: string; categorie: Categorie; largeur: number | null; hauteur: number | null; indice: string }

function champLigne(i: number, champ: string, message: string): ErreurService {
  return new ErreurService('invalide', message, 'ligne_invalide', `lignes.${i}.${champ}`);
}

function lignePropre(s: SaisieLigne, i: number): LignePropre {
  const nom = typeof s.nom === 'string' ? s.nom.trim() : '';
  if (nom.length < 1 || nom.length > MAX_NOM_ASSET) throw champLigne(i, 'nom', `Le nom : de 1 à ${MAX_NOM_ASSET} caractères.`);
  if (typeof s.categorie !== 'string' || !(CATEGORIES as readonly string[]).includes(s.categorie)) {
    throw champLigne(i, 'categorie', 'La catégorie est inconnue.');
  }
  const categorie = s.categorie as Categorie;
  const indice = s.indice === undefined || s.indice === null ? '' : s.indice;
  if (typeof indice !== 'string' || indice.trim().length > MAX_INDICE) {
    throw champLigne(i, 'indice', `L’indication : ${MAX_INDICE} caractères au plus.`);
  }
  const sans = categorie === 'sol' || categorie === 'mur';
  if (sans) {
    if ((s.largeur ?? null) !== null || (s.hauteur ?? null) !== null) throw champLigne(i, 'largeur', 'Un sol ou un mur n’a pas d’empreinte.');
    return { nom, categorie, largeur: null, hauteur: null, indice: indice.trim() };
  }
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_EMPREINTE;
  const largeur = s.largeur ?? 1;
  const hauteur = s.hauteur ?? 1;
  if (!ok(largeur)) throw champLigne(i, 'largeur', `L’empreinte : de 1 à ${MAX_EMPREINTE} cases.`);
  if (!ok(hauteur)) throw champLigne(i, 'hauteur', `L’empreinte : de 1 à ${MAX_EMPREINTE} cases.`);
  return { nom, categorie, largeur, hauteur, indice: indice.trim() };
}

// ---- Writes of the GM ------------------------------------------------------------------------------------------------------
/**
 * `PUT /`: saves the list as a `prepare` batch (creating it, or replacing the lines of the one that is). 1 to 20 lines. An
 * open batch that is not `prepare` is `lot_en_cours`.
 */
export function enregistrerLot(db: Db, acteur: Acteur, universId: number, lignes: unknown): LotVue {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    if (!Array.isArray(lignes) || lignes.length < 1 || lignes.length > MAX_LIGNES) {
      throw new ErreurService('invalide', `${MAX_LIGNES} lignes au plus.`, 'lignes_invalides', 'lignes');
    }
    const propres = lignes.map((l, i) => lignePropre((l ?? {}) as SaisieLigne, i));
    let lot = lotOuvert(db, universId);
    if (lot && lot.etat !== 'prepare') throw conflit('Un lot est déjà ouvert.', 'lot_en_cours');
    const now = maintenant();
    if (!lot) {
      const info = db.prepare("INSERT INTO bm_lots (univers_id, etat, cree_par, cree_le, modifie_le) VALUES (?, 'prepare', ?, ?, ?)")
        .run(universId, acteur.compteId, now, now);
      lot = { id: Number(info.lastInsertRowid), univers_id: universId, etat: 'prepare', cree_par: acteur.compteId, cree_le: now };
    } else {
      db.prepare('DELETE FROM bm_lots_lignes WHERE lot_id = ?').run(lot.id);
      db.prepare('UPDATE bm_lots SET modifie_le = ? WHERE id = ?').run(now, lot.id);
    }
    const ins = db.prepare('INSERT INTO bm_lots_lignes (lot_id, rang, nom, categorie, largeur, hauteur, indice) VALUES (?, ?, ?, ?, ?, ?, ?)');
    propres.forEach((p, i) => ins.run(lot!.id, i + 1, p.nom, p.categorie, p.largeur, p.hauteur, p.indice));
    return vueLot(db, lot);
  })();
}

function lotExigeOuvert(db: Db, universId: number): LotSql {
  const lot = lotOuvert(db, universId);
  if (!lot) throw introuvable();
  return lot;
}

/** « Lancer le lot »: `prepare` → `en_cours`; the runner takes the lines in order. */
export function lancerLot(db: Db, acteur: Acteur, universId: number): LotVue {
  const vue = db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const lot = lotExigeOuvert(db, universId);
    if (lot.etat !== 'prepare') throw conflit('Ce lot est déjà lancé.', 'etat_lot');
    db.prepare("UPDATE bm_lots SET etat = 'en_cours', modifie_le = ? WHERE id = ?").run(maintenant(), lot.id);
    return vueLot(db, { ...lot, etat: 'en_cours' });
  })();
  declencher(db);
  return vue;
}

/** « Reprendre »: every `interrompu` line goes back to `attente`. */
export function reprendreLot(db: Db, acteur: Acteur, universId: number): LotVue {
  const vue = db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const lot = lotExigeOuvert(db, universId);
    const r = lot.etat === 'en_cours'
      ? db.prepare("UPDATE bm_lots_lignes SET etat = 'attente', code_echec = NULL WHERE lot_id = ? AND etat = 'interrompu'").run(lot.id)
      : { changes: 0 };
    if (r.changes === 0) throw conflit('Aucune ligne à reprendre.', 'etat_lot');
    return vueLot(db, lot);
  })();
  declencher(db);
  return vue;
}

/** Files of removed drafts are deleted after the commit, the library's own way. */
function effacerFichiers(db: Db, acteur: Acteur, universId: number, ids: number[]): void {
  for (const id of ids) {
    try {
      effacerFichier(db, acteur, universId, id);
    } catch {
      // The row is gone already; a file left behind is an orphan of the library, which the GM can delete there.
    }
  }
}

/** « Arrêter le lot »: every line not `accepte` becomes `ecarte`, drafts deleted; a running call ends alone and is dropped. */
export function arreterLot(db: Db, acteur: Acteur, universId: number): LotVue | null {
  const { fichiers } = db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const lot = lotExigeOuvert(db, universId);
    const fichiers: number[] = [];
    const lignes = db.prepare("SELECT id, asset_id FROM bm_lots_lignes WHERE lot_id = ? AND etat <> 'accepte' AND etat <> 'ecarte'")
      .all(lot.id) as { id: number; asset_id: number | null }[];
    for (const l of lignes) {
      const f = retirerAsset(db, universId, l.asset_id);
      if (f !== null) fichiers.push(f);
      db.prepare("UPDATE bm_lots_lignes SET etat = 'ecarte', asset_id = NULL, code_echec = NULL WHERE id = ?").run(l.id);
    }
    db.prepare("UPDATE bm_lots SET etat = 'termine', modifie_le = ? WHERE id = ?").run(maintenant(), lot.id);
    return { fichiers };
  })();
  effacerFichiers(db, acteur, universId, fichiers);
  return null;
}

function retirerAsset(db: Db, universId: number, assetId: number | null): number | null {
  return assetId === null ? null : retirerLigneBrouillon(db, universId, assetId);
}

function ligneDe(db: Db, universId: number, ligneId: number): { ligne: LigneSql; lot: LotSql } {
  const ligne = db.prepare(`${SELECT_LIGNES} WHERE l.id = ?`).get(ligneId) as LigneSql | undefined;
  const lot = ligne ? db.prepare('SELECT id, univers_id, etat, cree_par, cree_le FROM bm_lots WHERE id = ?').get(ligne.lot_id) as LotSql : undefined;
  if (!ligne || !lot || lot.univers_id !== universId) throw introuvable();
  return { ligne, lot };
}

const etatLigneRefuse = () => conflit('Cette ligne a changé.', 'etat_ligne');

/** The batch closes the moment every line is `accepte` or `ecarte` (checked in each change's transaction). */
function fermerSiFini(db: Db, lotId: number): void {
  const reste = db.prepare("SELECT 1 AS ok FROM bm_lots_lignes WHERE lot_id = ? AND etat NOT IN ('accepte', 'ecarte') LIMIT 1").get(lotId);
  if (!reste) db.prepare("UPDATE bm_lots SET etat = 'termine', modifie_le = ? WHERE id = ? AND etat <> 'termine'").run(maintenant(), lotId);
}

function changerLigne(
  db: Db, acteur: Acteur, universId: number, ligneId: number, depuis: EtatLigne[],
  faire: (ligne: LigneSql, lot: LotSql) => number | null,
): LotVue | null {
  const { fichiers, vue } = db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const { ligne, lot } = ligneDe(db, universId, ligneId);
    if (!depuis.includes(ligne.etat)) throw etatLigneRefuse();
    const fichier = faire(ligne, lot);
    db.prepare('UPDATE bm_lots SET modifie_le = ? WHERE id = ?').run(maintenant(), lot.id);
    fermerSiFini(db, lot.id);
    const frais = db.prepare('SELECT id, univers_id, etat, cree_par, cree_le FROM bm_lots WHERE id = ?').get(lot.id) as LotSql;
    return { fichiers: fichier === null ? [] : [fichier], vue: frais.etat === 'termine' ? null : vueLot(db, frais) };
  })();
  effacerFichiers(db, acteur, universId, fichiers);
  return vue;
}

/**
 * « Accepter »: the draft becomes a valid asset and its file takes the library's visibility (`joueurs`) through
 * `modifierFichier`, in one transaction. `bibliotheque_pleine` at 5 000 valid assets.
 */
export function accepterLigne(db: Db, acteur: Acteur, universId: number, ligneId: number): LotVue | null {
  return changerLigne(db, acteur, universId, ligneId, ['brouillon'], (ligne) => {
    if (ligne.asset_id === null) throw etatLigneRefuse();
    const f = fichierDeAsset(db, universId, ligne.asset_id);
    if (!f) throw etatLigneRefuse();
    validerBrouillon(db, universId, ligne.asset_id);
    modifierFichier(db, acteur, universId, f.fichierId, { visibilite: 'joueurs' });
    db.prepare("UPDATE bm_lots_lignes SET etat = 'accepte' WHERE id = ?").run(ligne.id);
    return null;
  });
}

/** « Régénérer… »: keeps the remark, deletes the draft and its file, the line waits again. */
export function regenererLigne(db: Db, acteur: Acteur, universId: number, ligneId: number, remarque: unknown): LotVue | null {
  const r = remarque === undefined || remarque === null ? '' : remarque;
  if (typeof r !== 'string' || r.trim().length > MAX_REMARQUE) {
    exigerEcriture(db, acteur, universId);
    throw new ErreurService('invalide', `La remarque : ${MAX_REMARQUE} caractères au plus.`, 'remarque_invalide', 'remarque');
  }
  const vue = changerLigne(db, acteur, universId, ligneId, ['brouillon'], (ligne) => {
    const fichier = retirerAsset(db, universId, ligne.asset_id);
    db.prepare("UPDATE bm_lots_lignes SET etat = 'attente', remarque = ?, asset_id = NULL, code_echec = NULL WHERE id = ?")
      .run(r.trim(), ligne.id);
    return fichier;
  });
  declencher(db);
  return vue;
}

/** « Écarter »: the line leaves the batch, its draft is deleted. */
export function ecarterLigne(db: Db, acteur: Acteur, universId: number, ligneId: number): LotVue | null {
  return changerLigne(db, acteur, universId, ligneId, ['brouillon', 'echec', 'interrompu'], (ligne) => {
    const fichier = retirerAsset(db, universId, ligne.asset_id);
    db.prepare("UPDATE bm_lots_lignes SET etat = 'ecarte', asset_id = NULL, code_echec = NULL WHERE id = ?").run(ligne.id);
    return fichier;
  });
}

/** « Réessayer »: a failed or interrupted line waits again. */
export function reessayerLigne(db: Db, acteur: Acteur, universId: number, ligneId: number): LotVue | null {
  const vue = changerLigne(db, acteur, universId, ligneId, ['echec', 'interrompu'], (ligne) => {
    db.prepare("UPDATE bm_lots_lignes SET etat = 'attente', code_echec = NULL WHERE id = ?").run(ligne.id);
    return null;
  });
  declencher(db);
  return vue;
}

// ---- Restart -----------------------------------------------------------------------------------------------------------------
/**
 * At startup (AD-battlemap-generation-7): lines `attente` and `en_cours` of `en_cours` batches become `interrompu`; nothing
 * starts by itself. Returns the number of lines changed.
 */
export function interrompreLotsEnCours(db: Db): number {
  return db.prepare(
    `UPDATE bm_lots_lignes SET etat = 'interrompu' WHERE etat IN ('attente', 'en_cours')
     AND lot_id IN (SELECT id FROM bm_lots WHERE etat = 'en_cours')`,
  ).run().changes;
}

// ---- What the runner reads and writes (no right check: the batch was launched by a GM, who is read again here) ----------------
export interface LigneATraiter {
  id: number; universId: number; compteId: number; nom: string; categorie: Categorie; largeur: number | null; hauteur: number | null;
  indice: string; remarque: string;
}

/** Takes the next `attente` line (oldest open batch, then rank) and marks it `en_cours`. */
export function prendreLigneSuivante(db: Db): LigneATraiter | null {
  return db.transaction(() => {
    const l = db.prepare(
      `SELECT l.id, b.univers_id, b.cree_par, l.nom, l.categorie, l.largeur, l.hauteur, l.indice, l.remarque
       FROM bm_lots_lignes l JOIN bm_lots b ON b.id = l.lot_id
       WHERE l.etat = 'attente' AND b.etat = 'en_cours' ORDER BY b.id, l.rang LIMIT 1`,
    ).get() as { id: number; univers_id: number; cree_par: number; nom: string; categorie: Categorie; largeur: number | null; hauteur: number | null; indice: string; remarque: string } | undefined;
    if (!l) return null;
    db.prepare("UPDATE bm_lots_lignes SET etat = 'en_cours' WHERE id = ?").run(l.id);
    return { id: l.id, universId: l.univers_id, compteId: l.cree_par, nom: l.nom, categorie: l.categorie, largeur: l.largeur,
      hauteur: l.hauteur, indice: l.indice, remarque: l.remarque };
  })();
}

/** True while the line is still `en_cours` (a « Arrêter » since then drops the result). */
export function ligneToujoursEnCours(db: Db, ligneId: number): boolean {
  return db.prepare("SELECT 1 AS ok FROM bm_lots_lignes WHERE id = ? AND etat = 'en_cours'").get(ligneId) !== undefined;
}

/** Stores the failure of a line still `en_cours`. */
export function echouerLigne(db: Db, ligneId: number, code: CodeEchec): void {
  db.prepare("UPDATE bm_lots_lignes SET etat = 'echec', code_echec = ? WHERE id = ? AND etat = 'en_cours'").run(code, ligneId);
}

/** The line becomes `brouillon` with its asset; false (and nothing written) when it is no longer `en_cours`. */
export function poserBrouillonLigne(db: Db, ligneId: number, assetId: number): boolean {
  return db.prepare("UPDATE bm_lots_lignes SET etat = 'brouillon', asset_id = ?, code_echec = NULL WHERE id = ? AND etat = 'en_cours'")
    .run(assetId, ligneId).changes === 1;
}

/** The footprint of a line, made square when the transparency step could not do better (AD-battlemap-generation-4). */
export function carrerLigne(db: Db, ligneId: number): { largeur: number; hauteur: number } | null {
  const l = db.prepare('SELECT largeur, hauteur FROM bm_lots_lignes WHERE id = ?').get(ligneId) as { largeur: number | null; hauteur: number | null } | undefined;
  if (!l || l.largeur === null || l.hauteur === null) return null;
  const c = Math.max(l.largeur, l.hauteur);
  return { largeur: c, hauteur: c };
}
