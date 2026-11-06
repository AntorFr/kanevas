export interface Reference { cle: string; nom: string; q: number; r: number }
export interface VueGalaxie {
  id: number; titre: string; visible?: boolean; version: number; niveau: 'mj' | 'joueur'; porteeSaut: number;
  reference: Reference | null;
}
export interface SystemeCarte { id: number; cle: string; nom: string; q: number; r: number; taille: number; couleur: string; secret?: boolean; version?: number }
export interface RouteCarte {
  id: number; depuis: { cle: string; q: number; r: number }; vers: { cle: string; q: number; r: number };
  longueur: number; publique?: boolean; version?: number; type_lien?: string;
}
export interface ZoneCarte { id: number; nom: string; contour: [number, number][]; couleur: string; secret?: boolean; cle?: string; version?: number; densite?: number | null }
export interface VueBlocs {
  blocs: { bx: number; by: number; generes: [number, number][] }[];
  systemes: SystemeCarte[]; routes: RouteCarte[]; zones: ZoneCarte[];
}
export interface PanneauSysteme {
  nom: string; q: number; r: number; taille: number; couleur: string; notes: string;
  routes: { avec: { cle: string; nom: string }; longueur: number }[]; lien: string;
  /** Level `mj` only. */
  id?: number; secret?: boolean; promu?: boolean; version?: number;
}
export interface Resultat { cle: string; nom: string; q: number; r: number }
export type VueTrajet =
  | { trouve: false; libelle: string }
  | { trouve: true; etapes: Resultat[]; troncons: { depuis: string; vers: string; longueur: number; jours: number }[]; cases: number; jours: number; libelle: string };

/** What is selected on the map: a defined system by its key, or a generated hexagon. */
export type Selection =
  | { k: 'systeme'; cle: string; secret?: boolean }
  | { k: 'genere'; q: number; r: number }
  | { k: 'route'; id: number }
  | { k: 'zone'; cle: string };

/** A gesture of the GM on the map (E-21): what the next tap does. */
export type Geste =
  | { k: 'placer' }
  | { k: 'route'; depart: SystemeCarte | null }
  | { k: 'zone'; points: [number, number][] }
  | { k: 'deplacer'; cle: string };

/** What a tap on the map reports while a gesture is on. */
export type Touche =
  | { k: 'hex'; q: number; r: number; genere: boolean }
  | { k: 'systeme'; systeme: SystemeCarte };
