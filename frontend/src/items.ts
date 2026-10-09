import {
  Flag,
  Gem,
  Hourglass,
  LayoutGrid,
  Map as Carte,
  MapPin,
  NotebookPen,
  ScrollText,
  Settings2,
  Shield,
  ContactRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

import type { Role } from './types';

/**
 * The sidebar's items (docs/ecrans.md, « Barre latérale »). They live here, not in the bar: an item
 * shows only when a registered screen answers its address, so a screen not built yet
 * has no entry in the bar until it is registered. `chemin(id)` is the concrete address.
 */
export interface Item {
  libelle: string;
  icone: LucideIcon;
  chemin: (universId: number) => string;
  /** Section heading in the bar; items with the same one are grouped. */
  section?: string;
  /** Only this role sees it. */
  role?: Role;
}

export const ITEMS_UNIVERS: Item[] = [
  { libelle: 'Vue d’ensemble', icone: LayoutGrid, chemin: (id) => `/univers/${id}` },
  { libelle: 'Campagnes', icone: Flag, chemin: (id) => `/univers/${id}/campagnes` },
  { libelle: 'Comptes-rendus', icone: NotebookPen, chemin: (id) => `/univers/${id}/comptes-rendus` },
  { libelle: 'Cartes', icone: Carte, chemin: (id) => `/univers/${id}/cartes` },
  { libelle: 'Personnages', icone: UsersRound, section: 'Lore', chemin: (id) => `/univers/${id}/fiches/personnages` },
  { libelle: 'Lieux', icone: MapPin, section: 'Lore', chemin: (id) => `/univers/${id}/fiches/lieux` },
  { libelle: 'Factions', icone: Shield, section: 'Lore', chemin: (id) => `/univers/${id}/fiches/factions` },
  { libelle: 'Objets', icone: Gem, section: 'Lore', chemin: (id) => `/univers/${id}/fiches/objets` },
  { libelle: 'Événements', icone: Hourglass, section: 'Lore', chemin: (id) => `/univers/${id}/fiches/evenements` },
  { libelle: 'Quêtes', icone: ScrollText, section: 'Lore', chemin: (id) => `/univers/${id}/fiches/quetes` },
  { libelle: 'Membres', icone: ContactRound, section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/membres` },
  { libelle: 'Paramètres', icone: Settings2, section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/parametres` },
];
