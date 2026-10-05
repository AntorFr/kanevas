import type { ComponentType } from 'react';

import type { Role } from '../../types';
import type { PropsBlocSection } from './types';

/**
 * A block of a section of E-9 (relations, attachments…). A slice adds one by dropping a file in
 * `blocs/` whose default export is a `BlocSection`; this registry picks them all up, nothing else
 * is edited.
 */
export interface BlocSection {
  id: string;
  /** Roles that see it (effective role: the GM in player mode is a `joueur`). */
  roles: Role[];
  /** Ascending order inside the section. */
  rang: number;
  composant: ComponentType<PropsBlocSection>;
}

const modules = import.meta.glob<{ default: BlocSection }>('./blocs/*.tsx', { eager: true });

export const blocsSection: BlocSection[] = Object.values(modules).map((m) => m.default);

/** The blocks a role sees, in order (ties by id). */
export function blocsSectionVisibles(role: Role, registre: BlocSection[] = blocsSection): BlocSection[] {
  return registre
    .filter((b) => b.roles.includes(role))
    .sort((a, b) => a.rang - b.rang || a.id.localeCompare(b.id));
}
