import {
  Flag,
  KeyRound,
  LayoutGrid,
  Map as Carte,
  NotebookPen,
  Settings2,
  ShieldCheck,
  ContactRound,
  type LucideIcon,
} from 'lucide-react';

import type { Role } from './types';
import { iconeDeNom, type TypeVue } from './types-contexte';

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
  /** Only accounts whose `GET /api/moi` carries this group see it. */
  groupe?: string;
  /** Also shown, without its section heading, below « Mes univers » outside a universe. */
  horsUnivers?: boolean;
}

/** Authelia group carried by `GET /api/moi` that makes an instance admin (B-6). */
export const GROUPE_ADMIN = 'parents';

export const ITEMS_UNIVERS: Item[] = [
  { libelle: 'Vue d’ensemble', icone: LayoutGrid, chemin: (id) => `/univers/${id}` },
  { libelle: 'Campagnes', icone: Flag, chemin: (id) => `/univers/${id}/campagnes` },
  { libelle: 'Comptes-rendus', icone: NotebookPen, chemin: (id) => `/univers/${id}/comptes-rendus` },
  { libelle: 'Cartes', icone: Carte, chemin: (id) => `/univers/${id}/cartes` },
  { libelle: 'Membres', icone: ContactRound, section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/membres` },
  { libelle: 'Paramètres', icone: Settings2, section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/parametres` },
  { libelle: 'Accès par API', icone: KeyRound, section: 'Univers', role: 'mj', chemin: (id) => `/univers/${id}/acces-api` },
  // « Administration » (E-5): instance admins only, wherever the bar is.
  { libelle: 'Administration', icone: ShieldCheck, section: 'Instance', groupe: GROUPE_ADMIN, horsUnivers: true, chemin: () => '/administration' },
];

/**
 * The « Lore » items, built from the types the server sends (AD-120): the list is never copied here.
 * The bar passes the enabled types; the breadcrumb passes them all, since a disabled type's list still opens.
 */
export const itemsLore = (types: TypeVue[]): Item[] =>
  types.filter((t) => t.reglable).map((t) => ({
    // The compte-rendu is not a settable type: its fixed item « Comptes-rendus » already exists.
    libelle: t.pluriel,
    icone: iconeDeNom(t.icone),
    section: 'Lore',
    chemin: (id: number) => `/univers/${id}/fiches/${t.slug}`,
  }));
