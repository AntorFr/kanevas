import type { Db } from '../db/db.js';
import { attachmentsDir } from '../config/env.js';
import { exigerRole, vueMJ } from './droits.js';
import { ErreurService, introuvable } from './erreurs.js';
import { exigerEcriture } from './battlemap-assets.js';
import { ajouterFichier, effacerFichier, modifierFichier, type FluxEntrant } from './fichiers.js';
import { estImage } from './fichiers-lecture.js';
import type { Acteur } from './types.js';

/** The art direction of the battle map (AD-152): one text and up to 8 reference images, GM only. Only reader/writer of `bm_direction*`. */

export const MAX_TEXTE_DIRECTION = 5000;
export const MAX_REFERENCES = 8;
export const MAX_LEGENDE = 200;

export interface ReferenceVue { fichierId: number; nom: string; legende: string; rang: number; jeton: string }
export interface DirectionVue {
  texte: string;
  /** The text before the last change, for « Annuler » (AD-76); null before any change. */
  textePrecedent: string | null;
  /** 0 while nothing was ever written. */
  version: number;
  modifieLe: string | null;
  images: ReferenceVue[];
}

/** Readable by the GM outside Player mode only: anyone else, a GM in Player mode included, gets `introuvable`. */
function exigerLecture(db: Db, acteur: Acteur, universId: number): void {
  const role = exigerRole(db, universId, acteur.compteId);
  if (!vueMJ(role, acteur)) throw introuvable();
}

function lire(db: Db, universId: number): DirectionVue {
  const d = db.prepare('SELECT texte, texte_precedent, version, modifie_le FROM bm_direction WHERE univers_id = ?').get(universId) as
    { texte: string; texte_precedent: string | null; version: number; modifie_le: string } | undefined;
  const images = (db.prepare(
    `SELECT i.fichier_id, f.nom, i.legende, i.rang, f.disque FROM bm_direction_images i JOIN fichiers f ON f.id = i.fichier_id
     WHERE i.univers_id = ? ORDER BY i.rang`,
  ).all(universId) as { fichier_id: number; nom: string; legende: string; rang: number; disque: string }[])
    .map((r) => ({ fichierId: r.fichier_id, nom: r.nom, legende: r.legende, rang: r.rang, jeton: r.disque }));
  return { texte: d?.texte ?? '', textePrecedent: d?.texte_precedent ?? null, version: d?.version ?? 0, modifieLe: d?.modifie_le ?? null, images };
}

export function lireDirection(db: Db, acteur: Acteur, universId: number): DirectionVue {
  exigerLecture(db, acteur, universId);
  return lire(db, universId);
}

/**
 * Writes the text if `version` is the current one (0 before any write). The previous text is kept when the text changes.
 * A stale version is `conflit` (`direction_modifiee`); over 5 000 characters is `invalide` (`texte_trop_long`).
 */
export function ecrireDirection(db: Db, acteur: Acteur, universId: number, texte: unknown, version: unknown): DirectionVue {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    if (typeof texte !== 'string') throw new ErreurService('invalide', 'Le texte est invalide.', 'texte_invalide');
    if (texte.length > MAX_TEXTE_DIRECTION) {
      throw new ErreurService('invalide', `Le style : ${MAX_TEXTE_DIRECTION} caractères au plus.`, 'texte_trop_long');
    }
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      throw new ErreurService('invalide', 'La version est invalide.', 'version_invalide');
    }
    const maintenant = lire(db, universId);
    if (version !== maintenant.version) {
      throw new ErreurService('conflit', 'Ce texte a changé depuis que vous l’avez ouvert.', 'direction_modifiee');
    }
    const quand = new Date().toISOString();
    if (maintenant.version === 0) {
      db.prepare('INSERT INTO bm_direction (univers_id, texte, texte_precedent, version, modifie_le) VALUES (?, ?, NULL, 1, ?)')
        .run(universId, texte, quand);
    } else {
      const precedent = texte === maintenant.texte ? maintenant.textePrecedent : maintenant.texte;
      db.prepare('UPDATE bm_direction SET texte = ?, texte_precedent = ?, version = version + 1, modifie_le = ? WHERE univers_id = ?')
        .run(texte, precedent, quand, universId);
    }
    return lire(db, universId);
  })();
}

function exigerPlace(db: Db, universId: number): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM bm_direction_images WHERE univers_id = ?').get(universId) as { n: number };
  if (n >= MAX_REFERENCES) throw new ErreurService('conflit', `${MAX_REFERENCES} images au plus.`, 'limite_references');
}

function inserer(db: Db, universId: number, fichierId: number): void {
  const { m } = db.prepare('SELECT COALESCE(MAX(rang), 0) AS m FROM bm_direction_images WHERE univers_id = ?').get(universId) as { m: number };
  db.prepare("INSERT INTO bm_direction_images (univers_id, fichier_id, legende, rang) VALUES (?, ?, '', ?)").run(universId, fichierId, m + 1);
}

function legendeValide(legende: unknown): string {
  if (typeof legende !== 'string' || legende.trim().length > MAX_LEGENDE) {
    throw new ErreurService('invalide', `La légende : ${MAX_LEGENDE} caractères au plus.`, 'legende_invalide');
  }
  return legende.trim();
}

/** Adds an uploaded image as a reference: the file is created GM-only (origin `direction`). */
export async function ajouterReference(
  db: Db, acteur: Acteur, universId: number, flux: FluxEntrant, nomFichier: string, racine: string = attachmentsDir,
): Promise<DirectionVue> {
  exigerEcriture(db, acteur, universId);
  exigerPlace(db, universId);
  const f = await ajouterFichier(db, acteur, universId, flux, nomFichier, { ou: 'direction' }, racine);
  try {
    return db.transaction(() => {
      exigerPlace(db, universId);
      inserer(db, universId, f.id);
      return lire(db, universId);
    })();
  } catch (e) {
    effacerFichier(db, acteur, universId, f.id, racine);
    throw e;
  }
}

/** Adds an image of the media library as a reference: the file becomes GM-only (`modifierFichier`). */
export function ajouterReferenceDepuisFichier(db: Db, acteur: Acteur, universId: number, fichierId: number): DirectionVue {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const f = db.prepare('SELECT type FROM fichiers WHERE id = ? AND univers_id = ?').get(fichierId, universId) as { type: string } | undefined;
    if (!f) throw introuvable();
    if (!estImage(f.type)) throw new ErreurService('invalide', 'Ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).', 'pas_une_image');
    if (db.prepare('SELECT 1 AS ok FROM bm_direction_images WHERE univers_id = ? AND fichier_id = ?').get(universId, fichierId)) {
      throw new ErreurService('conflit', 'Cette image est déjà une référence.', 'reference_existante');
    }
    exigerPlace(db, universId);
    if (db.prepare('SELECT 1 AS ok FROM bm_assets WHERE fichier_id = ?').get(fichierId)) {
      // Turning it GM-only would hide an asset the players read: refuse rather than do it silently.
      throw new ErreurService('conflit', 'Ce fichier est utilisé par la bibliothèque d’assets.', 'fichier_bibliotheque');
    }
    modifierFichier(db, acteur, universId, fichierId, { visibilite: 'mj' });
    inserer(db, universId, fichierId);
    return lire(db, universId);
  })();
}

/** Removes a reference; the file stays in the media library. */
export function retirerReference(db: Db, acteur: Acteur, universId: number, fichierId: number): DirectionVue {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const r = db.prepare('DELETE FROM bm_direction_images WHERE univers_id = ? AND fichier_id = ?').run(universId, fichierId);
    if (r.changes === 0) throw introuvable();
    const restantes = db.prepare('SELECT fichier_id FROM bm_direction_images WHERE univers_id = ? ORDER BY rang').all(universId) as { fichier_id: number }[];
    restantes.forEach((x, i) => db.prepare('UPDATE bm_direction_images SET rang = ? WHERE univers_id = ? AND fichier_id = ?').run(i + 1, universId, x.fichier_id));
    return lire(db, universId);
  })();
}

export function legenderReference(db: Db, acteur: Acteur, universId: number, fichierId: number, legende: unknown): DirectionVue {
  return db.transaction(() => {
    exigerEcriture(db, acteur, universId);
    const l = legendeValide(legende);
    const r = db.prepare('UPDATE bm_direction_images SET legende = ? WHERE univers_id = ? AND fichier_id = ?').run(l, universId, fichierId);
    if (r.changes === 0) throw introuvable();
    return lire(db, universId);
  })();
}
