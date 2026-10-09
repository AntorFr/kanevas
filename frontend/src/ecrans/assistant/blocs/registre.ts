import type { ComponentType } from 'react';

import type { Evenement, TypeEvenement } from '../fil';
import { Ecriture } from './ecriture';

export interface PropsBloc {
  evenement: Evenement;
  universId: number;
  /** Called before a link is followed (the panel closes on a phone). */
  surOuverture: () => void;
}

/**
 * The blocks under an answer, one line per event `type` (AD-76). Later slices (propositions,
 * images) add their line here without touching an existing block.
 */
export const blocs: Partial<Record<TypeEvenement, ComponentType<PropsBloc>>> = {
  section_modifiee: Ecriture,
  section_completee: Ecriture,
  campagne_creee: Ecriture,
  scenario_cree: Ecriture,
};
