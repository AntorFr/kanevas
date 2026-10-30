/** Wire format of the common tools API (C-5), independent of module code. */
export type Valeur = boolean | number | string;
export type Niveau = 'systeme' | 'univers';
export interface Reglage {
  nom: string;
  libelle: string;
  aide?: string;
  niveau: 'systeme+univers' | 'univers';
  defaut: Valeur;
  protege?: boolean;
  forme: { type: 'booleen' } | { type: 'nombre'; min: number; max: number; entier?: boolean }
    | { type: 'texte'; max: number } | { type: 'choix'; valeurs: string[] };
}
export interface Resolue { valeur: Valeur; origine: 'defaut' | Niveau }
export interface Ligne {
  active: boolean | null;
  visibilite: { mj: boolean | null; joueur: boolean | null };
  valeurs: Record<string, Valeur>;
  versionReglages: number;
}
export interface Communs {
  module: string;
  libelle: string;
  reglages: Reglage[];
  systeme: Ligne;
  univers: Ligne | null;
  effectif: Record<string, Resolue>;
}
export interface Outil extends Omit<Communs, 'effectif'> {
  cle: string;
  description: string;
  type: string;
  dependances: string[];
  effectif: { active: boolean; visibilite: { mj: boolean; joueur: boolean }; reglages: Record<string, Resolue> };
}
export interface Responsable {
  ecriture: boolean;
  responsable: { id: number; nom: string; vousEtes: boolean } | null;
}
export interface VueOutils {
  ecriture: boolean;
  outils: Outil[];
  communs: Communs[];
}
export const afficher = (v: Valeur) => typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v);
export const origine = (v: Resolue) => `${v.origine === 'defaut' ? 'Par défaut' : v.origine === 'systeme' ? 'Système' : 'Univers'} · ${afficher(v.valeur)}`;
