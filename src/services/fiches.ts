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
import { ErreurService, introuvable, invalide } from './erreurs.js';
import { etiquetageDe } from './etiquettes.js';
import { mentionsDe } from './mentions.js';
import { lireLignes } from './pieces-jointes.js';
import { CHARGES, estTypeFiche, typeActif } from './types-fiche.js';
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
  sous_type: string | null;
}

export const versFiche = (r: FicheRow): Fiche => ({
  id: r.id,
  universId: r.univers_id,
  type: r.type,
  titre: r.titre,
  sousType: r.sous_type,
  charge: JSON.parse(r.charge) as Record<string, unknown>,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
  illustration: r.illustration_fichier ? { jeton: r.illustration_fichier } : null,
});

export const MAX_SOUS_TYPE = 60;

/** A sub-type: 1 to 60 characters once trimmed (`null` is "none", handled by the callers). */
export function validerSousType(valeur: unknown): string {
  if (typeof valeur !== 'string') throw invalide(`Le sous-type : de 1 à ${MAX_SOUS_TYPE} caractères.`);
  const t = valeur.trim();
  if (t.length < 1 || t.length > MAX_SOUS_TYPE) {
    throw invalide(`Le sous-type : de 1 à ${MAX_SOUS_TYPE} caractères.`);
  }
  return t;
}

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
    /** Optional free sub-type of the sheet (B-52); `null` or absent: none. */
    sousType?: string | null;
    /** Import only (B-50, AD-107): the origin key and dates of the sheet, and what the import wrote. */
    origine?: { cle: string; creeLe?: string; modifieLe?: string; dernierImport: unknown };
  },
): Fiche {
  exigerMJ(db, universId, compteId);
  if (!estTypeFiche(entree.type)) {
    throw invalide('Type de fiche inconnu.');
  }
  const type = entree.type as TypeFiche;
  // The import accepts a disabled type (the batch warns); every other creation refuses it (AD-102).
  if (!entree.origine && !typeActif(db, universId, type)) {
    throw new ErreurService('invalide', 'Ce type est désactivé dans cet univers.', 'type_desactive');
  }
  const titre = validerTitre(entree.titre, 120, 'Le titre');
  const sousType = entree.sousType == null ? null : validerSousType(entree.sousType);
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
  const id = Number(info.lastInsertRowid);
  // A separate write: a base short of 0013 (the migration test seeds one through the services) has no column.
  if (sousType !== null) db.prepare('UPDATE fiches SET sous_type = ? WHERE id = ?').run(sousType, id);
  return versFiche(chargerFiche(db, universId, id));
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

/** The GM sets, changes or removes (`null`) the sub-type of a sheet. Writes nothing else. */
export function changerSousType(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  sousType: unknown,
): Fiche {
  exigerMJ(db, universId, compteId);
  chargerFiche(db, universId, ficheId);
  const valeur = sousType === null ? null : validerSousType(sousType);
  db.prepare('UPDATE fiches SET sous_type = ?, modifie_le = ? WHERE id = ?').run(
    valeur,
    new Date().toISOString(),
    ficheId,
  );
  return versFiche(chargerFiche(db, universId, ficheId));
}

/**
 * The GM changes the type of a sheet among the thirteen settable ones (AD-120 (4)): the same row,
 * so id, sections, relations and map places stay. The payload becomes that of the new type (a
 * character takes `pj`, `false` by default) and the sub-type is cleared unless the caller gives a
 * new one. A disabled target type is allowed. A session report cannot be changed into or out of.
 * The same type is refused (`meme_type`) unless the caller gives a payload (the import flips `pj`).
 */
export function changerTypeFiche(
  db: Db,
  compteId: number,
  universId: number,
  ficheId: number,
  type: string,
  charge?: Record<string, unknown>,
  sousType?: string | null,
): Fiche {
  exigerMJ(db, universId, compteId);
  const actuelle = chargerFiche(db, universId, ficheId);
  if (!estTypeFiche(type)) throw new ErreurService('invalide', 'Type de fiche inconnu.', 'type_inconnu');
  if (type === 'compte_rendu' || actuelle.type === 'compte_rendu') {
    throw new ErreurService('invalide', 'Ce type ne se change pas.', 'type_non_reglable');
  }
  if (type === actuelle.type && charge === undefined) {
    throw new ErreurService('invalide', 'La fiche est déjà de ce type.', 'meme_type');
  }
  const voulu = sousType == null ? null : validerSousType(sousType);
  const base = type === 'personnage' ? { pj: false } : {};
  const c = CHARGES[type].safeParse({ v: 1, ...base, ...charge });
  if (!c.success) throw invalide('Charge utile invalide pour ce type de fiche.');
  const garde = type === actuelle.type ? actuelle.sous_type : null;
  db.prepare('UPDATE fiches SET type = ?, charge = ?, sous_type = ?, modifie_le = ? WHERE id = ?').run(
    type,
    JSON.stringify(c.data),
    voulu ?? garde,
    new Date().toISOString(),
    ficheId,
  );
  return versFiche(chargerFiche(db, universId, ficheId));
}

export interface SousTypeVu {
  sousType: string;
  nb: number;
}

const sansCasse = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * The sub-types of the sheets the caller reads (optionally of one type), grouped without case
 * (SQLite NOCASE), with their count. The spelling shown is the most used, the oldest on a tie.
 * Any member; a sheet the caller does not read is neither counted nor spelled.
 */
export function listerSousTypes(
  db: Db,
  acteur: Acteur,
  universId: number,
  options: { type?: string } = {},
): SousTypeVu[] {
  const role = exigerRole(db, universId, acteur.compteId);
  const where = ['f.univers_id = ?', 'f.sous_type IS NOT NULL'];
  const params: (string | number)[] = [universId];
  if (options.type !== undefined) {
    if (!estTypeFiche(options.type)) throw invalide('Type de fiche inconnu.');
    where.push('f.type = ?');
    params.push(options.type);
  }
  const lisible = sqlFicheLisible(role, acteur, 'f');
  if (lisible) {
    where.push(lisible.sql);
    params.push(...lisible.params);
  }
  const lignes = db
    .prepare(
      `SELECT f.sous_type AS nom, COUNT(*) AS n, MIN(f.id) AS premier FROM fiches f
       WHERE ${where.join(' AND ')} GROUP BY f.sous_type`,
    )
    .all(...params) as { nom: string; n: number; premier: number }[];
  const groupes = new Map<string, { nom: string; n: number; max: number; premier: number; total: number }>();
  for (const l of lignes) {
    const cle = sansCasse(l.nom);
    const g = groupes.get(cle);
    if (!g) groupes.set(cle, { nom: l.nom, n: l.n, max: l.n, premier: l.premier, total: l.n });
    else {
      g.total += l.n;
      if (l.n > g.max || (l.n === g.max && l.premier < g.premier)) {
        g.nom = l.nom;
        g.max = l.n;
        g.premier = l.premier;
      }
    }
  }
  return [...groupes.values()]
    .map((g) => ({ sousType: g.nom, nb: g.total }))
    .sort((a, b) => sansCasse(a.sousType).localeCompare(sansCasse(b.sousType)));
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
    ...etiquetageDe(db, ficheId),
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
 * word of the title, of an alias or of the sub-type, or all of them a word of one section the caller reads.
 * `etiquette` is one more optional condition (AD-118). Each sheet carries its `alias` and `etiquettes`,
 * and, with `recherche`, the `aliasTrouve` when only an alias answers the title.
 */
export function listerFiches(
  db: Db,
  acteur: Acteur,
  universId: number,
  options: {
    type?: string;
    sousType?: string;
    etiquette?: string;
    curseur?: string;
    limite?: number;
    recherche?: string;
  } = {},
): PageFiches {
  const role = exigerRole(db, universId, acteur.compteId);
  const limite = Math.min(Math.max(Math.trunc(options.limite ?? LIMITE_LISTE), 1), LIMITE_LISTE);
  const where = ['f.univers_id = ?'];
  const params: (string | number)[] = [universId];
  if (options.type !== undefined) {
    if (!estTypeFiche(options.type)) {
      throw invalide('Type de fiche inconnu.');
    }
    where.push('f.type = ?');
    params.push(options.type);
  }
  if (options.sousType !== undefined) {
    where.push('f.sous_type = ? COLLATE NOCASE');
    params.push(options.sousType);
  }
  if (options.etiquette !== undefined) {
    // A label is compared exactly, never through FTS (AD-118 (2)); it only narrows the read filter.
    where.push(
      `EXISTS (SELECT 1 FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id
        WHERE fe.fiche_id = f.id AND e.nom = ? COLLATE NOCASE)`,
    );
    params.push(options.etiquette.trim());
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
  const mots = options.recherche === undefined ? null : motsDe(options.recherche);
  return {
    fiches: page.map((r) => {
      const e = etiquetageDe(db, r.id);
      const f: Fiche = { ...versFiche(r), alias: e.alias, etiquettes: e.etiquettes };
      if (mots !== null) {
        const trouve = mots.length > 0 && !repond(r.titre, mots) ? e.alias.find((a) => repond(a, mots)) : undefined;
        if (trouve !== undefined) f.aliasTrouve = trouve;
      }
      return f;
    }),
    suivant,
  };
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const jetons = (s: string) => sansAccents(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t !== '');

/** The search words as tokens (as the index cuts them), accents and case ignored. */
const motsDe = (saisie: string): string[] => jetons(saisie.replaceAll('\0', ' '));

/** Every search token starts a token of the text. */
const repond = (texte: string, mots: string[]): boolean => {
  const t = jetons(texte);
  return mots.every((m) => t.some((j) => j.startsWith(m)));
};
