import { BookOpen, Map as Carte, WandSparkles, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

import type { PropsOutil, PropsSection } from './types';

/**
 * The client side of the tools (AD-133): `module/outil` → its icon and a lazy `import()` of its
 * component. The code of a tool is requested only after the server has described it to the caller;
 * an entry of the bar whose key is absent here is not shown. A module adds its lines here — and
 * touches neither the router nor the bar.
 */
export interface OutilClient {
  icone: LucideIcon;
  charger: () => Promise<{ default: ComponentType<PropsOutil> }>;
}

export const OUTILS_CLIENT: Record<string, OutilClient> = {
  'essai/a': { icone: Carte, charger: () => import('./essai/a') },
  'essai/b': { icone: BookOpen, charger: () => import('./essai/b') },
  'essai/g': { icone: WandSparkles, charger: () => import('./essai/g') },
};

export const outilClient = (cle: string): OutilClient | undefined => (Object.hasOwn(OUTILS_CLIENT, cle) ? OUTILS_CLIENT[cle] : undefined);

/**
 * The display components of managed sections (S-7): `module/outil/type` → a lazy `import()`. The module is
 * requested only when a sheet shows a section whose `geree.composant` is true and whose tool is open to the reader.
 */
export const COMPOSANTS_SECTION: Record<string, () => Promise<{ default: ComponentType<PropsSection> }>> = {
  'essai/g/caracteristiques': () => import('./essai/section-g'),
};

export const composantSection = (cle: string, type: string) => {
  const k = `${cle}/${type}`;
  return Object.hasOwn(COMPOSANTS_SECTION, k) ? COMPOSANTS_SECTION[k] : undefined;
};
