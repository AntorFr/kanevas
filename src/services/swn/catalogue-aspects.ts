// The catalogue of aspects of a galaxy (AD-reglages-6): the overrides per type and the one merge of an aspect.
// `aspectEffectif` is the only place where a galaxy's override and a body's own aspect meet (a source-scan test holds
// it); the browser merges nothing. A write goes through `ecrireAspect` of `reglages.ts` (the only SQL on `swn_aspects`)
// and never moves the galaxy's `version`: a catalogue change moves no position and no row, it changes the picture only.
import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { ecrireAspect, galaxieDuMJ, lireAspects } from './reglages.js';

type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep merge of objects, `sur` over `base`; anything else (a list, a number, a colour) is replaced whole, as the core does. */
function fusion(base: Objet, sur: Objet): Objet {
  const sortie: Objet = { ...base };
  for (const [k, v] of Object.entries(sur)) {
    const b = sortie[k];
    sortie[k] = estObjet(b) && estObjet(v) ? fusion(b, v) : v;
  }
  return sortie;
}

/**
 * The effective aspect of a body of `type`: the core's default < the galaxy's override of the type < the body's own
 * aspect. The core's default is not copied in: the renderer applies it itself, under the variant its `nature` names
 * (which a copy of the default here would shadow). So the result carries the overrides and what the body sets, and the
 * renderer finishes the layers. An unknown type, or one without override, gives the body's own aspect.
 */
export function aspectEffectif(db: Db, galaxieId: number, type: string, aspectDuCorps: Objet): Objet {
  return fusionSurcharges(surchargesDe(db, galaxieId), type, aspectDuCorps);
}

/** The overrides of a galaxy by type, read once for a whole interior. */
export function surchargesDe(db: Db, galaxieId: number): Map<string, Objet> {
  return new Map(lireAspects(db, galaxieId).map((l) => [l.type, l.parametres]));
}

/** `aspectEffectif` with the overrides already read (`surchargesDe`): the same merge, one query per interior. */
export function fusionSurcharges(surcharges: Map<string, Objet>, type: string, aspectDuCorps: Objet): Objet {
  const surcharge = surcharges.get(type);
  return surcharge ? fusion(surcharge, aspectDuCorps) : aspectDuCorps;
}

/**
 * Sets (or, with `parametres: null`, removes) the override of one type. The caller must be a GM of the galaxy's universe
 * outside Player mode (any other role: the `introuvable` of an unknown galaxy). `version` is the type's row version (0
 * without row); a stale one is `conflit` / `a_change`. The core validates (unknown type or key, range, colour, 4 KiB:
 * `invalide` with `champ`). Returns the new version of the row (0 once removed).
 */
export function poserAspect(
  db: Db, acteur: Acteur | number, universId: number, galaxieId: number, type: string,
  entree: { version: unknown; parametres: unknown },
): number {
  const g = galaxieDuMJ(db, acteur, universId, galaxieId, true);
  const version = entree?.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new ErreurService('invalide', 'Version attendue.', 'reglage_invalide', 'version');
  }
  return ecrireAspect(db, g.id, type, entree.parametres ?? null, version);
}
