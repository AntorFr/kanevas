import { z } from 'zod';

/**
 * The single list of sheet types (AD-113 of the plan, numbered AD-120 in ARCHITECTURE.md).
 * No SQL, no service import: `TYPES_FICHE`, `TypeFiche` and the payload schemas are derived
 * from `TYPES`, so a type is added here and nowhere else on the server.
 */
export interface DefinitionType {
  /** Stored in `fiches.type`. */
  type: string;
  /** Plural of the address: `/univers/:id/fiches/<slug>`. */
  slug: string;
  singulier: string;
  pluriel: string;
  /** « Nouveau lieu ». */
  nouveau: string;
  /** « Aucun lieu ». */
  aucun: string;
  /** Lucide icon name (the frontend maps it to a component). */
  icone: string;
  /** False for the session report, which no setting turns off and no one changes into. */
  reglable: boolean;
  /** Versioned payload of the type (AD-6, AD-17). */
  charge: z.ZodType<Record<string, unknown>>;
}

const v1 = () => z.strictObject({ v: z.literal(1) });

const def = <T extends string>(d: Omit<DefinitionType, 'type'> & { type: T }) => d;

export const TYPES = [
  def({ type: 'personnage', slug: 'personnages', singulier: 'Personnage', pluriel: 'Personnages', nouveau: 'Nouveau personnage', aucun: 'Aucun personnage', icone: 'users-round', reglable: true, charge: z.strictObject({ v: z.literal(1), pj: z.boolean() }) }),
  def({ type: 'lieu', slug: 'lieux', singulier: 'Lieu', pluriel: 'Lieux', nouveau: 'Nouveau lieu', aucun: 'Aucun lieu', icone: 'map-pin', reglable: true, charge: v1() }),
  def({ type: 'faction', slug: 'factions', singulier: 'Faction', pluriel: 'Factions', nouveau: 'Nouvelle faction', aucun: 'Aucune faction', icone: 'shield', reglable: true, charge: v1() }),
  def({ type: 'objet', slug: 'objets', singulier: 'Objet', pluriel: 'Objets', nouveau: 'Nouvel objet', aucun: 'Aucun objet', icone: 'gem', reglable: true, charge: v1() }),
  def({ type: 'evenement', slug: 'evenements', singulier: 'Événement', pluriel: 'Événements', nouveau: 'Nouvel événement', aucun: 'Aucun événement', icone: 'hourglass', reglable: true, charge: v1() }),
  def({ type: 'quete', slug: 'quetes', singulier: 'Quête', pluriel: 'Quêtes', nouveau: 'Nouvelle quête', aucun: 'Aucune quête', icone: 'scroll-text', reglable: true, charge: v1() }),
  def({ type: 'creature', slug: 'creatures', singulier: 'Créature', pluriel: 'Créatures', nouveau: 'Nouvelle créature', aucun: 'Aucune créature', icone: 'paw-print', reglable: true, charge: v1() }),
  def({ type: 'race', slug: 'races', singulier: 'Race', pluriel: 'Races', nouveau: 'Nouvelle race', aucun: 'Aucune race', icone: 'dna', reglable: true, charge: v1() }),
  def({ type: 'vaisseau', slug: 'vaisseaux', singulier: 'Vaisseau', pluriel: 'Vaisseaux', nouveau: 'Nouveau vaisseau', aucun: 'Aucun vaisseau', icone: 'ship', reglable: true, charge: v1() }),
  def({ type: 'savoir', slug: 'savoirs', singulier: 'Savoir', pluriel: 'Savoirs', nouveau: 'Nouveau savoir', aucun: 'Aucun savoir', icone: 'lightbulb', reglable: true, charge: v1() }),
  def({ type: 'recit', slug: 'recits', singulier: 'Récit', pluriel: 'Récits', nouveau: 'Nouveau récit', aucun: 'Aucun récit', icone: 'book-open', reglable: true, charge: v1() }),
  def({ type: 'regle', slug: 'regles', singulier: 'Règle', pluriel: 'Règles', nouveau: 'Nouvelle règle', aucun: 'Aucune règle', icone: 'scale', reglable: true, charge: v1() }),
  def({ type: 'note', slug: 'notes', singulier: 'Note', pluriel: 'Notes', nouveau: 'Nouvelle note', aucun: 'Aucune note', icone: 'sticky-note', reglable: true, charge: v1() }),
  def({ type: 'compte_rendu', slug: 'comptes-rendus', singulier: 'Compte-rendu', pluriel: 'Comptes-rendus', nouveau: 'Nouveau compte-rendu', aucun: 'Aucun compte-rendu', icone: 'file-text', reglable: false, charge: z.strictObject({ v: z.literal(1), campagne_id: z.number().int().positive() }) }),
] as const;

export type TypeFiche = (typeof TYPES)[number]['type'];

export const TYPES_FICHE = TYPES.map((t) => t.type) as unknown as readonly [TypeFiche, ...TypeFiche[]];

export const estTypeFiche = (type: string): type is TypeFiche =>
  (TYPES_FICHE as readonly string[]).includes(type);

/** Payload schema per type, derived from the list. */
export const CHARGES = Object.fromEntries(TYPES.map((t) => [t.type, t.charge])) as Record<
  TypeFiche,
  z.ZodType<Record<string, unknown>>
>;
