// The map document as the core writes it (AD-154). Types only: every rule (limits, positions) is the core's.
export type TypeCalque = 'sol' | 'mur' | 'objet';
export type Cote = 'h' | 'v';

export interface Calque { id: string; nom: string; type: TypeCalque; visible: boolean; verrouille: boolean; mj_seul: boolean }
export interface Sol { calque: string; x: number; y: number; asset_id: string }
export interface Mur { calque: string; x: number; y: number; cote: Cote; asset_id: string; porte?: boolean }
export interface Element {
  id: string; calque: string; asset_id: string; x: number; y: number;
  rotation?: number; miroir?: boolean; echelle?: number; fiche_id?: string;
}
export interface Document {
  schema: number; largeur: number; hauteur: number;
  calques: Calque[]; sols: Sol[]; murs: Mur[]; elements: Element[];
}

export interface Cellule { x: number; y: number }
export interface Segment { x: number; y: number; cote: Cote }

/** A command of the core's closed list (AD-battlemap-editeur-3); the editor builds only the ones of its tools. */
export type Commande = { type: string; [champ: string]: unknown };

/** What `GET /cartes/:cid` answers. */
export interface CarteLue {
  id: number; titre: string; visible?: boolean; largeur: number; hauteur: number; tailleCase: number;
  document: Document; version: number; peutEcrire: boolean;
}

/** An asset of the library as the panel and the canvas need it. */
export interface AssetCarte {
  id: number; fichierId: number; nom: string; categorie: string; largeur: number | null; hauteur: number | null;
  vueDessus: boolean; etat: string; visible: boolean; jeton: string; tags: string[];
}
