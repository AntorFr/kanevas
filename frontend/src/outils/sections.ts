import type { ComponentType } from 'react';

import type { PropsSection } from './types';

/**
 * The display components of managed sections (S-7): `module/outil/type` → a lazy `import()`. The module is
 * requested only when a sheet shows a section whose `geree.composant` is true and whose tool is open to the reader.
 */
export const COMPOSANTS_SECTION: Record<string, () => Promise<{ default: ComponentType<PropsSection> }>> = {
  'essai/g/caracteristiques': () => import('./essai/section-g'),
  'swn/vaisseaux/caracteristiques': () => import('./swn/vaisseaux/section'),
};

export const composantSection = (cle: string, type: string) => {
  const k = `${cle}/${type}`;
  return Object.hasOwn(COMPOSANTS_SECTION, k) ? COMPOSANTS_SECTION[k] : undefined;
};

/** Wording of the managed-section banner for tools whose name reads differently in the sentence (docs/ecrans.md, E-9). */
export const MOTS_BANDEAU: Record<string, { nom: string; ouvrir: string }> = {
  'swn/vaisseaux': { nom: 'le concepteur de vaisseaux', ouvrir: 'Ouvrir dans le concepteur' },
};
export const motsBandeau = (cle: string | null) => (cle !== null && Object.hasOwn(MOTS_BANDEAU, cle) ? MOTS_BANDEAU[cle] : undefined);
