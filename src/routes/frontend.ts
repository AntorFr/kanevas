import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../config/env.js';

/** Placeholder of `frontend/index.html`, replaced at serve time (AD-55 banner flag). */
const MARQUE_BOUCHON = '<!--KANEVAS_BOUCHON-->';

export interface Frontend {
  /** Directory of the Vite build, served by `@fastify/static` (AD-57). */
  racine: string;
  /** `index.html`, the fallback for every screen address. */
  index: string;
}

/**
 * Locates the frontend build: `FRONTEND_DIR`, else `dist/public` (next to the compiled server,
 * or under the repo root when run through tsx; under test, `FRONTEND_DIR` only). Null when there is no build: the server then
 * answers unknown addresses as before.
 */
export function chargerFrontend(): Frontend | null {
  const ici = dirname(fileURLToPath(import.meta.url));
  // Under test only an explicit FRONTEND_DIR counts: a build left in dist/ must not change routes.
  const candidats =
    env.NODE_ENV === 'test'
      ? [process.env.FRONTEND_DIR]
      : [process.env.FRONTEND_DIR, join(ici, '../public'), join(ici, '../../dist/public')];
  for (const racine of candidats) {
    if (racine && existsSync(join(racine, 'index.html'))) {
      const brut = readFileSync(join(racine, 'index.html'), 'utf8');
      const meta = env.KANEVAS_STUB ? '<meta name="kanevas-bouchon" content="1">' : '';
      return { racine, index: brut.replace(MARQUE_BOUCHON, meta) };
    }
  }
  return null;
}
