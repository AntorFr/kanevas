export interface Reference { cle: string; nom: string; q: number; r: number }
export interface VueGalaxie {
  id: number; titre: string; visible?: boolean; version: number; niveau: 'mj' | 'joueur'; porteeSaut: number;
  reference: Reference | null;
}
export interface SystemeCarte { id: number; cle: string; nom: string; q: number; r: number; taille: number; couleur: string | null; classe?: string; secret?: boolean; version?: number }
export interface RouteCarte {
  id: number; depuis: { cle: string; q: number; r: number }; vers: { cle: string; q: number; r: number };
  longueur: number; publique?: boolean; version?: number; type_lien?: string;
}
export interface ZoneCarte { id: number; nom: string; contour: [number, number][]; couleur: string; secret?: boolean; cle?: string; version?: number; densite?: number | null;
  /** Set zone only (B-84): canonical ranges `[r, q0, q1]` and their hexagon count; `contour` is then empty. */
  plages?: [number, number, number][]; hexagones?: number }
export interface VueBlocs {
  blocs: { bx: number; by: number; generes: [number, number, number, string][] }[];
  systemes: SystemeCarte[]; routes: RouteCarte[]; zones: ZoneCarte[];
}
export interface PanneauSysteme {
  nom: string; q: number; r: number; taille: number; couleur: string | null; classe?: string; notes: string;
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

/** What `GET …/galaxies/:gid/interieur/:q/:r` returns (E-23); no key of a hidden thing is ever in it. */
export interface AstreSysteme {
  cle: string; genre: 'etoile' | 'planete' | 'lune' | 'comete'; parent_cle: string | null; etoile_rang: number; type: string;
  nom: string | null; orbite: number | null; heure: number; taille: number; aspect?: Record<string, unknown>;
  /** Plain text, when the answer carries one. */
  description?: string | null;
  /** The sheet the body is linked to, when the reader reads it (AD-liens-2); `null` or absent otherwise. */
  fiche?: FicheLiee | null;
  /** GM only. */
  version?: number;
}
export interface FicheLiee { id: number; titre: string }
export interface FormationSysteme { cle: string; forme: 'anneau' | 'nuage'; nom: string | null; parametres: Record<string, unknown>; etoile_rang: number; version?: number; fiche?: FicheLiee | null;
  /** Plain text, for the writing GM only. */
  description?: string }
/** A non-celestial element (B-96). On a body its place is the body's (`sur` is that body's `cle`); `reserve` and `version`: the writing GM only. */
export interface ElementSysteme {
  cle: string; genre: 'vaisseau' | 'ville' | 'station' | 'base' | 'autre'; nom: string; sur: string | null; orbite: number | null; heure: number;
  aspect: { icone: string; couleur: string }; fiche?: FicheLiee | null; description?: string;
  reserve?: boolean; version?: number;
}
export interface InterieurSysteme {
  q: number; r: number; nom: string | null; etat: 'tire' | 'defini'; transition?: number; astres: AstreSysteme[]; formations: FormationSysteme[];
  elements?: ElementSysteme[];
  /** The GM outside Player mode only (AD-edition-2): the write tokens. Absent for everyone else. */
  peutEcrire?: true; versionSysteme?: number;
}
/** An exit towards a neighbouring system (`…/interieur/:q/:r/sorties`); a hidden neighbour or a private route has no entry. */
export interface SortieSysteme { q: number; r: number; heure: number; nom: string | null; /** Length of the route to this neighbour. */ distance: number; /** Type of that route, `null` without one. */ type_lien: string | null }
