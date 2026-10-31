/** What `GET /api/univers/:id/outils/:module/:outil/description` returns (AD-133). */
export interface DescriptionOutil {
  cle: string;
  libelle: string;
  type: string;
  description: string;
  dependances: string[];
  usages: { nom: string; mjSeul: boolean }[];
  reglages: { nom: string; libelle: string }[];
  valeurs: Record<string, { valeur: unknown; origine: string }>;
  communs: Record<string, { valeur: unknown; origine: string }>;
}

/** An entry of `GET /api/univers/:id/outils/entrees`. */
export interface EntreeOutil {
  cle: string;
  libelle: string;
  icone: string;
  chemin: string;
}

/** The props every tool component receives once its description is read. */
export interface PropsOutil {
  universId: number;
  description: DescriptionOutil;
  /** The path segment after the tool (a galaxy id), when the address has one. */
  cible?: string;
  /** What the tool's `verifier` read before its code was requested. */
  prealable?: unknown;
  /** `?mode=joueur` when a GM views as a player, else empty: the mode the tool was opened under. */
  suffixeMode?: string;
}
