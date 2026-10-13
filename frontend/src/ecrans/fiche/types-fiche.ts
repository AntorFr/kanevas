import { FileText, Gem, Hourglass, MapPin, ScrollText, Shield, UsersRound, type LucideIcon } from 'lucide-react';

/** The six lore types reachable from the sidebar (the session report has its own screen, E-13). */
export interface TypeLore {
  slug: string;
  type: string;
  label: string;
  /** Page heading. */
  pluriel: string;
  /** « Aucun personnage » … */
  aucun: string;
  nouveau: string;
}

export const TYPES_LORE: TypeLore[] = [
  { slug: 'personnages', pluriel: 'Personnages', type: 'personnage', label: 'Personnage', aucun: 'Aucun personnage', nouveau: 'Nouveau personnage' },
  { slug: 'lieux', pluriel: 'Lieux', type: 'lieu', label: 'Lieu', aucun: 'Aucun lieu', nouveau: 'Nouveau lieu' },
  { slug: 'factions', pluriel: 'Factions', type: 'faction', label: 'Faction', aucun: 'Aucune faction', nouveau: 'Nouvelle faction' },
  { slug: 'objets', pluriel: 'Objets', type: 'objet', label: 'Objet', aucun: 'Aucun objet', nouveau: 'Nouvel objet' },
  { slug: 'evenements', pluriel: 'Événements', type: 'evenement', label: 'Événement', aucun: 'Aucun événement', nouveau: 'Nouvel événement' },
  { slug: 'quetes', pluriel: 'Quêtes', type: 'quete', label: 'Quête', aucun: 'Aucune quête', nouveau: 'Nouvelle quête' },
];

export const typeParSlug = (slug: string | undefined) => TYPES_LORE.find((t) => t.slug === slug);
export const typeParType = (type: string) => TYPES_LORE.find((t) => t.type === type);

/** The badge of a sheet: PJ or PNJ for a character, the type otherwise. */
export function badgeFiche(f: { type: string; charge: { pj?: boolean } }): string {
  if (f.type === 'personnage') return f.charge.pj ? 'PJ' : 'PNJ';
  return typeParType(f.type)?.label ?? f.type;
}

const ICONES: Record<string, LucideIcon> = {
  personnage: UsersRound,
  lieu: MapPin,
  faction: Shield,
  objet: Gem,
  evenement: Hourglass,
  quete: ScrollText,
};

/** The icon of a sheet type, the same as its sidebar item. */
export const iconeDuType = (type: string): LucideIcon => ICONES[type] ?? FileText;
