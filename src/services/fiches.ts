import { z } from 'zod';

import type { Db } from '../db/db.js';
import {
  exigerMJ,
  exigerRole,
  peutLireSection,
  sqlFicheLisible,
  sqlSectionLisible,
  vueMJ,
  vueSection,
} from './droits.js';
import { introuvable, invalide } from './erreurs.js';
import { mentionsDe } from './mentions.js';
import { lireLignes } from './pieces-jointes.js';
import {
  TYPES_FICHE,
  type Acteur,
  type Fiche,
  type FicheVue,
  type PageMentions,
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
  illustration_fichier: string | null;
  cle_origine: string | null;
}

export const versFiche = (r: FicheRow): Fiche => ({
  id: r.id,
  universId: r.univers_id,
  type: r.type,
  titre: r.titre,
  charge: JSON.parse(r.charge) as Record<string, unknown>,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
  illustration: r.illustration_fichier ? { jeton: r.illustration_fichier } : null,
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
  entree: {
    type: string;
    titre: string;
    charge?: Record<string, unknown>;
    /** Import only (B-50, AD-107): the origin key and dates of the sheet, and what the import wrote. */
    origine?: { cle: string; creeLe?: string; modifieLe?: string; dernierImport: unknown };
  },
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
  const o = entree.origine;
  const cree = o?.creeLe ?? now;
  const info = db
    .prepare(
      `INSERT INTO fiches (univers_id, type, titre, charge, cree_le, modifie_le, cle_origine, dernier_import)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      universId,
      type,
      titre,
      JSON.stringify(charge.data),
      cree,
      o?.modifieLe ?? (cree > now ? cree : now),
      o?.cle ?? null,
      o ? JSON.stringify(o.dernierImport) : null,
    );
  return versFiche(chargerFiche(db, universId, Number(info.lastInsertRowid)));
}

/** The GM renames a sheet (the screen to do it comes later; the import already needs it). */
export function renommerFiche(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  titre: string,
): Fiche {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  const t = validerTitre(titre, 120, 'Le titre');
  db.prepare('UPDATE fiches SET titre = ?, modifie_le = ? WHERE id = ?').run(
    t,
    new Date().toISOString(),
    ficheId,
  );
  return versFiche(chargerFiche(db, universId, ficheId));
}

/**
 * The GM changes the type of a sheet among the six writable ones, with the payload of the new
 * type (a character keeps or loses `pj`). A session report cannot be changed into or out of.
 */
export function changerTypeFiche(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  type: string,
  charge?: Record<string, unknown>,
): Fiche {
  exigerMJ(db, universId, compteId);
  const actuelle = chargerFiche(db, universId, ficheId);
  if (!(TYPES_FICHE as readonly string[]).includes(type) || type === 'compte_rendu' || actuelle.type === 'compte_rendu') {
    throw invalide('Type de fiche inconnu.');
  }
  const c = CHARGES[type as TypeFiche].safeParse({ v: 1, ...charge });
  if (!c.success) throw invalide('Charge utile invalide pour ce type de fiche.');
  db.prepare('UPDATE fiches SET type = ?, charge = ?, modifie_le = ? WHERE id = ?').run(
    type,
    JSON.stringify(c.data),
    new Date().toISOString(),
    ficheId,
  );
  return versFiche(chargerFiche(db, universId, ficheId));
}

/**
 * A sheet with only the sections the caller may read, no trace of the others
 * (B-9). A caller who reads none gets "not found", like an unknown id (AD-22);
 * the GM (outside player mode) reads even a sheet without section.
 */
export function lireFiche(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  formeLiens: 'html' | 'markdown' = 'html',
): FicheVue {
  const role = exigerRole(db, universId, acteur.compteId);
  const fiche = chargerFiche(db, universId, ficheId);
  const lisibles = sectionsDe(db, ficheId).filter((s) => peutLireSection(role, s, acteur));
  if (lisibles.length === 0 && (role !== 'mj' || acteur.modeJoueur)) throw introuvable();
  const mentions = mentionsDe(db, role, acteur, universId, ficheId);
  return {
    ...versFiche(fiche),
    mentions: mentions.mentions,
    mentionsSuite: mentions.suite,
    mentionsRestantes: mentions.restantes,
    // The origin key is a GM matter (B-50): a reader's answer has no such field at all.
    ...(vueMJ(role, acteur) && fiche.cle_origine ? { cleOrigine: fiche.cle_origine } : {}),
    sections: lisibles.map((s) => ({
      ...vueSection(db, universId, role, s, acteur, formeLiens),
      piecesJointes: lireLignes(db, s.id, vueMJ(role, acteur)),
    })),
  };
}

/**
 * The next sources of « Mentionnée dans » (AD-100): `apres` sources are already shown. Same refusal as
 * the sheet itself — a sheet the caller does not read does not exist.
 */
export function lireMentions(
  db: Db,
  acteur: Acteur,
  universId: number,
  ficheId: number,
  apres: number,
): PageMentions {
  const role = exigerRole(db, universId, acteur.compteId);
  chargerFiche(db, universId, ficheId);
  const lisible = sectionsDe(db, ficheId).some((s) => peutLireSection(role, s, acteur));
  if (!lisible && (role !== 'mj' || acteur.modeJoueur)) throw introuvable();
  return mentionsDe(db, role, acteur, universId, ficheId, apres);
}

export const LONGUEUR_RECHERCHE = 100;

/**
 * Turns a free search input into a safe FTS5 query (AD-63): every word is a
 * quoted prefix phrase (quotes doubled), words without any letter or digit are
 * dropped, NUL is a separator. Refuses an empty or over-long input; returns
 * null when no word is left (nothing can match).
 */
export function motsRecherche(saisie: string): string | null {
  const brut = saisie.replaceAll('\0', ' ').trim();
  if (brut.length < 1 || brut.length > LONGUEUR_RECHERCHE) {
    throw invalide(`La recherche : de 1 à ${LONGUEUR_RECHERCHE} caractères.`);
  }
  const mots = brut
    .split(/\s+/)
    .filter((m) => /[\p{L}\p{N}]/u.test(m))
    .map((m) => `"${m.replaceAll('"', '""')}"*`);
  return mots.length > 0 ? mots.join(' ') : null;
}

export interface PageFiches {
  fiches: Fiche[];
  /** Opaque cursor for the next page, null at the end. */
  suivant: string | null;
}

/**
 * The sheets of a universe (optionally one type) the caller reads at least one
 * section of, by title without case, at most 100 per page (AD-22, B-11).
 * With `recherche`, the same list plus one condition (AD-63): every word starts a
 * word of the title, or all of them a word of one section the caller reads.
 */
export function listerFiches(
  db: Db,
  acteur: Acteur,
  universId: number,
  options: { type?: string; curseur?: string; limite?: number; recherche?: string } = {},
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
  const lisible = sqlFicheLisible(role, acteur, 'f');
  if (lisible) {
    where.push(lisible.sql);
    params.push(...lisible.params);
  }
  if (options.recherche !== undefined) {
    const match = motsRecherche(options.recherche);
    if (match === null) return { fiches: [], suivant: null };
    const sectionLue = sqlSectionLisible(role, acteur, 's');
    where.push(
      `(f.id IN (SELECT rowid FROM recherche_fiches WHERE recherche_fiches MATCH ?)
        OR EXISTS (SELECT 1 FROM sections s WHERE s.fiche_id = f.id
          AND s.id IN (SELECT rowid FROM recherche_sections WHERE recherche_sections MATCH ?)
          ${sectionLue ? `AND ${sectionLue.sql}` : ''}))`,
    );
    // Column filter (AD-114): a non-GM, or the GM in player mode, searches the public text only.
    // The whole query goes between parentheses so the filter covers every word.
    const colonnes = role === 'mj' && !acteur.modeJoueur ? 'titre contenu' : 'titre contenu_public';
    params.push(match, `{${colonnes}} : (${match})`, ...(sectionLue?.params ?? []));
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
