import { createHash } from 'node:crypto';
import type { Db } from '../../db/db.js';
import { bloc, densiteHexagone, TAILLE_BLOC } from '../../outils/swn/regles/generation.js';
import type { Point } from '../../outils/swn/regles/hex.js';
import { invalide } from '../erreurs.js';
import type { Acteur } from '../types.js';
import { galaxieLisible, zonesLisibles, type NiveauLecture } from './galaxies.js';

export interface CoordonneesBloc { bx: number; by: number }
export interface BlocGenere extends CoordonneesBloc { generes: [number, number][] }

/** Inclusive block rectangle; safe integer arithmetic also bounds the work of the loops. */
export function validerRectangle(de: CoordonneesBloc, a: CoordonneesBloc): void {
  const valeurs = [de.bx, de.by, a.bx, a.by];
  if (!valeurs.every((n) => Number.isSafeInteger(n) && Number.isSafeInteger(n * TAILLE_BLOC)
    && Number.isSafeInteger(n * TAILLE_BLOC + TAILLE_BLOC - 1))
    || a.bx < de.bx || a.by < de.by || a.bx - de.bx >= 12 || a.by - de.by >= 12) {
    throw invalide('Choisissez un rectangle de 12 × 12 blocs au maximum.');
  }
}

const LIMITE = 4_000;
// A single bounded LRU. Database namespaces prevent temporary databases (or a reopened
// database with recycled identifiers) from sharing entries accidentally.
const cache = new Map<string, readonly Point[]>();
const bases = new WeakMap<Db, number>();
let prochaineBase = 0;
type Compteur = { hits: number; generations: number };
const parNiveau: Record<NiveauLecture, Compteur> = {
  mj: { hits: 0, generations: 0 }, joueur: { hits: 0, generations: 0 },
};

/** Test diagnostics only; never part of a map response. Returned counters are snapshots. */
export function compteurs(): Compteur & { parNiveau: Record<NiveauLecture, Compteur> } {
  return {
    hits: parNiveau.mj.hits + parNiveau.joueur.hits,
    generations: parNiveau.mj.generations + parNiveau.joueur.generations,
    parNiveau: { mj: { ...parNiveau.mj }, joueur: { ...parNiveau.joueur } },
  };
}

export function viderCacheBlocs(): void {
  cache.clear();
  for (const c of Object.values(parNiveau)) { c.hits = 0; c.generations = 0; }
}

/**
 * Generated positions only (G-3/G-4), before readable defined systems replace them.
 * Rights and zones are read afresh, even on a hit; no MJ entry is touched by a player.
 */
export function lireBlocsGeneres(
  db: Db, acteur: Acteur, universId: number, galaxieId: number,
  de: CoordonneesBloc, a: CoordonneesBloc,
): BlocGenere[] {
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  validerRectangle(de, a);
  const zones = zonesLisibles(db, galaxie.id, niveau);
  const versions = zones.map((z) => [z.cle, z.version] as const)
    .sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  const empreinte = createHash('sha256').update(JSON.stringify(versions)).digest('hex');
  const densites = zones.map((z) => ({ contour: JSON.parse(z.contour) as Point[], densite: z.densite }));
  let base = bases.get(db);
  if (base === undefined) { base = ++prochaineBase; bases.set(db, base); }
  const resultat: BlocGenere[] = [];
  for (let by = de.by; by <= a.by; by++) {
    for (let bx = de.bx; bx <= a.bx; bx++) {
      // Default density is also an input of generation: changing it must not reuse a stale block.
      const cle = JSON.stringify([base, galaxie.id, galaxie.graine, bx, by, niveau, empreinte, galaxie.densite_defaut]);
      let positions = cache.get(cle);
      if (positions !== undefined) {
        parNiveau[niveau].hits++;
        cache.delete(cle);
      } else {
        parNiveau[niveau].generations++;
        positions = bloc(galaxie.graine, bx, by,
          (q, r) => densiteHexagone(q, r, densites, galaxie.densite_defaut)).map(({ q, r }) => [q, r] as const);
      }
      cache.set(cle, positions);
      if (cache.size > LIMITE) cache.delete(cache.keys().next().value!);
      // Callers may overlay systems or mutate their response without modifying the cache.
      resultat.push({ bx, by, generes: positions.map(([q, r]) => [q, r]) });
    }
  }
  return resultat;
}
