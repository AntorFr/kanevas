export type Role = 'mj' | 'joueur';

export interface UniversListe {
  id: number;
  nom: string;
  description: string;
  role: Role;
}

export interface Moi {
  username: string;
  groups: string[];
  limites: { contenuSection: number };
}
