import type { Db } from '../db/db.js';
import { attachmentsDir } from '../config/env.js';
import { exigerRole, vueMJ } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { ajouterFichier, effacerFichier, modifierFichier, type FluxEntrant } from './fichiers.js';
import { estImage } from './fichiers-lecture.js';
import type { Acteur } from './types.js';

/**
 * The asset library of the battle map (AD-150, AD-151): the only reader and writer of `bm_assets`. An asset is a file of the
 * media library plus a row; the bytes go through `ajouterFichier` only (AD-117) and the file's visibility is the asset's.
 */

export const CATEGORIES = ['objet', 'vaisseau', 'decor', 'sol', 'mur'] as const;
export type Categorie = (typeof CATEGORIES)[number];
export const MAX_ASSETS = 5000;
export const MAX_NOM_ASSET = 80;
export const MAX_EMPREINTE = 20;
export const MAX_TAGS = 10;
export const MAX_TAG = 30;

export interface AssetVue {
  id: number;
  fichierId: number;
  nom: string;
  categorie: Categorie;
  largeur: number | null;
  hauteur: number | null;
  vueDessus: boolean;
  tags: string[];
  etat: 'valide' | 'brouillon';
  /** Visibility of the backing file: `true` when the players read it. */
  visible: boolean;
  jeton: string;
  creeLe: string;
}

export interface SaisieAsset {
  nom?: string;
  categorie?: string;
  largeur?: number | null;
  hauteur?: number | null;
  vueDessus?: boolean;
  tags?: string[];
}

interface Ligne {
  id: number; fichier_id: number; nom: string; categorie: Categorie; largeur: number | null; hauteur: number | null;
  vue_dessus: number; tags: string; etat: 'valide' | 'brouillon'; cree_le: string; visibilite: string; disque: string;
}

const SELECT = `SELECT a.id, a.fichier_id, a.nom, a.categorie, a.largeur, a.hauteur, a.vue_dessus, a.tags, a.etat, a.cree_le,
  f.visibilite, f.disque FROM bm_assets a JOIN fichiers f ON f.id = a.fichier_id`;

const vue = (l: Ligne): AssetVue => ({
  id: l.id, fichierId: l.fichier_id, nom: l.nom, categorie: l.categorie, largeur: l.largeur, hauteur: l.hauteur,
  vueDessus: l.vue_dessus === 1, tags: JSON.parse(l.tags) as string[], etat: l.etat, visible: l.visibilite === 'joueurs',
  jeton: l.disque, creeLe: l.cree_le,
});

/**
 * Write rights of the library and the direction (AD-battlemap-assets-5): no role or a player → `introuvable` (the write
 * surface does not exist for her); a GM in Player mode → `refuse`.
 */
export function exigerEcriture(db: Db, acteur: Acteur, universId: number): void {
  if (exigerRole(db, universId, acteur.compteId) !== 'mj') throw introuvable();
  if (acteur.modeJoueur) throw refuse();
}

const erreur = (code: 'invalide' | 'conflit', message: string, detail: string) => new ErreurService(code, message, detail);

function nomValide(nom: unknown): string {
  const n = typeof nom === 'string' ? nom.trim() : '';
  if (n.length < 1 || n.length > MAX_NOM_ASSET) throw erreur('invalide', `Le nom : de 1 à ${MAX_NOM_ASSET} caractères.`, 'nom_invalide');
  return n;
}

function tagsValides(tags: unknown): string[] {
  if (!Array.isArray(tags)) throw erreur('invalide', 'Les étiquettes sont une liste.', 'tags_invalides');
  const propres: string[] = [];
  for (const t of tags) {
    const n = typeof t === 'string' ? t.trim() : '';
    if (n.length < 1 || n.length > MAX_TAG) throw erreur('invalide', `Une étiquette : de 1 à ${MAX_TAG} caractères.`, 'tags_invalides');
    if (!propres.some((p) => p.toLowerCase() === n.toLowerCase())) propres.push(n);
  }
  if (propres.length > MAX_TAGS) throw erreur('invalide', `${MAX_TAGS} étiquettes au plus.`, 'tags_invalides');
  return propres;
}

function empreinteValide(categorie: Categorie, largeur: unknown, hauteur: unknown): { largeur: number | null; hauteur: number | null } {
  if (categorie === 'sol' || categorie === 'mur') {
    if ((largeur ?? null) !== null || (hauteur ?? null) !== null) {
      throw erreur('invalide', 'Un sol ou un mur n’a pas d’empreinte.', 'empreinte_invalide');
    }
    return { largeur: null, hauteur: null };
  }
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_EMPREINTE;
  if (!ok(largeur) || !ok(hauteur)) {
    throw erreur('invalide', `L’empreinte : de 1 à ${MAX_EMPREINTE} cases.`, 'empreinte_invalide');
  }
  return { largeur, hauteur };
}

function categorieValide(c: unknown): Categorie {
  if (typeof c !== 'string' || !(CATEGORIES as readonly string[]).includes(c)) {
    throw erreur('invalide', 'La catégorie est inconnue.', 'categorie_invalide');
  }
  return c as Categorie;
}

function exigerPlace(db: Db, universId: number): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM bm_assets WHERE univers_id = ?').get(universId) as { n: number };
  if (n >= MAX_ASSETS) throw erreur('conflit', 'Bibliothèque pleine (5 000 assets).', 'bibliotheque_pleine');
}

const echapperLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface FiltresAssets {
  categorie?: string;
  /** Part of the name or of a label, without case. */
  q?: string;
  /** Every label given must be on the asset. */
  tags?: string[];
}

export interface ListeAssets {
  assets: AssetVue[];
  /** Per category, over the assets the caller reads and the search and labels, whatever the category filter; `total` is their sum. */
  comptes: Record<Categorie, number> & { total: number };
}

/**
 * The assets the caller reads. A player (and a GM in Player mode) gets valid assets whose file the players read, counts
 * included; the GM gets every one, drafts too.
 */
export function listerAssets(db: Db, acteur: Acteur, universId: number, filtres: FiltresAssets = {}): ListeAssets {
  const role = exigerRole(db, universId, acteur.compteId);
  const mj = vueMJ(role, acteur);
  if (filtres.categorie !== undefined) categorieValide(filtres.categorie);
  const where = ['a.univers_id = ?'];
  const params: (string | number)[] = [universId];
  if (!mj) where.push("a.etat = 'valide'", "f.visibilite = 'joueurs'");
  const q = filtres.q?.trim();
  if (q) {
    where.push(`(a.nom LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_each(a.tags) j WHERE j.value LIKE ? ESCAPE '\\'))`);
    params.push(`%${echapperLike(q)}%`, `%${echapperLike(q)}%`);
  }
  for (const t of filtres.tags ?? []) {
    where.push('EXISTS (SELECT 1 FROM json_each(a.tags) j WHERE lower(j.value) = lower(?))');
    params.push(t);
  }
  const comptes = { objet: 0, vaisseau: 0, decor: 0, sol: 0, mur: 0, total: 0 } as ListeAssets['comptes'];
  const lignes = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY a.id DESC`).all(...params) as Ligne[];
  for (const l of lignes) {
    comptes[l.categorie] += 1;
    comptes.total += 1;
  }
  const assets = lignes.filter((l) => filtres.categorie === undefined || l.categorie === filtres.categorie).map(vue);
  return { assets, comptes };
}

function lireAsset(db: Db, universId: number, id: number): Ligne {
  const l = db.prepare(`${SELECT} WHERE a.id = ? AND a.univers_id = ?`).get(id, universId) as Ligne | undefined;
  if (!l) throw introuvable();
  return l;
}

/** Name proposed for a file added as an asset: its own, extension off, cut to the limit. */
function nomDeFichier(nom: string): string {
  const sans = nom.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || nom.trim();
  return sans.slice(0, MAX_NOM_ASSET).trim() || 'Asset';
}

interface Preparation { nom: string | null; categorie: Categorie; largeur: number | null; hauteur: number | null; vueDessus: boolean; tags: string[] }

function preparer(saisie: SaisieAsset): Preparation {
  const categorie = categorieValide(saisie.categorie ?? 'objet');
  const sans = categorie === 'sol' || categorie === 'mur';
  const { largeur, hauteur } = empreinteValide(categorie, saisie.largeur ?? (sans ? null : 1), saisie.hauteur ?? (sans ? null : 1));
  return {
    nom: saisie.nom === undefined ? null : nomValide(saisie.nom),
    categorie, largeur, hauteur, vueDessus: saisie.vueDessus ?? true, tags: tagsValides(saisie.tags ?? []),
  };
}

function inserer(db: Db, universId: number, fichierId: number, nomParDefaut: string, p: Preparation): number {
  const info = db.prepare(
    `INSERT INTO bm_assets (univers_id, fichier_id, nom, categorie, largeur, hauteur, vue_dessus, tags, etat, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'valide', ?)`,
  ).run(universId, fichierId, p.nom ?? nomDeFichier(nomParDefaut), p.categorie, p.largeur, p.hauteur, p.vueDessus ? 1 : 0,
    JSON.stringify(p.tags), new Date().toISOString());
  return Number(info.lastInsertRowid);
}

/** Adds a file of the media library as an asset; the file keeps its visibility. One file backs one asset only. */
export function ajouterAssetDepuisFichier(db: Db, acteur: Acteur, universId: number, fichierId: number, saisie: SaisieAsset = {}): AssetVue {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const f = db.prepare('SELECT nom, type FROM fichiers WHERE id = ? AND univers_id = ?').get(fichierId, universId) as
      { nom: string; type: string } | undefined;
    if (!f) throw introuvable();
    const p = preparer(saisie);
    if (!estImage(f.type)) throw erreur('invalide', 'Ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).', 'pas_une_image');
    if (db.prepare('SELECT 1 AS ok FROM bm_assets WHERE fichier_id = ?').get(fichierId)) {
      throw erreur('conflit', 'Ce fichier est déjà un asset.', 'fichier_deja_asset');
    }
    exigerPlace(db, universId);
    return vue(lireAsset(db, universId, inserer(db, universId, fichierId, f.nom, p)));
  })();
}

/** Adds an uploaded image as an asset: the file is added visible to the players (origin `bibliotheque`, AD-battlemap-assets-2). */
export async function ajouterAsset(
  db: Db, acteur: Acteur, universId: number, flux: FluxEntrant, nomFichier: string, saisie: SaisieAsset = {},
  racine: string = attachmentsDir,
): Promise<AssetVue> {
  exigerEcriture(db, acteur, universId);
  const p = preparer(saisie);
  exigerPlace(db, universId);
  const fichier = await ajouterFichier(db, acteur, universId, flux, nomFichier, { ou: 'bibliotheque' }, racine);
  try {
    return db.transaction(() => {
      exigerPlace(db, universId);
      return vue(lireAsset(db, universId, inserer(db, universId, fichier.id, nomFichier, p)));
    })();
  } catch (e) {
    effacerFichier(db, acteur, universId, fichier.id, racine); // no row backs it: nothing leaks
    throw e;
  }
}

export interface ChangementAssets extends SaisieAsset {
  /** Visibility of the players: written on the file, `modifierFichier` being its only writer. */
  visible?: boolean;
}

/**
 * Changes a selection in one transaction: every asset or none. A footprint given for a `sol` or a `mur`, a name over 80
 * characters, an unknown id: the whole selection is refused. A moved category takes the footprint given, else 1×1 (or none).
 */
export function modifierAssets(db: Db, acteur: Acteur, universId: number, ids: number[], changement: ChangementAssets): AssetVue[] {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const uniques = [...new Set(ids)];
    if (uniques.length === 0) throw invalide('Aucun asset sélectionné.');
    const nom = changement.nom === undefined ? undefined : nomValide(changement.nom);
    const tags = changement.tags === undefined ? undefined : tagsValides(changement.tags);
    const categorie = changement.categorie === undefined ? undefined : categorieValide(changement.categorie);
    for (const id of uniques) {
      const l = lireAsset(db, universId, id);
      const cat = categorie ?? l.categorie;
      const sans = cat === 'sol' || cat === 'mur';
      const largeur = changement.largeur !== undefined ? changement.largeur : categorie ? (sans ? null : l.largeur ?? 1) : l.largeur;
      const hauteur = changement.hauteur !== undefined ? changement.hauteur : categorie ? (sans ? null : l.hauteur ?? 1) : l.hauteur;
      const e = empreinteValide(cat, largeur, hauteur);
      db.prepare('UPDATE bm_assets SET nom = ?, categorie = ?, largeur = ?, hauteur = ?, vue_dessus = ?, tags = ? WHERE id = ?')
        .run(nom ?? l.nom, cat, e.largeur, e.hauteur, (changement.vueDessus ?? l.vue_dessus === 1) ? 1 : 0,
          tags === undefined ? l.tags : JSON.stringify(tags), l.id);
      if (changement.visible !== undefined) {
        modifierFichier(db, acteur, universId, l.fichier_id, { visibilite: changement.visible ? 'joueurs' : 'mj' });
      }
    }
    return uniques.map((id) => vue(lireAsset(db, universId, id)));
  })();
}

/**
 * « Utilisé sur N cartes »: always 0 here, `bm_cartes` not existing yet (AD-battlemap-assets-3). The editor slice replaces this
 * body with the read of the map documents through the core. GM outside Player mode.
 */
export function compterUsage(db: Db, acteur: Acteur, universId: number, ids: number[]): number {
  exigerEcriture(db, acteur, universId);
  for (const id of new Set(ids)) lireAsset(db, universId, id);
  return 0;
}

/** Removes a selection of assets, all or none; the files stay in the media library (and keep their visibility). */
export function retirerAssets(db: Db, acteur: Acteur, universId: number, ids: number[]): number {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const uniques = [...new Set(ids)];
    if (uniques.length === 0) throw invalide('Aucun asset sélectionné.');
    for (const id of uniques) lireAsset(db, universId, id);
    const del = db.prepare('DELETE FROM bm_assets WHERE id = ?');
    for (const id of uniques) del.run(id);
    return uniques.length;
  })();
}
