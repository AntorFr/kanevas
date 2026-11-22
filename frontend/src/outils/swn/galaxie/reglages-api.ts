import { appeler, lire } from '../../../api';

type Objet = Record<string, unknown>;

export interface AspectReglage { type: string; surcharge: Objet; defaut: Objet; version: number }

/** The complete read of the galaxy's settings (`GET …/reglages`). */
export interface VueReglages {
  /** The galaxy's version: the token of a write. */
  version: number;
  version_generateur: number;
  versions_connues: number[];
  densite_defaut: number;
  valeurs: Objet;
  surcharge: Objet;
  defauts: Objet;
  par_defaut: boolean;
  aspects: AspectReglage[];
}

/** What a proposal would move, before it is applied. */
export interface ApercuReglages {
  tires_changent: number;
  definis_inchangent: number;
  etendue: { de: { bx: number; by: number }; a: { bx: number; by: number }; largeur: number; hauteur: number };
}

/** A proposal: only the keys present are proposed; `valeurs: null` returns to the defaults. */
export interface PropositionReglages {
  densite?: number;
  version_generateur?: number;
  valeurs?: Objet | null;
  aspects?: Record<string, Objet | null>;
}

const base = (universId: number | string, galaxieId: number | string) =>
  `/api/univers/${universId}/outils/swn/galaxie/galaxies/${galaxieId}`;

export const lireReglages = (universId: number | string, galaxieId: number | string) =>
  lire<VueReglages>(`${base(universId, galaxieId)}/reglages`);

export const apercevoirReglages = (universId: number | string, galaxieId: number | string, proposition: PropositionReglages) =>
  appeler<ApercuReglages>('POST', `${base(universId, galaxieId)}/reglages/apercu`, proposition);

export const poserReglages = (
  universId: number | string, galaxieId: number | string,
  entree: PropositionReglages & { version: number; confirme?: boolean },
) => appeler<VueReglages>('PUT', `${base(universId, galaxieId)}/reglages`, entree);

/** `version` is the row's own (0 without row); `parametres: null` removes the override. Answers the settings as read now. */
export const poserAspect = (
  universId: number | string, galaxieId: number | string, type: string,
  entree: { version: number; parametres: Objet | null },
) => appeler<VueReglages>('PUT', `${base(universId, galaxieId)}/aspects/${encodeURIComponent(type)}`, entree);
