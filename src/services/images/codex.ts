import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { typeParSignature } from '../pieces-jointes.js';
import { ErreurGeneration, type GenerateurImage } from './types.js';
import { sousVerrou } from './verrou.js';

/** Engine deadline (AD-90). */
export const DELAI_CODEX_MS = 150_000;
/** A result larger than this is not an image we want to keep in memory. */
const TAILLE_MAX = 20 * 1024 * 1024;

export interface OptionsCodex {
  /** `CODEX_HOME`: holds `auth.json`; Codex writes `generated_images/<session>/` there. */
  codexHome: string;
  /** Parent of the disposable working directories (`/data/tmp/images`). */
  racineTmp: string;
  /** Executable name or path; default `codex`, looked up in the `PATH`. */
  executable?: string;
  /** Deadline in ms; tests shorten it. */
  delaiMs?: number;
}

/** Every file under `racine`, as absolute paths (the folder may not exist yet). */
async function lister(racine: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  async function parcourir(dir: string): Promise<void> {
    let entrees;
    try {
      entrees = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const chemin = join(dir, e.name);
      if (e.isDirectory()) await parcourir(chemin);
      else if (e.isFile()) out.set(chemin, (await stat(chemin)).mtimeMs);
    }
  }
  await parcourir(racine);
  return out;
}

/**
 * Runs `codex exec` and waits for its end. Its output is discarded (`stdio: ignore`): it could quote the
 * credentials and the image path is not guaranteed in it anyway (AD-90). The child is killed on deadline
 * or when `signal` fires.
 */
function executer(
  executable: string,
  args: string[],
  cwd: string,
  codexHome: string,
  delaiMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ErreurGeneration());
    const enfant = spawn(executable, args, {
      cwd,
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: 'ignore',
    });
    let fini = false;
    const finir = (err?: Error) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      signal?.removeEventListener('abort', onAbort);
      if (err) {
        enfant.kill('SIGKILL');
        reject(err);
      } else resolve();
    };
    const minuterie = setTimeout(() => finir(new ErreurGeneration()), delaiMs);
    const onAbort = () => finir(new ErreurGeneration());
    signal?.addEventListener('abort', onAbort, { once: true });
    enfant.on('error', () => finir(new ErreurGeneration()));
    enfant.on('close', (code) => finir(code === 0 ? undefined : new ErreurGeneration()));
  });
}

/** `codex` adapter (AD-50, AD-90). */
export function generateurCodex(options: OptionsCodex): GenerateurImage {
  const { codexHome, racineTmp, executable = 'codex', delaiMs = DELAI_CODEX_MS } = options;
  const dossierImages = join(codexHome, 'generated_images');
  return {
    generer(description, signal) {
      return sousVerrou(signal, async () => {
        const cwd = join(racineTmp, randomUUID());
        let avant = new Map<string, number>();
        try {
          await mkdir(cwd, { recursive: true });
          avant = await lister(dossierImages);
          const instruction =
            `Génère une image : ${description}\n` +
            "Génère cette seule image avec ton outil de génération d'images, sans écrire d'autre fichier ni de code.";
          await executer(
            executable,
            ['exec', '--sandbox', 'danger-full-access', '--skip-git-repo-check', instruction],
            cwd,
            codexHome,
            delaiMs,
            signal,
          );
          const apres = await lister(dossierImages);
          const nouveaux = [...apres].filter(([chemin]) => !avant.has(chemin)).sort((a, b) => b[1] - a[1]);
          if (nouveaux.length === 0) throw new ErreurGeneration();
          const lu = nouveaux[0]![0];
          if ((await stat(lu)).size > TAILLE_MAX) throw new ErreurGeneration();
          const octets = await readFile(lu);
          if (!typeParSignature(octets.subarray(0, 16)).startsWith('image/')) throw new ErreurGeneration();
          return octets;
        } catch (e) {
          throw e instanceof ErreurGeneration ? e : new ErreurGeneration();
        } finally {
          // The file read, and whatever else this run left in the engine's folder (a refused result too).
          for (const [chemin] of await lister(dossierImages)) {
            if (avant.has(chemin)) continue;
            await rm(chemin, { force: true }).catch(() => undefined);
            await rmdir(dirname(chemin)).catch(() => undefined);
          }
          await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
        }
      });
    },
  };
}
