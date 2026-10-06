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
