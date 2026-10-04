import { z } from 'zod';

import type { Db } from '../db/db.js';
import { exigerMJ, exigerRole, peutLireSection, vueMJ, vueSection } from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { lireLignes } from './pieces-jointes.js';
import {
  TYPES_FICHE,
  type Acteur,
  type Fiche,
  type FicheVue,
  type SectionRow,
  type TypeFiche,
} from './types.js';

export const LIMITE_LISTE = 100;

interface FicheRow {
  id: number;
  univers_id: number;
  type: TypeFiche;
  titre: string;
  charge: string;
  cree_le: string;
  modifie_le: string;
}

export const versFiche = (r: FicheRow): Fiche => ({
  id: r.id,
  universId: r.univers_id,
  type: r.type,
  titre: r.titre,
  charge: JSON.parse(r.charge) as Record<string, unknown>,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
});

/**
 * Versioned payload per type (AD-6, AD-17): v1 is empty except for a character
 * (PJ or PNJ) and a session report (its campaign). The content lives in sections.
 */
const CHARGES: Record<TypeFiche, z.ZodType<Record<string, unknown>>> = {
  personnage: z.strictObject({ v: z.literal(1), pj: z.boolean() }),
  compte_rendu: z.strictObject({ v: z.literal(1), campagne_id: z.number().int().positive() }),
  lieu: z.strictObject({ v: z.literal(1) }),
  faction: z.strictObject({ v: z.literal(1) }),
  objet: z.strictObject({ v: z.literal(1) }),
  evenement: z.strictObject({ v: z.literal(1) }),
  quete: z.strictObject({ v: z.literal(1) }),
};

export function validerTitre(titre: string, max: number, quoi: string): string {
  const t = titre.trim();
  if (t.length < 1 || t.length > max) throw invalide(`${quoi} : de 1 à ${max} caractères.`);
  return t;
}

/** The sheet row of this universe, or not found (a sheet of another universe does not exist here). */
export function chargerFiche(db: Db, universId: number, ficheId: number): FicheRow {
  const row = db
    .prepare('SELECT * FROM fiches WHERE id = ? AND univers_id = ?')
    .get(ficheId, universId) as FicheRow | undefined;
  if (!row) throw introuvable();
  return row;
}

function sectionsDe(db: Db, ficheId: number): SectionRow[] {
  return db
    .prepare('SELECT * FROM sections WHERE fiche_id = ? ORDER BY ordre')
    .all(ficheId) as SectionRow[];
}

/**
 * The GM creates a sheet of one of the seven types. No section yet: the GM
 * adds them. (A session report by any member, B-19, comes with kanevas-suivi,
 * which owns campaigns.)
 */
export function creerFiche(
  db: Db,
  compteId: number,
  universId: number,
  entree: { type: string; titre: string; charge?: Record<string, unknown> },
): Fiche {
  exigerMJ(db, universId, compteId);
  if (!(TYPES_FICHE as readonly string[]).includes(entree.type)) {
    throw invalide('Type de fiche inconnu.');
  }
  const type = entree.type as TypeFiche;
  const titre = validerTitre(entree.titre, 120, 'Le titre');
  const charge = CHARGES[type].safeParse({ v: 1, ...entree.charge });
  if (!charge.success) throw invalide('Charge utile invalide pour ce type de fiche.');
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(universId, type, titre, JSON.stringify(charge.data), now, now);
  return versFiche(chargerFiche(db, universId, Number(info.lastInsertRowid)));
}

/**
 * A sheet with only the sections the caller may read, no trace of the others
 * (B-9). A caller who reads none gets "not found", like an unknown id (AD-22);
 * the GM (outside player mode) reads even a sheet without section.
 */
export function lireFiche(db: Db, acteur: Acteur, universId: number, ficheId: number): FicheVue {
  const role = exigerRole(db, universId, acteur.compteId);
  const fiche = chargerFiche(db, universId, ficheId);
  const lisibles = sectionsDe(db, ficheId).filter((s) => peutLireSection(role, s, acteur));
  if (lisibles.length === 0 && (role !== 'mj' || acteur.modeJoueur)) throw introuvable();
  return {
    ...versFiche(fiche),
    sections: lisibles.map((s) => ({
      ...vueSection(role, s, acteur),
      piecesJointes: lireLignes(db, s.id, vueMJ(role, acteur)),
    })),
  };
}

export interface PageFiches {
  fiches: Fiche[];
  /** Opaque cursor for the next page, null at the end. */
  suivant: string | null;
}

/**
 * The sheets of a universe (optionally one type) the caller reads at least one
 * section of, by title without case, at most 100 per page (AD-22, B-11).
 */
export function listerFiches(
  db: Db,
  acteur: Acteur,
  universId: number,
  options: { type?: string; curseur?: string; limite?: number } = {},
): PageFiches {
  const role = exigerRole(db, universId, acteur.compteId);
  const limite = Math.min(Math.max(Math.trunc(options.limite ?? LIMITE_LISTE), 1), LIMITE_LISTE);
  const where = ['f.univers_id = ?'];
  const params: (string | number)[] = [universId];
  if (options.type !== undefined) {
    if (!(TYPES_FICHE as readonly string[]).includes(options.type)) {
      throw invalide('Type de fiche inconnu.');
    }
    where.push('f.type = ?');
    params.push(options.type);
  }
  if (role !== 'mj' || acteur.modeJoueur) {
    const auteur = acteur.modeJoueur ? null : acteur.compteId;
    where.push(
      `EXISTS (SELECT 1 FROM sections s WHERE s.fiche_id = f.id AND
         (s.joueurs_lisent = 1 OR (s.auteur_lit = 1 AND s.auteur_id = ?)))`,
    );
    params.push(auteur ?? -1);
  }
  if (options.curseur !== undefined) {
    let c: { t: string; i: number };
    try {
      c = JSON.parse(Buffer.from(options.curseur, 'base64url').toString('utf8'));
      if (typeof c.t !== 'string' || !Number.isInteger(c.i)) throw new Error();
    } catch {
      throw invalide('Curseur invalide.');
    }
    where.push('(f.titre COLLATE NOCASE > ? OR (f.titre COLLATE NOCASE = ? AND f.id > ?))');
    params.push(c.t, c.t, c.i);
  }
  const rows = db
    .prepare(
      `SELECT f.* FROM fiches f WHERE ${where.join(' AND ')}
       ORDER BY f.titre COLLATE NOCASE, f.id LIMIT ?`,
    )
    .all(...params, limite + 1) as FicheRow[];
  const page = rows.slice(0, limite);
  const dernier = page[page.length - 1];
  const suivant =
    rows.length > limite && dernier
      ? Buffer.from(JSON.stringify({ t: dernier.titre, i: dernier.id })).toString('base64url')
      : null;
  return { fiches: page.map(versFiche), suivant };
}
