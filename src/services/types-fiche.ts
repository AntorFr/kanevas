import { z } from 'zod';

import type { Db } from '../db/db.js';
import { exigerMJ, exigerRole } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';

/**
 * The single list of sheet types (AD-113 of the plan, numbered AD-120 in ARCHITECTURE.md).
 * `TYPES_FICHE`, `TypeFiche` and the payload schemas are derived from `TYPES`, so a type is
 * added here and nowhere else on the server. Below the list: the one computation of "type
 * enabled" (AD-102) and the two settings that write `types_systeme` / `types_univers`.
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

export const STATUT_AVENTURE = z.enum(['en_preparation', 'prete', 'en_cours', 'terminee']);

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
  def({ type: 'aventure', slug: 'aventures', singulier: 'Aventure', pluriel: 'Aventures', nouveau: 'Nouvelle aventure', aucun: 'Aucune aventure', icone: 'flag', reglable: true, charge: z.strictObject({ v: z.literal(1), statut: STATUT_AVENTURE.default('en_preparation') }) }),
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

export type OrigineType = 'univers' | 'systeme' | 'defaut';

export interface TypeVue {
  type: TypeFiche;
  slug: string;
  singulier: string;
  pluriel: string;
  nouveau: string;
  aucun: string;
  icone: string;
  reglable: boolean;
  active: boolean;
  /** Who decided: the universe's forcing, its system's setting, or the product default. */
  origine: OrigineType;
  /** The universe's own forcing, `null` when it follows its system. */
  forcage: 'active' | 'desactive' | null;
  /** GM only: the system's own setting (`null` without a system or without a line for the type). */
  systeme?: boolean | null;
  /** GM only: every sheet of the type, since the GM reads them all. */
  nbFiches?: number;
}

export type EtatType = 'active' | 'desactive' | 'suivre';

function systemeDe(db: Db, universId: number): number | null {
  const r = db.prepare('SELECT systeme_id FROM univers WHERE id = ?').get(universId) as
    | { systeme_id: number | null }
    | undefined;
  return r?.systeme_id ?? null;
}

interface Decision {
  active: boolean;
  origine: OrigineType;
  forcage: 'active' | 'desactive' | null;
  systeme: boolean | null;
}

/** A base migrated short of 0013 (the migration test seeds one through the services) has no setting yet. */
const sansReglages = (db: Db) =>
  !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'types_univers'").get();

function decisions(db: Db, universId: number): Map<string, Decision> {
  if (sansReglages(db)) {
    return new Map(
      TYPES.map((t) => [t.type, { active: true, origine: 'defaut', forcage: null, systeme: null } as Decision]),
    );
  }
  const sid = systemeDe(db, universId);
  const univers = new Map(
    (db.prepare('SELECT type, active FROM types_univers WHERE univers_id = ?').all(universId) as {
      type: string;
      active: number;
    }[]).map((r) => [r.type, r.active === 1]),
  );
  const systeme = new Map(
    sid === null
      ? []
      : (db.prepare('SELECT type, active FROM types_systeme WHERE systeme_id = ?').all(sid) as {
          type: string;
          active: number;
        }[]).map((r) => [r.type, r.active === 1]),
  );
  const out = new Map<string, Decision>();
  for (const t of TYPES) {
    const u = univers.get(t.type);
    const s = systeme.get(t.type);
    const base = { forcage: null, systeme: s ?? null } as const;
    if (!t.reglable) out.set(t.type, { ...base, active: true, origine: 'defaut' });
    else if (u !== undefined)
      out.set(t.type, { active: u, origine: 'univers', forcage: u ? 'active' : 'desactive', systeme: s ?? null });
    else if (s !== undefined) out.set(t.type, { ...base, active: s, origine: 'systeme' });
    else out.set(t.type, { ...base, active: true, origine: 'defaut' });
  }
  return out;
}

/** The single "effective(universe, type)" of AD-102: forcing, else system, else enabled. */
export function typeActif(db: Db, universId: number, type: string): boolean {
  return decisions(db, universId).get(type)?.active ?? false;
}

/** The list read for a universe, in list order, `compte_rendu` included. Any member; the GM also gets counts. */
export function typesDeLUnivers(db: Db, compteId: number, universId: number): TypeVue[] {
  const role = exigerRole(db, universId, compteId);
  const d = decisions(db, universId);
  const comptes =
    role === 'mj'
      ? new Map(
          (db.prepare('SELECT type, COUNT(*) AS n FROM fiches WHERE univers_id = ? GROUP BY type').all(universId) as {
            type: string;
            n: number;
          }[]).map((r) => [r.type, r.n]),
        )
      : null;
  return TYPES.map((t) => {
    const x = d.get(t.type)!;
    const vue: TypeVue = {
      type: t.type,
      slug: t.slug,
      singulier: t.singulier,
      pluriel: t.pluriel,
      nouveau: t.nouveau,
      aucun: t.aucun,
      icone: t.icone,
      reglable: t.reglable,
      active: x.active,
      origine: x.origine,
      forcage: x.forcage,
    };
    if (comptes) {
      vue.systeme = x.systeme;
      vue.nbFiches = comptes.get(t.type) ?? 0;
    }
    return vue;
  });
}

/** The row of one type after a setting, same shape as the list. */
export function typeDeLUnivers(db: Db, compteId: number, universId: number, type: string): TypeVue {
  return typesDeLUnivers(db, compteId, universId).find((t) => t.type === type)!;
}

function typeReglable(type: string): void {
  const def = TYPES.find((t) => t.type === type);
  if (!def) throw new ErreurService('invalide', 'Type de fiche inconnu.', 'type_inconnu');
  if (!def.reglable) throw new ErreurService('invalide', 'Ce type ne se règle pas.', 'type_non_reglable');
}


/** The GM of the universe turns a type on, off, or back to « follow the system » (deletes the forcing). */
export function reglerTypeUnivers(
  db: Db,
  compteId: number,
  universId: number,
  type: string,
  etat: string,
): TypeVue {
  exigerMJ(db, universId, compteId);
  typeReglable(type);
  if (etat !== 'active' && etat !== 'desactive' && etat !== 'suivre') throw invalide('État inconnu.');
  if (etat === 'suivre') {
    db.prepare('DELETE FROM types_univers WHERE univers_id = ? AND type = ?').run(universId, type);
  } else {
    db.prepare(
      `INSERT INTO types_univers (univers_id, type, active) VALUES (?, ?, ?)
       ON CONFLICT (univers_id, type) DO UPDATE SET active = excluded.active`,
    ).run(universId, type, etat === 'active' ? 1 : 0);
  }
  return typeDeLUnivers(db, compteId, universId, type);
}

/** Types of a system as the system sets them (default enabled), reglable types only. */
export function typesDuSysteme(db: Db, systemeId: number): { type: TypeFiche; active: boolean }[] {
  const lignes = new Map(
    (db.prepare('SELECT type, active FROM types_systeme WHERE systeme_id = ?').all(systemeId) as {
      type: string;
      active: number;
    }[]).map((r) => [r.type, r.active === 1]),
  );
  return TYPES.filter((t) => t.reglable).map((t) => ({ type: t.type, active: lignes.get(t.type) ?? true }));
}

/**
 * Sets a type for a system. Same right as its templates (AD-94): GM of at least one attached
 * universe; a system none of the caller's universes uses → not found, reader only → refused.
 */
export function reglerTypeSysteme(
  db: Db,
  compteId: number,
  systemeId: number,
  type: string,
  active: unknown,
): { type: string; active: boolean } {
  const roles = db
    .prepare(
      `SELECT m.role FROM univers u JOIN membres m ON m.univers_id = u.id
       WHERE u.systeme_id = ? AND m.compte_id = ?`,
    )
    .all(systemeId, compteId) as { role: string }[];
  if (roles.length === 0) throw introuvable();
  if (!roles.some((r) => r.role === 'mj')) throw refuse();
  typeReglable(type);
  if (typeof active !== 'boolean') throw invalide('État inconnu.');
  db.prepare(
    `INSERT INTO types_systeme (systeme_id, type, active) VALUES (?, ?, ?)
     ON CONFLICT (systeme_id, type) DO UPDATE SET active = excluded.active`,
  ).run(systemeId, type, active ? 1 : 0);
  return { type, active };
}
