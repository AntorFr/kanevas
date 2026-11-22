import { BookOpen, Images, Map as Carte, Rocket, WandSparkles, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

import { ErreurApi, lire } from '../api';
import type { PropsOutil } from './types';

/**
 * The client side of the tools (AD-133): `module/outil` → its icon and a lazy `import()` of its
 * component. The code of a tool is requested only after the server has described it to the caller;
 * an entry of the bar whose key is absent here is not shown. A module adds its lines here — and
 * touches neither the router nor the bar.
 */
export interface OutilClient {
  icone: LucideIcon;
  /** The tool is reached from its own list (E-10 « Cartes »), never from the « Outils » section of the bar. */
  horsBarre?: boolean;
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
    horsBarre: true,
    // The address of a system's inside (`…/:cible/interieur/:q/:r`, E-23) is read through its own route: the read is the check.
    verifier: (universId, cible, suffixe) => {
      const base = `/api/univers/${universId}/outils/swn/galaxie/galaxies/${encodeURIComponent(cible ?? '')}`;
      // The settings screen (E-24) is read through its own route: a player, a non-member, an unknown galaxy get « Page introuvable. ».
      if (/\/reglages\/?$/.test(window.location.pathname)) return lire(`${base}/reglages${suffixe}`);
      const m = /\/interieur\/([^/]+)\/([^/]+)\/?$/.exec(window.location.pathname);
      return lire(m ? `${base}/interieur/${encodeURIComponent(m[1] ?? '')}/${encodeURIComponent(m[2] ?? '')}${suffixe}` : `${base}${suffixe}`);
    },
    charger: () => import('./swn/galaxie'),
  },
  'swn/vaisseaux': {
    icone: Rocket,
    // A design opened by its address (`?fiche=`) is read before the tool's code is requested: unreadable = « Page introuvable. ».
    verifier: (universId, _cible, suffixe) => {
      const fiche = new URLSearchParams(window.location.search).get('fiche');
      if (fiche === null) return Promise.resolve(undefined);
      return lire(`/api/univers/${universId}/outils/swn/vaisseaux/conceptions/${encodeURIComponent(fiche)}${suffixe}`);
    },
    charger: () => import('./swn/vaisseaux'),
  },
  // The screen answers its own address (`ecrans/battlemap-assets.tsx`); this entry makes « Bibliothèque » show in the bar.
  'battlemap/assets': { icone: Images, charger: () => import('./battlemap/assets') },
  // The editor of a composed map (E-28). The map is read before the code is requested: a player, a GM in Player mode, an unknown or
  // hidden map all end on « Page introuvable. » (the 403 of Player mode included).
  'battlemap/cartes': {
    icone: Carte,
    horsBarre: true,
    verifier: async (universId, cible, suffixe) => {
      try {
        const carte = await lire<{ peutEcrire: boolean }>(`/api/univers/${universId}/outils/battlemap/cartes/${encodeURIComponent(cible ?? '')}${suffixe}`);
        if (!carte.peutEcrire || suffixe) throw new ErreurApi(404, 'Introuvable.');
        return carte;
      } catch (e) {
        throw e instanceof ErreurApi && e.statut === 403 ? new ErreurApi(404, 'Introuvable.') : e;
      }
    },
    charger: () => import('./battlemap/cartes'),
  },
  'essai/g': { icone: WandSparkles, charger: () => import('./essai/g') },
};

export const outilClient = (cle: string): OutilClient | undefined => (Object.hasOwn(OUTILS_CLIENT, cle) ? OUTILS_CLIENT[cle] : undefined);
