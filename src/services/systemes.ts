import type { Db } from '../db/db.js';
import { exigerMJ, roleDe } from './droits.js';
import { ErreurService, introuvable, invalide, refuse } from './erreurs.js';
import { LIMITE_LISTE } from './fiches.js';
import type { Role } from './types.js';

export const TYPES_GABARIT = ['regle', 'creature', 'objet'] as const;
export type TypeGabarit = (typeof TYPES_GABARIT)[number];

export interface SystemeCatalogue {
  id: number;
  nom: string;
}

/** What a member of an attached universe learns: never another universe's name or id (AD-84). */
export interface SystemeVue {
  id: number;
  nom: string;
  universUtilisateurs: number;
  /** Whether the caller (GM of the passing universe) may write templates. */
  peutEcrire: boolean;
}

export interface Gabarit {
  id: number;
  systemeId: number;
  type: TypeGabarit;
  nom: string;
  contenu: string;
  version: number;
  creeLe: string;
  modifieLe: string;
}

interface GabaritRow {
  id: number;
  systeme_id: number;
  type: TypeGabarit;
  nom: string;
  contenu: string;
  version: number;
  cree_le: string;
  modifie_le: string;
}

const versGabarit = (r: GabaritRow): Gabarit => ({
  id: r.id,
  systemeId: r.systeme_id,
  type: r.type,
  nom: r.nom,
  contenu: r.contenu,
  version: r.version,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
});

const nomPris = () => new ErreurService('conflit', 'Un système porte déjà ce nom.', 'nom_pris');
const gabaritPris = (type: TypeGabarit) =>
  new ErreurService(
    'conflit',
    `${{ regle: 'Une règle', creature: 'Une créature', objet: 'Un objet' }[type]} porte déjà ce nom.`,
    'nom_pris',
  );

function validerNomSysteme(nom: string): string {
  const n = nom.trim();
  if (n.length < 1 || n.length > 80) throw invalide('Le nom doit faire de 1 à 80 caractères.');
  return n;
}

function estMJQuelquePart(db: Db, compteId: number): boolean {
  return !!db.prepare("SELECT 1 FROM membres WHERE compte_id = ? AND role = 'mj' LIMIT 1").get(compteId);
}

/** Inserts a system; the NOCASE unique index is the final arbiter of "name taken". */
function insererSysteme(db: Db, nom: string): SystemeCatalogue {
  const pris = db.prepare('SELECT 1 FROM systemes_jeu WHERE nom = ?').get(nom);
  if (pris) throw nomPris();
  const info = db
    .prepare('INSERT INTO systemes_jeu (nom, cree_le) VALUES (?, ?)')
    .run(nom, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), nom };
}

/** The catalogue (id, name only), for an account that is GM of at least one universe (AD-25). */
export function listerSystemes(db: Db, compteId: number): SystemeCatalogue[] {
  if (!estMJQuelquePart(db, compteId)) throw refuse();
  return db
    .prepare('SELECT id, nom FROM systemes_jeu ORDER BY nom COLLATE NOCASE, id')
    .all() as SystemeCatalogue[];
}

/** Any GM of any universe creates a system, detached. A taken name (case ignored) is a conflict `nom_pris`. */
export function creerSysteme(db: Db, compteId: number, entree: { nom: string }): SystemeCatalogue {
  if (!estMJQuelquePart(db, compteId)) throw refuse();
  const nom = validerNomSysteme(entree.nom);
  return db.transaction(() => insererSysteme(db, nom))();
}

/** Attaches the universe to a system, or detaches it with `null`. GM only; unknown system → invalid. */
export function rattacherSysteme(
  db: Db,
  compteId: number,
  universId: number,
  systemeId: number | null,
): void {
  exigerMJ(db, universId, compteId);
  if (systemeId !== null) {
    const ok = db.prepare('SELECT 1 FROM systemes_jeu WHERE id = ?').get(systemeId);
    if (!ok) throw invalide('Système inconnu.');
  }
  db.prepare('UPDATE univers SET systeme_id = ? WHERE id = ?').run(systemeId, universId);
}

/** Creates the system and attaches the universe in one transaction: a taken name does neither. */
export function creerEtRattacherSysteme(
  db: Db,
  compteId: number,
  universId: number,
  entree: { nom: string },
): SystemeCatalogue {
  exigerMJ(db, universId, compteId);
  const nom = validerNomSysteme(entree.nom);
  return db.transaction(() => {
    const s = insererSysteme(db, nom);
    db.prepare('UPDATE univers SET systeme_id = ? WHERE id = ?').run(s.id, universId);
    return s;
  })();
}

/**
 * The system of a universe the caller is a member of. No role, or a universe
 * without system: "not found", identical to an unknown id (AD-22, AD-83).
 */
function systemeDe(db: Db, compteId: number, universId: number): { systemeId: number; role: Role } {
  const role = roleDe(db, universId, compteId);
  if (!role) throw introuvable();
  const row = db.prepare('SELECT systeme_id FROM univers WHERE id = ?').get(universId) as
    | { systeme_id: number | null }
    | undefined;
  if (!row || row.systeme_id === null) throw introuvable();
  return { systemeId: row.systeme_id, role };
}

/** The system seen from a universe: its name and the number of universes using it, nothing else (AD-84). */
export function lireSysteme(db: Db, compteId: number, universId: number): SystemeVue {
  const { systemeId, role } = systemeDe(db, compteId, universId);
  const s = db.prepare('SELECT id, nom FROM systemes_jeu WHERE id = ?').get(systemeId) as SystemeCatalogue;
  const n = db.prepare('SELECT COUNT(*) AS n FROM univers WHERE systeme_id = ?').get(systemeId) as {
    n: number;
  };
  return { id: s.id, nom: s.nom, universUtilisateurs: n.n, peutEcrire: role === 'mj' };
}

export interface PageGabarits {
  gabarits: Gabarit[];
  suivant: string | null;
}

/** Templates of one type, by name without case, 100 per page with an opaque cursor; any member reads. */
export function listerGabarits(
  db: Db,
  compteId: number,
  universId: number,
  options: { type: string; curseur?: string; limite?: number },
): PageGabarits {
  const { systemeId } = systemeDe(db, compteId, universId);
  if (!(TYPES_GABARIT as readonly string[]).includes(options.type)) {
    throw invalide('Type de gabarit inconnu.');
  }
  const limite = Math.min(Math.max(Math.trunc(options.limite ?? LIMITE_LISTE), 1), LIMITE_LISTE);
  const where = ['systeme_id = ?', 'type = ?'];
  const params: (string | number)[] = [systemeId, options.type];
  if (options.curseur !== undefined) {
    let c: { t: string; i: number };
    try {
      c = JSON.parse(Buffer.from(options.curseur, 'base64url').toString('utf8'));
      if (typeof c.t !== 'string' || !Number.isInteger(c.i)) throw new Error();
    } catch {
      throw invalide('Curseur invalide.');
    }
    where.push('(nom COLLATE NOCASE > ? OR (nom COLLATE NOCASE = ? AND id > ?))');
    params.push(c.t, c.t, c.i);
  }
  const rows = db
    .prepare(`SELECT * FROM gabarits WHERE ${where.join(' AND ')} ORDER BY nom COLLATE NOCASE, id LIMIT ?`)
    .all(...params, limite + 1) as GabaritRow[];
  const page = rows.slice(0, limite);
  const dernier = page[page.length - 1];
  const suivant =
    rows.length > limite && dernier
      ? Buffer.from(JSON.stringify({ t: dernier.nom, i: dernier.id })).toString('base64url')
      : null;
  return { gabarits: page.map(versGabarit), suivant };
}

function validerGabarit(nom: string, contenu: string): string {
  const n = nom.trim();
  if (n.length < 1 || n.length > 120) throw invalide('Le nom doit faire de 1 à 120 caractères.');
  if (contenu.length > 20000) throw invalide('Le contenu doit faire 20 000 caractères au plus.');
  return n;
}

/** Write access: member of the passing universe, GM, universe attached. Player → refused. */
function exigerEcritureGabarits(db: Db, compteId: number, universId: number): number {
  const { systemeId, role } = systemeDe(db, compteId, universId);
  if (role !== 'mj') throw refuse();
  return systemeId;
}

/** The GM of an attached universe adds a template; its type is fixed from now on. Version starts at 1. */
export function creerGabarit(
  db: Db,
  compteId: number,
  universId: number,
  entree: { type: string; nom: string; contenu?: string },
): Gabarit {
  const systemeId = exigerEcritureGabarits(db, compteId, universId);
  if (!(TYPES_GABARIT as readonly string[]).includes(entree.type)) {
    throw invalide('Type de gabarit inconnu.');
  }
  const type = entree.type as TypeGabarit;
  const contenu = entree.contenu ?? '';
  const nom = validerGabarit(entree.nom, contenu);
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM gabarits WHERE systeme_id = ? AND type = ? AND nom = ?').get(systemeId, type, nom)) {
      throw gabaritPris(type);
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO gabarits (systeme_id, type, nom, contenu, version, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(systemeId, type, nom, contenu, now, now);
    return versGabarit(
      db.prepare('SELECT * FROM gabarits WHERE id = ?').get(Number(info.lastInsertRowid)) as GabaritRow,
    );
  })();
}

/**
 * Rewrites name and content with the version the caller read (AD-85). A stale
 * version is a conflict `gabarit_modifie` and nothing is written. The type
 * never changes; a template of a system the universe does not use is not found.
 */
export function modifierGabarit(
  db: Db,
  compteId: number,
  universId: number,
  gabaritId: number,
  entree: { nom: string; contenu: string; version: number },
): Gabarit {
  const systemeId = exigerEcritureGabarits(db, compteId, universId);
  const nom = validerGabarit(entree.nom, entree.contenu);
  return db.transaction(() => {
    const g = db
      .prepare('SELECT * FROM gabarits WHERE id = ? AND systeme_id = ?')
      .get(gabaritId, systemeId) as GabaritRow | undefined;
    if (!g) throw introuvable();
    if (g.version !== entree.version) {
      throw new ErreurService('conflit', 'Le gabarit a changé.', 'gabarit_modifie');
    }
    const autre = db
      .prepare('SELECT 1 FROM gabarits WHERE systeme_id = ? AND type = ? AND nom = ? AND id <> ?')
      .get(systemeId, g.type, nom, gabaritId);
    if (autre) throw gabaritPris(g.type);
    db.prepare(
      'UPDATE gabarits SET nom = ?, contenu = ?, version = version + 1, modifie_le = ? WHERE id = ?',
    ).run(nom, entree.contenu, new Date().toISOString(), gabaritId);
    return versGabarit(db.prepare('SELECT * FROM gabarits WHERE id = ?').get(gabaritId) as GabaritRow);
  })();
}
