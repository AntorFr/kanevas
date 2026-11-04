/** A map as the list route returns it (`CarteVue` of the server; `visible` only for the GM). */
export interface Carte {
  id: number;
  universId: number;
  titre: string;
  forme: 'illustree' | 'graphe';
  visible?: boolean;
  fond: boolean;
}

/** A map that belongs to a tool (E-10, G-8): listed after the illustrated maps, opened at its own address. */
export interface CarteOutil {
  type: 'outil';
  id: number;
  universId: number;
  titre: string;
  module: string;
  outil: { module: string; outil: string };
  adresse: string;
  visible?: boolean;
  /** Token of the map's own row, to change its visibility (GM only). */
  version?: number;
}

export const estCarteOutil = (c: Carte | CarteOutil): c is CarteOutil => 'type' in c && c.type === 'outil';

export interface PageCartes {
  cartes: (Carte | CarteOutil)[];
  suivant: string | null;
  /** « Nouvelle carte » forms of the tools (GM outside Player mode only; first page). */
  formes?: { module: string; outil: string; libelle: string }[];
}

export const FORMES: Record<Carte['forme'], string> = { illustree: 'Carte illustrée', graphe: 'Graphe' };

export const adresseCarte = (universId: number | string, carteId: number) => `/univers/${universId}/cartes/${carteId}`;
export const adresseFond = (universId: number | string, carteId: number) =>
  `/api/univers/${universId}/cartes/${carteId}/fond`;
