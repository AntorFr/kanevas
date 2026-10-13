import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { attachmentsDir } from '../config/env.js';

/**
 * Byte storage on the volume (AD-7, AD-65). No notion of section: attachments
 * and map backgrounds both use it. A file is written under `<racine>/tmp/` then
 * moved in one step to `<racine>/<uuid>`.
 */

const NOM_FICHIER = /^[0-9a-f-]{36}$/;

export interface Ecrit {
  /** Name of the file in `tmp/` (not yet final). */
  temporaire: string;
  taille: number;
  /** The first bytes (up to 16), for the caller to sniff the real type. */
  debut: Buffer;
}

/** Writes a stream to `tmp/`. On any failure (interrupted stream) leaves nothing behind. */
export async function ecrireFlux(
  flux: Readable | AsyncIterable<Buffer | Uint8Array>,
  racine: string = attachmentsDir,
): Promise<Ecrit> {
  const tmp = join(racine, 'tmp');
  await mkdir(tmp, { recursive: true });
  const temporaire = randomUUID();
  const chemin = join(tmp, temporaire);
  let taille = 0;
  const debut: Buffer[] = [];
  let gardes = 0;
  const compteur = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      taille += chunk.length;
      if (gardes < 16) {
        const part = chunk.subarray(0, 16 - gardes);
        debut.push(part);
        gardes += part.length;
      }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(flux, compteur, createWriteStream(chemin, { flags: 'wx' }));
  } catch (e) {
    await rm(chemin, { force: true });
    throw e;
  }
  return { temporaire, taille, debut: Buffer.concat(debut) };
}

/** Drops a temporary file (a refused upload). Never throws. */
export async function abandonner(temporaire: string, racine: string = attachmentsDir): Promise<void> {
  await rm(join(racine, 'tmp', temporaire), { force: true }).catch(() => undefined);
}

/**
 * Moves a temporary file to its final name (a fresh UUID), synchronously so it
 * can sit inside a database transaction. Returns the final name.
 */
export function promouvoir(temporaire: string, racine: string = attachmentsDir): string {
  const fichier = randomUUID();
  renameSync(join(racine, 'tmp', temporaire), join(racine, fichier));
  return fichier;
}

/** Deletes a stored file. Never throws. */
export function supprimerFichier(fichier: string, racine: string = attachmentsDir): void {
  if (!NOM_FICHIER.test(fichier)) return;
  try {
    rmSync(join(racine, fichier), { force: true });
  } catch {
    // The row is already gone: an orphan is unreachable (accepted risk, docs/donnees.md).
  }
}

/** Opens a stored file; null if it is missing on the disk. */
export async function lireFichier(
  fichier: string,
  racine: string = attachmentsDir,
): Promise<{ flux: Readable; taille: number } | null> {
  if (!NOM_FICHIER.test(fichier)) return null;
  const chemin = join(racine, fichier);
  try {
    const s = await stat(chemin);
    return { flux: createReadStream(chemin), taille: s.size };
  } catch {
    return null;
  }
}

/** Empties `tmp/` (startup: any upload still there was cut short, AD-65). */
export async function viderTmp(racine: string = attachmentsDir): Promise<void> {
  const tmp = join(racine, 'tmp');
  await mkdir(tmp, { recursive: true });
  for (const f of await readdir(tmp)) await rm(join(tmp, f), { recursive: true, force: true });
}

