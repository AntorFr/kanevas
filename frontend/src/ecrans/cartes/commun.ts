/** A map as the list route returns it (`CarteVue` of the server; `visible` only for the GM). */
export interface Carte {
  id: number;
  universId: number;
  titre: string;
  forme: 'illustree' | 'graphe';
  visible?: boolean;
  fond: boolean;
}

export interface PageCartes {
  cartes: Carte[];
  suivant: string | null;
}

export const FORMES: Record<Carte['forme'], string> = { illustree: 'Carte illustrée', graphe: 'Graphe' };

export const adresseCarte = (universId: number | string, carteId: number) => `/univers/${universId}/cartes/${carteId}`;
export const adresseFond = (universId: number | string, carteId: number) =>
  `/api/univers/${universId}/cartes/${carteId}/fond`;
