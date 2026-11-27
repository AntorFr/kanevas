// The exits of a system towards its neighbours (AD-carte-3): a second read of the tool beside `lireInterieur`, which it
// does not change. The routes are those E-21 reads (`routesLisibles`, both ends in `systemesLisibles`): nothing is
// recomputed here, so a private route or a hidden neighbour yields no entry, no gap and no count.
import type { Db } from '../../db/db.js';
import { chargerModule } from '../../wasm/charger.js';
import type { Acteur } from '../types.js';
import { galaxieLisible, routesLisibles, systemesLisibles } from './galaxies.js';
import { lireInterieur } from './interieur.js';

interface Coeur { heure_vers_voisin(q1: number, r1: number, q2: number, r2: number): number }

let coeur: Coeur | undefined;
try {
  coeur = await chargerModule<Coeur>('coeur');
} catch {
  coeur = undefined;
}

export interface SortieVue { q: number; r: number; heure: number; nom: string | null; distance: number; type_lien: string | null }

/**
 * The exits of the system at `(q, r)`. It opens with the guards of `lireInterieur` (the same `introuvable`), then lists
 * the readable routes that leave this system towards a readable neighbouring system, with the neighbour's hour.
 */
export function lireSorties(
  db: Db, acteur: Acteur, universId: number, galaxieId: number, q: number, r: number,
): SortieVue[] {
  lireInterieur(db, acteur, universId, galaxieId, q, r);
  if (!coeur) throw new Error('Wasm module "coeur" is missing or unreadable.');
  const { galaxie, niveau } = galaxieLisible(db, acteur, universId, galaxieId);
  const lisibles = systemesLisibles(db, galaxie.id, niveau);
  const origine = lisibles.find((s) => s.q === q && s.r === r);
  if (!origine) return [];
  const parId = new Map(lisibles.map((s) => [s.id, s]));
  const vus = new Set<number>();
  const sorties: SortieVue[] = [];
  for (const ro of routesLisibles(db, galaxie.id, niveau)) {
    const autre = ro.depuis_id === origine.id ? ro.vers_id : ro.vers_id === origine.id ? ro.depuis_id : null;
    const voisin = autre === null ? undefined : parId.get(autre);
    if (!voisin || voisin.id === origine.id || vus.has(voisin.id)) continue;
    vus.add(voisin.id);
    sorties.push({ q: voisin.q, r: voisin.r, heure: coeur.heure_vers_voisin(q, r, voisin.q, voisin.r), nom: voisin.nom, distance: ro.longueur, type_lien: ro.type_lien });
  }
  return sorties;
}
