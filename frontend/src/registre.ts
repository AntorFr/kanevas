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
  /** Outside the frame (no sidebar, no top bar): the table display (E-30). */
  sansCadre?: boolean;
}

const modules = import.meta.glob<{ default: Ecran | Ecran[] }>('./ecrans/*.tsx', { eager: true });

// A screen file answers one address, or several when one screen has more than one form (B-101: a sheet).
export const ecrans: Ecran[] = Object.values(modules).flatMap((m) => m.default);

/** True when a registered screen answers this concrete address. */
export function ecranEnregistre(url: string, registre: Ecran[] = ecrans): boolean {
  return registre.some((e) => matchPath({ path: e.chemin, end: true }, url) !== null);
}
