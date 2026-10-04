import type { ComponentType } from 'react';
import { matchPath } from 'react-router-dom';

/**
 * A screen of the application (AD-16). Each task adds one file `ecrans/<nom>.tsx` whose default
 * export is an `Ecran`; nothing else is edited — the router and the sidebar read this registry.
 */
export interface Ecran {
  /** react-router pattern, e.g. `/`, `/univers/:id`, `/univers/:id/membres`. */
  chemin: string;
  composant: ComponentType;
}

const modules = import.meta.glob<{ default: Ecran }>('./ecrans/*.tsx', { eager: true });

export const ecrans: Ecran[] = Object.values(modules).map((m) => m.default);

/** True when a registered screen answers this concrete address. */
export function ecranEnregistre(url: string, registre: Ecran[] = ecrans): boolean {
  return registre.some((e) => matchPath({ path: e.chemin, end: true }, url) !== null);
}
