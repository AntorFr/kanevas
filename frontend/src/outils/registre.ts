import { BookOpen, Map as Carte, WandSparkles, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

import { lire } from '../api';
import type { PropsOutil } from './types';

/**
 * The client side of the tools (AD-133): `module/outil` → its icon and a lazy `import()` of its
 * component. The code of a tool is requested only after the server has described it to the caller;
 * an entry of the bar whose key is absent here is not shown. A module adds its lines here — and
 * touches neither the router nor the bar.
 */
export interface OutilClient {
  icone: LucideIcon;
  /**
   * Asked together with the description, before `charger`: a refusal (404, 403) stops the page and the
   * tool's code is never requested. Only for tools whose address carries a target.
   */
  verifier?: (universId: number, cible: string | undefined, suffixe: string) => Promise<unknown>;
  charger: () => Promise<{ default: ComponentType<PropsOutil> }>;
}

export const OUTILS_CLIENT: Record<string, OutilClient> = {
  'essai/a': { icone: Carte, charger: () => import('./essai/a') },
  'essai/b': { icone: BookOpen, charger: () => import('./essai/b') },
  'swn/galaxie': {
    icone: Carte,
    verifier: (universId, cible, suffixe) => lire(`/api/univers/${universId}/outils/swn/galaxie/galaxies/${encodeURIComponent(cible ?? '')}${suffixe}`),
    charger: () => import('./swn/galaxie'),
  },
  'essai/g': { icone: WandSparkles, charger: () => import('./essai/g') },
};

export const outilClient = (cle: string): OutilClient | undefined => (Object.hasOwn(OUTILS_CLIENT, cle) ? OUTILS_CLIENT[cle] : undefined);
