import type { Db } from '../db/db.js';
import { vueMJ } from './droits.js';
import { extraireReferencesFichier } from './markdown.js';
import type { RenduFichier, ResolveurFichiers, ResolveurFichiersEnAttente } from './markdown.js';
import type { Acteur, Role } from './types.js';
import type { FichierRow } from './fichiers.js';

// Read side of the file references, apart from `fichiers.ts` so that `droits.ts` can use it without
// pulling `sections.ts` / `fiches.ts` into its import cycle.
export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const estImage = (type: string): boolean => TYPES_IMAGE.includes(type);

/** The role-aware core of the one read rule; `fichierLisible` is its public door. */
export function lisiblePar(role: Role | null, acteur: Acteur, f: Pick<FichierRow, 'visibilite' | 'ajoute_par'>): boolean {
  if (role === null) return false;
  if (vueMJ(role, acteur)) return true;
  return f.visibilite === 'joueurs' || f.ajoute_par === acteur.compteId;
}


export function compterReferences(source: string): Map<number, number> {
  const n = new Map<number, number>();
  for (const id of extraireReferencesFichier(source)) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
}

/**
 * The resolver of the `fichier:<id>` references of a text for one reader (AD-117, AD-96): one query for
 * all the files of the text, the rendering decided by the file and the one read rule. A closed file reads as
 * reserved, a vanished one as removed for the GM outside player mode and as nothing for anyone else.
 */
export function resolveurFichiers(
  db: Db,
  universId: number,
  role: Role,
  acteur: Acteur,
  source: string,
): ResolveurFichiers | undefined {
  const ids = [...compterReferences(source).keys()];
  if (ids.length === 0) return undefined;
  const rows = db
    .prepare(`SELECT * FROM fichiers WHERE univers_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
    .all(universId, ...ids) as FichierRow[];
  const parId = new Map(rows.map((r) => [r.id, r]));
  const marque = vueMJ(role, acteur);
  return (id): RenduFichier => {
    const f = parId.get(id);
    if (!f) return marque ? { genre: 'supprime' } : { genre: 'rien' };
    if (!lisiblePar(role, acteur, f)) return { genre: 'ferme' };
    return {
      genre: 'fichier',
      id: f.id,
      nom: f.nom,
      image: estImage(f.type),
      adresse: `/api/univers/${universId}/fichiers/${f.id}?v=${encodeURIComponent(f.disque)}`,
    };
  };
}

/** The `fichier:cle:` references of a text read as a tile for a GM outside player mode, as nothing for anyone else. */
export function resolveurFichiersEnAttente(role: Role, acteur: Acteur): ResolveurFichiersEnAttente {
  const marque = vueMJ(role, acteur);
  return (cle): RenduFichier => (marque ? { genre: 'attente', cle } : { genre: 'rien' });
}
