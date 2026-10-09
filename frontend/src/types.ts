export type Role = 'mj' | 'joueur';

export interface UniversListe {
  id: number;
  nom: string;
  description: string;
  role: Role;
  systeme?: { id: number; nom: string } | null;
  nbMembres?: number;
}

export interface Moi {
  username: string;
  groups: string[];
  limites: { contenuSection: number };
}

/** A game system as the account sees it (AD-94): only its own universes are ever named. */
export interface SystemeCompte {
  id: number;
  nom: string;
  nbUnivers: number;
  entrees: { regle: number; creature: number; objet: number };
  mesUnivers: { id: number; nom: string; role: Role }[];
  peutEcrire: boolean;
}
