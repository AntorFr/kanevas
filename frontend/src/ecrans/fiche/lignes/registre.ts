import type { ComponentType } from 'react';

import type { Fiche } from '../types';

export interface PropsLigneTitre {
  universId: string;
  fiche: Fiche;
  /** Only the GM outside player mode may edit the line. */
  gestion: boolean;
  /** Silent refetch after a successful write; the sections stay mounted. */
  rafraichir: () => Promise<void>;
}

/**
 * A line under the title of E-9, for the sheets of one type (e.g. « Campagne : … » of a session
 * report). A slice adds one by dropping a file in `lignes/` whose default export is a `LigneTitre`;
 * this registry picks them all up. A type without a line shows nothing.
 */
export interface LigneTitre {
  /** The sheet type it applies to (`fiches.type`). */
  type: string;
  composant: ComponentType<PropsLigneTitre>;
}

const modules = import.meta.glob<{ default: LigneTitre }>('./*.tsx', { eager: true });

export const lignesTitre: LigneTitre[] = Object.values(modules).map((m) => m.default);

/** The lines to show under the title of a sheet of this type. */
export function lignesDuType(type: string, registre: LigneTitre[] = lignesTitre): LigneTitre[] {
  return registre.filter((l) => l.type === type);
}
