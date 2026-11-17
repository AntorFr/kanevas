import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../config/env.js';
import type { Db } from '../db/db.js';
import { cleDeFicheLue, resoudreUnivers } from '../services/cles.js';
import { estId } from '../services/cles-forme.js';
import { roleDe } from '../services/droits.js';
import { estTypeFiche } from '../services/types-fiche.js';

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

/** The readable address of a sheet inside its universe: `/<type>/<name>` for a key `type:name`, else `/fiche/<key>` (B-101). */
export function adresseDeFiche(cle: string): string {
  const [a, b, ...reste] = cle.split(':');
  return b !== undefined && reste.length === 0 && estTypeFiche(a!) ? `/${a}/${b}` : `/fiche/${cle}`;
}

/**
 * Where a numeric screen address leads (B-101, AD-146): `/univers/<id>/…` and `/univers/<u>/fiche/<id>` answer 302
 * to the readable form. `null`: the address is not one of those (the application serves it as it always did);
 * `'introuvable'`: a numeric sheet address the reader cannot follow — an unknown sheet, one they cannot read, or
 * a universe they are not in — all the same answer, which never says which. A universe's own numeric address is
 * followed only for a member.
 */
export function adresseLisible(db: Db, compteId: number, chemin: string, requete: string): string | null | 'introuvable' {
  const m = /^\/univers\/([^/]+)((?:\/.*)?)$/.exec(chemin);
  if (!m) return null;
  let ref: string;
  try {
    ref = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  const reste = m[2]!;
  const f = /^\/fiche\/(\d+)\/?$/.exec(reste);
  const univers = resoudreUnivers(db, ref);
  const membre = univers !== null && roleDe(db, univers.id, compteId) !== null;
  if (f) {
    if (!membre) return 'introuvable';
    const id = Number(f[1]);
    const cle = Number.isSafeInteger(id) ? cleDeFicheLue(db, compteId, univers.id, id) : null;
    return cle === null ? 'introuvable' : `/univers/${univers.cle}${adresseDeFiche(cle)}${requete}`;
  }
  if (membre && estId(ref)) return `/univers/${univers.cle}${reste}${requete}`;
  return null;
}
