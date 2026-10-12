import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { codexHome as codexHomeEnv, env, imagesTmpDir } from '../../config/env.js';
import { generateurAucun } from './aucun.js';
import { generateurBouchon } from './bouchon.js';
import { generateurCodex } from './codex.js';
import type { GenerateurImage, NomAdaptateur } from './types.js';

export { ErreurGeneration } from './types.js';
export type { GenerateurImage, NomAdaptateur } from './types.js';

/** What the choice depends on, passed in so tests need no `process.env`. */
export interface ConfigImages {
  KANEVAS_STUB?: string | undefined;
  codexHome: string;
  racineTmp: string;
  /** Directories searched for the `codex` executable; default: the process `PATH`. */
  path?: string | undefined;
  delaiMs?: number;
}

export interface AdaptateurChoisi {
  nom: NomAdaptateur;
  generateur: GenerateurImage;
}

function executableDans(path: string | undefined): string | undefined {
  for (const dir of (path ?? '').split(delimiter)) {
    if (!dir) continue;
    const chemin = join(dir, 'codex');
    try {
      if (!statSync(chemin).isFile()) continue;
      accessSync(chemin, constants.X_OK);
      return chemin;
    } catch {
      // not here
    }
  }
  return undefined;
}

/**
 * AD-88: `bouchon` with `KANEVAS_STUB=1`; else `codex` when the executable is present and
 * `<CODEX_HOME>/auth.json` exists; else `aucun` — never a silent stub. `auth.json` is only tested for
 * existence, never read.
 */
export function choisirAdaptateur(
  config: ConfigImages = {
    KANEVAS_STUB: env.KANEVAS_STUB,
    codexHome: codexHomeEnv,
    racineTmp: imagesTmpDir,
  },
): AdaptateurChoisi {
  if (config.KANEVAS_STUB === '1') return { nom: 'bouchon', generateur: generateurBouchon };
  const executable = executableDans(config.path ?? process.env.PATH);
  if (executable && existsSync(join(config.codexHome, 'auth.json'))) {
    return {
      nom: 'codex',
      generateur: generateurCodex({
        codexHome: config.codexHome,
        racineTmp: config.racineTmp,
        executable,
        ...(config.delaiMs !== undefined ? { delaiMs: config.delaiMs } : {}),
      }),
    };
  }
  return { nom: 'aucun', generateur: generateurAucun };
}
