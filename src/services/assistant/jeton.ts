import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { dbPath, env } from '../../config/env.js';

/** What the token resolver reads: injected by tests, `env` otherwise. */
export interface ConfigJeton {
  CLAUDE_CODE_OAUTH_TOKEN?: string | undefined;
  /** Overrides the directory holding `oauth-token` (AD-112). */
  CLAUDE_DIR?: string | undefined;
}

export type SourceJeton = 'instance' | 'deploiement';

/** Never carries the value (AD-112). */
export interface EtatJeton {
  pose: boolean;
  poseLe: string | null;
  source: SourceJeton | null;
}

const NOM = 'oauth-token';

/** `<data root>/claude`; under the OS temp dir when the database is in memory. */
export function dossierClaude(config: ConfigJeton = env): string {
  if (config.CLAUDE_DIR) return config.CLAUDE_DIR;
  return dbPath === ':memory:' ? join(tmpdir(), 'kanevas-claude') : join(dirname(dbPath), 'claude');
}

function lireFichier(config: ConfigJeton): { jeton: string; poseLe: string } | null {
  const chemin = join(dossierClaude(config), NOM);
  try {
    const jeton = readFileSync(chemin, 'utf8').trim();
    if (!jeton) return null;
    return { jeton, poseLe: statSync(chemin).mtime.toISOString() };
  } catch {
    return null;
  }
}

/** The single reading of the assistant token: the volume file, else the deployment variable. */
export function jetonEffectif(config: ConfigJeton = env): string | null {
  const fichier = lireFichier(config);
  if (fichier) return fichier.jeton;
  return config.CLAUDE_CODE_OAUTH_TOKEN?.trim() || null;
}

export function etatJeton(config: ConfigJeton = env): EtatJeton {
  const fichier = lireFichier(config);
  if (fichier) return { pose: true, poseLe: fichier.poseLe, source: 'instance' };
  if (config.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return { pose: true, poseLe: null, source: 'deploiement' };
  return { pose: false, poseLe: null, source: null };
}

/** Temporary file then `rename`, 0600 in a 0700 directory. */
export function ecrireJeton(jeton: string, config: ConfigJeton = env): void {
  const dossier = dossierClaude(config);
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  chmodSync(dossier, 0o700);
  const tmp = join(dossier, `${NOM}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, jeton.trim(), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, join(dossier, NOM));
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** Removes the file only; never creates anything. */
export function supprimerJeton(config: ConfigJeton = env): void {
  rmSync(join(dossierClaude(config), NOM), { force: true });
}
