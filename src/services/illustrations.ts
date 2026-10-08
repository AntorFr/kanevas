import type { Readable } from 'node:stream';

import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { exigerRole, peutVoirFiche } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import { chargerFiche } from './fiches.js';
import { typeParSignature } from './pieces-jointes.js';
import { abandonner, ecrireFlux, lireFichier, promouvoir, supprimerFichier } from './stockage.js';
import type { Acteur, IllustrationVue } from './types.js';

interface IllustrationRow {
  illustration_fichier: string | null;
  illustration_type: string | null;
  illustration_taille: number | null;
}

const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Read rights of the illustration are the sheet's own (AD-93): real rights,
 * never the player mode. No role or invisible sheet → not found, like an unknown id.
 */
function contexte(db: Db, compteId: number, universId: number, ficheId: number) {
  const role = exigerRole(db, universId, compteId);
  const fiche = chargerFiche(db, universId, ficheId);
  if (!peutVoirFiche(db, role, ficheId, { compteId })) throw introuvable();
  return { role, fiche: fiche as unknown as IllustrationRow };
}

/** The GM of the sheet's universe; a reader who is not GM is refused (403). */
function exigerEcriture(db: Db, compteId: number, universId: number, ficheId: number): IllustrationRow {
  const { role, fiche } = contexte(db, compteId, universId, ficheId);
  if (role !== 'mj') throw refuse("Seul le MJ peut changer l'illustration.");
  return fiche;
}

/**
 * Sets or replaces the illustration (AD-93). The right is checked before the
 * stream is read and again inside the transaction that writes; the replaced
 * file is deleted after the commit. A refusal leaves no column, no file.
 */
export async function poserIllustration(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  flux: Readable | AsyncIterable<Buffer | Uint8Array>,
  racine: string = attachmentsDir,
): Promise<{ jeton: string; type: string; taille: number }> {
  exigerEcriture(db, compteId, universId, ficheId);
  const ecrit = await ecrireFlux(flux, racine);
  let fichier: string | null = null;
  try {
    if (ecrit.taille === 0) {
      throw new ErreurService('invalide', 'Le fichier est vide.', 'fichier_vide');
    }
    const type = typeParSignature(ecrit.debut);
    if (!TYPES_IMAGE.includes(type)) {
      throw new ErreurService(
        'invalide',
        'Ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).',
        'pas_une_image',
      );
    }
    const ancien = db.transaction(() => {
      const avant = exigerEcriture(db, compteId, universId, ficheId);
      fichier = promouvoir(ecrit.temporaire, racine);
      db.prepare(
        `UPDATE fiches SET illustration_fichier = ?, illustration_type = ?, illustration_taille = ?
         WHERE id = ?`,
      ).run(fichier, type, ecrit.taille, ficheId);
      return avant.illustration_fichier;
    })();
    if (ancien) supprimerFichier(ancien, racine);
    return { jeton: fichier!, type, taille: ecrit.taille };
  } catch (e) {
    await abandonner(ecrit.temporaire, racine);
    if (fichier) supprimerFichier(fichier, racine);
    throw e;
  }
}

/** Removes the illustration (a no-op when there is none), then its file. */
export function retirerIllustration(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  racine: string = attachmentsDir,
): void {
  const ancien = db.transaction(() => {
    const avant = exigerEcriture(db, compteId, universId, ficheId);
    db.prepare(
      `UPDATE fiches SET illustration_fichier = NULL, illustration_type = NULL, illustration_taille = NULL
       WHERE id = ?`,
    ).run(ficheId);
    return avant.illustration_fichier;
  })();
  if (ancien) supprimerFichier(ancien, racine);
}

/**
 * Opens the illustration for whoever sees the sheet. `courant` tells the route
 * whether the `?v=` token it received is the current one (long cache).
 */
export async function ouvrirIllustration(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  jeton: string | undefined,
  racine: string = attachmentsDir,
): Promise<{ flux: Readable; type: string; taille: number; courant: boolean }> {
  const { fiche } = contexte(db, acteur.compteId, universId, ficheId);
  if (!fiche.illustration_fichier) throw introuvable();
  const f = await lireFichier(fiche.illustration_fichier, racine);
  if (!f) throw introuvable();
  return {
    flux: f.flux,
    type: fiche.illustration_type!,
    taille: f.taille,
    courant: jeton === fiche.illustration_fichier,
  };
}

