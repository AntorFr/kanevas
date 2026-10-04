import type { Role } from './types';

/**
 * The sidebar's items (docs/ecrans.md, « Barre latérale »). They are fixed here and never edited
 * by a screen task: an item shows only when a registered screen answers its address, so an
 * unbuilt screen (Campagnes, Cartes…) has no entry in the bar. `chemin(id)` is the concrete address.
 */
export interface Item {
  libelle: string;
  chemin: (universId: number) => string;
  /** Section heading in the bar; items with the same one are grouped. */
  section?: string;
  /** Only this role sees it. */
  role?: Role;
  /** Only accounts whose `GET /api/moi` carries this group see it. */
  groupe?: string;
  /** Also shown, without its section heading, below « Mes univers » outside a universe. */
  horsUnivers?: boolean;
}

/** Authelia group carried by `GET /api/moi` that makes an instance admin (B-6). */
export const GROUPE_ADMIN = 'parents';

export const ITEMS_UNIVERS: Item[] = [
  { libelle: 'Vue d’ensemble', chemin: (id) => `/univers/${id}` },
  { libelle: 'Campagnes', chemin: (id) => `/univers/${id}/campagnes` },
  { libelle: 'Comptes-rendus', chemin: (id) => `/univers/${id}/comptes-rendus` },
  { libelle: 'Cartes', chemin: (id) => `/univers/${id}/cartes` },
  { libelle: 'Personnages', section: 'Lore', chemin: (id) => `/univers/${id}/fiches/personnages` },
  { libelle: 'Lieux', section: 'Lore', chemin: (id) => `/univers/${id}/fiches/lieux` },
  { libelle: 'Factions', section: 'Lore', chemin: (id) => `/univers/${id}/fiches/factions` },
  { libelle: 'Objets', section: 'Lore', chemin: (id) => `/univers/${id}/fiches/objets` },
  { libelle: 'Événements', section: 'Lore', chemin: (id) => `/univers/${id}/fiches/evenements` },
  { libelle: 'Quêtes', section: 'Lore', chemin: (id) => `/univers/${id}/fiches/quetes` },
  { libelle: 'Membres', section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/membres` },
  { libelle: 'Paramètres', section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/parametres` },
  // « Administration » (E-5): instance admins only, wherever the bar is.
  { libelle: 'Administration', section: 'Instance', groupe: GROUPE_ADMIN, horsUnivers: true, chemin: () => '/administration' },
];
