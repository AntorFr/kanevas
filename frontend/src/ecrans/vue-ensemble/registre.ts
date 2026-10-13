import type { ComponentType } from 'react';

import type { Role } from '../../types';

/**
 * A block of the overview (E-3). A slice adds one by dropping a file in `blocs/` whose default
 * export is a `Bloc`; this registry picks them all up, nothing else is edited.
 */
export interface Bloc {
  id: string;
  /** Roles that see it. */
  roles: Role[];
  /** Ascending order on the page. */
  rang: number;
  /** Column of the desktop layout; the DOM order is the rank, so a phone reads them in rank order. Default: the main one. */
  colonne?: 'principale' | 'laterale';
  composant: ComponentType<{ universId: number; role: Role }>;
}

const modules = import.meta.glob<{ default: Bloc }>('./blocs/*.tsx', { eager: true });

export const blocs: Bloc[] = Object.values(modules).map((m) => m.default);

/** The blocks a role sees, in order (ties by id). */
export function blocsVisibles(role: Role, registre: Bloc[] = blocs): Bloc[] {
  return registre
    .filter((b) => b.roles.includes(role))
    .sort((a, b) => a.rang - b.rang || a.id.localeCompare(b.id));
}
