import type { ComponentType } from 'react';

import type { Role } from '../../types';
import type { FicheVue } from './types';

export interface PropsBlocFiche {
  universId: string;
  fiche: FicheVue;
  /** Effective role: a GM in player mode is a player. */
  role: Role;
  suffixeMode: string;
}

/** Sheet blocks (AD-124), rendered once above the sections, independently of section blocks. */
export interface BlocFiche {
  id: string;
  types: string[];
  roles: Role[];
  rang: number;
  composant: ComponentType<PropsBlocFiche>;
}

const modules = import.meta.glob<{ default: BlocFiche }>('./blocs-fiche/*.tsx', { eager: true });
export const blocsFiche: BlocFiche[] = Object.values(modules).map((m) => m.default);

/** Enabled universe types never enter this filter: existing sheets keep their blocks. */
export function blocsFicheVisibles(type: string, role: Role, registre: BlocFiche[] = blocsFiche): BlocFiche[] {
  return registre.filter((b) => b.types.includes(type) && b.roles.includes(role))
    .sort((a, b) => a.rang - b.rang || a.id.localeCompare(b.id));
}
