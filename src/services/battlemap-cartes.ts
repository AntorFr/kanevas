import type { Db } from '../db/db.js';
import type { CarteOutil, LigneDonnees } from '../outils/declaration.js';
import * as coeur from '../outils/battlemap/coeur.js';
import { annoncer } from './battlemap-flux.js';
import { etatAssets } from './battlemap-donnees.js';
import { roleDe, sqlFicheLisible, vueMJ } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { resoudreOutil } from './outils.js';
import { effacerTables, redimensionnerTable } from './battlemap-tables.js';
import type { Acteur, Role } from './types.js';

/**
 * The composed maps of the battle map (AD-154, AD-155, AD-156): the only reader and writer of `bm_cartes`. The document is
 * the core's JSON; every rule (limits, positions, filter, usage count) is the core's, called through `coeur.ts` — nothing
 * here decides what a command may do. The core's filter context (GM-only assets, removed assets, readable sheets) is built
 * here from the database, never given by a caller (AD-battlemap-editeur-5).
 */

export const OUTIL_CARTES = 'battlemap/cartes';
export const LARGEUR_DEFAUT = 30;
export const HAUTEUR_DEFAUT = 20;
export const TAILLE_CASE_DEFAUT = 70;
export const TAILLE_CASE_MIN = 20;
export const TAILLE_CASE_MAX = 300;
export const MAX_TITRE_CARTE = 80;
/** Commands per batch: a request is bounded before the core sees it. */
export const MAX_COMMANDES = 5000;

export interface Ligne {
  id: number; univers_id: number; titre: string; visible: number; largeur: number; hauteur: number;
  taille_case: number; document: string; version: number; cree_le: string; modifie_le: string;
}

export interface CarteVue {
  id: number;
  titre: string;
  /** Visibility to players; carried for the GM only. */
  visible?: boolean;
  largeur: number;
  hauteur: number;
  tailleCase: number;
  /** The core's document, filtered for everyone but a GM outside Player mode. */
  document: unknown;
  version: number;
  peutEcrire: boolean;
}

export const invalideChamp = (champ: string, message: string, detail?: string) => new ErreurService('invalide', message, detail ?? champ, champ);
export const PERIMEE = () => new ErreurService('conflit', 'Cette carte a changé depuis que vous l’avez ouverte.', 'version');
export const maintenant = () => new Date().toISOString();

export function ligne(db: Db, universId: number, id: number): Ligne | undefined {
  if (!Number.isSafeInteger(id)) return undefined;
  return db.prepare('SELECT * FROM bm_cartes WHERE id = ? AND univers_id = ?').get(id, universId) as Ligne | undefined;
}

/**
 * Write rights (AD-battlemap-editeur-2): no role or a player → `introuvable` (the write surface does not exist for her);
 * a GM in Player mode → `refuse`; then the map must exist in this universe.
 */
export function exigerEcriture(db: Db, acteur: Acteur, universId: number, id: number): Ligne {
  const role = roleDe(db, universId, acteur.compteId);
  if (role !== 'mj') throw introuvable();
  if (acteur.modeJoueur) throw refuse('Passez en mode MJ pour faire cela.');
  const l = ligne(db, universId, id);
  if (!l) throw introuvable();
  return l;
}

/** The refusals of the core, as the interface's codes (`detail` is the code the route sends). */
export function refusDuCoeur(r: coeur.RefusCoeur): ErreurService {
  if (r.code === 'carte_pleine') return new ErreurService('conflit', 'La carte est pleine.', 'carte_pleine');
  if (r.code === 'limite_depassee') {
    return new ErreurService('invalide', 'Cette taille laisse des éléments hors de la carte, ou dépasse 200 cases.', 'limite_depassee', r.champ ?? 'taille');
  }
  return new ErreurService('invalide', 'Commande refusée.', r.code, r.champ);
}

export interface Document {
  sols?: { asset_id: string }[]; murs?: { asset_id: string }[]; elements?: { asset_id: string; fiche_id?: string }[];
}
export const assetsDe = (d: Document): Set<string> =>
  new Set([...(d.sols ?? []), ...(d.murs ?? []), ...(d.elements ?? [])].map((x) => x.asset_id));
export const fichesDe = (d: Document): Set<string> =>
  new Set((d.elements ?? []).flatMap((e) => (typeof e.fiche_id === 'string' ? [e.fiche_id] : [])));

/** The sheets of `ids` the actor reads in this universe (AD-64): the GM outside Player mode reads every one. */
export function fichesLisibles(db: Db, role: Role, acteur: Acteur, universId: number, ids: Iterable<string>): Set<string> {
  const cond = sqlFicheLisible(role, acteur, 'f');
  const lire = db.prepare(`SELECT 1 AS ok FROM fiches f WHERE f.id = ? AND f.univers_id = ?${cond ? ` AND ${cond.sql}` : ''}`);
  const lisibles = new Set<string>();
  for (const id of new Set(ids)) {
    if (/^[1-9][0-9]{0,15}$/.test(id) && lire.get(Number(id), universId, ...(cond?.params ?? []))) lisibles.add(id);
  }
  return lisibles;
}

/** The filter's context, built from the database for the reader (never given by the caller). */
export function contexteFiltre(db: Db, role: Role, acteur: Acteur, universId: number, d: Document): coeur.ContexteFiltre {
  const ids = assetsDe(d);
  const { connus, mjSeul } = etatAssets(db, universId, ids);
  return {
    assets_mj_seul: [...mjSeul],
    assets_retires: [...ids].filter((i) => !connus.has(i)),
    fiches_lisibles: [...fichesLisibles(db, role, acteur, universId, fichesDe(d))],
  };
}

function vue(l: Ligne, document: string, mj: boolean): CarteVue {
  const v: CarteVue = {
    id: l.id, titre: l.titre, largeur: l.largeur, hauteur: l.hauteur, tailleCase: l.taille_case,
    document: JSON.parse(document), version: l.version, peutEcrire: mj,
  };
  if (mj) v.visible = l.visible === 1;
  return v;
}

/**
 * The only read of a map (AD-156): a role is required; an unknown id and a hidden map for a non-GM are the same
 * `introuvable`; a GM in Player mode on a hidden map gets `refuse` (`mode_joueur`). Everyone but a GM outside Player
 * mode reads the document filtered by the core.
 */
export function lireCarte(db: Db, acteur: Acteur, universId: number, id: number): CarteVue {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) throw introuvable();
  const l = ligne(db, universId, id);
  if (!l) throw introuvable();
  const mj = vueMJ(role, acteur);
  if (l.visible !== 1 && !mj) {
    if (role === 'mj') throw new ErreurService('refuse', 'Les joueurs ne voient pas cette carte : elle n’est pas visible.', 'mode_joueur');
    throw introuvable();
  }
  if (mj) return vue(l, l.document, true);
  const doc = JSON.parse(l.document) as Document;
  return vue(l, coeur.filtrerPourJoueur(l.document, contexteFiltre(db, role, acteur, universId, doc)), false);
}

function titreValide(titre: unknown): string {
  const t = typeof titre === 'string' ? titre.trim() : '';
  if (t.length < 1 || t.length > MAX_TITRE_CARTE) throw invalideChamp('titre', `Le titre : de 1 à ${MAX_TITRE_CARTE} caractères.`);
  return t;
}

function tailleCaseValide(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < TAILLE_CASE_MIN || (v as number) > TAILLE_CASE_MAX) {
    throw invalideChamp('taille_case', `La taille de case : de ${TAILLE_CASE_MIN} à ${TAILLE_CASE_MAX} pixels.`);
  }
  return v as number;
}

function tailleValide(v: unknown, defaut: number): number {
  if (v === undefined || v === null) return defaut;
  if (!Number.isInteger(v)) throw invalideChamp('taille', 'La taille est un nombre entier de cases.', 'taille_invalide');
  return v as number;
}

/** The registry setting « taille de case par défaut », read at creation only (a map keeps the size it was given). */
function tailleCaseDuReglage(db: Db, universId: number): number {
  try {
    const v = resoudreOutil(db, universId, OUTIL_CARTES).reglages.tailleCase?.valeur;
    return Number.isInteger(v) && (v as number) >= TAILLE_CASE_MIN && (v as number) <= TAILLE_CASE_MAX ? v as number : TAILLE_CASE_DEFAUT;
  } catch (e) {
    if (e instanceof ErreurService) return TAILLE_CASE_DEFAUT;
    throw e;
  }
}

/** Creates a map: its document is the core's empty one (`carte_vide`), the size defaults to 30 × 20. GM outside Player mode. */
export function creerCarte(db: Db, acteur: Acteur, universId: number,
  saisie: { titre: unknown; largeur?: unknown; hauteur?: unknown; tailleCase?: unknown }): { id: number } {
  return db.transaction(() => {
    if (roleDe(db, universId, acteur.compteId) !== 'mj') throw introuvable();
    if (acteur.modeJoueur) throw refuse('Passez en mode MJ pour faire cela.');
    const titre = titreValide(saisie.titre);
    const largeur = tailleValide(saisie.largeur, LARGEUR_DEFAUT);
    const hauteur = tailleValide(saisie.hauteur, HAUTEUR_DEFAUT);
    const tailleCase = saisie.tailleCase === undefined ? tailleCaseDuReglage(db, universId) : tailleCaseValide(saisie.tailleCase);
    let document: string;
    try {
      document = coeur.carteVide(largeur, hauteur);
    } catch {
      throw refusDuCoeur({ ok: false, code: 'limite_depassee', champ: 'taille' });
    }
    const now = maintenant();
    const id = Number(db.prepare(
      `INSERT INTO bm_cartes (univers_id, titre, visible, largeur, hauteur, taille_case, document, version, cree_le, modifie_le)
       VALUES (?, ?, 0, ?, ?, ?, ?, 1, ?, ?)`).run(universId, titre, largeur, hauteur, tailleCase, document, now, now).lastInsertRowid);
    return { id };
  })();
}

/** Strings found under `asset_id` / `fiche_id` of the commands that place or link something. */
function referencesDuLot(commandes: unknown[]): { assets: Set<string>; fiches: Set<string> } {
  const assets = new Set<string>();
  const fiches = new Set<string>();
  for (const c of commandes) {
    if (typeof c !== 'object' || c === null) continue;
    const o = c as { type?: unknown; asset_id?: unknown; fiche_id?: unknown };
    if (typeof o.type !== 'string') continue;
    if (['peindre_sol', 'tracer_mur', 'poser_element'].includes(o.type) && o.asset_id !== undefined) assets.add(String(o.asset_id));
    if (['poser_element', 'lier_fiche'].includes(o.type) && o.fiche_id !== undefined && o.fiche_id !== null) fiches.add(String(o.fiche_id));
  }
  return { assets, fiches };
}

/**
 * An id the document already carries stays acceptable (an undo puts back an element whose asset was removed since, rule 4);
 * any other must be an asset of the universe, a sheet of the universe the actor reads.
 */
function verifierReferences(db: Db, acteur: Acteur, universId: number, doc: Document, commandes: unknown[]): void {
  const { assets, fiches } = referencesDuLot(commandes);
  const dejaA = assetsDe(doc);
  const nouveaux = [...assets].filter((a) => !dejaA.has(a));
  if (nouveaux.length > 0 && nouveaux.some((a) => !etatAssets(db, universId, [a]).connus.has(a))) {
    throw new ErreurService('invalide', 'Cet asset n’existe pas dans la bibliothèque.', 'asset_inconnu', 'asset_id');
  }
  const dejaF = fichesDe(doc);
  const autres = [...fiches].filter((f) => !dejaF.has(f));
  if (autres.length > 0) {
    const lisibles = fichesLisibles(db, 'mj', acteur, universId, autres);
    if (autres.some((f) => !lisibles.has(f))) {
      throw new ErreurService('invalide', 'Cette fiche n’existe pas dans cet univers.', 'fiche_inconnue', 'fiche_id');
    }
  }
}

/**
 * A batch of the core's commands, applied whole or refused whole, at the version the writer read. A stale version is
 * `conflit` (`detail: 'version'`); the core's limits are `carte_pleine` (conflit) and `limite_depassee` (invalide); a foreign
 * `asset_id` / `fiche_id` is `asset_inconnu` / `fiche_inconnue`. Returns the new version and the inverse commands.
 */
export function appliquerCommandes(db: Db, acteur: Acteur, universId: number, id: number,
  version: unknown, commandes: unknown): { version: number; inverses: unknown[] } {
  const res = db.transaction(() => {
    const l = exigerEcriture(db, acteur, universId, id);
    if (!Number.isInteger(version) || (version as number) < 1) throw invalideChamp('version', 'Version invalide.');
    if (!Array.isArray(commandes) || commandes.length === 0 || commandes.length > MAX_COMMANDES) {
      throw invalideChamp('commandes', `Un lot compte de 1 à ${MAX_COMMANDES} commandes.`);
    }
    if (version !== l.version) throw PERIMEE();
    verifierReferences(db, acteur, universId, JSON.parse(l.document) as Document, commandes);
    const r = coeur.appliquerLot(l.document, commandes);
    if (!r.ok) throw refusDuCoeur(r);
    return { version: ecrireDocument(db, l, r.document), inverses: r.inverses };
  })();
  annoncer(db, id);
  return res;
}

/** Stores a document the core produced; the size columns follow it. */
function ecrireDocument(db: Db, l: Ligne, document: string, extra: { sql: string; params: unknown[] } = { sql: '', params: [] }): number {
  const d = JSON.parse(document) as { largeur: number; hauteur: number };
  const version = l.version + 1;
  db.prepare(`UPDATE bm_cartes SET document = ?, largeur = ?, hauteur = ?, version = ?, modifie_le = ?${extra.sql} WHERE id = ?`)
    .run(document, d.largeur, d.hauteur, version, maintenant(), ...extra.params, l.id);
  return version;
}

export interface ReglagesCarte {
  titre?: unknown; visible?: unknown; tailleCase?: unknown; largeur?: unknown; hauteur?: unknown;
}

/**
 * Title, visibility to players, cell size and size, one transaction, one version step. The size goes through the core's
 * `redimensionner` command, so a resize that leaves elements out is `limite_depassee` and changes nothing.
 */
export function reglerCarte(db: Db, acteur: Acteur, universId: number, id: number,
  version: unknown, reglages: ReglagesCarte): { version: number } {
  const res = db.transaction(() => {
    const l = exigerEcriture(db, acteur, universId, id);
    if (!Number.isInteger(version) || (version as number) < 1) throw invalideChamp('version', 'Version invalide.');
    if (version !== l.version) throw PERIMEE();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (reglages.titre !== undefined) { sets.push('titre = ?'); params.push(titreValide(reglages.titre)); }
    if (reglages.visible !== undefined) {
      if (typeof reglages.visible !== 'boolean') throw invalideChamp('visible', 'Visibilité invalide.');
      sets.push('visible = ?'); params.push(reglages.visible ? 1 : 0);
    }
    if (reglages.tailleCase !== undefined) { sets.push('taille_case = ?'); params.push(tailleCaseValide(reglages.tailleCase)); }
    let document = l.document;
    if (reglages.largeur !== undefined || reglages.hauteur !== undefined) {
      const largeur = tailleValide(reglages.largeur, l.largeur);
      const hauteur = tailleValide(reglages.hauteur, l.hauteur);
      if (largeur !== l.largeur || hauteur !== l.hauteur) {
        const r = coeur.appliquerLot(l.document, [{ type: 'redimensionner', largeur, hauteur }]);
        if (!r.ok) throw refusDuCoeur(r);
        document = r.document;
        // A played map: the table follows the new size in the same transaction, or refuses the whole change (AD-battlemap-table-7).
        redimensionnerTable(db, l, largeur, hauteur);
      }
    }
    if (sets.length === 0 && document === l.document) throw invalideChamp('reglages', 'Rien à changer.');
    return { version: ecrireDocument(db, l, document, { sql: sets.map((s) => `, ${s}`).join(''), params }) };
  })();
  annoncer(db, id);
  return res;
}

export const rendreVisibleCarte = (db: Db, acteur: Acteur, universId: number, id: number, visible: boolean, version: number): { version: number } =>
  reglerCarte(db, acteur, universId, id, version, { visible });

/** Deletes a map; its table and the owners of its tokens go with it by `ON DELETE CASCADE`. */
export function supprimerCarte(db: Db, acteur: Acteur, universId: number, id: number): void {
  db.transaction(() => {
    const l = exigerEcriture(db, acteur, universId, id);
    db.prepare('DELETE FROM bm_cartes WHERE id = ?').run(l.id);
  })();
  annoncer(db, id);
}

/** The composed maps for E-10: the editor's address only for a GM outside Player mode; a player gets the visible ones. */
export function cartesComposees(db: Db, acteur: Acteur, universId: number): CarteOutil[] {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) return [];
  const mj = vueMJ(role, acteur);
  const lignes = db.prepare('SELECT id, titre, visible, largeur, hauteur, version FROM bm_cartes WHERE univers_id = ? ORDER BY titre COLLATE NOCASE, id')
    .all(universId) as Pick<Ligne, 'id' | 'titre' | 'visible' | 'largeur' | 'hauteur' | 'version'>[];
  return lignes.filter((l) => mj || l.visible === 1).map((l) => ({
    id: l.id, titre: l.titre, visible: l.visible === 1, version: l.version, largeur: l.largeur, hauteur: l.hauteur,
    ...(mj ? { adresse: `/univers/${universId}/outils/battlemap/cartes/${l.id}` } : {}),
  }));
}

/**
 * « Utilisé sur N cartes »: the maps of the universe whose document uses at least one of the assets, read through the core's
 * `compterUsages`; a map counts once, an asset removed from the library included (its references stay, rule 4).
 */
export function cartesUtilisant(db: Db, universId: number, assetIds: Iterable<number | string>): number {
  const ids = [...new Set([...assetIds].map(String))];
  if (ids.length === 0) return 0;
  const documents = db.prepare('SELECT document FROM bm_cartes WHERE univers_id = ?').all(universId) as { document: string }[];
  return documents.filter((d) => ids.some((a) => coeur.compterUsages(d.document, a) > 0)).length;
}

/** What `compter` / `effacer` of the module see of the maps (D-1): the rows of the universe only. */
export function compterCartes(db: Db, universId: number): LigneDonnees[] {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM bm_cartes WHERE univers_id = ?').get(universId) as { n: number };
  return [{ cle: 'cartes', singulier: 'carte composée', pluriel: 'cartes composées', nombre: n }];
}

export function effacerCartes(db: Db, universId: number): void {
  const ids = (db.prepare('SELECT id FROM bm_cartes WHERE univers_id = ?').all(universId) as { id: number }[]).map((r) => r.id);
  effacerTables(db, universId);
  db.prepare('DELETE FROM bm_cartes WHERE univers_id = ?').run(universId);
  for (const id of ids) annoncer(db, id);
}

/** The maps of the universes of a system where the tool is on: they stay when the system's data go (D-2). */
export function utilisationsCartes(db: Db, systemeId: number): LigneDonnees[] {
  const univers = db.prepare('SELECT id FROM univers WHERE systeme_id = ?').all(systemeId) as { id: number }[];
  const nombre = univers.filter((u) => resoudreOutil(db, u.id, OUTIL_CARTES).active)
    .reduce((n, u) => n + compterCartes(db, u.id)[0]!.nombre, 0);
  return [{ cle: 'cartes', singulier: 'carte composée', pluriel: 'cartes composées', nombre }];
}
